/**
 * MissionRuntime: one deterministic, in-memory mission execution (simulator -> engine -> cases -> link -> ground).
 * It has no I/O of its own. Hosts (browser worker, local gateway) drive `tick()` and persist the command log;
 * because everything runs on one virtual clock, a run is fully recoverable by replaying (spec, commands) to a time.
 * Simulator truth is kept in a separate store that the engine never reads.
 */
import { z } from 'zod';
import {
  LINK_PROFILES, METRICS, METRIC_NAMES, Receipt, isChunk,
  type CasePackage, type CrewEngineState, type EngineSnapshot, type GroundReply, type HealthEvent, type LinkConfig, type Metric,
  type Observation, type OutboxEntry, type ReferenceSession, type RunManifest, type ScenarioInfo, type SensorMeta, type SignalChunk,
} from '@aster/contracts';
import { createEngine, ENGINE_VERSION, METHOD_VERSIONS, RULE_VERSIONS } from '@aster/engine';
import { createSimulator, DEFAULT_CREW, GENERATOR_VERSION, Rng, scenarioById, TICK_MS, type Injection, type ScenarioDef, type Simulator, type TruthBreath } from '@aster/simulator';
import { acceptReply, buildPackage, GroundStation, LinkSim, ReliableSender, type GroundCase, type Snippet, type Transport } from '@aster/comms';

export type Command =
  | { t: number; type: 'inject'; injection: Injection }
  | { t: number; type: 'ack'; eventId: string }
  | { t: number; type: 'queue'; eventId: string }
  | { t: number; type: 'link'; up: boolean }
  | { t: number; type: 'linkProfile'; profile: LinkConfig['profile'] }
  | { t: number; type: 'groundReply'; packageId: string; text: string; requestedEvidence: string[]; authorRole: GroundReply['authorRole'] }
  | { t: number; type: 'retry'; packageId: string }
  | { t: number; type: 'autoQueue'; on: boolean };
const num = z.number().refine(Number.isFinite), cid = z.string().min(1).max(160);
const InjectionSchema = z.discriminatedUnion('kind', [
  z.object({ atMs: num, kind: z.literal('set'), crewId: cid, track: z.enum(['cabinPpm', 'vent', 'kEx', 'spatialGain', 'sensorTauMs', 'sensorDelayMs', 'respNoise', 'contact', 'calPath', 'response', 'fluid']), value: num.min(0).max(100000) }),
  z.object({ atMs: num, kind: z.literal('calibrate'), crewId: cid }),
  z.object({ atMs: num, kind: z.literal('exercise'), crewId: cid, on: z.boolean(), loadN: num.min(0).max(5000), cadenceRpm: num.min(0).max(120) }),
  z.object({ atMs: num, kind: z.literal('dropout'), crewId: cid, metric: z.enum(METRIC_NAMES as [Metric, ...Metric[]]), durationMs: num.min(0).max(3600000) }),
]);
/** Runtime schema for the durable command log: rows recovered from storage are validated before they are replayed. */
export const CommandSchema = z.discriminatedUnion('type', [
  z.object({ t: num, type: z.literal('inject'), injection: InjectionSchema }),
  z.object({ t: num, type: z.literal('ack'), eventId: cid }),
  z.object({ t: num, type: z.literal('queue'), eventId: cid }),
  z.object({ t: num, type: z.literal('link'), up: z.boolean() }),
  z.object({ t: num, type: z.literal('linkProfile'), profile: z.enum(['near-real-time demonstration', 'delayed exploration demonstration']) }),
  z.object({ t: num, type: z.literal('groundReply'), packageId: cid, text: z.string().min(1).max(2000), requestedEvidence: z.array(z.string().max(200)).max(8), authorRole: z.enum(['ground-specialist', 'simulated-responder']) }),
  z.object({ t: num, type: z.literal('retry'), packageId: cid }),
  z.object({ t: num, type: z.literal('autoQueue'), on: z.boolean() }),
]);
export const MAX_REPLIES = 500;
export type CommandInput = Command extends infer C ? (C extends { t: number } ? Omit<C, 't'> : never) : never;

export interface RunSpec {
  missionId: string; runId: string; parentRunId: string | null; forkedAtMs: number | null;
  scenarioId: string; seed: number; startedAtUtc: string; crewIds: string[]; codeCommit: string;
}
export interface MissionReply { reply: GroundReply; stale: boolean; localRevisionAtReceipt: number; receivedAtMs: number }
export interface SeriesData { t: number[]; v: number[]; stepMs: number; unit: string }
export interface TruthView { breaths: TruthBreath[]; latent: { t: number[]; contact: number[]; response: number[]; fluid: number[]; vent: number[]; calPath: number[] } }
export interface CrewSummary { crewId: string; latest: CrewEngineState['latest']; channelQuality: CrewEngineState['channelQuality']; sessionActive: boolean; calibration: CrewEngineState['calibration']['state'] }
export interface ViewRequest { crewId: string; metrics: Metric[]; windowMs: number; endMs: number | null; eventId: string | null; includeTruth: boolean }
export interface OutboxRow { id: string; eventId: string; eventRevision: number; state: OutboxEntry['state']; attempts: number; queuedAtMs: number; deliveredAtMs: number | null; sizeBytes: number; lastError: string | null; contentHash: string; priority: number }
export interface ViewState {
  manifest: RunManifest; scenario: ScenarioInfo; nowMs: number; crew: typeof DEFAULT_CREW; sensorMeta: SensorMeta;
  detail: CrewEngineState; summaries: CrewSummary[];
  events: HealthEvent[]; revisions: HealthEvent[];
  outbox: OutboxRow[]; replies: MissionReply[];
  ground: { cases: GroundCase[]; replies: OutboxEntry<GroundReply>[]; rejected: GroundStation['rejected'] };
  link: { cfg: LinkConfig; effectiveUp: boolean; stats: LinkSim['stats'] | null; simulated: boolean };
  series: Partial<Record<Metric, SeriesData>>;
  quarantine: EngineSnapshot['quarantine'];
  truth: TruthView | null;
  autoQueue: boolean;
  diagnostics: { records: number; rejectedReplies: number; transportRetries: number; commandCount: number };
}

const KEEP_MS = 30 * 60 * 1000;
class DisplayStore {
  private m = new Map<string, { t: number[]; v: number[] }>();
  add(records: (Observation | SignalChunk)[]): void {
    for (const r of records) {
      if (!r.crewId) continue;
      const key = `${r.crewId}|${r.metric}`;
      let s = this.m.get(key);
      if (!s) { s = { t: [], v: [] }; this.m.set(key, s); }
      if (isChunk(r)) {
        const step = 1000 / r.sampleRateHz;
        if (r.sampleRateHz > 50) {
          // min/max-preserving display decimation; analysis always uses the raw samples inside the engine
          let lo = Infinity, hi = -Infinity;
          for (const x of r.samples) { if (x < lo) lo = x; if (x > hi) hi = x; }
          if (Number.isFinite(lo)) { s.t.push(r.startAtMs, r.startAtMs + 50); s.v.push(lo, hi); }
        } else for (let i = 0; i < r.samples.length; i++) if (Number.isFinite(r.samples[i])) { s.t.push(r.startAtMs + i * step); s.v.push(r.samples[i]); }
      } else if (r.value !== null && Number.isFinite(r.value) && r.unit === METRICS[r.metric as Metric]?.unit && r.value <= METRICS[r.metric as Metric].max) {
        if (s.t.length && r.observedAtMs <= s.t[s.t.length - 1]) continue; // display mirrors what the engine would accept
        s.t.push(r.observedAtMs); s.v.push(r.value);
      }
      if (s.t.length > 4096 && s.t[s.t.length - 1] - s.t[0] > KEEP_MS * 1.2) {
        const cut = s.t.findIndex((x) => x >= s!.t[s!.t.length - 1] - KEEP_MS);
        s.t.splice(0, cut); s.v.splice(0, cut);
      }
    }
  }
  query(crewId: string, metric: Metric, a: number, b: number, maxPts = 1400): SeriesData {
    const s = this.m.get(`${crewId}|${metric}`);
    const rate = METRICS[metric].rateHz, stepMs = rate > 50 ? 100 : 1000 / rate;
    const out: SeriesData = { t: [], v: [], stepMs, unit: METRICS[metric].unit };
    if (!s) return out;
    let lo = 0, hi = s.t.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (s.t[m] < a) lo = m + 1; else hi = m; }
    let end = lo;
    while (end < s.t.length && s.t[end] <= b) end++;
    const n = end - lo;
    if (n <= maxPts) { out.t = s.t.slice(lo, end); out.v = s.v.slice(lo, end); return out; }
    const bucket = Math.ceil(n / (maxPts / 2));
    for (let i = lo; i < end; i += bucket) {
      let mn = Infinity, mx = -Infinity, tn = 0, tx = 0;
      for (let k = i; k < Math.min(end, i + bucket); k++) { if (s.v[k] < mn) { mn = s.v[k]; tn = s.t[k]; } if (s.v[k] > mx) { mx = s.v[k]; tx = s.t[k]; } }
      if (tn <= tx) { out.t.push(tn, tx); out.v.push(mn, mx); } else { out.t.push(tx, tn); out.v.push(mx, mn); }
    }
    out.stepMs = stepMs * bucket;
    return out;
  }
}

const SNIPPET_METRICS: Record<HealthEvent['module'], Metric[]> = {
  exposure: ['co2.local', 'co2.cabin', 'resp.displacement'], environment: ['co2.cabin', 'pressure.cabin'],
  integrity: ['contact.force', 'mech.pvdf'], exercise: ['exercise.load', 'mech.pvdf', 'imp.r10k'], data: [],
};
const SEVERITY_RANK = { info: 1, review: 2, priority: 3 } as const;

export class MissionRuntime {
  readonly scenario: ScenarioDef;
  readonly sim: Simulator;
  private engine;
  readonly link: Transport;
  private linkSim: LinkSim | null = null;
  linkCfg: LinkConfig;
  readonly outbox = new ReliableSender<CasePackage>('up', 'package');
  readonly ground = new GroundStation();
  readonly groundOut = new ReliableSender<GroundReply>('down', 'reply');
  readonly replies: MissionReply[] = [];
  readonly revisions = new Map<string, HealthEvent[]>();
  readonly commands: Command[] = [];
  private display = new DisplayStore();
  private truth = new Map<string, TruthView>();
  private pending: Command[] = [];
  private replyN = 0;
  private records = 0; private rejectedReplies = 0;
  autoQueue = true;
  droppedCommands = 0;
  /** While true (fork reconstruction) no case is queued: a forked run inherits no outbox. */
  private reconstructingUntil = -1;
  nowMs = 0;
  newEvents: HealthEvent[] = [];

  constructor(readonly spec: RunSpec, references: Record<string, ReferenceSession[]>, opts: { commands?: Command[]; transport?: Transport; reconstructUntilMs?: number } = {}) {
    this.scenario = scenarioById(spec.scenarioId);
    this.sim = createSimulator({ scenario: this.scenario, seed: spec.seed, missionId: spec.missionId, runId: spec.runId, crewIds: spec.crewIds, baseWallMs: Date.parse(spec.startedAtUtc) });
    this.engine = createEngine({ missionId: spec.missionId, runId: spec.runId, crewIds: spec.crewIds, sensorMeta: this.sim.sensorMeta, references, origin: 'simulated' });
    const p = this.scenario.link.profile;
    this.linkCfg = { profile: p, ...LINK_PROFILES[p], up: true };
    if (opts.transport) this.link = opts.transport;
    else {
      const rng = new Rng(spec.seed, 'link');
      this.linkSim = new LinkSim(this.linkCfg, () => rng.next(), this.scenario.link.outages, this.scenario.link.duplicateDelivery);
      this.link = this.linkSim;
    }
    // Stored rows are untrusted on recovery: anything that does not match the schema is dropped, never executed.
    this.pending = (opts.commands ?? []).filter((c) => { const ok = CommandSchema.safeParse(c).success; if (!ok) this.droppedCommands++; return ok; }).sort((a, b) => a.t - b.t);
    this.reconstructingUntil = opts.reconstructUntilMs ?? -1;
    for (const id of spec.crewIds) this.truth.set(id, { breaths: [], latent: { t: [], contact: [], response: [], fluid: [], vent: [], calPath: [] } });
  }

  /** Rebuild a run purely from its spec and command log (reload recovery, historical inspection, fork). */
  static replay(spec: RunSpec, references: Record<string, ReferenceSession[]>, commands: Command[], toMs: number, opts: { reconstructUntilMs?: number } = {}): MissionRuntime {
    const rt = new MissionRuntime(spec, references, { commands, ...opts });
    while (rt.nowMs < toMs) rt.tick();
    return rt;
  }

  get manifest(): RunManifest {
    return {
      schemaVersion: 1, missionId: this.spec.missionId, runId: this.spec.runId, parentRunId: this.spec.parentRunId, forkedAtMs: this.spec.forkedAtMs,
      scenarioId: this.scenario.id, scenarioVersion: this.scenario.version, seed: this.spec.seed, generatorVersion: GENERATOR_VERSION, engineVersion: ENGINE_VERSION,
      ruleVersions: RULE_VERSIONS, methodVersions: METHOD_VERSIONS, startedAtUtc: this.spec.startedAtUtc, origin: 'simulated',
      units: Object.fromEntries(Object.entries(METRICS).map(([k, v]) => [k, v.unit])), sampleRatesHz: Object.fromEntries(Object.entries(METRICS).map(([k, v]) => [k, v.rateHz])),
      codeCommit: this.spec.codeCommit,
    };
  }
  get storageFaultActive(): boolean { return this.scenario.storageFaultAtMs !== null && this.nowMs >= this.scenario.storageFaultAtMs; }
  latestEvent(id: string): HealthEvent | null { const r = this.revisions.get(id); return r ? r[r.length - 1] : null; }

  /** Apply an operator command now and append it to the durable command log. */
  apply(input: CommandInput): Command {
    const cmd = CommandSchema.parse({ ...input, t: this.nowMs }) as Command;
    this.commands.push(cmd);
    this.exec(cmd);
    return cmd;
  }
  private exec(c: Command): void {
    switch (c.type) {
      case 'inject': this.sim.inject({ ...c.injection, atMs: this.nowMs }); break;
      case 'ack': { const ev = this.engine.acknowledge(c.eventId); if (ev) this.record(ev); break; }
      case 'queue': { const ev = this.latestEvent(c.eventId); if (ev) this.queue(ev); break; }
      case 'link': this.linkCfg.up = c.up; break;
      case 'linkProfile': Object.assign(this.linkCfg, LINK_PROFILES[c.profile], { profile: c.profile }); break;
      case 'retry': this.outbox.retryNow(c.packageId, this.nowMs); break;
      case 'autoQueue': this.autoQueue = c.on; break;
      case 'groundReply': {
        const r = this.ground.makeReply(c.packageId, c.text, c.requestedEvidence, c.authorRole, this.nowMs, ++this.replyN);
        if (r) this.groundOut.enqueue(r.replyId, r, 2, this.nowMs);
        break;
      }
    }
  }
  private record(ev: HealthEvent): void {
    const list = this.revisions.get(ev.id) ?? [];
    if (list.some((x) => x.revision === ev.revision)) return;
    list.push(ev); this.revisions.set(ev.id, list); this.newEvents.push(ev);
    // every reply about an older revision of this event is now stale context
    for (const r of this.replies) if (r.reply.eventId === ev.id && r.reply.eventRevision < ev.revision) r.stale = true;
  }
  private queue(ev: HealthEvent): void {
    if (this.nowMs <= this.reconstructingUntil) return;
    const a = Math.max(0, ev.updatedAtMs - 60000), b = ev.updatedAtMs;
    const snippets: Snippet[] = SNIPPET_METRICS[ev.module].map((metric) => {
      const s = this.display.query(ev.crewId, metric, a, b, 120);
      return { metric, unit: s.unit, startMs: s.t[0] ?? a, stepMs: Math.round(s.stepMs), values: s.v.slice(0, 600).map((x) => Math.round(x * 1000) / 1000) };
    }).filter((s) => s.values.length > 0);
    const missing = ev.evidence.filter((e) => e.value === null).map((e) => `${e.metric}${e.note ? ` (${e.note})` : ''}`.slice(0, 200));
    const pseudo = DEFAULT_CREW.find((c) => c.id === ev.crewId)?.pseudonym ?? ev.crewId;
    const pkg = buildPackage(ev, pseudo, this.nowMs, snippets, missing);
    this.outbox.supersede((e) => e.payload.eventId === ev.id && e.payload.eventRevision < ev.revision);
    this.outbox.enqueue(pkg.packageId, pkg, SEVERITY_RANK[ev.severity], this.nowMs);
  }

  tick(): void {
    while (this.pending.length && this.pending[0].t <= this.nowMs) { const c = this.pending.shift()!; this.commands.push(c); this.exec(c); }
    const b = this.sim.step();
    this.records += b.records.length;
    this.engine.ingest(b.records);
    this.display.add(b.records);
    for (const t of b.truth) {
      const tv = this.truth.get(t.crewId)!;
      if (t.breath) tv.breaths.push(t.breath);
      if (b.tMs % 1000 === 0) { const l = tv.latent; l.t.push(b.tMs); l.contact.push(t.contact); l.response.push(t.response); l.fluid.push(t.fluid); l.vent.push(t.vent); l.calPath.push(t.calPath); }
    }
    this.nowMs = b.tMs + TICK_MS;
    const d = this.engine.advanceTo(this.nowMs);
    for (const crewId of d.calibrationRequests) this.sim.inject({ atMs: this.nowMs, kind: 'calibrate', crewId });
    for (const ev of d.events) {
      this.record(ev);
      if (this.autoQueue && ev.severity !== 'info' && (ev.revision === 1 || ev.state === 'resolved')) this.queue(ev);
    }
    this.pump();
  }

  /** Move frames across the link in both directions (virtual clock for LinkSim, wall-driven for real transports). */
  pump(): void {
    const now = this.nowMs;
    this.outbox.tick(now, this.link);
    for (const f of this.link.poll('up', now)) {
      if (f.kind === 'package') {
        const receipt = this.ground.receive(f.body, now);
        if (receipt) this.link.send('down', { kind: 'receipt', id: receipt.packageId, body: receipt, bytes: 160 }, now);
      } else if (f.kind === 'reply-ack') this.groundOut.onAck(f.id, now);
    }
    this.groundOut.tick(now, this.link);
    for (const f of this.link.poll('down', now)) {
      if (f.kind === 'receipt') {
        const r = Receipt.safeParse(f.body);
        if (!r.success || r.data.runId !== this.spec.runId) { this.rejectedReplies++; continue; }
        if (r.data.hashOk) this.outbox.onAck(r.data.packageId, now);
        else { const e = this.outbox.entries.find((x) => x.id === r.data.packageId); if (e) { e.state = 'failed'; e.lastError = 'checksum-mismatch'; } }
      } else if (f.kind === 'reply') {
        const known = new Map(this.outbox.entries.map((e) => [e.id, { eventId: e.payload.eventId, eventRevision: e.payload.eventRevision }]));
        const res = acceptReply(f.body, this.spec.runId, known, (id) => this.latestEvent(id)?.revision ?? null);
        if ('error' in res) { this.rejectedReplies++; continue; }
        const dup = this.replies.some((x) => x.reply.replyId === res.reply.replyId);
        if (!dup && (this.replies.length >= MAX_REPLIES || this.replies.filter((x) => x.reply.packageId === res.reply.packageId).length >= 20)) { this.rejectedReplies++; continue; }
        if (!dup) {
          this.replies.push({ reply: res.reply, stale: res.stale, localRevisionAtReceipt: res.localRevision, receivedAtMs: now });
          const e = this.outbox.entries.find((x) => x.id === res.reply.packageId);
          if (e && e.state === 'delivered') e.state = 'acknowledged';
        }
        this.link.send('up', { kind: 'reply-ack', id: res.reply.replyId, body: null, bytes: 80 }, now);
      }
    }
  }

  snapshot(): EngineSnapshot { return this.engine.snapshot(); }
  truthView(crewId: string): TruthView | null { return this.truth.get(crewId) ?? null; }
  series(crewId: string, metric: Metric, a: number, b: number, maxPts?: number): SeriesData { return this.display.query(crewId, metric, a, b, maxPts); }

  view(req: ViewRequest): ViewState {
    const snap = this.engine.snapshot();
    const crewId = snap.crews[req.crewId] ? req.crewId : this.spec.crewIds[0];
    const end = req.endMs ?? this.nowMs, start = Math.max(0, end - req.windowMs);
    const series: ViewState['series'] = {};
    for (const m of req.metrics) series[m] = this.display.query(crewId, m, start, end);
    const d = snap.crews[crewId];
    const detail: CrewEngineState = { ...d, breaths: d.breaths.filter((x) => x.endMs >= start - 5000 && x.startMs <= end), integrity: d.integrity.filter((x) => x.endMs >= start && x.startMs <= end) };
    return {
      manifest: this.manifest, nowMs: this.nowMs, sensorMeta: this.sim.sensorMeta, crew: DEFAULT_CREW.filter((c) => this.spec.crewIds.includes(c.id)),
      scenario: { id: this.scenario.id, version: this.scenario.version, titleKey: this.scenario.titleKey, descriptionKey: this.scenario.descriptionKey, durationMs: this.scenario.durationMs, modules: this.scenario.modules },
      detail,
      summaries: Object.values(snap.crews).map((c) => ({ crewId: c.crewId, latest: c.latest, channelQuality: c.channelQuality, sessionActive: c.session.active, calibration: c.calibration.state })),
      events: snap.events, revisions: req.eventId ? this.revisions.get(req.eventId) ?? [] : [],
      outbox: this.outbox.entries.map((e) => ({ id: e.id, eventId: e.payload.eventId, eventRevision: e.payload.eventRevision, state: e.state, attempts: e.attempts, queuedAtMs: e.queuedAtMs, deliveredAtMs: e.deliveredAtMs, sizeBytes: e.sizeBytes, lastError: e.lastError, contentHash: e.payload.contentHash, priority: e.priority })),
      replies: this.replies,
      ground: { cases: [...this.ground.cases.values()], replies: this.groundOut.entries, rejected: this.ground.rejected },
      link: { cfg: { ...this.linkCfg }, effectiveUp: this.link.isUp(this.nowMs), stats: this.linkSim ? { ...this.linkSim.stats } : null, simulated: this.linkSim !== null },
      series, quarantine: snap.quarantine,
      truth: req.includeTruth ? this.truth.get(crewId) ?? null : null,
      autoQueue: this.autoQueue,
      diagnostics: { records: this.records, rejectedReplies: this.rejectedReplies, transportRetries: this.outbox.entries.reduce((s, e) => s + e.attempts, 0), commandCount: this.commands.length },
    };
  }
}

export function newRunSpec(scenarioId: string, seed: number, parent: { runId: string; atMs: number } | null = null, crewIds = DEFAULT_CREW.map((c) => c.id)): RunSpec {
  const stamp = Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
  return { missionId: 'mission-demo', runId: `run-${scenarioId}-${seed}-${stamp}`, parentRunId: parent?.runId ?? null, forkedAtMs: parent?.atMs ?? null, scenarioId, seed, startedAtUtc: new Date().toISOString(), crewIds, codeCommit: 'local' };
}
/** Only fault/instrument injections carry over into a fork; acknowledgements, queue and replies do not. */
export const forkCommands = (commands: Command[], atMs: number): Command[] => commands.filter((c) => c.t <= atMs && c.type === 'inject');
