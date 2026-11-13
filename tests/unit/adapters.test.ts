import { describe, expect, it } from 'vitest';
import { METRIC_NAMES, encodeChunk, isChunk, type Observation, type SignalChunk } from '@aster/contracts';
import {
  FRAME_HEADER_BYTES, MAX_FRAME_SAMPLES, MAX_PARSER_BUFFER_BYTES, NO_CREW, ReplayAdapter, decodeWireRecord, SerialFrameParser, WebSerialAdapter, WebSocketAdapter, crc16, detectCapabilities, encodeFrame, frameToRecord, parseCsv, parseNdjson,
} from '@aster/adapters';

const obs = (i: number, over: Partial<Observation> = {}): Observation => ({
  schemaVersion: 1, id: `o-${i}`, missionId: 'm', runId: 'r', crewId: null, streamId: 'cabin:co2.cabin', sourceId: 'rec', sequence: i, observedAtMs: i * 1000,
  receivedAtUtc: '2026-01-01T00:00:00.000Z', clockUncertaintyMs: 0, metric: 'co2.cabin', value: 600 + i, unit: 'ppm', origin: 'simulated', quality: 'valid', qualityReasons: [], provenanceId: 'p', ...over,
});
const chunk = (i: number): SignalChunk => ({
  schemaVersion: 1, missionId: 'm', runId: 'r', crewId: 'crew-1', streamId: 'crew-1:mech.pvdf', sourceId: 'rec', sequence: i, startAtMs: i * 100, sampleRateHz: 200,
  samples: Float32Array.from({ length: 20 }, (_, k) => Math.sin(k)), unit: 'a.u.', origin: 'simulated', quality: 'valid', clockUncertaintyMs: 0, provenanceId: 'p', metric: 'mech.pvdf',
});
const ndjson = (rows: unknown[]): string => rows.map((r) => JSON.stringify(r)).join('\n');
const ctx = { missionId: 'm', runId: 'r', crewIds: ['crew-1', 'crew-2'], sourceId: 'emu' };
const id = (m: (typeof METRIC_NAMES)[number]): number => METRIC_NAMES.indexOf(m);

describe('replay importers', () => {
  it('imports NDJSON observations and signal chunks and relabels them as recorded', () => {
    const r = parseNdjson(ndjson([obs(0), obs(1), encodeChunk(chunk(0)), encodeChunk(chunk(1))]) + '\n');
    expect(r.errors).toEqual([]);
    expect(r.records).toHaveLength(4);
    expect(r.records.every((x) => x.origin === 'recorded')).toBe(true);
    const c = r.records.find(isChunk)!;
    expect(c.samples).toBeInstanceOf(Float32Array);
    expect(c.samples).toHaveLength(20);
    expect(r.preview).toMatchObject({ format: 'ndjson', origin: 'recorded', totalRows: 4, accepted: 4, rejected: 0, timeRangeMs: { startMs: 0, endMs: 1000 } });
    expect(r.preview.streams.map((s) => s.records)).toEqual([2, 2]);
  });

  it('imports CSV with the required header and with a column mapping', () => {
    const r = parseCsv('observedAtMs,crewId,metric,value,unit\n0,,co2.cabin,610,ppm\n1000,,co2.cabin,612.5,ppm\n0,crew-1,pulse.rate,64,beats/min\n');
    expect(r.errors).toEqual([]);
    expect(r.records).toHaveLength(3);
    expect(r.records.map((x) => x.origin)).toEqual(['recorded', 'recorded', 'recorded']);
    expect((r.records[2] as Observation).crewId).toBe('crew-1');
    expect((r.records[0] as Observation).crewId).toBeNull();
    const mapped = parseCsv('t,who,metric,reading,unit\n5,crew-1,contact.force,12,N\n', { mapping: { observedAtMs: 't', crewId: 'who', value: 'reading' } });
    expect(mapped.errors).toEqual([]);
    expect(mapped.records[0]).toMatchObject({ metric: 'contact.force', value: 12, observedAtMs: 5, crewId: 'crew-1' });
    expect(parseCsv('0,,co2.cabin,610,ppm\n').errors[0].message).toMatch(/header/);
  });

  it('rejects unit mismatches and unknown metrics instead of converting or guessing', () => {
    const n = parseNdjson(ndjson([obs(0), obs(1, { unit: '%' }), obs(2, { metric: 'co2.unknown' })]));
    expect(n.records).toHaveLength(1);
    expect(n.errors.map((e) => e.row)).toEqual([2, 3]);
    expect(n.errors[0].message).toMatch(/unit "%" does not match "ppm"/);
    expect(n.errors[1].message).toMatch(/unknown metric/);
    const c = parseCsv('observedAtMs,crewId,metric,value,unit\n0,,co2.cabin,0.06,%\n1,,nope,1,ppm\n');
    expect(c.records).toHaveLength(0);
    expect(c.errors.map((e) => e.row)).toEqual([2, 3]);
  });

  it('rejects duplicate ids, duplicate sequences and duplicate timestamps', () => {
    const n = parseNdjson(ndjson([obs(0), obs(0), obs(1, { id: 'o-0' }), obs(2, { sequence: 0 }), encodeChunk(chunk(0)), encodeChunk(chunk(0))]));
    expect(n.records).toHaveLength(2);
    expect(n.errors.map((e) => e.row)).toEqual([2, 3, 4, 6]);
    expect(n.errors.every((e) => /duplicate/.test(e.message))).toBe(true);
    const c = parseCsv('observedAtMs,crewId,metric,value,unit\n0,,co2.cabin,610,ppm\n0,,co2.cabin,611,ppm\n');
    expect(c.records).toHaveLength(1);
    expect(c.errors[0]).toMatchObject({ row: 3 });
    expect(c.errors[0].message).toMatch(/duplicate/);
  });

  it('rejects non-monotonic timestamps per stream and non-finite numbers', () => {
    const n = parseNdjson(ndjson([obs(5), obs(6), obs(7, { observedAtMs: 100 }), obs(8)]));
    expect(n.records).toHaveLength(3);
    expect(n.errors).toHaveLength(1);
    expect(n.errors[0]).toMatchObject({ row: 3 });
    expect(n.errors[0].message).toMatch(/non-monotonic/);
    const c = parseCsv('observedAtMs,crewId,metric,value,unit\n2000,,co2.cabin,610,ppm\n1000,,co2.cabin,611,ppm\n3000,,co2.cabin,NaN,ppm\n4000,,co2.cabin,Infinity,ppm\n5000,,co2.cabin,,ppm\nabc,,co2.cabin,1,ppm\n');
    expect(c.records).toHaveLength(1);
    expect(c.errors.map((e) => e.row)).toEqual([3, 4, 5, 6, 7]);
    expect(c.errors[0].message).toMatch(/non-monotonic/);
    expect(parseNdjson('{"schemaVersion":1,"value":1e999}\nnot json\n[1]').errors.map((e) => e.row)).toEqual([1, 2, 3]);
  });

  it('refuses oversize input and too many rows with a clear error', () => {
    const big = parseNdjson('x'.repeat(2048), { maxBytes: 1024 });
    expect(big.records).toHaveLength(0);
    expect(big.errors[0].message).toMatch(/exceeds the 1024 byte import limit/);
    const rows = parseCsv('observedAtMs,crewId,metric,value,unit\n' + Array.from({ length: 11 }, (_, i) => `${i},,co2.cabin,600,ppm`).join('\n'), { maxRows: 10 });
    expect(rows.records).toHaveLength(0);
    expect(rows.errors[0].message).toMatch(/above the 10 row import limit/);
    expect(parseNdjson('é'.repeat(600), { maxBytes: 1024 }).errors[0].message).toMatch(/exceeds/); // 1200 UTF-8 bytes
  });

  it('ReplayAdapter yields the imported records and honours cancellation', async () => {
    const a = new ReplayAdapter();
    await a.connect({ kind: 'replay', format: 'ndjson', text: ndjson([obs(0), obs(1), obs(2)]) });
    const ac = new AbortController(), seen: number[] = [];
    for await (const r of a.observations(ac.signal)) { seen.push(r.sequence); if (seen.length === 2) ac.abort(); }
    expect(seen).toEqual([0, 1]);
    await expect(a.connect({ kind: 'websocket', url: 'ws://127.0.0.1:1' })).rejects.toThrow();
  });
});

describe('serial reference frame', () => {
  it('uses CRC-16/CCITT-FALSE', () => {
    expect(crc16(new TextEncoder().encode('123456789'))).toBe(0x29b1);
  });

  it('round-trips scalar and chunk frames into contract records', () => {
    const p = new SerialFrameParser();
    const bytes = new Uint8Array([
      ...encodeFrame({ metricId: id('co2.cabin'), crewIndex: NO_CREW, sequence: 7, tMs: 123456, sampleRateHz: 0, samples: [2600.5] }),
      ...encodeFrame({ metricId: id('mech.pvdf'), crewIndex: 1, sequence: 8, tMs: 123500, sampleRateHz: 200, samples: [0.25, -0.5, 0.75] }),
    ]);
    const frames = p.push(bytes);
    expect(frames).toHaveLength(2);
    expect(p.stats).toMatchObject({ frames: 2, crcErrors: 0, resyncs: 0 });
    const scalar = frameToRecord(frames[0], ctx) as Observation;
    expect(scalar).toMatchObject({ metric: 'co2.cabin', unit: 'ppm', value: 2600.5, crewId: null, sequence: 7, observedAtMs: 123456, origin: 'simulated', quality: 'valid' });
    const ch = frameToRecord(frames[1], ctx) as SignalChunk;
    expect(isChunk(ch)).toBe(true);
    expect(ch).toMatchObject({ metric: 'mech.pvdf', unit: 'a.u.', crewId: 'crew-2', sampleRateHz: 200, startAtMs: 123500, origin: 'simulated' });
    expect(Array.from(ch.samples)).toEqual([0.25, -0.5, 0.75]);
  });

  it('labels origin "hardware" only when the caller says so, and refuses unmappable frames', () => {
    const [f] = new SerialFrameParser().push(encodeFrame({ metricId: id('contact.force'), crewIndex: 0, sequence: 1, tMs: 10, sampleRateHz: 10, samples: [1, 2] }));
    expect(frameToRecord(f, ctx)!.origin).toBe('simulated');
    expect(frameToRecord(f, { ...ctx, origin: 'hardware' })!.origin).toBe('hardware');
    expect(frameToRecord({ ...f, crewIndex: 9 }, ctx)).toBeNull(); // unknown crew
    expect(frameToRecord({ ...f, crewIndex: NO_CREW }, ctx)).toBeNull(); // chunk without a crew
    const [nan] = new SerialFrameParser().push(encodeFrame({ metricId: id('co2.cabin'), crewIndex: NO_CREW, sequence: 1, tMs: 10, sampleRateHz: 0, samples: [NaN] }));
    expect(frameToRecord(nan, ctx)).toMatchObject({ value: null, quality: 'invalid' });
  });

  it('reassembles frames split across arbitrary chunk boundaries', () => {
    const frames = Array.from({ length: 12 }, (_, i) => encodeFrame({ metricId: id('contact.force'), crewIndex: 0, sequence: i, tMs: i * 1000, sampleRateHz: 10, samples: Array.from({ length: 10 }, (_, k) => i + k / 10) }));
    const stream = new Uint8Array(frames.flatMap((f) => [...f]));
    for (const size of [1, 3, 7, 19, 64]) {
      const p = new SerialFrameParser(), out = [];
      for (let o = 0; o < stream.length; o += size) out.push(...p.push(stream.subarray(o, o + size)));
      expect(out.map((f) => f.sequence)).toEqual(frames.map((_, i) => i));
      expect(p.stats).toMatchObject({ frames: 12, crcErrors: 0, resyncs: 0 });
    }
  });

  it('rejects a corrupted frame by CRC and resynchronises on the next good frame', () => {
    const mk = (seq: number): Uint8Array => encodeFrame({ metricId: id('contact.force'), crewIndex: 0, sequence: seq, tMs: seq, sampleRateHz: 10, samples: [1, 2, 3, 4] });
    const bad = mk(2);
    bad[FRAME_HEADER_BYTES + 5] ^= 0xff; // flip a payload byte
    const p = new SerialFrameParser();
    const out = p.push(new Uint8Array([0x00, 0x13, 0xa5, ...mk(1), ...bad, 0xa5, 0x5a, 0x09, ...mk(3)]));
    expect(out.map((f) => f.sequence)).toEqual([1, 3]);
    expect(p.stats.crcErrors).toBe(1);
    expect(p.stats.resyncs).toBeGreaterThanOrEqual(2);
    expect(p.stats.frames).toBe(2);
  });

  it('rejects an oversized count without buffering it, and encodeFrame refuses to build one', () => {
    const good = encodeFrame({ metricId: id('contact.force'), crewIndex: 0, sequence: 5, tMs: 5, sampleRateHz: 10, samples: [1] });
    const huge = good.slice();
    new DataView(huge.buffer).setUint16(15, MAX_FRAME_SAMPLES + 1, true);
    const p = new SerialFrameParser();
    expect(p.push(huge)).toHaveLength(0);
    expect(p.stats.resyncs).toBe(1);
    expect(p.push(good).map((f) => f.sequence)).toEqual([5]);
    expect(() => encodeFrame({ metricId: 0, crewIndex: 0, sequence: 0, tMs: 0, sampleRateHz: 10, samples: new Array(MAX_FRAME_SAMPLES + 1).fill(0) })).toThrow(RangeError);
    expect(() => encodeFrame({ metricId: 200, crewIndex: 0, sequence: 0, tMs: 0, sampleRateHz: 10, samples: [0] })).toThrow(RangeError);
    expect(() => encodeFrame({ metricId: 0, crewIndex: 0, sequence: 0, tMs: 0, sampleRateHz: 0, samples: [0, 1] })).toThrow(RangeError);
  });

  it('WebSerialAdapter feeds bytes through the same parser and only prompts inside connect()', async () => {
    const a = new WebSerialAdapter({ ...ctx, origin: 'simulated' });
    a.feed(encodeFrame({ metricId: id('contact.force'), crewIndex: 0, sequence: 1, tMs: 10, sampleRateHz: 10, samples: [1, 2] }));
    const ac = new AbortController();
    for await (const r of a.observations(ac.signal)) { expect(r.origin).toBe('simulated'); ac.abort(); }
    expect(a.parser.stats.frames).toBe(1);
    await expect(a.connect({ kind: 'serial', baudRate: 115200 })).rejects.toThrow(/not available/); // no navigator.serial in Node
  });
});

describe('WebSocket adapter', () => {
  it('accepts valid batches and rejects malformed messages and records', () => {
    const a = new WebSocketAdapter();
    expect(a.handleMessage(JSON.stringify({ type: 'batch', records: [obs(0), encodeChunk(chunk(0))] }))).toBe(2);
    expect(a.handleMessage('{not json')).toBe(0);
    expect(a.handleMessage(new Uint8Array([1, 2, 3]))).toBe(0);
    expect(a.handleMessage(JSON.stringify({ type: 'hello' }))).toBe(0);
    expect(a.handleMessage(JSON.stringify({ type: 'batch', records: 'nope' }))).toBe(0);
    expect(a.handleMessage(JSON.stringify({ type: 'batch', records: new Array(5001).fill(obs(0)) }))).toBe(0);
    expect(a.handleMessage(JSON.stringify({ type: 'batch', records: [obs(1), obs(2, { unit: '%' }), { ...obs(3), value: 'high' }, { ...obs(4), __proto__: null, metric: 'x.y' }, null] }))).toBe(1);
    expect(a.stats).toMatchObject({ messages: 7, rejectedMessages: 5, records: 3, rejectedRecords: 4 });
  });

  it('applies drop-oldest backpressure on a bounded queue and stops on abort', async () => {
    const a = new WebSocketAdapter({ maxQueue: 3 });
    a.handleMessage(JSON.stringify({ type: 'batch', records: [0, 1, 2, 3, 4].map((i) => obs(i)) }));
    expect(a.stats.dropped).toBe(2);
    const ac = new AbortController(), seen: number[] = [];
    for await (const r of a.observations(ac.signal)) { seen.push(r.sequence); if (seen.length === 3) ac.abort(); }
    expect(seen).toEqual([2, 3, 4]);
  });

  it('validates the URL and reconnects with backoff after the socket drops', async () => {
    const a0 = new WebSocketAdapter();
    await expect(a0.connect({ kind: 'websocket', url: 'http://127.0.0.1:1/x' })).rejects.toThrow(/ws: or wss:/);
    await expect(a0.connect({ kind: 'websocket', url: 'ws://user:pw@127.0.0.1:1/x' })).rejects.toThrow(/credentials/);
    const sockets: FakeSocket[] = [];
    class FakeSocket {
      onopen: ((e: unknown) => void) | null = null; onmessage: ((e: { data: unknown }) => void) | null = null; onclose: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null;
      closed = false;
      constructor(readonly url: string) { sockets.push(this); queueMicrotask(() => this.onopen?.({})); }
      close(): void { this.closed = true; }
    }
    const a = new WebSocketAdapter({ WebSocketCtor: FakeSocket, baseBackoffMs: 5 });
    await a.connect({ kind: 'websocket', url: 'ws://127.0.0.1:9/telemetry' });
    sockets[0].onmessage!({ data: JSON.stringify({ type: 'batch', records: [obs(0)] }) });
    sockets[0].onclose!({});
    await new Promise((r) => setTimeout(r, 40));
    expect(sockets).toHaveLength(2);
    expect(a.stats).toMatchObject({ records: 1, reconnects: 1 });
    await a.disconnect();
    expect(sockets[1].closed).toBe(true);
    sockets[1].onclose!({});
    await new Promise((r) => setTimeout(r, 30));
    expect(sockets).toHaveLength(2); // no reconnect after disconnect()
  });
});

describe('capabilities', () => {
  it('reports truthful verification labels and never claims hardware verification', () => {
    const caps = detectCapabilities();
    const by = Object.fromEntries(caps.map((c) => [c.transport, c]));
    expect(Object.keys(by).sort()).toEqual(['ble', 'camera', 'replay', 'serial', 'simulator', 'websocket']);
    expect(by.replay.verification).toBe('emulator-verified');
    expect(by.websocket.verification).toBe('emulator-verified');
    expect(by.serial).toMatchObject({ verification: 'emulator-verified', requiresUserGesture: true, supported: false });
    expect(by.ble).toMatchObject({ verification: 'not implemented', supported: false });
    expect(by.camera.verification).toBe('not implemented');
    expect(by.simulator.verification).toBe('emulator-verified');
    for (const c of caps) {
      expect(c.verification).not.toBe('hardware-verified');
      expect(c.note.replace(/not hardware-verified/g, '')).not.toMatch(/hardware-verified|verified (on|with) (a )?(physical|real)/i);
    }
  });
});

describe('security regressions', () => {
  it('CSV number parsing has no catastrophic backtracking and long fields/lines are row errors', () => {
    const header = 'observedAtMs,crewId,metric,value,unit\n';
    const t0 = performance.now();
    const huge = parseCsv(`${header}0,,co2.cabin,${'1'.repeat(200_000)}x,ppm\n1,,co2.cabin,600,ppm\n`);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(huge.records).toHaveLength(1);
    expect(huge.errors).toEqual([{ row: 2, message: 'line exceeds 4096 characters' }]);
    // inside the line cap, a numeric field longer than 32 characters is refused before any regex runs
    const t1 = performance.now();
    const long = parseCsv(`${header}0,,co2.cabin,${'1'.repeat(4000)}x,ppm\n1,,co2.cabin,${'9'.repeat(33)},ppm\n2,,co2.cabin,1.5e2,ppm\n3,,co2.cabin,1..5,ppm\n`);
    expect(performance.now() - t1).toBeLessThan(200);
    expect(long.errors.map((e) => e.row)).toEqual([2, 3, 5]);
    expect(long.errors.every((e) => /not a finite number/.test(e.message))).toBe(true);
    expect((long.records[0] as Observation).value).toBe(150);
    expect(parseCsv(`${'h'.repeat(5000)}\n`).errors[0].message).toMatch(/header row is malformed/);
  });

  it('NDJSON lines above the per-line cap are row errors, not parsed', () => {
    const r = parseNdjson([JSON.stringify(obs(0)), JSON.stringify({ ...obs(1), pad: 'x'.repeat(300 * 1024) }), JSON.stringify(obs(2))].join('\n'));
    expect(r.records).toHaveLength(2);
    expect(r.errors).toEqual([{ row: 2, message: 'line exceeds 262144 characters' }]);
  });

  it('never keeps a sender-chosen origin: wire records are stamped "recorded" unless the receiver passes a trusted origin', () => {
    const claimed = decodeWireRecord(obs(0, { origin: 'hardware' }))!;
    expect(claimed.record.origin).toBe('recorded');
    expect(claimed.claimedOrigin).toBe('hardware');
    const ch = decodeWireRecord({ ...encodeChunk(chunk(0)), origin: 'hardware' })!;
    expect(ch.record.origin).toBe('recorded');
    expect(isChunk(ch.record)).toBe(true);
    expect(decodeWireRecord(obs(0, { origin: 'hardware' }), 'simulated')!.record.origin).toBe('simulated');

    const a = new WebSocketAdapter();
    a.handleMessage(JSON.stringify({ type: 'batch', records: [obs(0, { origin: 'hardware' }), obs(1, { origin: 'simulated' }), { ...encodeChunk(chunk(0)), origin: 'hardware' }] }));
    expect(a.stats.claimedOrigins).toEqual({ hardware: 2, simulated: 1 });
    const trusted = new WebSocketAdapter({ trustedOrigin: 'simulated' });
    trusted.handleMessage(JSON.stringify({ type: 'batch', records: [obs(0, { origin: 'hardware' })] }));
    return (async () => {
      for (const [adapter, expected] of [[a, 'recorded'], [trusted, 'simulated']] as const) {
        const ac = new AbortController(), seen: string[] = [];
        setTimeout(() => ac.abort(), 20);
        for await (const r of adapter.observations(ac.signal)) seen.push(r.origin);
        expect(seen.length).toBeGreaterThan(0);
        expect(new Set(seen)).toEqual(new Set([expected]));
      }
    })();
  });

  it('serial parser stays linear on 1 MB of adversarial headers with bad CRCs and recovers afterwards', () => {
    // 17-byte headers, each announcing the maximum sample count, back to back: every one is a CRC candidate over ~4 KB.
    const header = encodeFrame({ metricId: id('contact.force'), crewIndex: 0, sequence: 1, tMs: 1, sampleRateHz: 10, samples: new Array(MAX_FRAME_SAMPLES).fill(0) }).subarray(0, FRAME_HEADER_BYTES);
    const flood = new Uint8Array(1024 * 1024);
    for (let o = 0; o + FRAME_HEADER_BYTES <= flood.length; o += FRAME_HEADER_BYTES) flood.set(header, o);
    const p = new SerialFrameParser();
    const t0 = performance.now();
    const out = p.push(flood);
    const ms = performance.now() - t0;
    expect(out).toHaveLength(0);
    expect(ms).toBeLessThan(500);
    expect(p.stats.crcErrors).toBeGreaterThan(100);
    expect(p.stats.crcErrors).toBeLessThan(1000); // not one CRC per header (that would be ~61 000)

    // same flood delivered in small reads: still bounded, and the retained buffer never exceeds one frame
    const q = new SerialFrameParser();
    const t1 = performance.now();
    for (let o = 0; o < flood.length; o += 4096) q.push(flood.subarray(o, o + 4096));
    expect(performance.now() - t1).toBeLessThan(500);
    expect((q as unknown as { buf: Uint8Array }).buf.length).toBeLessThanOrEqual(MAX_PARSER_BUFFER_BYTES);

    // good frames after the flood are parsed again
    const good = Array.from({ length: 400 }, (_, i) => encodeFrame({ metricId: id('contact.force'), crewIndex: 0, sequence: 1000 + i, tMs: i, sampleRateHz: 10, samples: [1, 2, 3, 4] }));
    const after = p.push(new Uint8Array(good.flatMap((f) => [...f])));
    expect(after.length).toBeGreaterThan(200);
    expect(after[after.length - 1].sequence).toBe(1399);
  });

  it('garbage without any sync pattern is discarded in one pass', () => {
    const p = new SerialFrameParser();
    const t0 = performance.now();
    expect(p.push(new Uint8Array(1024 * 1024).fill(0x11))).toHaveLength(0);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(p.stats).toMatchObject({ frames: 0, crcErrors: 0, resyncs: 1, bytesDiscarded: 1024 * 1024 });
  });
});
