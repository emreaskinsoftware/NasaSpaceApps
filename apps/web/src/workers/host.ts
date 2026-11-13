/**
 * MissionHost: scheduling + durability around a MissionRuntime. Runs inside the mission worker; kept free of
 * worker globals so it can be tested with fake-indexeddb. Playback speed only changes wall-clock scheduling.
 */
import type { ReferenceSession } from '@aster/contracts';
import { MissionRuntime, forkCommands, newRunSpec, type CommandInput, type ViewRequest, type ViewState } from '@aster/runtime';
import { TICK_MS } from '@aster/simulator';
import { GroundDb, MissionDb, RETENTION } from '../storage/db';
import type { FromWorker, RunStatus } from './protocol';

const DEFAULT_REQ: ViewRequest = { crewId: 'crew-1', metrics: [], windowMs: 60000, endMs: null, eventId: null, includeTruth: false };

export class MissionHost {
  rt: MissionRuntime | null = null;
  private running = false; private speed = 1; private recovering = false; private recovered = false;
  private req: ViewRequest = DEFAULT_REQ;
  private debt = 0; private lastWall = 0; private lagMs = 0;
  private persist = { ok: true, lastDurableMs: 0, error: null as string | null, simulatedFault: false };
  private faultCleared = false;
  private savedRevisions = new Set<string>(); private savedOutbox = new Map<string, string>(); private savedGround = new Set<string>();
  private lastCheckpointWall = 0;
  private runs: RunStatus['runs'] = [];
  private storage: RunStatus['storage'] = { usage: null, quota: null };
  owner = true;

  constructor(private refs: Record<string, ReferenceSession[]>, private post: (m: FromWorker) => void, readonly db = new MissionDb(), readonly gdb = new GroundDb()) {}

  private guardWrite(): void {
    if (this.rt?.storageFaultActive && !this.faultCleared) throw new Error('QuotaExceededError (storage fault simulated by scenario SIM-15)');
  }
  private fail(e: unknown): void {
    this.persist.ok = false; this.persist.error = e instanceof Error ? e.message : String(e);
    this.persist.simulatedFault = !!this.rt?.storageFaultActive && !this.faultCleared;
  }

  /** Durable checkpoint: never reports "saved" until the transaction has succeeded. */
  async checkpoint(): Promise<void> {
    const rt = this.rt;
    if (!rt) return;
    try {
      this.guardWrite();
      const revs = [...rt.revisions.values()].flat().filter((e) => !this.savedRevisions.has(`${e.id}@${e.revision}`));
      const view = rt.view(DEFAULT_REQ);
      const out = view.outbox.filter((o) => this.savedOutbox.get(o.id) !== `${o.state}|${o.attempts}`);
      await this.db.transaction('rw', this.db.runs, this.db.eventRevisions, this.db.outbox, async () => {
        await this.db.eventRevisions.bulkPut(revs.map((ev) => ({ key: `${ev.id}@${ev.revision}`, runId: ev.runId, ev })));
        await this.db.outbox.bulkPut(out.map((row) => ({ id: row.id, runId: rt.spec.runId, row })));
        await this.db.runs.put({ runId: rt.spec.runId, spec: rt.spec, lastMs: rt.nowMs, active: 1, updatedAt: Date.now() });
      });
      for (const e of revs) this.savedRevisions.add(`${e.id}@${e.revision}`);
      for (const o of out) this.savedOutbox.set(o.id, `${o.state}|${o.attempts}`);
      // Ground store: only what actually crossed the simulated link.
      const cases = view.ground.cases.filter((c) => !this.savedGround.has(c.pkg.packageId));
      if (cases.length) { await this.gdb.cases.bulkPut(cases.map((c) => ({ packageId: c.pkg.packageId, runId: c.pkg.runId, receivedAtMs: c.receivedAtMs, pkg: c.pkg }))); for (const c of cases) this.savedGround.add(c.pkg.packageId); }
      const replies = view.ground.replies.filter((r) => !this.savedGround.has(r.id));
      if (replies.length) { await this.gdb.replies.bulkPut(replies.map((r) => ({ replyId: r.id, runId: r.payload.runId, reply: r.payload }))); for (const r of replies) this.savedGround.add(r.id); }
      this.persist = { ok: true, lastDurableMs: rt.nowMs, error: null, simulatedFault: false };
    } catch (e) { this.fail(e); }
  }

  private async refreshRuns(): Promise<void> {
    try {
      const rows = await this.db.runs.orderBy('updatedAt').reverse().limit(RETENTION.maxRuns).toArray();
      this.runs = rows.map((r) => ({ runId: r.runId, scenarioId: r.spec.scenarioId, seed: r.spec.seed, lastMs: r.lastMs, parentRunId: r.spec.parentRunId, startedAtUtc: r.spec.startedAtUtc, active: r.runId === this.rt?.spec.runId }));
      const est = await (globalThis.navigator?.storage?.estimate?.() ?? Promise.resolve(null));
      if (est) this.storage = { usage: est.usage ?? null, quota: est.quota ?? null };
    } catch { /* storage inspection is best-effort */ }
  }

  private adopt(rt: MissionRuntime): void {
    this.rt = rt; this.running = false; this.debt = 0; this.faultCleared = false;
    this.savedRevisions.clear(); this.savedOutbox.clear(); this.savedGround.clear();
    this.persist = { ok: true, lastDurableMs: rt.nowMs, error: null, simulatedFault: false };
  }

  /** Reload recovery: rebuild the last active run from its spec + command log (no duplicated events, acknowledgements kept). */
  async init(): Promise<void> {
    this.recovering = true; this.emit();
    try {
      const row = (await this.db.runs.where('active').equals(1).sortBy('updatedAt')).pop();
      if (row) {
        const cmds = (await this.db.commands.where('runId').equals(row.runId).sortBy('id')).map((c) => c.cmd);
        this.adopt(MissionRuntime.replay(row.spec, this.refs, cmds, row.lastMs));
        this.recovered = true;
      }
    } catch (e) { this.post({ type: 'error', op: 'recover', message: e instanceof Error ? e.message : String(e) }); }
    this.recovering = false;
    await this.refreshRuns(); this.emit();
  }

  private async deactivateAll(): Promise<void> { await this.db.runs.where('active').equals(1).modify({ active: 0 }); }

  async start(scenarioId: string, seed: number, parent: { runId: string; atMs: number } | null = null): Promise<void> {
    try {
      await this.deactivateAll();
      const spec = newRunSpec(scenarioId, seed, parent);
      let rt: MissionRuntime;
      if (parent && this.rt) {
        // "Resume from here": a NEW run; only fault/instrument injections are reconstructed. No inherited acks, outbox or replies.
        const cmds = forkCommands(this.rt.commands, parent.atMs);
        rt = MissionRuntime.replay(spec, this.refs, cmds, parent.atMs, { reconstructUntilMs: parent.atMs });
        await this.db.commands.bulkAdd(cmds.map((cmd) => ({ runId: spec.runId, cmd })));
      } else rt = new MissionRuntime(spec, this.refs);
      this.adopt(rt); this.recovered = false;
      await this.checkpoint(); await this.refreshRuns();
    } catch (e) { this.post({ type: 'error', op: 'start', message: e instanceof Error ? e.message : String(e) }); }
    this.emit();
  }

  /** Commands are written to the durable log BEFORE they are applied. */
  async command(input: CommandInput): Promise<void> {
    const rt = this.rt;
    if (!rt) return;
    try {
      this.guardWrite();
      const cmd = { ...input, t: rt.nowMs };
      await this.db.commands.add({ runId: rt.spec.runId, cmd: cmd as never });
      rt.apply(input);
    } catch (e) { this.fail(e); this.post({ type: 'error', op: 'command', message: this.persist.error ?? 'persistence failure' }); }
    this.emit();
  }

  control(action: 'run' | 'pause' | 'step'): void {
    if (!this.rt) return;
    if (action === 'run') { this.running = true; this.lastWall = performance.now(); this.recovered = false; }
    else if (action === 'pause') this.running = false;
    else { this.running = false; if (!this.finished) this.rt.tick(); }
    this.emit();
  }
  setSpeed(s: number): void { this.speed = [1, 10, 60].includes(s) ? s : 1; this.emit(); }
  setView(req: ViewRequest): void {
    this.req = req;
    if (req.endMs !== null) this.running = false; // historical inspection is read-only and pauses the active run
    this.emit();
  }
  async retryPersist(): Promise<void> { this.faultCleared = true; await this.checkpoint(); this.emit(); }
  get finished(): boolean { return !!this.rt && this.rt.nowMs >= this.rt.scenario.durationMs; }

  /** Called on a fixed wall interval by the worker. */
  pump(nowWall: number): void {
    const rt = this.rt;
    if (rt && this.running) {
      const dt = Math.min(500, nowWall - this.lastWall);
      this.debt += (dt * this.speed) / TICK_MS;
      const cap = Math.min(Math.floor(this.debt), 150), t0 = performance.now();
      let done = 0;
      while (done < cap && !this.finished) { rt.tick(); done++; if (performance.now() - t0 > 40) break; }
      this.debt -= done;
      // If the worker cannot keep up, drop the backlog instead of freezing, and report it as lag.
      this.lagMs = this.debt > 300 ? (this.debt * TICK_MS) / this.speed : 0;
      if (this.debt > 300) this.debt = 0;
      if (this.finished) this.running = false;
    }
    this.lastWall = nowWall;
    if (rt && nowWall - this.lastCheckpointWall > 2000) { this.lastCheckpointWall = nowWall; void this.checkpoint().then(() => this.refreshRuns()); }
  }

  status(): RunStatus {
    return { hasRun: !!this.rt, running: this.running, speed: this.speed, recovering: this.recovering, recovered: this.recovered, owner: this.owner, finished: this.finished, persist: { ...this.persist }, workerLagMs: Math.round(this.lagMs), storage: this.storage, runs: this.runs };
  }
  view(): ViewState | null { return this.rt ? this.rt.view(this.req) : null; }
  emit(): void { this.post({ type: 'state', status: this.status(), view: this.view() }); }

  export(kind: 'run' | 'truth' | 'backup'): void {
    const rt = this.rt;
    if (!rt) return;
    const base = { manifest: rt.manifest, exportedAtUtc: new Date().toISOString() };
    let data: unknown;
    if (kind === 'truth') data = { ...base, namespace: 'evaluation-truth — never an engine input', truth: Object.fromEntries(rt.spec.crewIds.map((c) => [c, rt.truthView(c)])) };
    else {
      const v = rt.view({ ...DEFAULT_REQ, crewId: this.req.crewId });
      data = { ...base, commands: rt.commands, eventRevisions: [...rt.revisions.values()].flat(), outbox: v.outbox, replies: v.replies, breaths: rt.snapshot().crews[this.req.crewId]?.breaths ?? [], ...(kind === 'backup' ? { ground: v.ground } : {}) };
    }
    this.post({ type: 'export', kind, filename: `aster-${kind}-${rt.spec.runId}.json`, json: JSON.stringify(data, null, 1) });
  }

  async wipe(): Promise<void> {
    this.running = false; this.rt = null;
    await Promise.all([this.db.runs.clear(), this.db.commands.clear(), this.db.eventRevisions.clear(), this.db.outbox.clear(), this.gdb.cases.clear(), this.gdb.replies.clear()]);
    await this.refreshRuns(); this.emit();
  }
}
