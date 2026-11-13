/**
 * ASTER reference DEVICE EMULATOR (software only; every record is labelled origin "simulated").
 * It is not a physical instrument and proves nothing about hardware. It exists to exercise the real ingest path:
 *   synthetic samples -> encodeFrame (serial reference frame) -> byte stream (optionally corrupted)
 *   -> SerialFrameParser + frameToRecord (the same parser a serial device would hit) -> WebSocket batch -> gateway.
 * The gateway validates and counts these as "external telemetry"; they are never merged into the simulated run.
 *
 * Usage: tsx scripts/device-emulator.ts [--url ws://127.0.0.1:4310/api/v1/telemetry] [--seconds 5] [--corrupt]
 *        (set ASTER_API_TOKEN when the gateway requires a bearer token)
 */
import WebSocket from 'ws';
import { METRIC_NAMES, encodeChunk, isChunk, type Metric } from '@aster/contracts';
import { NO_CREW, SerialFrameParser, encodeFrame, frameToRecord } from '@aster/adapters';

const args = process.argv.slice(2);
const flag = (name: string): boolean => args.includes(`--${name}`);
const option = (name: string, fallback: string): string => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const url = option('url', 'ws://127.0.0.1:4310/api/v1/telemetry');
const seconds = Math.max(1, Math.min(600, Number(option('seconds', '5')) || 5));
const corrupt = flag('corrupt');
const token = process.env.ASTER_API_TOKEN;

const metricId = (m: Metric): number => METRIC_NAMES.indexOf(m);
let state = 0x2545f491;
const rand = (): number => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }; // deterministic LCG

/** One second of synthetic device output as serial frames. */
function framesForSecond(sec: number): Uint8Array[] {
  const tMs = sec * 1000;
  const force = Array.from({ length: 10 }, (_, i) => 12 + 1.5 * Math.sin((sec * 10 + i) / 7) + (rand() - 0.5) * 0.2);
  const pvdf = Array.from({ length: 200 }, (_, i) => 0.3 * Math.sin((2 * Math.PI * 18 * i) / 200) + (rand() - 0.5) * 0.05);
  return [
    encodeFrame({ metricId: metricId('contact.force'), crewIndex: 0, sequence: sec, tMs, sampleRateHz: 10, samples: force }),
    encodeFrame({ metricId: metricId('co2.cabin'), crewIndex: NO_CREW, sequence: sec, tMs, sampleRateHz: 0, samples: [2600 + 40 * Math.sin(sec / 30) + (rand() - 0.5) * 10] }),
    encodeFrame({ metricId: metricId('mech.pvdf'), crewIndex: 0, sequence: sec, tMs, sampleRateHz: 200, samples: pvdf }),
  ];
}

async function main(): Promise<void> {
  console.log(`[device-emulator] EMULATOR / simulated origin. Target ${url}; ${seconds} s${corrupt ? '; corrupting one frame per second' : ''}`);
  const ws = new WebSocket(url, { headers: token ? { authorization: `Bearer ${token}` } : undefined, handshakeTimeout: 5000, maxPayload: 256 * 1024 });
  await new Promise<void>((resolve, reject) => { ws.once('open', () => resolve()); ws.once('error', reject); ws.once('unexpected-response', (_q, res) => reject(new Error(`gateway refused the connection (HTTP ${res.statusCode})`))); });

  const parser = new SerialFrameParser();
  const totals = { framesEncoded: 0, framesCorrupted: 0, recordsSent: 0, accepted: 0, rejected: 0, acks: 0 };
  const waiters: (() => void)[] = [];
  ws.on('message', (data) => {
    let m: { type?: string; accepted?: number; rejected?: number } = {};
    try { m = JSON.parse(data.toString()) as typeof m; } catch { return; }
    if (m.type === 'view') return; // periodic mission view push; not used by a device
    if (m.type === 'ack') { totals.accepted += Number(m.accepted) || 0; totals.rejected += Number(m.rejected) || 0; }
    totals.acks++; waiters.shift()?.();
  });

  for (let sec = 0; sec < seconds; sec++) {
    const frames = framesForSecond(sec);
    totals.framesEncoded += frames.length;
    if (corrupt) { const f = frames[sec % frames.length]; f[Math.floor(f.length / 2)] ^= 0x5a; totals.framesCorrupted++; }
    const stream = Buffer.concat(frames);
    const records = [];
    // Deliver the byte stream in awkward slices, like a UART would, so frames are split across reads.
    for (let p = 0; p < stream.length; p += 61) {
      for (const frame of parser.push(stream.subarray(p, Math.min(stream.length, p + 61)))) {
        const rec = frameToRecord(frame, { missionId: 'device-emulator', runId: 'emulator-session', crewIds: ['crew-1'], sourceId: 'device-emulator', origin: 'simulated' });
        if (rec) records.push(isChunk(rec) ? encodeChunk(rec) : rec);
      }
    }
    const acked = new Promise<void>((resolve) => { waiters.push(resolve); setTimeout(resolve, 3000); });
    ws.send(JSON.stringify({ type: 'batch', records }));
    totals.recordsSent += records.length;
    await acked;
    if (sec < seconds - 1) await new Promise((r) => setTimeout(r, 1000));
  }
  ws.close();
  console.log(`[device-emulator] frames encoded ${totals.framesEncoded}, corrupted on purpose ${totals.framesCorrupted}`);
  console.log(`[device-emulator] parser: frames ${parser.stats.frames}, crcErrors ${parser.stats.crcErrors}, resyncs ${parser.stats.resyncs}`);
  console.log(`[device-emulator] gateway: records sent ${totals.recordsSent}, accepted ${totals.accepted}, rejected ${totals.rejected} (sent with claimed origin "simulated"; the gateway stamps external records "recorded", counts them as external telemetry and never merges them into the run)`);
}

main().catch((e: unknown) => { console.error(`[device-emulator] ${e instanceof Error ? e.message : 'failed'}`); process.exit(1); });
