/**
 * HttpTransport: the mission runtime's link, backed by REAL HTTP to the separate ground process.
 *  - send('up', package)  -> POST /api/v1/ground/packages; the returned Receipt is queued as a 'down' frame
 *  - a poller GETs /api/v1/ground/replies (cursor) and queues each reply as a 'down' frame
 *  - 'reply-ack' is a no-op (the cursor already makes reply delivery idempotent)
 *  - isUp() reflects the last health/POST outcome, so "ground unreachable" is an outage: entries stay queued and retry
 * The runtime's in-process GroundStation is bypassed, hence poll('up') is always empty.
 * Everything the ground returns is treated as untrusted input: size-capped WHILE reading, zod-validated, and bounded in
 * count (replies per package / per run) so a hostile or broken ground can not grow mission-side state.
 */
import { z } from 'zod';
import { GroundReply, Receipt } from '@aster/contracts';
import type { Dir, Frame, Transport } from '@aster/comms';
import { isLoopbackHost } from '../common';

export interface HttpTransportOptions {
  baseUrl: string; runId: string; token?: string | null; timeoutMs?: number; pollMs?: number;
  /** Reply cursor to resume from (persisted by the host). */
  cursor?: number;
  /** Called for every newly accepted reply (persist reply + cursor together) and when only the cursor moves (reply === null). */
  onReply?: (seq: number, reply: GroundReply | null) => void;
  maxResponseBytes?: number;
}

export const MAX_RESPONSE_BYTES = 512 * 1024;
/** Mirrors the runtime's acceptance caps: anything beyond these would be refused there, so it is dropped here and never stored. */
export const MAX_REPLIES_PER_PACKAGE = 20;
export const MAX_REPLIES_PER_RUN = 500;
const RepliesPage = z.object({ replies: z.array(z.object({ seq: z.number().int().positive(), reply: z.unknown() })).max(50), next: z.number().int().min(0) });

class ResponseTooLarge extends Error {}

export class HttpTransport implements Transport {
  readonly stats = { posts: 0, postFailures: 0, receipts: 0, replies: 0, invalidResponses: 0, oversizedResponses: 0, droppedReplies: 0 };
  /** While paused (run recovery) the link reports down so the outbox keeps entries queued instead of sending. */
  paused = false;
  private up = false;
  private down: Frame[] = [];
  private inflight = new Map<string, Promise<void>>();
  private cursor: number;
  private seen = new Set<string>();
  private perPackage = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy: Promise<void> | null = null;
  private readonly base: string;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;

  constructor(private opts: HttpTransportOptions) {
    const u = new URL(opts.baseUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('ground URL must be http(s)');
    if (u.username || u.password) throw new Error('credentials in the ground URL are not allowed');
    if (opts.token && u.protocol === 'http:' && !isLoopbackHost(u.hostname)) throw new Error('Refusing to start: the ground bearer token would be sent over plain http to a non-loopback host; use an https ground URL');
    this.base = u.origin;
    this.timeoutMs = opts.timeoutMs ?? 4000;
    this.maxBytes = opts.maxResponseBytes ?? MAX_RESPONSE_BYTES;
    this.cursor = opts.cursor ?? 0;
  }

  get replyCursor(): number { return this.cursor; }
  /** Re-offer replies accepted before a restart to the runtime (from the host's own store; ground is not contacted). */
  restore(replies: readonly GroundReply[]): void {
    for (const r of replies) if (r.runId === this.opts.runId && this.admit(r)) this.down.push({ kind: 'reply', id: r.replyId, body: r, bytes: 400 });
  }
  isUp(): boolean { return this.up && !this.paused; }
  minLatencyMs(): number { return 250; }

  send(dir: Dir, frame: Frame): boolean {
    if (dir !== 'up' || frame.kind !== 'package') return true; // reply-ack and anything else: nothing to transmit
    if (!this.isUp()) return false;
    if (!this.inflight.has(frame.id)) {
      const p = this.post(frame).finally(() => this.inflight.delete(frame.id));
      this.inflight.set(frame.id, p);
    }
    return true;
  }
  poll(dir: Dir): Frame[] {
    if (dir === 'up') return [];
    const out = this.down;
    this.down = [];
    return out;
  }

  /** Count a reply against the per-package / per-run caps; false = duplicate or over the cap. */
  private admit(r: GroundReply): boolean {
    if (this.seen.has(r.replyId)) return false;
    const n = this.perPackage.get(r.packageId) ?? 0;
    if (this.seen.size >= MAX_REPLIES_PER_RUN || n >= MAX_REPLIES_PER_PACKAGE) { this.stats.droppedReplies++; return false; }
    this.seen.add(r.replyId); this.perPackage.set(r.packageId, n + 1);
    return true;
  }

  /** Read a response body with a hard byte cap enforced during the read (never buffer an unbounded body first). */
  private async readCapped(res: Response): Promise<string> {
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > this.maxBytes) { await res.body?.cancel().catch(() => undefined); throw new ResponseTooLarge(); }
    if (!res.body) return '';
    const reader = res.body.getReader(), chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > this.maxBytes) { await reader.cancel().catch(() => undefined); throw new ResponseTooLarge(); }
      chunks.push(value);
    }
    const all = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { all.set(c, o); o += c.byteLength; }
    return new TextDecoder().decode(all);
  }

  private async request(path: string, init: { method: 'GET' | 'POST'; body?: string }): Promise<{ status: number; json: unknown }> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (this.opts.token) headers.authorization = `Bearer ${this.opts.token}`;
    const res = await fetch(this.base + path, { method: init.method, body: init.body, headers, redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs) });
    let text: string;
    try { text = await this.readCapped(res); } catch (e) { if (e instanceof ResponseTooLarge) this.stats.oversizedResponses++; throw e; }
    let json: unknown = null;
    try { json = JSON.parse(text); } catch { /* validated by callers */ }
    return { status: res.status, json };
  }

  private async post(frame: Frame): Promise<void> {
    this.stats.posts++;
    try {
      const { status, json } = await this.request('/api/v1/ground/packages', { method: 'POST', body: JSON.stringify(frame.body) });
      if (status >= 500 || status === 401 || status === 403 || status === 429) { this.up = false; this.stats.postFailures++; return; }
      this.up = true;
      // 200/201 carry the receipt; 422 carries a receipt with hashOk=false (the runtime then marks the entry failed).
      const receipt = Receipt.safeParse(status === 422 ? (json as { receipt?: unknown } | null)?.receipt : json);
      if (!receipt.success || receipt.data.packageId !== frame.id) { this.stats.invalidResponses++; return; }
      this.stats.receipts++;
      this.down.push({ kind: 'receipt', id: receipt.data.packageId, body: receipt.data, bytes: 160 });
    } catch { this.up = false; this.stats.postFailures++; }
  }

  /** Health probe; updates the outage state. */
  async probe(): Promise<boolean> {
    try { this.up = (await this.request('/health', { method: 'GET' })).status === 200; } catch { this.up = false; }
    return this.up;
  }
  /** Pull new ground replies for this run (cursor-based, idempotent, bounded). */
  async pollReplies(): Promise<number> {
    if (!this.up) return 0;
    try {
      const { status, json } = await this.request(`/api/v1/ground/replies?runId=${encodeURIComponent(this.opts.runId)}&after=${this.cursor}&limit=50`, { method: 'GET' });
      if (status !== 200) return 0;
      const page = RepliesPage.safeParse(json);
      if (!page.success) { this.stats.invalidResponses++; return 0; }
      let n = 0;
      for (const r of page.data.replies) {
        if (r.seq <= this.cursor) continue;
        this.cursor = r.seq;
        const reply = GroundReply.safeParse(r.reply);
        if (!reply.success) { this.stats.invalidResponses++; this.opts.onReply?.(r.seq, null); continue; }
        // Run/package/revision acceptance is decided by the mission runtime (acceptReply). A reply for another run is
        // still handed over so the runtime refuses and counts it, but it is never persisted or counted against the caps.
        const foreign = reply.data.runId !== this.opts.runId;
        if (!foreign && !this.admit(reply.data)) { this.opts.onReply?.(r.seq, null); continue; }
        this.opts.onReply?.(r.seq, foreign ? null : reply.data);
        this.down.push({ kind: 'reply', id: reply.data.replyId, body: reply.data, bytes: 400 });
        this.stats.replies++; n++;
      }
      return n;
    } catch { this.up = false; return 0; }
  }
  /** One maintenance cycle: probe health, then pull replies. Serialised so cycles never overlap. */
  cycle(): Promise<void> {
    this.busy ??= (async () => { await this.probe(); await this.pollReplies(); })().finally(() => { this.busy = null; });
    return this.busy;
  }
  /** Wait for in-flight POSTs (tests, graceful shutdown). */
  async idle(): Promise<void> {
    while (this.inflight.size || this.busy) await Promise.allSettled([...this.inflight.values(), this.busy]);
  }
  start(): void {
    if (this.timer) return;
    void this.cycle();
    this.timer = setInterval(() => void this.cycle(), this.opts.pollMs ?? 2000);
    this.timer.unref?.();
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
