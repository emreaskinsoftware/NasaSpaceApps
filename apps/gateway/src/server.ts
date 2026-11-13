/**
 * ASTER mission gateway: the local mission-workstation process (research prototype, simulated data only).
 * Owns ONE MissionRuntime ticking at 1x wall time, persists run spec + command log + event revisions to SQLite,
 * and talks to the separate ground process over real HTTP (HttpTransport). After a restart the run is rebuilt
 * deterministically from (spec, command log, last checkpoint time): same events, same acknowledgements.
 * Telemetry received on the WebSocket from a device/emulator is validated and COUNTED only ("external telemetry");
 * it is never merged into the simulated run, so emulator data can not be mislabelled as part of the run.
 */
import { readFileSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { GroundReply, isMetric, type HealthEvent, type Metric, type ReferenceSession } from '@aster/contracts';
import { CommandSchema, MissionRuntime, newRunSpec, type Command, type CommandInput, type RunSpec } from '@aster/runtime';
import { TICK_MS, scenarioCatalog } from '@aster/simulator';
import { TelemetryBatch, decodeWireRecord, detectCapabilities, parseCsv, parseNdjson } from '@aster/adapters';
import {
  BODY_LIMIT_BYTES, HttpError, ID_PATTERN, WS_PROTOCOL, envPort, isEntryPoint, openDb, parse, registerRateLimit, registerSecurity, resolveSecurity, securityFromEnv, serverOptions, transaction,
  type SecurityOptions,
} from './common';
import { HttpTransport } from './transports/http';

export interface GatewayOptions extends SecurityOptions {
  dataDir?: string;
  scenarioId?: string;
  seed?: number;
  groundUrl?: string;
  groundToken?: string;
  /** false = the host drives time through `app.aster.advance()` (tests). Default true: 1x wall time. */
  autoTick?: boolean;
  /** Start a new run even when a stored run for this scenario/seed exists. */
  freshRun?: boolean;
  bodyLimit?: number;
  /** State-changing (POST) requests allowed per remote address per minute. Default 30. */
  rateLimitPerMin?: number;
  /** A WebSocket that answers no ping and sends nothing for this long is closed. Default 60 s. */
  wsIdleMs?: number;
}
export interface GatewayControl {
  readonly runtime: MissionRuntime;
  readonly transport: HttpTransport;
  readonly recovered: boolean;
  /** Stored command rows that failed validation at recovery and were not replayed. */
  readonly droppedCommands: number;
  readonly events: readonly HealthEvent[];
  readonly external: ExternalTelemetry;
  /** Advance mission time synchronously (manual-clock hosts only). */
  advance(ms: number): void;
  apply(input: CommandInput): Command;
  /** Let pending HTTP exchanges with ground finish and move their results into the runtime. */
  settle(): Promise<void>;
}
/** Counters for device/emulator data received over the WebSocket. Not part of the simulated run. */
export interface ExternalTelemetry {
  connections: number; openConnections: number; batches: number; acceptedRecords: number; rejectedRecords: number; rejectedMessages: number; rateLimited: number; idleClosed: number;
  /** Origin label as CLAIMED by the sender; unverified and never applied to a record. */
  claimedOrigins: Record<string, number>;
  /** Origin the gateway stamps on every externally received record, whatever the sender claims. */
  stampedOrigin: 'recorded';
  mergedIntoRun: false;
}
declare module 'fastify' { interface FastifyInstance { aster: GatewayControl } }

const MIGRATIONS = [
  `CREATE TABLE runs (run_id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, scenario_id TEXT NOT NULL, seed INTEGER NOT NULL, spec TEXT NOT NULL, manifest TEXT NOT NULL, last_time_ms INTEGER NOT NULL DEFAULT 0, created_at_utc TEXT NOT NULL);
   CREATE TABLE commands (run_id TEXT NOT NULL REFERENCES runs(run_id), seq INTEGER NOT NULL, t INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (run_id, seq));
   CREATE TABLE events (n INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL REFERENCES runs(run_id), event_id TEXT NOT NULL, revision INTEGER NOT NULL, body TEXT NOT NULL, UNIQUE (run_id, event_id, revision));`,
  `ALTER TABLE runs ADD COLUMN reply_cursor INTEGER NOT NULL DEFAULT 0;
   CREATE TABLE replies (run_id TEXT NOT NULL REFERENCES runs(run_id), seq INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (run_id, seq));`,
];

const CHECKPOINT_MS = 2000;
const VIEW_PUSH_MS = 500;
const WS_MAX_PAYLOAD_BYTES = 512 * 1024;
const WS_MAX_MESSAGES_PER_SEC = 40;
const WS_MAX_CLIENTS = 16;
const WS_MAX_BUFFERED_BYTES = 1024 * 1024;
const WS_IDLE_MS = 60_000;
const POSTS_PER_MINUTE = 30;

const idParam = z.string().regex(ID_PATTERN);
const IdParams = z.object({ id: idParam });
const EventsQuery = z.object({ after: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(500).default(200) });
const SnapshotQuery = z.object({
  crewId: idParam.optional(),
  windowMs: z.coerce.number().int().min(1000).max(30 * 60 * 1000).default(60_000),
  metrics: z.string().max(400).optional().transform((s) => (s ? s.split(',') : [])).pipe(z.array(z.string().refine(isMetric, 'unknown metric')).max(8)),
});
const ImportBody = z.strictObject({ text: z.string().max(BODY_LIMIT_BYTES), format: z.enum(['ndjson', 'csv']).default('ndjson') });
const SpecRow = z.object({ missionId: idParam, runId: idParam, parentRunId: idParam.nullable(), forkedAtMs: z.number().nullable(), scenarioId: idParam, seed: z.number().int(), startedAtUtc: z.string().max(40), crewIds: z.array(idParam).min(1).max(16), codeCommit: z.string().max(80) });

const loadReferences = (): Record<string, ReferenceSession[]> =>
  JSON.parse(readFileSync(new URL('../../../data/reference/sessions.json', import.meta.url), 'utf8')) as Record<string, ReferenceSession[]>;

export async function buildGateway(opts: GatewayOptions = {}): Promise<FastifyInstance> {
  const sec = resolveSecurity(opts);
  const scenarioId = opts.scenarioId ?? 'SIM-12', seed = opts.seed ?? 7;
  if (!scenarioCatalog().some((s) => s.id === scenarioId)) throw new Error('Unknown scenario id');
  if (!Number.isSafeInteger(seed)) throw new Error('Seed must be an integer');
  const refs = loadReferences();
  const db = openDb(opts.dataDir ?? '.aster-data', 'gateway.sqlite', MIGRATIONS);

  /* ---------- run: recover from the database or start a new one ---------- */
  const stored = opts.freshRun ? undefined
    : db.prepare('SELECT run_id, spec, last_time_ms, reply_cursor FROM runs WHERE scenario_id = ? AND seed = ? ORDER BY rowid DESC LIMIT 1').get(scenarioId, seed) as { run_id: string; spec: string; last_time_ms: number; reply_cursor: number } | undefined;
  let spec: RunSpec, transport: HttpTransport;
  try {
    spec = stored ? SpecRow.parse(JSON.parse(stored.spec)) : newRunSpec(scenarioId, seed);
    transport = new HttpTransport({
      baseUrl: opts.groundUrl ?? 'http://127.0.0.1:4320', runId: spec.runId, token: opts.groundToken ?? null, cursor: stored?.reply_cursor ?? 0,
      // Reply and cursor are persisted together, so a restart resumes after the last stored reply instead of re-reading from 0.
      onReply: (seq, reply) => transaction(db, () => {
        if (reply) db.prepare('INSERT OR IGNORE INTO replies (run_id, seq, body) VALUES (?, ?, ?)').run(spec.runId, seq, JSON.stringify(reply));
        db.prepare('UPDATE runs SET reply_cursor = ? WHERE run_id = ?').run(seq, spec.runId);
      }),
    });
  } catch (e) { db.close(); throw e; }
  // Every stored command row is validated before it may be replayed; invalid rows are dropped and counted, never executed.
  const commandRows = stored ? db.prepare('SELECT seq, body FROM commands WHERE run_id = ? ORDER BY seq').all(stored.run_id) as { seq: number; body: string }[] : [];
  const storedCommands: Command[] = [];
  let droppedCommands = 0;
  for (const row of commandRows) {
    let parsed: ReturnType<typeof CommandSchema.safeParse> | null = null;
    try { parsed = CommandSchema.safeParse(JSON.parse(row.body)); } catch { /* counted below */ }
    if (parsed?.success) storedCommands.push(parsed.data as Command); else droppedCommands++;
  }
  // Same construction as MissionRuntime.replay(spec, refs, commands, t), but bound to the real transport. The transport
  // is paused while replaying so nothing is transmitted on a fast-forwarded clock; queued cases are sent afterwards and
  // de-duplicated by ground (idempotent by packageId).
  transport.paused = true;
  const rt = new MissionRuntime(spec, refs, { commands: storedCommands, transport });
  if (stored) {
    const lastCommandT = storedCommands.length ? storedCommands[storedCommands.length - 1].t + TICK_MS : 0;
    const toMs = Math.max(stored.last_time_ms, lastCommandT);
    while (rt.nowMs < toMs) rt.tick();
    // Replies accepted before the restart come back from the local database (not from ground) once their packages exist again.
    const kept: GroundReply[] = [];
    for (const row of db.prepare('SELECT body FROM replies WHERE run_id = ? ORDER BY seq').all(stored.run_id) as { body: string }[]) {
      try { const r = GroundReply.safeParse(JSON.parse(row.body)); if (r.success) kept.push(r.data); } catch { /* skip corrupt row */ }
    }
    transport.restore(kept);
    rt.pump();
  } else {
    db.prepare('INSERT INTO runs (run_id, mission_id, scenario_id, seed, spec, manifest, created_at_utc) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(spec.runId, spec.missionId, scenarioId, seed, JSON.stringify(spec), JSON.stringify(rt.manifest), new Date().toISOString());
  }
  transport.paused = false;
  droppedCommands += rt.droppedCommands;

  const insertEvent = db.prepare('INSERT OR IGNORE INTO events (run_id, event_id, revision, body) VALUES (?, ?, ?, ?)');
  const insertCommand = db.prepare('INSERT INTO commands (run_id, seq, t, body) VALUES (?, ?, ?, ?)');
  const saveTime = db.prepare('UPDATE runs SET last_time_ms = ? WHERE run_id = ?');
  const events: HealthEvent[] = [];
  let commandSeq = commandRows.length ? commandRows[commandRows.length - 1].seq + 1 : 0, lastCheckpoint = rt.nowMs;
  const drainEvents = (): void => {
    const fresh = rt.newEvents.splice(0);
    if (!fresh.length) return;
    events.push(...fresh);
    transaction(db, () => { for (const ev of fresh) insertEvent.run(spec.runId, ev.id, ev.revision, JSON.stringify(ev)); });
  };
  const checkpoint = (): void => { saveTime.run(rt.nowMs, spec.runId); lastCheckpoint = rt.nowMs; };
  const step = (): void => { rt.tick(); drainEvents(); if (rt.nowMs - lastCheckpoint >= CHECKPOINT_MS) checkpoint(); };
  const apply = (input: CommandInput): Command => {
    const cmd = rt.apply(input);
    transaction(db, () => { insertCommand.run(spec.runId, commandSeq++, cmd.t, JSON.stringify(cmd)); saveTime.run(rt.nowMs, spec.runId); });
    lastCheckpoint = rt.nowMs;
    drainEvents();
    return cmd;
  };
  drainEvents();

  const external: ExternalTelemetry = { connections: 0, openConnections: 0, batches: 0, acceptedRecords: 0, rejectedRecords: 0, rejectedMessages: 0, rateLimited: 0, idleClosed: 0, claimedOrigins: {}, stampedOrigin: 'recorded', mergedIntoRun: false };
  const control: GatewayControl = {
    runtime: rt, transport, recovered: stored !== undefined, droppedCommands, events, external, apply,
    advance(ms) { const to = rt.nowMs + ms; while (rt.nowMs < to) step(); },
    async settle() { await transport.cycle(); await transport.idle(); rt.pump(); drainEvents(); },
  };

  /* ---------- HTTP ---------- */
  const app = Fastify(serverOptions(opts.bodyLimit));
  registerSecurity(app, sec);
  registerRateLimit(app, { max: opts.rateLimitPerMin ?? POSTS_PER_MINUTE, windowMs: 60_000, methods: ['POST'] });
  app.decorate('aster', control);
  for (const type of ['text/plain', 'application/x-ndjson']) app.addContentTypeParser(type, { parseAs: 'string' }, (_req, body, done) => done(null, body));
  await app.register(websocket, {
    options: {
      maxPayload: WS_MAX_PAYLOAD_BYTES,
      // Only ever select the plain protocol name; the bearer-carrying subprotocol is never echoed back.
      handleProtocols: (protocols: Set<string>) => (protocols.has(WS_PROTOCOL) ? WS_PROTOCOL : false),
    },
  });

  const mission = (id: string): void => { if (id !== spec.missionId) throw new HttpError(404, 'not_found'); };
  const eventOr404 = (id: string): HealthEvent => { const ev = rt.latestEvent(id); if (!ev) throw new HttpError(404, 'not_found'); return ev; };

  app.get('/health', async () => ({ ok: true, service: 'aster-gateway', dataOrigin: 'simulated', timeProfile: '1x wall time', recovery: { recovered: control.recovered, droppedCommands } }));

  app.get('/api/v1/capabilities', async () => ({
    context: 'gateway process (browser-only transports are reported by the web app itself)',
    capabilities: detectCapabilities(),
    run: { missionId: spec.missionId, runId: spec.runId, scenarioId, seed, origin: 'simulated', recovered: control.recovered },
  }));

  app.get('/api/v1/missions/:id/snapshot', async (req) => {
    mission(parse(IdParams, req.params).id);
    const q = parse(SnapshotQuery, req.query);
    // Simulator truth is never served by the gateway (includeTruth: false).
    const view = rt.view({ crewId: q.crewId ?? spec.crewIds[0], metrics: q.metrics as Metric[], windowMs: q.windowMs, endMs: null, eventId: null, includeTruth: false });
    return { ...view, diagnostics: { ...view.diagnostics, droppedCommands }, externalTelemetry: external, groundLink: { reachable: transport.isUp(), replyCursor: transport.replyCursor, ...transport.stats } };
  });

  app.get('/api/v1/events', async (req) => {
    const q = parse(EventsQuery, req.query);
    const page = events.slice(q.after, q.after + q.limit);
    return { runId: spec.runId, events: page, next: q.after + page.length, total: events.length };
  });

  app.post('/api/v1/imports', async (req) => {
    const b = typeof req.body === 'string' ? { text: req.body, format: 'ndjson' as const } : parse(ImportBody, req.body);
    const r = b.format === 'csv' ? parseCsv(b.text, { maxBytes: BODY_LIMIT_BYTES }) : parseNdjson(b.text, { maxBytes: BODY_LIMIT_BYTES });
    // Validation/preview only: imported rows are labelled "recorded" and are not fed into the simulated run.
    return { format: b.format, origin: 'recorded', mergedIntoRun: false, accepted: r.preview.accepted, rejected: r.preview.rejected, errors: r.errors.slice(0, 100), preview: r.preview };
  });

  // Commands that would change nothing are answered from current state and never appended to the durable command log,
  // so repeated requests can not grow the log (or the replay time) without bound.
  app.post('/api/v1/cases/:id/packages', async (req, reply) => {
    const ev = eventOr404(parse(IdParams, req.params).id);
    const packageId = `${ev.id}@r${ev.revision}`;
    const find = () => rt.outbox.entries.find((e) => e.id === packageId);
    const existing = find();
    if (!existing) apply({ type: 'queue', eventId: ev.id });
    const changed = !existing && find() !== undefined;
    return reply.code(changed ? 202 : 200).send({ packageId, eventId: ev.id, eventRevision: ev.revision, changed, alreadyQueued: existing !== undefined, state: find()?.state ?? null });
  });

  app.post('/api/v1/cases/:id/ack', async (req) => {
    const ev = eventOr404(parse(IdParams, req.params).id);
    const changed = ev.state === 'open';
    if (changed) apply({ type: 'ack', eventId: ev.id });
    const now = rt.latestEvent(ev.id)!;
    return { eventId: now.id, revision: now.revision, state: now.state, changed: changed && now.state !== 'open' };
  });

  app.get('/api/v1/exports/:id', async (req) => {
    const { id } = parse(IdParams, req.params);
    // Looked up by id in the database only; the id never becomes part of a file path.
    const run = db.prepare('SELECT spec, manifest, last_time_ms FROM runs WHERE run_id = ?').get(id) as { spec: string; manifest: string; last_time_ms: number } | undefined;
    if (!run) throw new HttpError(404, 'not_found');
    const rows = (sql: string): unknown[] => (db.prepare(sql).all(id) as { body: string }[]).map((r) => JSON.parse(r.body));
    return {
      schemaVersion: 1, exportedAtUtc: new Date().toISOString(), origin: 'simulated', notice: 'Research prototype export; simulated data only.',
      manifest: JSON.parse(run.manifest), spec: JSON.parse(run.spec), lastTimeMs: id === spec.runId ? rt.nowMs : run.last_time_ms,
      commands: rows('SELECT body FROM commands WHERE run_id = ? ORDER BY seq'), events: rows('SELECT body FROM events WHERE run_id = ? ORDER BY n'),
    };
  });

  /* ---------- WebSocket: compact view out, external (device/emulator) batches in ---------- */
  const clients = new Set<WebSocket>();
  const lastSeen = new WeakMap<WebSocket, number>();
  const wsIdleMs = opts.wsIdleMs ?? WS_IDLE_MS;
  const compactView = (): string => JSON.stringify({
    type: 'view', missionId: spec.missionId, runId: spec.runId, origin: 'simulated', nowMs: rt.nowMs,
    events: rt.snapshot().events.map((e) => ({ id: e.id, revision: e.revision, crewId: e.crewId, severity: e.severity, state: e.state, ruleId: e.ruleId, updatedAtMs: e.updatedAtMs })),
    outbox: rt.outbox.entries.map((e) => ({ id: e.id, state: e.state, attempts: e.attempts })),
    replies: rt.replies.length, groundReachable: transport.isUp(), eventCursor: events.length, externalTelemetry: external,
  });
  app.get('/api/v1/telemetry', { websocket: true }, (socket) => {
    if (clients.size >= WS_MAX_CLIENTS) { socket.close(1013, 'too many connections'); return; }
    clients.add(socket); external.connections++; external.openConnections = clients.size;
    lastSeen.set(socket, Date.now());
    socket.on('pong', () => lastSeen.set(socket, Date.now()));
    let windowStart = Date.now(), inWindow = 0;
    const send = (o: unknown): void => { if (socket.readyState === socket.OPEN && socket.bufferedAmount < WS_MAX_BUFFERED_BYTES) socket.send(JSON.stringify(o)); };
    socket.on('message', (data, isBinary) => {
      const now = Date.now();
      lastSeen.set(socket, now);
      if (now - windowStart >= 1000) { windowStart = now; inWindow = 0; }
      if (++inWindow > WS_MAX_MESSAGES_PER_SEC) { external.rateLimited++; socket.close(1008, 'rate limit'); return; }
      let raw: unknown = null;
      if (!isBinary) { try { raw = JSON.parse(data.toString()); } catch { /* rejected below */ } }
      const batch = TelemetryBatch.safeParse(raw);
      if (!batch.success) { external.rejectedMessages++; send({ type: 'error', error: 'invalid_message' }); return; }
      let accepted = 0, rejected = 0;
      for (const r of batch.data.records) {
        // No trusted origin is passed: the record is stamped 'recorded'; the sender's label is only tallied as a claim.
        const rec = decodeWireRecord(r);
        if (!rec || rec.record.origin !== external.stampedOrigin) { rejected++; continue; }
        accepted++; external.claimedOrigins[rec.claimedOrigin] = (external.claimedOrigins[rec.claimedOrigin] ?? 0) + 1;
      }
      external.batches++; external.acceptedRecords += accepted; external.rejectedRecords += rejected;
      send({ type: 'ack', accepted, rejected, stampedOrigin: external.stampedOrigin, mergedIntoRun: false });
    });
    socket.on('close', () => { clients.delete(socket); external.openConnections = clients.size; });
    socket.on('error', () => { /* ws closes the connection itself (e.g. 1009 for an oversized message) */ });
  });

  /* ---------- clocks ---------- */
  const timers: ReturnType<typeof setInterval>[] = [];
  // Heartbeat: ping every quarter of the idle window; a socket with no pong and no message for the whole window is
  // terminated, so silent connections can not hold the (capped) connection slots forever.
  timers.push(setInterval(() => {
    const now = Date.now();
    for (const c of clients) {
      if (now - (lastSeen.get(c) ?? 0) > wsIdleMs) { external.idleClosed++; c.terminate(); } else if (c.readyState === c.OPEN) c.ping();
    }
  }, Math.max(25, Math.floor(wsIdleMs / 4))));
  timers.push(setInterval(() => {
    if (!clients.size) return;
    const msg = compactView();
    for (const c of clients) if (c.readyState === c.OPEN && c.bufferedAmount < WS_MAX_BUFFERED_BYTES) c.send(msg);
  }, VIEW_PUSH_MS));
  if (opts.autoTick !== false) {
    // 1x wall time, no acceleration: at most a short bounded catch-up after a stall, then the clock re-anchors.
    let anchorWall = Date.now(), anchorMission = rt.nowMs;
    timers.push(setInterval(() => {
      const target = anchorMission + (Date.now() - anchorWall);
      let n = 0;
      while (rt.nowMs + TICK_MS <= target && n < 20) { step(); n++; }
      if (n === 20) { anchorWall = Date.now(); anchorMission = rt.nowMs; }
      if (n === 0) { rt.pump(); drainEvents(); }
    }, TICK_MS));
    transport.start();
  }
  app.addHook('onClose', async () => {
    for (const t of timers) clearInterval(t);
    transport.stop();
    for (const c of clients) c.terminate();
    checkpoint();
    db.close();
  });
  return app;
}

if (isEntryPoint(import.meta.url)) {
  try {
    const sec = securityFromEnv(), env = process.env;
    const app = await buildGateway({
      ...sec, dataDir: env.ASTER_DATA_DIR, scenarioId: env.ASTER_SCENARIO, seed: env.ASTER_SEED === undefined ? undefined : Number(env.ASTER_SEED),
      groundUrl: env.ASTER_GROUND_URL, groundToken: env.ASTER_GROUND_TOKEN, freshRun: env.ASTER_NEW_RUN === '1',
    });
    const address = await app.listen({ host: sec.host?.trim() || '127.0.0.1', port: envPort(env.ASTER_GATEWAY_PORT, 4310) });
    const c = app.aster;
    console.log(`[aster-gateway] listening on ${address} (research prototype, simulated data; auth ${sec.token ? 'bearer token required' : 'loopback only'})`);
    console.log(`[aster-gateway] run ${c.runtime.spec.runId} ${c.recovered ? `recovered at t=${c.runtime.nowMs} ms` : 'started'}; 1x wall time`);
    for (const sig of ['SIGINT', 'SIGTERM'] as const) process.once(sig, () => void app.close().then(() => process.exit(0)));
  } catch (e) {
    console.error(`[aster-gateway] ${e instanceof Error ? e.message : 'failed to start'}`);
    process.exit(1);
  }
}
