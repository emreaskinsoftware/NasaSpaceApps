/**
 * Application-level store-and-forward. This is NOT NASA radio infrastructure and not a DTN stack.
 * Priority scheduling can shorten queue wait; nothing here can beat the configured propagation delay.
 */
import { CasePackage, GroundReply, type HealthEvent, type LinkConfig, type OutboxEntry, type Receipt } from '@aster/contracts';

/* ---------- canonical JSON + synchronous SHA-256 (integrity check only, not an authentication signature) ---------- */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}
const K = new Uint32Array(64);
{
  let n = 0;
  for (let c = 2; n < 64; c++) {
    let prime = true;
    for (let d = 2; d * d <= c; d++) if (c % d === 0) { prime = false; break; }
    if (prime) K[n++] = (Math.cbrt(c) * 4294967296) >>> 0;
  }
}
export function sha256Hex(text: string): string {
  const data = new TextEncoder().encode(text);
  const len = data.length, total = (((len + 9) >> 6) + 1) << 6;
  const m = new Uint8Array(total);
  m.set(data); m[len] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(total - 8, Math.floor((len * 8) / 4294967296)); dv.setUint32(total - 4, (len * 8) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, '0')).join('');
}

/* ---------- case packages ---------- */
export type Snippet = CasePackage['snippets'][number];
export function buildPackage(ev: HealthEvent, crewPseudonym: string, nowMs: number, snippets: Snippet[], missing: string[]): CasePackage {
  const starts = ev.evidence.map((e) => e.window.startMs), ends = ev.evidence.map((e) => e.window.endMs);
  const body = {
    schemaVersion: 1 as const, packageId: `${ev.id}@r${ev.revision}`, missionId: ev.missionId, runId: ev.runId, eventId: ev.id, eventRevision: ev.revision,
    crewPseudonym, generatedAtMs: nowMs,
    inputInterval: { startMs: starts.length ? Math.min(...starts) : ev.openedAtMs, endMs: ends.length ? Math.max(...ends) : ev.updatedAtMs },
    summary: { ruleId: ev.ruleId, ruleVersion: ev.ruleVersion, severity: ev.severity, module: ev.module, explanationKey: ev.explanationKey, explanationParams: ev.explanationParams },
    evidence: ev.evidence, snippets, limitations: ev.limitations, missing, origin: ev.origin,
  };
  return { ...body, contentHash: sha256Hex(canonicalJson(body)) };
}
export function verifyPackage(pkg: CasePackage): boolean {
  const { contentHash, ...body } = pkg;
  return sha256Hex(canonicalJson(body)) === contentHash;
}
export const packageBytes = (p: unknown): number => new TextEncoder().encode(JSON.stringify(p)).length;

/* ---------- link ---------- */
export type Dir = 'up' | 'down';
export interface Frame { kind: 'package' | 'receipt' | 'reply' | 'reply-ack'; id: string; body: unknown; bytes: number }
export interface Transport {
  isUp(tMs: number): boolean;
  /** Returns false when the frame could not be handed to the link (link down). A lost frame still returns true. */
  send(dir: Dir, frame: Frame, tMs: number): boolean;
  poll(dir: Dir, tMs: number): Frame[];
  /** Earliest possible one-way latency for a frame of this size. */
  minLatencyMs(bytes: number): number;
}

/** Virtual-clock link simulator: propagation delay + serialization at a bandwidth, loss, outages. */
export class LinkSim implements Transport {
  private q: { at: number; dir: Dir; frame: Frame }[] = [];
  private txFree: Record<Dir, number> = { up: 0, down: 0 };
  private dupDone = new Set<string>();
  stats = { sent: 0, lost: 0, delivered: 0, bytes: 0, duplicatesInjected: 0 };
  constructor(public cfg: LinkConfig, private rng: () => number, private outages: [number, number][] = [], private duplicateDelivery = false) {}
  isUp(t: number): boolean { return this.cfg.up && !this.outages.some(([a, b]) => t >= a && t < b); }
  minLatencyMs(bytes: number): number { return this.cfg.oneWayDelayMs + (bytes / this.cfg.bandwidthBytesPerSec) * 1000; }
  send(dir: Dir, frame: Frame, t: number): boolean {
    if (!this.isUp(t)) return false;
    const start = Math.max(t, this.txFree[dir]);
    const ser = (frame.bytes / this.cfg.bandwidthBytesPerSec) * 1000;
    this.txFree[dir] = start + ser;
    this.stats.sent++; this.stats.bytes += frame.bytes;
    if (this.rng() < this.cfg.packetLoss) { this.stats.lost++; return true; }
    const at = start + ser + this.cfg.oneWayDelayMs;
    this.q.push({ at, dir, frame });
    if (this.duplicateDelivery && frame.kind === 'package' && !this.dupDone.has(frame.id)) {
      this.dupDone.add(frame.id); this.stats.duplicatesInjected++;
      this.q.push({ at: at + 400, dir, frame });
    }
    return true;
  }
  poll(dir: Dir, t: number): Frame[] {
    const out: Frame[] = [];
    this.q = this.q.filter((x) => {
      if (x.dir !== dir || x.at > t) return true;
      if (this.isUp(x.at)) { out.push(x.frame); this.stats.delivered++; } else this.stats.lost++;
      return false;
    });
    return out;
  }
}

/* ---------- reliable sender (durable outbox semantics, at-least-once; receivers must be idempotent) ---------- */
export class ReliableSender<T> {
  entries: OutboxEntry<T>[] = [];
  onChange: ((e: OutboxEntry<T>) => void) | null = null;
  constructor(private dir: Dir, private kind: Frame['kind']) {}
  private touch(e: OutboxEntry<T>): void { this.onChange?.(e); }
  enqueue(id: string, payload: T, priority: number, tMs: number): OutboxEntry<T> | null {
    if (this.entries.some((e) => e.id === id)) return null; // idempotent
    const e: OutboxEntry<T> = { id, payload, priority, state: 'queued', attempts: 0, queuedAtMs: tMs, nextAttemptAtMs: tMs, deliveredAtMs: null, sizeBytes: packageBytes(payload), lastError: null };
    this.entries.push(e); this.touch(e);
    return e;
  }
  supersede(pred: (e: OutboxEntry<T>) => boolean): void {
    for (const e of this.entries) if (e.state === 'queued' && pred(e)) { e.state = 'superseded'; this.touch(e); }
  }
  retryNow(id: string, tMs: number): void {
    const e = this.entries.find((x) => x.id === id);
    if (e && (e.state === 'failed' || e.state === 'queued')) { e.state = 'queued'; e.nextAttemptAtMs = tMs; this.touch(e); }
  }
  tick(tMs: number, link: Transport): void {
    for (const e of this.entries) {
      if (e.state !== 'sending') continue;
      const deadline = e.nextAttemptAtMs + 2 * link.minLatencyMs(e.sizeBytes) + 4000;
      if (tMs > deadline) {
        e.attempts++; e.lastError = 'no-acknowledgement';
        e.state = e.attempts >= 8 ? 'failed' : 'queued';
        e.nextAttemptAtMs = tMs + Math.min(30000, 2000 * 2 ** Math.min(e.attempts, 4));
        this.touch(e);
      }
    }
    if (!link.isUp(tMs)) return;
    // Priority with aging: one priority step per 60 s waited, so low-priority cases cannot starve.
    const ready = this.entries.filter((e) => e.state === 'queued' && e.nextAttemptAtMs <= tMs)
      .sort((a, b) => (b.priority + (tMs - b.queuedAtMs) / 60000) - (a.priority + (tMs - a.queuedAtMs) / 60000));
    for (const e of ready) {
      if (!link.send(this.dir, { kind: this.kind, id: e.id, body: e.payload, bytes: e.sizeBytes }, tMs)) break;
      e.state = 'sending'; e.nextAttemptAtMs = tMs; this.touch(e);
    }
  }
  onAck(id: string, tMs: number): void {
    const e = this.entries.find((x) => x.id === id);
    if (e && e.state !== 'delivered' && e.state !== 'acknowledged') { e.state = 'delivered'; e.deliveredAtMs = tMs; e.lastError = null; this.touch(e); }
  }
}

/* ---------- ground receiving logic (shared by the in-browser ground and the ground server) ---------- */
export interface GroundCase { pkg: CasePackage; receivedAtMs: number; duplicates: number }
export class GroundStation {
  cases = new Map<string, GroundCase>();
  rejected: { packageId: string; reason: string; atMs: number }[] = [];
  private replyCount = new Map<string, number>();
  constructor(readonly limits = { maxCases: 2000, maxRejected: 200, maxRepliesPerPackage: 20 }) {}
  private reject(packageId: string, reason: string, atMs: number): void {
    this.rejected.push({ packageId, reason, atMs });
    if (this.rejected.length > this.limits.maxRejected) this.rejected.shift(); // bounded ring: a hostile peer cannot grow it
  }
  receive(raw: unknown, tMs: number): Receipt | null {
    const parsed = CasePackage.safeParse(raw);
    if (!parsed.success) { this.reject(String((raw as { packageId?: unknown } | null)?.packageId ?? '?').slice(0, 160), 'schema', tMs); return null; }
    const pkg = parsed.data;
    const hashOk = verifyPackage(pkg);
    if (!hashOk) { this.reject(pkg.packageId, 'checksum-mismatch', tMs); return { packageId: pkg.packageId, runId: pkg.runId, receivedAtMs: tMs, duplicate: false, hashOk: false }; }
    const existing = this.cases.get(pkg.packageId);
    if (existing) { existing.duplicates++; return { packageId: pkg.packageId, runId: pkg.runId, receivedAtMs: existing.receivedAtMs, duplicate: true, hashOk: true }; }
    if (this.cases.size >= this.limits.maxCases) { this.reject(pkg.packageId, 'store-full', tMs); return null; }
    this.cases.set(pkg.packageId, { pkg, receivedAtMs: tMs, duplicates: 0 });
    return { packageId: pkg.packageId, runId: pkg.runId, receivedAtMs: tMs, duplicate: false, hashOk: true };
  }
  /** Build a reply linked to the exact package/event revision. Never executable as device control. */
  makeReply(packageId: string, text: string, requestedEvidence: string[], authorRole: GroundReply['authorRole'], tMs: number, n: number): GroundReply | null {
    const c = this.cases.get(packageId);
    if (!c) return null;
    const used = this.replyCount.get(packageId) ?? 0;
    if (used >= this.limits.maxRepliesPerPackage) return null;
    this.replyCount.set(packageId, used + 1);
    const r = GroundReply.safeParse({ schemaVersion: 1, replyId: `${packageId}/reply-${n}`, runId: c.pkg.runId, packageId, eventId: c.pkg.eventId, eventRevision: c.pkg.eventRevision, authorRole, createdAtMs: tMs, requestedEvidence, text });
    return r.success ? r.data : null;
  }
}

/** Mission-side acceptance of a ground reply: same run, known package; flags stale context instead of overwriting. */
export function acceptReply(raw: unknown, runId: string, knownPackages: ReadonlyMap<string, { eventId: string; eventRevision: number }>, latestRevision: (eventId: string) => number | null): { reply: GroundReply; stale: boolean; localRevision: number } | { error: string } {
  const p = GroundReply.safeParse(raw);
  if (!p.success) return { error: 'schema' };
  if (p.data.runId !== runId) return { error: 'cross-run-reply' };
  const pkg = knownPackages.get(p.data.packageId);
  if (!pkg) return { error: 'unknown-package' };
  // A reply must refer to exactly the event revision its package carried; otherwise the stale-context flag could be defeated.
  if (pkg.eventId !== p.data.eventId || pkg.eventRevision !== p.data.eventRevision) return { error: 'mismatched-context' };
  const local = latestRevision(p.data.eventId);
  if (local === null) return { error: 'unknown-event' };
  return { reply: p.data, stale: local > p.data.eventRevision, localRevision: local };
}
