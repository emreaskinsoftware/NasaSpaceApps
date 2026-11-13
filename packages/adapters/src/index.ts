/**
 * ASTER telemetry adapters (pure TypeScript; runs in the browser and in Node, no node: imports).
 *
 * Verification status, stated plainly: every path in this file has been exercised with synthetic recordings
 * and the software device emulator only. No physical device has been connected. Nothing here is hardware-verified.
 *
 * ── Serial reference frame, version 1 (little-endian) ─────────────────────────────────────────────
 *   offset size field
 *   0      2    sync            0xA5 0x5A
 *   2      1    version         1
 *   3      1    metricId        index into METRIC_NAMES (@aster/contracts)
 *   4      1    crewIndex       index into the configured crew list; 0xFF = no crew (cabin channel)
 *   5      4    sequence        u32, per stream
 *   9      4    tMs             u32, mission time of the first sample (ms)
 *   13     2    sampleRateHz    u16; 0 = scalar observation (count must be 1)
 *   15     2    count           u16, 1..MAX_FRAME_SAMPLES
 *   17     4*n  samples         float32
 *   17+4n  2    crc             CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over bytes [2, 17+4n)
 * A parser that sees a bad sync, unknown version/metric, an oversized count or a CRC mismatch drops one
 * byte and resynchronises on the next sync pattern; it never guesses a value.
 */
import { z } from 'zod';
import {
  METRICS, METRIC_NAMES, MAX_BATCH_RECORDS, Observation, SignalChunkWire, decodeChunk, isChunk, isMetric,
  type AdapterCapabilities, type AdapterConfig, type DataOrigin, type Metric, type SignalChunk, type TelemetryAdapter,
} from '@aster/contracts';

export type TelemetryRecord = Observation | SignalChunk;

/* ====================================================================================================
 * Replay importers (NDJSON, CSV)
 * ==================================================================================================== */
export const DEFAULT_MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const DEFAULT_MAX_IMPORT_ROWS = 200_000;
const MAX_REPORTED_ERRORS = 500;
export const MAX_CSV_LINE_CHARS = 4096;
export const MAX_NDJSON_LINE_CHARS = 256 * 1024;
export const MAX_NUMBER_FIELD_CHARS = 32;

export interface ImportOptions {
  maxBytes?: number;
  maxRows?: number;
  /** CSV only: logical column -> header name in the file. */
  mapping?: Partial<Record<CsvColumn, string>>;
  /** CSV only: identity stamped on the built observations. */
  missionId?: string;
  runId?: string;
  receivedAtUtc?: string;
}
export interface ImportError { row: number; message: string }
export interface ImportPreview {
  format: 'ndjson' | 'csv';
  origin: 'recorded';
  totalRows: number;
  accepted: number;
  rejected: number;
  errorsTruncated: boolean;
  streams: { streamId: string; metric: string; unit: string; records: number }[];
  timeRangeMs: { startMs: number; endMs: number } | null;
  /** First accepted rows, flattened for display. */
  sample: { streamId: string; metric: string; atMs: number; value: number | null; unit: string; samples: number }[];
}
export interface ImportResult { records: TelemetryRecord[]; errors: ImportError[]; preview: ImportPreview }

export const CSV_COLUMNS = ['observedAtMs', 'crewId', 'metric', 'value', 'unit'] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];

const recordTime = (r: TelemetryRecord): number => (isChunk(r) ? r.startAtMs : r.observedAtMs);

/** Shared acceptance rules. Returns an error message or null. Never converts units, never reorders. */
class ImportSession {
  readonly records: TelemetryRecord[] = [];
  readonly errors: ImportError[] = [];
  rejected = 0;
  private ids = new Set<string>();
  private seqs = new Set<string>();
  private lastAt = new Map<string, number>();
  private streams = new Map<string, { streamId: string; metric: string; unit: string; records: number }>();
  constructor(private format: 'ndjson' | 'csv') {}
  fail(row: number, message: string): void {
    this.rejected++;
    if (this.errors.length < MAX_REPORTED_ERRORS) this.errors.push({ row, message });
  }
  accept(row: number, r: TelemetryRecord, id: string | null): void {
    if (!isMetric(r.metric)) return this.fail(row, `unknown metric "${r.metric.slice(0, 64)}"`);
    const expected = METRICS[r.metric].unit;
    if (r.unit !== expected) return this.fail(row, `unit "${r.unit}" does not match "${expected}" required for ${r.metric} (units are never converted)`);
    if (id !== null && this.ids.has(id)) return this.fail(row, `duplicate id "${id}"`);
    const seqKey = `${r.streamId}\u0000${r.sequence}`;
    if (this.seqs.has(seqKey)) return this.fail(row, `duplicate sequence ${r.sequence} in stream "${r.streamId}"`);
    const at = recordTime(r), last = this.lastAt.get(r.streamId);
    if (last !== undefined && at === last) return this.fail(row, `duplicate timestamp ${at} in stream "${r.streamId}"`);
    if (last !== undefined && at < last) return this.fail(row, `non-monotonic timestamp ${at} after ${last} in stream "${r.streamId}"`);
    if (id !== null) this.ids.add(id);
    this.seqs.add(seqKey); this.lastAt.set(r.streamId, at);
    const s = this.streams.get(r.streamId) ?? { streamId: r.streamId, metric: r.metric, unit: r.unit, records: 0 };
    s.records++; this.streams.set(r.streamId, s);
    this.records.push({ ...r, origin: 'recorded' });
  }
  result(totalRows: number): ImportResult {
    let startMs = Infinity, endMs = -Infinity;
    for (const r of this.records) { const t = recordTime(r); if (t < startMs) startMs = t; if (t > endMs) endMs = t; }
    return {
      records: this.records, errors: this.errors,
      preview: {
        format: this.format, origin: 'recorded', totalRows, accepted: this.records.length, rejected: this.rejected, errorsTruncated: this.rejected > this.errors.length,
        streams: [...this.streams.values()], timeRangeMs: this.records.length ? { startMs, endMs } : null,
        sample: this.records.slice(0, 8).map((r) => isChunk(r)
          ? { streamId: r.streamId, metric: r.metric, atMs: r.startAtMs, value: null, unit: r.unit, samples: r.samples.length }
          : { streamId: r.streamId, metric: r.metric, atMs: r.observedAtMs, value: r.value, unit: r.unit, samples: 1 }),
      },
    };
  }
}

function refuse(format: 'ndjson' | 'csv', message: string): ImportResult {
  const s = new ImportSession(format);
  s.fail(0, message);
  return s.result(0);
}
function tooLarge(text: string, maxBytes: number): boolean {
  // UTF-8 length is >= UTF-16 length, so the cheap check short-circuits before anything is allocated for huge inputs.
  return text.length > maxBytes || new TextEncoder().encode(text).length > maxBytes;
}
const issueText = (e: z.ZodError): string => e.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ').slice(0, 300);

/** NDJSON: one Observation or one SignalChunkWire (codec "f32-array-v1") per line. Rows are 1-based line numbers. */
export function parseNdjson(text: string, opts: ImportOptions = {}): ImportResult {
  if (typeof text !== 'string') return refuse('ndjson', 'input must be text');
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_IMPORT_BYTES, maxRows = opts.maxRows ?? DEFAULT_MAX_IMPORT_ROWS;
  if (tooLarge(text, maxBytes)) return refuse('ndjson', `input exceeds the ${maxBytes} byte import limit; nothing was imported`);
  const lines = text.split(/\r?\n/);
  const rows = lines.reduce((n, l) => n + (l.trim() ? 1 : 0), 0);
  if (rows > maxRows) return refuse('ndjson', `input has ${rows} rows, above the ${maxRows} row import limit; nothing was imported`);
  const s = new ImportSession('ndjson');
  lines.forEach((line, i) => {
    if (line.length > MAX_NDJSON_LINE_CHARS) return s.fail(i + 1, `line exceeds ${MAX_NDJSON_LINE_CHARS} characters`);
    if (!line.trim()) return;
    let raw: unknown;
    try { raw = JSON.parse(line); } catch { return s.fail(i + 1, 'not valid JSON'); }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return s.fail(i + 1, 'row must be a JSON object');
    if ('samples' in raw || 'codec' in raw) {
      const p = SignalChunkWire.safeParse(raw);
      if (!p.success) return s.fail(i + 1, `invalid signal chunk: ${issueText(p.error)}`);
      s.accept(i + 1, decodeChunk(p.data), null);
    } else {
      const p = Observation.safeParse(raw);
      if (!p.success) return s.fail(i + 1, `invalid observation: ${issueText(p.error)}`);
      s.accept(i + 1, p.data, p.data.id);
    }
  });
  return s.result(rows);
}

/** Minimal RFC-4180 field splitter (quoted fields, doubled quotes). Returns null on an unterminated quote. */
function splitCsvLine(line: string): string[] | null {
  const out: string[] = [];
  let cur = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false; } else cur += c;
    } else if (c === '"' && cur === '') quoted = true;
    else if (c === ',') { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (quoted) return null;
  out.push(cur.trim());
  return out;
}

/** CSV with a required header: observedAtMs,crewId,metric,value,unit (`mapping` may rename columns). Rows are 1-based file lines. */
export function parseCsv(text: string, opts: ImportOptions = {}): ImportResult {
  if (typeof text !== 'string') return refuse('csv', 'input must be text');
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_IMPORT_BYTES, maxRows = opts.maxRows ?? DEFAULT_MAX_IMPORT_ROWS;
  if (tooLarge(text, maxBytes)) return refuse('csv', `input exceeds the ${maxBytes} byte import limit; nothing was imported`);
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const headerAt = lines.findIndex((l) => l.trim() !== '');
  if (headerAt < 0) return refuse('csv', 'empty input: a header row is required');
  const header = lines[headerAt].length > MAX_CSV_LINE_CHARS ? null : splitCsvLine(lines[headerAt]);
  if (!header) return refuse('csv', 'header row is malformed');
  const col = {} as Record<CsvColumn, number>;
  for (const c of CSV_COLUMNS) {
    const name = opts.mapping?.[c] ?? c, at = header.indexOf(name);
    if (at < 0 || header.indexOf(name, at + 1) >= 0) return refuse('csv', `header must contain exactly one "${name}" column (for ${c})`);
    col[c] = at;
  }
  const rows = lines.reduce((n, l, i) => n + (i > headerAt && l.trim() ? 1 : 0), 0);
  if (rows > maxRows) return refuse('csv', `input has ${rows} rows, above the ${maxRows} row import limit; nothing was imported`);
  const s = new ImportSession('csv');
  const seq = new Map<string, number>();
  const missionId = opts.missionId ?? 'import', runId = opts.runId ?? 'import', receivedAtUtc = opts.receivedAtUtc ?? new Date().toISOString();
  // Length is checked before any regex runs, and the pattern has no ambiguous repetition (no catastrophic backtracking).
  const strictNumber = (v: string): number => (v.length <= MAX_NUMBER_FIELD_CHARS && /^[+-]?(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i.test(v) ? Number(v) : NaN);
  for (let i = headerAt + 1; i < lines.length; i++) {
    const row = i + 1;
    if (lines[i].length > MAX_CSV_LINE_CHARS) { s.fail(row, `line exceeds ${MAX_CSV_LINE_CHARS} characters`); continue; }
    if (!lines[i].trim()) continue;
    const f = splitCsvLine(lines[i]);
    if (!f) { s.fail(row, 'unterminated quoted field'); continue; }
    if (f.length !== header.length) { s.fail(row, `expected ${header.length} fields, found ${f.length}`); continue; }
    const at = strictNumber(f[col.observedAtMs]), value = strictNumber(f[col.value]);
    if (!Number.isFinite(at)) { s.fail(row, 'observedAtMs is not a finite number'); continue; }
    if (!Number.isFinite(value)) { s.fail(row, 'value is not a finite number'); continue; }
    const metric = f[col.metric], crewId = f[col.crewId] || null;
    const streamId = `${crewId ?? 'cabin'}:${metric}`, n = seq.get(streamId) ?? 0;
    const p = Observation.safeParse({
      schemaVersion: 1, id: `import:${streamId}:${n}`, missionId, runId, crewId, streamId, sourceId: 'replay-import', sequence: n, observedAtMs: at, receivedAtUtc,
      clockUncertaintyMs: 0, metric, value, unit: f[col.unit], origin: 'recorded', quality: 'valid', qualityReasons: [], provenanceId: 'import:csv',
    });
    if (!p.success) { s.fail(row, `invalid row: ${issueText(p.error)}`); continue; }
    const before = s.records.length;
    s.accept(row, p.data, p.data.id);
    if (s.records.length > before) seq.set(streamId, n + 1);
  }
  return s.result(rows);
}

/* ====================================================================================================
 * Serial reference frame
 * ==================================================================================================== */
export const FRAME_SYNC = [0xa5, 0x5a] as const;
export const FRAME_VERSION = 1;
export const FRAME_HEADER_BYTES = 17;
export const MAX_FRAME_SAMPLES = 1024;
export const NO_CREW = 0xff;

export interface FrameInput { metricId: number; crewIndex: number; sequence: number; tMs: number; sampleRateHz: number; samples: ArrayLike<number> }
export interface ParsedFrame { version: number; metricId: number; crewIndex: number; sequence: number; tMs: number; sampleRateHz: number; samples: Float32Array }

/** CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflection, no final xor. crc16("123456789") = 0x29B1. */
const CRC_TABLE = new Uint16Array(256);
for (let n = 0; n < 256; n++) {
  let c = n << 8;
  for (let b = 0; b < 8; b++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
  CRC_TABLE[n] = c;
}
export function crc16(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let crc = 0xffff;
  for (let i = start; i < end; i++) crc = ((crc << 8) & 0xffff) ^ CRC_TABLE[(crc >> 8) ^ bytes[i]];
  return crc;
}

export function encodeFrame(f: FrameInput): Uint8Array {
  const n = f.samples.length;
  const u = (v: number, max: number, name: string): number => { if (!Number.isInteger(v) || v < 0 || v > max) throw new RangeError(`${name} out of range`); return v; };
  if (n < 1 || n > MAX_FRAME_SAMPLES) throw new RangeError(`sample count must be 1..${MAX_FRAME_SAMPLES}`);
  if (f.sampleRateHz === 0 && n !== 1) throw new RangeError('a scalar frame (sampleRateHz 0) carries exactly one sample');
  const out = new Uint8Array(FRAME_HEADER_BYTES + 4 * n + 2), dv = new DataView(out.buffer);
  out[0] = FRAME_SYNC[0]; out[1] = FRAME_SYNC[1]; out[2] = FRAME_VERSION;
  out[3] = u(f.metricId, METRIC_NAMES.length - 1, 'metricId'); out[4] = u(f.crewIndex, 0xff, 'crewIndex');
  dv.setUint32(5, u(f.sequence, 0xffffffff, 'sequence'), true); dv.setUint32(9, u(f.tMs, 0xffffffff, 'tMs'), true);
  dv.setUint16(13, u(f.sampleRateHz, 0xffff, 'sampleRateHz'), true); dv.setUint16(15, n, true);
  for (let i = 0; i < n; i++) dv.setFloat32(FRAME_HEADER_BYTES + 4 * i, f.samples[i], true);
  dv.setUint16(out.length - 2, crc16(out, 2, out.length - 2), true);
  return out;
}

export const MAX_PARSER_BUFFER_BYTES = 64 * 1024;
/** CRC work the parser may spend re-scanning inside failed frames; refilled only by good frames (bounds CPU on hostile input). */
const RESCAN_CREDIT_BYTES = 16 * 1024;

/**
 * Streaming parser: feed arbitrary byte slices, get complete CRC-checked frames.
 * CPU is linear in the input: a rejected header jumps straight to the next sync pattern (no per-byte CRC). Looking for a
 * good frame INSIDE a CRC-failed candidate is paid from a small byte credit that only good frames refill; once it is spent,
 * failed candidates are skipped whole, so crafted "header + bad CRC" floods cost about one CRC pass over the input.
 * Memory is bounded: at most one incomplete frame is retained, with a hard cap of MAX_PARSER_BUFFER_BYTES.
 */
export class SerialFrameParser {
  readonly stats = { frames: 0, crcErrors: 0, resyncs: 0, bytesDiscarded: 0 };
  private buf = new Uint8Array(0);
  private hunting = false;
  private credit = RESCAN_CREDIT_BYTES;

  push(bytes: Uint8Array): ParsedFrame[] {
    const merged = new Uint8Array(this.buf.length + bytes.length);
    merged.set(this.buf); merged.set(bytes, this.buf.length);
    const out: ParsedFrame[] = [];
    const dv = new DataView(merged.buffer);
    const len = merged.length;
    let p = 0;
    /** Index of the next possible sync start at or after `from` (a lone trailing 0xA5 counts: its partner may arrive later). */
    const nextSync = (from: number): number => {
      for (let i = from; i < len; i++) if (merged[i] === FRAME_SYNC[0] && (i + 1 >= len || merged[i + 1] === FRAME_SYNC[1])) return i;
      return len;
    };
    const discardTo = (to: number): void => { this.stats.bytesDiscarded += to - p; p = to; if (!this.hunting) { this.hunting = true; this.stats.resyncs++; } };
    while (p < len) {
      if (merged[p] !== FRAME_SYNC[0] || (p + 1 < len && merged[p + 1] !== FRAME_SYNC[1])) { discardTo(nextSync(p + 1)); continue; }
      if (p + FRAME_HEADER_BYTES > len) break;
      const version = merged[p + 2], metricId = merged[p + 3], rate = dv.getUint16(p + 13, true), count = dv.getUint16(p + 15, true);
      if (version !== FRAME_VERSION || metricId >= METRIC_NAMES.length || count < 1 || count > MAX_FRAME_SAMPLES || (rate === 0 && count !== 1)) { discardTo(nextSync(p + 2)); continue; }
      const total = FRAME_HEADER_BYTES + 4 * count + 2;
      if (p + total > len) break;
      if (crc16(merged, p + 2, p + total - 2) !== dv.getUint16(p + total - 2, true)) {
        this.stats.crcErrors++;
        // With credit: look for a good frame inside the damaged one. Without: drop the whole candidate.
        const rescan = this.credit >= total;
        if (rescan) this.credit -= total;
        discardTo(rescan ? nextSync(p + 2) : p + total);
        continue;
      }
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) samples[i] = dv.getFloat32(p + FRAME_HEADER_BYTES + 4 * i, true);
      out.push({ version, metricId, crewIndex: merged[p + 4], sequence: dv.getUint32(p + 5, true), tMs: dv.getUint32(p + 9, true), sampleRateHz: rate, samples });
      this.stats.frames++; this.hunting = false; this.credit = Math.min(RESCAN_CREDIT_BYTES, this.credit + 2 * total);
      p += total;
    }
    if (len - p > MAX_PARSER_BUFFER_BYTES) discardTo(len); // cannot happen with MAX_FRAME_SAMPLES; kept as a hard bound
    this.buf = merged.slice(p);
    return out;
  }
}

export interface FrameContext {
  missionId: string;
  runId: string;
  crewIds: readonly string[];
  sourceId: string;
  /** Defaults to 'simulated'. Pass 'hardware' only when the caller knows the bytes came from a physical device. */
  origin?: DataOrigin;
  receivedAtUtc?: string;
}
/** Map a parsed frame to a contract record, or null when the frame cannot be represented (unknown metric/crew). */
export function frameToRecord(frame: ParsedFrame, ctx: FrameContext): TelemetryRecord | null {
  const metric: Metric | undefined = METRIC_NAMES[frame.metricId];
  if (!metric) return null;
  const crewId = frame.crewIndex === NO_CREW ? null : ctx.crewIds[frame.crewIndex] ?? undefined;
  if (crewId === undefined) return null;
  const origin = ctx.origin ?? 'simulated', unit = METRICS[metric].unit;
  const streamId = `${ctx.sourceId}:${crewId ?? 'cabin'}:${metric}`, provenanceId = `serial-frame-v${frame.version}:${ctx.sourceId}`;
  const base = { schemaVersion: 1 as const, missionId: ctx.missionId, runId: ctx.runId, streamId, sourceId: ctx.sourceId, sequence: frame.sequence, unit, origin, clockUncertaintyMs: 0, provenanceId, metric };
  if (frame.sampleRateHz === 0) {
    const v = frame.samples[0], ok = Number.isFinite(v);
    const o = Observation.safeParse({
      ...base, id: `${streamId}:${frame.sequence}`, crewId, observedAtMs: frame.tMs, receivedAtUtc: ctx.receivedAtUtc ?? new Date().toISOString(),
      value: ok ? v : null, quality: ok ? 'valid' : 'invalid', qualityReasons: ok ? [] : ['non-finite sample'],
    });
    return o.success ? o.data : null;
  }
  if (crewId === null) return null; // signal chunks are always crew-bound in the contract
  return { ...base, crewId, startAtMs: frame.tMs, sampleRateHz: frame.sampleRateHz, samples: frame.samples, quality: 'valid' };
}

/* ====================================================================================================
 * Adapters
 * ==================================================================================================== */
/** Bounded FIFO with drop-oldest backpressure and an async drain. */
class BoundedQueue<T> {
  dropped = 0;
  private items: T[] = [];
  private wake: (() => void) | null = null;
  private closed = false;
  constructor(private max: number) {}
  get size(): number { return this.items.length; }
  push(item: T): void {
    if (this.closed) return;
    if (this.items.length >= this.max) { this.items.shift(); this.dropped++; }
    this.items.push(item);
    this.wake?.();
  }
  close(): void { this.closed = true; this.wake?.(); }
  async *drain(signal: AbortSignal): AsyncGenerator<T> {
    const onAbort = (): void => this.wake?.();
    signal.addEventListener('abort', onAbort);
    try {
      while (!signal.aborted) {
        while (this.items.length) { if (signal.aborted) return; yield this.items.shift()!; }
        if (this.closed || signal.aborted) return;
        await new Promise<void>((res) => { this.wake = res; });
        this.wake = null;
      }
    } finally { signal.removeEventListener('abort', onAbort); this.wake = null; }
  }
}

const NOT_VERIFIED_ON_HARDWARE = 'No physical device has been connected; not hardware-verified.';

/** Replays an imported recording (records carry origin "recorded"). */
export class ReplayAdapter implements TelemetryAdapter {
  readonly id = 'replay';
  lastImport: ImportResult | null = null;
  constructor(private opts: ImportOptions = {}) {}
  async capabilities(): Promise<AdapterCapabilities> { return capability('replay'); }
  async connect(config: AdapterConfig): Promise<void> {
    if (config.kind !== 'replay') throw new Error('ReplayAdapter requires a replay config');
    this.lastImport = config.format === 'csv' ? parseCsv(config.text, this.opts) : parseNdjson(config.text, this.opts);
  }
  async *observations(signal: AbortSignal): AsyncGenerator<TelemetryRecord> {
    for (const r of this.lastImport?.records ?? []) { if (signal.aborted) return; yield r; }
  }
  async disconnect(): Promise<void> { this.lastImport = null; }
}

const WireRecord = z.union([Observation, SignalChunkWire]);
export const TelemetryBatch = z.object({ type: z.literal('batch'), records: z.array(z.unknown()).max(MAX_BATCH_RECORDS) });
export const MAX_WS_MESSAGE_CHARS = 1024 * 1024;

export interface DecodedWireRecord { record: TelemetryRecord; claimedOrigin: DataOrigin }
/**
 * Validate one wire record (schema + known metric + canonical unit) at a trust boundary.
 * The sender's `origin` is only a claim: it is returned separately as `claimedOrigin`, and the record is stamped
 * 'recorded' unless the RECEIVING code passes an origin it can vouch for. A peer can therefore never label data 'hardware'.
 */
export function decodeWireRecord(raw: unknown, trustedOrigin?: DataOrigin): DecodedWireRecord | null {
  const p = WireRecord.safeParse(raw);
  if (!p.success) return null;
  const d = p.data;
  if (!isMetric(d.metric) || d.unit !== METRICS[d.metric].unit) return null;
  const origin: DataOrigin = trustedOrigin ?? 'recorded';
  return { record: 'codec' in d ? decodeChunk({ ...d, origin }) : { ...d, origin }, claimedOrigin: d.origin };
}

interface SocketLike { onopen: ((e: unknown) => void) | null; onmessage: ((e: { data: unknown }) => void) | null; onclose: ((e: unknown) => void) | null; onerror: ((e: unknown) => void) | null; close(): void }
export interface WebSocketAdapterOptions {
  /** Origin the HOST vouches for. Without it every received record is stamped 'recorded', whatever the sender claims. */
  trustedOrigin?: DataOrigin;
  maxQueue?: number; maxBackoffMs?: number; baseBackoffMs?: number; connectTimeoutMs?: number; WebSocketCtor?: new (url: string) => SocketLike;
}

/** Receives `{type:"batch", records:[...]}` JSON messages. Every message and every record is validated; nothing is trusted. */
export class WebSocketAdapter implements TelemetryAdapter {
  readonly id = 'websocket';
  readonly stats = { messages: 0, rejectedMessages: 0, records: 0, rejectedRecords: 0, dropped: 0, reconnects: 0, claimedOrigins: {} as Partial<Record<DataOrigin, number>> };
  private queue: BoundedQueue<TelemetryRecord>;
  private socket: SocketLike | null = null;
  private url: string | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private opts: WebSocketAdapterOptions = {}) { this.queue = new BoundedQueue(opts.maxQueue ?? 10_000); }
  async capabilities(): Promise<AdapterCapabilities> { return capability('websocket'); }

  connect(config: AdapterConfig): Promise<void> {
    if (config.kind !== 'websocket') return Promise.reject(new Error('WebSocketAdapter requires a websocket config'));
    let u: URL;
    try { u = new URL(config.url); } catch { return Promise.reject(new Error('invalid WebSocket URL')); }
    if (u.protocol !== 'ws:' && u.protocol !== 'wss:') return Promise.reject(new Error('WebSocket URL must use ws: or wss:'));
    if (u.username || u.password) return Promise.reject(new Error('credentials in the URL are not allowed'));
    this.url = u.href; this.attempt = 0;
    this.queue = new BoundedQueue(this.opts.maxQueue ?? 10_000);
    return new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => { this.teardown(); reject(new Error('WebSocket connect timeout')); }, this.opts.connectTimeoutMs ?? 8000);
      this.open(() => { clearTimeout(t); resolve(); }, () => { clearTimeout(t); this.teardown(); reject(new Error('WebSocket connection failed')); });
    });
  }
  private open(onFirstOpen?: () => void, onFirstFail?: () => void): void {
    const Ctor = this.opts.WebSocketCtor ?? (globalThis as { WebSocket?: new (url: string) => SocketLike }).WebSocket;
    if (!Ctor || !this.url) { onFirstFail?.(); return; }
    let opened = false;
    const s = new Ctor(this.url);
    this.socket = s;
    s.onopen = () => { opened = true; this.attempt = 0; onFirstOpen?.(); };
    s.onmessage = (e) => this.handleMessage(e.data);
    s.onerror = () => { /* onclose follows */ };
    s.onclose = () => {
      if (this.socket !== s) return;
      this.socket = null;
      if (!opened && onFirstFail) { onFirstFail(); return; }
      if (this.url === null) return;
      const delay = Math.min(this.opts.maxBackoffMs ?? 30_000, (this.opts.baseBackoffMs ?? 500) * 2 ** Math.min(this.attempt++, 10));
      this.stats.reconnects++;
      this.timer = setTimeout(() => this.open(), delay);
    };
  }
  /** Public so tests and hosts can feed frames directly; the same validation applies to every path. */
  handleMessage(data: unknown): number {
    this.stats.messages++;
    if (typeof data !== 'string' || data.length > MAX_WS_MESSAGE_CHARS) { this.stats.rejectedMessages++; return 0; }
    let raw: unknown;
    try { raw = JSON.parse(data); } catch { this.stats.rejectedMessages++; return 0; }
    const batch = TelemetryBatch.safeParse(raw);
    if (!batch.success) { this.stats.rejectedMessages++; return 0; }
    let accepted = 0;
    for (const r of batch.data.records) {
      const rec = decodeWireRecord(r, this.opts.trustedOrigin);
      if (!rec) { this.stats.rejectedRecords++; continue; }
      this.stats.claimedOrigins[rec.claimedOrigin] = (this.stats.claimedOrigins[rec.claimedOrigin] ?? 0) + 1;
      this.queue.push(rec.record); accepted++;
    }
    this.stats.records += accepted; this.stats.dropped = this.queue.dropped;
    return accepted;
  }
  observations(signal: AbortSignal): AsyncIterable<TelemetryRecord> { return this.queue.drain(signal); }
  private teardown(): void {
    this.url = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const s = this.socket; this.socket = null;
    try { s?.close(); } catch { /* already closed */ }
  }
  async disconnect(): Promise<void> { this.teardown(); this.queue.close(); }
}

interface SerialPortLike { open(o: { baudRate: number }): Promise<void>; close(): Promise<void>; readable: ReadableStream<Uint8Array> | null }
interface SerialLike { requestPort(): Promise<SerialPortLike> }
const getSerial = (): SerialLike | null => (globalThis as { navigator?: { serial?: SerialLike } }).navigator?.serial ?? null;

export interface WebSerialAdapterOptions extends Omit<FrameContext, 'origin'> {
  /** Required: the caller states what is on the other end of the port ('hardware' for a physical device, 'simulated' for an emulator). */
  origin: DataOrigin;
  maxQueue?: number;
}
/** Web Serial reader for the reference frame. `requestPort()` is only ever called inside connect(), which must run in a user gesture. */
export class WebSerialAdapter implements TelemetryAdapter {
  readonly id = 'serial';
  readonly parser = new SerialFrameParser();
  readonly stats = { unmappedFrames: 0, dropped: 0 };
  private queue: BoundedQueue<TelemetryRecord>;
  private port: SerialPortLike | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  constructor(private opts: WebSerialAdapterOptions) { this.queue = new BoundedQueue(opts.maxQueue ?? 10_000); }
  async capabilities(): Promise<AdapterCapabilities> { return capability('serial'); }
  async connect(config: AdapterConfig): Promise<void> {
    if (config.kind !== 'serial') throw new Error('WebSerialAdapter requires a serial config');
    if (!Number.isInteger(config.baudRate) || config.baudRate < 300 || config.baudRate > 4_000_000) throw new Error('invalid baud rate');
    const serial = getSerial();
    if (!serial) throw new Error('Web Serial is not available in this browser');
    const port = await serial.requestPort(); // browser permission prompt; requires a user gesture
    await port.open({ baudRate: config.baudRate });
    if (!port.readable) { await port.close(); throw new Error('serial port is not readable'); }
    this.port = port; this.reader = port.readable.getReader();
    void this.pump(this.reader);
  }
  private async pump(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) this.feed(value);
      }
    } catch { /* port closed or device lost */ } finally { this.queue.close(); }
  }
  /** Parse raw bytes through the real frame parser (also used by tests and the emulator path). */
  feed(bytes: Uint8Array): void {
    for (const f of this.parser.push(bytes)) {
      const rec = frameToRecord(f, this.opts);
      if (rec) this.queue.push(rec); else this.stats.unmappedFrames++;
    }
    this.stats.dropped = this.queue.dropped;
  }
  observations(signal: AbortSignal): AsyncIterable<TelemetryRecord> { return this.queue.drain(signal); }
  async disconnect(): Promise<void> {
    try { await this.reader?.cancel(); } catch { /* ignore */ }
    try { this.reader?.releaseLock(); await this.port?.close(); } catch { /* ignore */ }
    this.reader = null; this.port = null; this.queue.close();
  }
}

/* ---------- capability report (truthful labels only) ---------- */
function capability(transport: AdapterCapabilities['transport']): AdapterCapabilities {
  const g = globalThis as { WebSocket?: unknown; navigator?: { serial?: unknown; mediaDevices?: { getUserMedia?: unknown } } };
  switch (transport) {
    case 'replay': return { id: 'replay', transport, supported: true, requiresUserGesture: false, verification: 'emulator-verified',
      note: `NDJSON/CSV import checked against bundled synthetic recordings only; imported data is labelled "recorded". ${NOT_VERIFIED_ON_HARDWARE}` };
    case 'websocket': return { id: 'websocket', transport, supported: typeof g.WebSocket === 'function', requiresUserGesture: false, verification: 'emulator-verified',
      note: `Batch protocol exercised with the software device emulator only. ${NOT_VERIFIED_ON_HARDWARE}` };
    case 'serial': return { id: 'serial', transport, supported: !!g.navigator?.serial, requiresUserGesture: true, verification: 'emulator-verified',
      note: `Reference frame parser exercised with emulator-generated bytes only. ${NOT_VERIFIED_ON_HARDWARE}` };
    case 'ble': return { id: 'ble', transport, supported: false, requiresUserGesture: true, verification: 'not implemented', note: 'Bluetooth LE transport is not implemented.' };
    case 'camera': return { id: 'camera', transport, supported: typeof g.navigator?.mediaDevices?.getUserMedia === 'function', requiresUserGesture: true, verification: 'not implemented',
      note: 'Local preview only. No measurement or inference is derived from camera frames (not implemented).' };
    case 'simulator': return { id: 'simulator', transport, supported: true, requiresUserGesture: false, verification: 'emulator-verified',
      note: 'Deterministic synthetic generator; all data is labelled "simulated". Not a physical instrument.' };
  }
}
export function detectCapabilities(): AdapterCapabilities[] {
  return (['simulator', 'replay', 'websocket', 'serial', 'ble', 'camera'] as const).map(capability);
}
