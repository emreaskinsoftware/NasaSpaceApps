/**
 * Deterministic seeded simulator. Three layers are kept apart:
 *   latent scenario state -> observation model -> records for the engine,
 * and `truth` which is routed ONLY to evaluation storage.
 * All physiological constants are configurable engineering assumptions, not a validated digital twin.
 */
import type { Metric, Observation, SensorMeta, SignalChunk } from '@aster/contracts';
import { METRICS } from '@aster/contracts';
import { TRACK_DEFAULTS, trackValue, type ScenarioDef, type TrackName } from './scenarios';

export * from './scenarios';
export const GENERATOR_VERSION = 'sim-1.0.0';
export const TICK_MS = 100;
const SUB = 20; // 200 Hz internal integration
const DT = 0.005;
const EXHALED_PPM = 42000;

/* ---------- PRNG ---------- */
export function hashSeed(seed: number, name: string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}
export class Rng {
  private a: number;
  private spare: number | null = null;
  constructor(seed: number, name: string) { this.a = hashSeed(seed, name) || 1; }
  next(): number {
    let t = (this.a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  uniform(lo: number, hi: number): number { return lo + (hi - lo) * this.next(); }
  gauss(): number {
    if (this.spare !== null) { const s = this.spare; this.spare = null; return s; }
    let u = 0;
    while (u === 0) u = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    const th = 2 * Math.PI * this.next();
    this.spare = r * Math.sin(th);
    return r * Math.cos(th);
  }
}

/** Held-out model variation: makes the observation model differ from the estimator's assumptions. */
export interface SimVariation {
  tauScale: number;       // actual gas-sensor tau = track * tauScale
  delayOffsetMs: number;  // actual transport delay = track + offset
  twoTauWeight: number;   // weight of a second, 4x slower response stage
  spatialGainScale: number;
  fluidAtten: number;     // attenuation of mechanical transmission per unit fluid index
  couplingExp: number;    // physiological-path coupling exponent
  actuatorExp: number;    // actuator-path coupling exponent (unequal paths)
  noiseScale: number;
}
export const NOMINAL_VARIATION: SimVariation = {
  tauScale: 1, delayOffsetMs: 0, twoTauWeight: 0, spatialGainScale: 1, fluidAtten: 0.25, couplingExp: 1.5, actuatorExp: 1.2, noiseScale: 1,
};
export function heldOutVariation(seed: number): SimVariation {
  const r = new Rng(seed, 'variation');
  return {
    tauScale: r.uniform(0.6, 1.6), delayOffsetMs: r.uniform(-100, 150), twoTauWeight: r.uniform(0, 0.4),
    spatialGainScale: r.uniform(0.85, 1.15), fluidAtten: r.uniform(0, 0.4), couplingExp: r.uniform(1.1, 1.9),
    actuatorExp: r.uniform(0.9, 1.5), noiseScale: r.uniform(0.7, 1.6),
  };
}

export type Injection =
  | { atMs: number; kind: 'set'; crewId: string; track: TrackName; value: number }
  | { atMs: number; kind: 'calibrate'; crewId: string }
  | { atMs: number; kind: 'exercise'; crewId: string; on: boolean; loadN: number; cadenceRpm: number }
  | { atMs: number; kind: 'dropout'; crewId: string; metric: Metric; durationMs: number };

export interface TruthBreath { startMs: number; inhaleEndMs: number; endMs: number; inhaledMeanPpm: number; cabinMeanPpm: number }
export interface TruthSample {
  tMs: number; crewId: string;
  contact: number; response: number; fluid: number; calPath: number; vent: number;
  exerciseActive: boolean; loadN: number;
  breath: TruthBreath | null;
}
export interface SimBatch { tMs: number; records: (Observation | SignalChunk)[]; truth: TruthSample[]; calibrationFired: string[] }

export interface SimConfig {
  scenario: ScenarioDef;
  seed: number;
  missionId: string;
  runId: string;
  crewIds: string[];
  /** Crew index that receives the scenario's faults; others run a nominal baseline. */
  targetCrew?: number;
  variation?: SimVariation;
  injections?: Injection[];
  baseWallMs?: number;
}
export interface Simulator {
  readonly nowMs: number;
  readonly sensorMeta: SensorMeta;
  step(): SimBatch;
  inject(i: Injection): void;
  injections(): Injection[];
}

class Biquad {
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  constructor(private b0: number, private b1: number, private b2: number, private a1: number, private a2: number) {}
  static bandpass(fc: number, q: number, fs: number): Biquad {
    const w = (2 * Math.PI * fc) / fs, al = Math.sin(w) / (2 * q), a0 = 1 + al;
    return new Biquad(al / a0, 0, -al / a0, (-2 * Math.cos(w)) / a0, (1 - al) / a0);
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

class CrewSim {
  private rResp: Rng; private rGas: Rng; private rMech: Rng; private rMisc: Rng;
  private phase = 0; private period = 60 / 14; private rr = 14; private readonly fi = 0.42;
  private pocket: number; private cabin: number;
  private delay = new Float32Array(600); private dIdx = 0; private lp1: number; private lp2: number;
  private repPhase = 0; private carrier = Biquad.bandpass(28, 0.9, 200); private bb = Biquad.bandpass(24, 0.7, 200);
  private lpC = 0; private mOu = 0; private warm = 0; private effort = 0; private wander = 0;
  private calUntil = -1; private nextAutoCal: number;
  private brStart = 0; private brInhEnd = 0; private brSum = 0; private brN = 0; private brCab = 0; private brCabN = 0; private wasInhaling = true;
  private seq: Record<string, number> = {};
  private overrides: Partial<Record<TrackName, { atMs: number; value: number }>> = {};
  private manualEx: { on: boolean; loadN: number; cadenceRpm: number } | null = null;
  private manualDrop: { metric: Metric; untilMs: number }[] = [];
  private readonly scale: number;

  constructor(private cfg: SimConfig, readonly crewId: string, private idx: number, private isTarget: boolean, private v: SimVariation) {
    const s = cfg.seed;
    this.rResp = new Rng(s, `${crewId}/resp`); this.rGas = new Rng(s, `${crewId}/gas`);
    this.rMech = new Rng(s, `${crewId}/mech`); this.rMisc = new Rng(s, `${crewId}/misc`);
    this.cabin = this.p('cabinPpm', 0); this.pocket = this.cabin + 300; this.lp1 = this.lp2 = this.cabin + 300;
    this.delay.fill(this.cabin + 300);
    this.scale = 0.85 + 0.1 * idx;
    this.nextAutoCal = 8000 + idx * 700;
    this.period = 60 / this.rr;
  }
  private p(name: TrackName, tMs: number): number {
    const o = this.overrides[name];
    if (o && tMs >= o.atMs) return o.value;
    if (!this.isTarget && name !== 'cabinPpm') return TRACK_DEFAULTS[name];
    return trackValue(this.cfg.scenario.tracks[name], TRACK_DEFAULTS[name], tMs);
  }
  inject(i: Injection): void {
    if (i.kind === 'set') this.overrides[i.track] = { atMs: i.atMs, value: i.value };
    else if (i.kind === 'calibrate') this.nextAutoCal = Math.min(this.nextAutoCal, i.atMs);
    else if (i.kind === 'exercise') this.manualEx = { on: i.on, loadN: i.loadN, cadenceRpm: i.cadenceRpm };
    else this.manualDrop.push({ metric: i.metric, untilMs: i.atMs + i.durationMs });
  }
  private exerciseAt(tMs: number): { loadN: number; cadenceRpm: number } | null {
    if (this.manualEx) return this.manualEx.on ? this.manualEx : null;
    if (!this.isTarget) return null;
    const seg = this.cfg.scenario.exercise.find((e) => tMs >= e.startMs && tMs < e.endMs);
    return seg ? { loadN: seg.loadN, cadenceRpm: seg.cadenceRpm } : null;
  }
  private dropped(metric: Metric, tMs: number): boolean {
    if (this.manualDrop.some((d) => d.metric === metric && tMs < d.untilMs)) return true;
    return this.isTarget && this.cfg.scenario.dropouts.some((d) => d.metric === metric && tMs >= d.startMs && tMs < d.endMs);
  }
  private obs(metric: Metric, tMs: number, value: number | null, out: (Observation | SignalChunk)[], patch: Partial<Observation> = {}): void {
    if (this.dropped(metric, tMs)) return;
    const streamId = `${this.crewId}.${metric}`;
    const sequence = (this.seq[streamId] = (this.seq[streamId] ?? -1) + 1);
    out.push({
      schemaVersion: 1, id: `${this.cfg.runId}/${streamId}/${sequence}`, missionId: this.cfg.missionId, runId: this.cfg.runId,
      crewId: this.crewId, streamId, sourceId: 'sim-reference-garment', sequence, observedAtMs: tMs,
      receivedAtUtc: new Date((this.cfg.baseWallMs ?? 0) + tMs).toISOString(), clockUncertaintyMs: 5,
      metric, value, unit: METRICS[metric].unit, origin: 'simulated', quality: 'valid', qualityReasons: [],
      provenanceId: `sim:${this.cfg.runId}`, ...patch,
    });
  }
  private chunk(metric: Metric, tMs: number, rate: number, samples: number[], out: (Observation | SignalChunk)[]): void {
    if (samples.length === 0 || this.dropped(metric, tMs)) return;
    const streamId = `${this.crewId}.${metric}`;
    const sequence = (this.seq[streamId] = (this.seq[streamId] ?? -1) + 1);
    out.push({
      schemaVersion: 1, missionId: this.cfg.missionId, runId: this.cfg.runId, crewId: this.crewId, streamId,
      sourceId: 'sim-reference-garment', sequence, startAtMs: tMs, sampleRateHz: rate, samples: Float32Array.from(samples),
      unit: METRICS[metric].unit, origin: 'simulated', quality: 'valid', clockUncertaintyMs: 5,
      provenanceId: `sim:${this.cfg.runId}`, metric,
    });
  }

  tick(t0: number, out: (Observation | SignalChunk)[], fired: string[]): TruthSample {
    const v = this.v, sc = this.cfg.scenario;
    const cabinTarget = this.p('cabinPpm', t0), vent = this.p('vent', t0), kEx = this.p('kEx', t0);
    const g = this.p('spatialGain', t0) * v.spatialGainScale;
    const tau1 = Math.max(0.02, (this.p('sensorTauMs', t0) * v.tauScale) / 1000), tau2 = tau1 * 4;
    const dSteps = Math.min(599, Math.max(0, Math.round((this.p('sensorDelayMs', t0) + v.delayOffsetMs) / 5)));
    const respNoise = this.p('respNoise', t0) * v.noiseScale;
    const contact = Math.max(0.05, Math.min(1, this.p('contact', t0)));
    const calPath = this.p('calPath', t0), response = this.p('response', t0), fluid = this.p('fluid', t0);
    const exr = this.exerciseAt(t0);
    const load = exr?.loadN ?? 0, cadence = exr?.cadenceRpm ?? 0;

    if (t0 >= this.nextAutoCal && this.calUntil < t0) {
      this.calUntil = t0 + 1000; this.nextAutoCal = t0 + sc.autoCalPeriodMs; fired.push(this.crewId);
    }
    const actuatorOn = t0 < this.calUntil;
    const kc = Math.pow(contact, v.couplingExp), kAct = Math.pow(contact, v.actuatorExp) * calPath;
    const aLp = 1 - Math.exp(-2 * Math.PI * (20 + 60 * contact) * DT);
    const amp = this.scale * response * Math.pow(Math.max(load, 0) / 400, 0.8) * (1 - v.fluidAtten * fluid);
    const artGain = 0.15 + 0.6 * (1 - contact);

    const pvdf: number[] = [], imu: number[] = [], resp: number[] = [], co2: number[] = [], ld: number[] = [], pos: number[] = [];
    let breath: TruthSample['breath'] = null;

    for (let k = 0; k < SUB; k++) {
      const t = t0 + k * 5, ts = t / 1000;
      // --- respiration ---
      const rrTarget = 14 + (exr ? 9 * Math.min(1, load / 500) : 0) + this.idx * 0.6;
      this.rr += ((rrTarget - this.rr) * DT) / 20;
      this.phase += DT / this.period;
      if (this.phase >= 1) {
        this.phase -= 1;
        if (this.brN > 0) {
          breath = { startMs: this.brStart, inhaleEndMs: this.brInhEnd, endMs: t, inhaledMeanPpm: this.brSum / this.brN, cabinMeanPpm: this.brCab / Math.max(1, this.brCabN) };
        }
        this.brStart = t; this.brSum = 0; this.brN = 0; this.brCab = 0; this.brCabN = 0;
        this.period = (60 / this.rr) * (1 + 0.08 * Math.max(-2, Math.min(2, this.rResp.gauss())));
      }
      const inhaling = this.phase < this.fi;
      if (this.wasInhaling && !inhaling) this.brInhEnd = t;
      this.wasInhaling = inhaling;
      const disp = inhaling ? 0.5 * (1 - Math.cos((Math.PI * this.phase) / this.fi)) : 0.5 * (1 + Math.cos((Math.PI * (this.phase - this.fi)) / (1 - this.fi)));
      // --- gas field: near-face pocket fed by exhalation, cleared by local ventilation ---
      this.cabin += ((cabinTarget - this.cabin) * DT) / 30 + 3 * Math.sqrt(DT) * this.rGas.gauss();
      const exShape = inhaling ? 0 : 1.571 * Math.sin((Math.PI * (this.phase - this.fi)) / (1 - this.fi));
      this.pocket += (kEx * (EXHALED_PPM - this.pocket) * exShape - vent * (this.pocket - this.cabin)) * DT;
      if (inhaling) { this.brSum += this.pocket; this.brN++; }
      this.brCab += this.cabin; this.brCabN++;
      // --- gas sensor: spatial mismatch -> transport delay -> one or two response stages -> noise ---
      this.delay[this.dIdx] = this.cabin + g * (this.pocket - this.cabin);
      const delayed = this.delay[(this.dIdx - dSteps + 600) % 600];
      this.dIdx = (this.dIdx + 1) % 600;
      this.lp1 += ((delayed - this.lp1) * DT) / tau1; this.lp2 += ((delayed - this.lp2) * DT) / tau2;
      // --- exercise + mechanics ---
      let env = 0, vel = 0, position = 0;
      if (exr) {
        this.repPhase += (DT * cadence) / 60;
        const f = this.repPhase - Math.floor(this.repPhase);
        position = Math.sin(2 * Math.PI * f); vel = Math.cos(2 * Math.PI * f);
        if (f < 0.55) { const s = Math.sin((Math.PI * f) / 0.55); env = s * s; }
      }
      const src = (0.012 + amp * env) * this.carrier.run(this.rMech.gauss()) * 2.2;
      this.lpC += (src - this.lpC) * aLp;
      this.mOu += (-this.mOu * DT) / 0.4 + 0.5 * Math.sqrt(DT) * this.rMisc.gauss();
      const m = (exr ? 0.5 * vel : 0) + this.mOu + (0.05 + 0.5 * Math.abs(vel)) * this.bb.run(this.rMisc.gauss()) * (exr ? 1 : 0.2);
      const tone = actuatorOn ? 0.3 * kAct * Math.sin(2 * Math.PI * 80 * ts) : 0;
      pvdf.push(kc * this.lpC + artGain * 1.0 * m + tone + 0.004 * v.noiseScale * this.rMech.gauss());
      if (k % 2 === 0) imu.push(2 * m + 0.05 * v.noiseScale * this.rMisc.gauss());
      if ((t / 5) % 8 === 0) {
        this.wander += (-this.wander * 0.04) / 8 + 0.004 * this.rResp.gauss();
        resp.push(disp + this.wander + respNoise * this.rResp.gauss());
        ld.push(exr ? Math.abs(load * (1 + 0.03 * position) + 4 * this.rMisc.gauss()) : Math.abs(1.5 * this.rMisc.gauss()));
        pos.push(position + 0.01 * this.rMisc.gauss());
      }
      if ((t / 5) % 10 === 0) {
        const y = (1 - v.twoTauWeight) * this.lp1 + v.twoTauWeight * this.lp2;
        co2.push(Math.max(0, Math.round(y + 15 * v.noiseScale * this.rGas.gauss())));
      }
    }
    this.warm += ((exr ? 1 : 0) - this.warm) * (TICK_MS / 60000);
    this.effort += ((exr ? Math.min(1, load / 500) : 0) - this.effort) * (TICK_MS / 25000);

    const firstOn = (period: number) => Math.ceil(t0 / period) * period;
    this.chunk('mech.pvdf', t0, 200, pvdf, out);
    this.chunk('imu.accel', t0, 100, imu, out);
    this.chunk('resp.displacement', firstOn(40), 25, resp, out);
    this.chunk('exercise.load', firstOn(40), 25, ld, out);
    this.chunk('exercise.position', firstOn(40), 25, pos, out);
    this.chunk('co2.local', firstOn(50), 20, co2, out);
    this.obs('contact.force', t0, Math.max(0, 12 * contact + 0.25 * this.rMisc.gauss()), out);
    this.obs('actuator.state', t0, actuatorOn ? 1 : 0, out);
    if (t0 % 1000 === 0) {
      const cn = (1 - contact) * 3;
      this.obs('co2.cabin', t0, Math.round(this.cabin + 8 * this.rGas.gauss()), out);
      this.obs('pressure.cabin', t0, 101.3 + 0.02 * this.rGas.gauss(), out);
      this.obs('temp.cabin', t0, 22.5 + 0.05 * this.rGas.gauss(), out);
      this.obs('imp.r10k', t0, 62 * (1 - 0.18 * fluid) * (1 - 0.02 * this.warm) + (0.15 + cn) * this.rMisc.gauss(), out);
      this.obs('imp.x10k', t0, -6.5 * (1 - 0.1 * fluid) + 0.05 * this.rMisc.gauss(), out);
      this.obs('imp.r100k', t0, 41 * (1 - 0.08 * fluid) * (1 - 0.015 * this.warm) + (0.12 + cn) * this.rMisc.gauss(), out);
      this.obs('imp.x100k', t0, -9 * (1 - 0.05 * fluid) + 0.05 * this.rMisc.gauss(), out);
      this.obs('pulse.rate', t0, 62 + this.idx * 2 + 50 * this.effort + 1.2 * this.rMisc.gauss(), out);
      // SIM-14 style malformed input: emitted through the same path so the engine must quarantine it.
      const mf = sc.malformed;
      if (this.isTarget && mf && t0 >= mf.startMs && t0 < mf.endMs) {
        const n = (t0 / 1000) % 4;
        if (n === 0) this.obs('co2.cabin', t0, this.cabin / 10000, out, { unit: '%' });
        else if (n === 1) this.obs('temp.cabin', t0 - 30000, 22.4, out);
        else if (n === 2) this.obs('pressure.cabin', t0, 1e9, out);
        else {
          const last = out[out.length - 1] as Observation;
          out.push({ ...last });
        }
      }
    }
    return { tMs: t0, crewId: this.crewId, contact, response, fluid, calPath, vent, exerciseActive: !!exr, loadN: load, breath };
  }
}

export function createSimulator(cfg: SimConfig): Simulator {
  const v = cfg.variation ?? NOMINAL_VARIATION;
  const target = cfg.targetCrew ?? 0;
  const crews = cfg.crewIds.map((id, i) => new CrewSim(cfg, id, i, i === target, v));
  const pending = [...(cfg.injections ?? [])].sort((a, b) => a.atMs - b.atMs);
  const applied: Injection[] = [];
  let now = 0;
  const apply = (i: Injection) => { crews.find((c) => c.crewId === i.crewId)?.inject(i); applied.push(i); };
  return {
    get nowMs() { return now; },
    sensorMeta: { co2LocalResponseTauMs: cfg.scenario.declared.tauMs, co2LocalTransportDelayMs: cfg.scenario.declared.delayMs, calToneHz: 80, impedanceFrequenciesHz: [10000, 100000] },
    step(): SimBatch {
      while (pending.length && pending[0].atMs <= now) apply(pending.shift()!);
      const records: (Observation | SignalChunk)[] = [], truth: TruthSample[] = [], fired: string[] = [];
      for (const c of crews) truth.push(c.tick(now, records, fired));
      const batch = { tMs: now, records, truth, calibrationFired: fired };
      now += TICK_MS;
      return batch;
    },
    inject(i: Injection) { apply({ ...i, atMs: Math.max(i.atMs, now) }); },
    injections: () => [...applied],
  };
}

export const DEFAULT_CREW = [
  { id: 'crew-1', pseudonym: 'CM-1', name: 'A. Vega' },
  { id: 'crew-2', pseudonym: 'CM-2', name: 'T. Okafor' },
  { id: 'crew-3', pseudonym: 'CM-3', name: 'L. Hartmann' },
  { id: 'crew-4', pseudonym: 'CM-4', name: 'S. Ilgaz' },
];
