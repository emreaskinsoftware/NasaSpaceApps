/**
 * ASTER decision engine: ingestion -> time/unit validation -> channel quality -> features -> module estimates
 * -> cross-module eligibility -> rule state machines -> event revisions.
 * Deterministic, local, no hosted model. Imports contracts only — never the simulator or evaluation packages.
 */
import {
  METRICS, MAX_BATCH_RECORDS, MAX_CHUNK_SAMPLES, isChunk, isMetric,
  type CrewEngineState, type DataOrigin, type Engine, type EngineDelta, type EngineSnapshot, type Estimate, type HealthEvent,
  type Metric, type QualityState, type ReferenceSession, type SensorMeta,
} from '@aster/contracts';
import { EXPOSURE_METHODS, ExposureProcessor } from './exposure';
import { IntegrityProcessor, INTEGRITY_METHODS } from './integrity';
import { EXERCISE_METHODS, ExerciseProcessor } from './exercise';
import { RULES, RuleMachine } from './rules';

export * from './exposure';
export * from './integrity';
export * from './exercise';
export { RULES, RULE_CONSTANTS, GUIDANCE, ruleCards } from './rules';
export const ENGINE_VERSION = 'engine-1.0.0';

export interface EngineConfig {
  missionId: string;
  runId: string;
  crewIds: string[];
  sensorMeta: SensorMeta;
  references: Record<string, ReferenceSession[]>;
  origin: DataOrigin;
}

const staleAfterMs = (m: Metric): number => Math.max(1500, 4000 / METRICS[m].rateHz);
const RULE_EVAL_MS = 500;

interface Chan { lastAtMs: number | null; lastSeq: number; reported: QualityState; reasons: string[] }

class CrewState {
  chans = new Map<string, Chan>();
  latest: Record<string, number | null> = {};
  exposure: ExposureProcessor;
  integrity: IntegrityProcessor;
  exercise: ExerciseProcessor;
  constructor(readonly crewId: string, meta: SensorMeta, refs: ReferenceSession[]) {
    this.exposure = new ExposureProcessor(meta);
    this.integrity = new IntegrityProcessor(meta);
    this.exercise = new ExerciseProcessor(this.integrity, refs);
  }
  quality(metric: string, nowMs: number): { state: QualityState; reasons: string[]; lastAtMs: number | null } {
    const c = this.chans.get(metric);
    if (!c || c.lastAtMs === null) return { state: 'unavailable', reasons: ['never-received'], lastAtMs: null };
    if (isMetric(metric) && nowMs - c.lastAtMs > staleAfterMs(metric)) return { state: 'stale', reasons: ['no-recent-samples'], lastAtMs: c.lastAtMs };
    return { state: c.reported, reasons: c.reasons, lastAtMs: c.lastAtMs };
  }
  route(metric: Metric, t: number, v: number): void {
    switch (metric) {
      case 'resp.displacement': this.exposure.onResp(t, v); break;
      case 'co2.local': this.exposure.co2.push(t, v); break;
      case 'co2.cabin': this.exposure.cabin.push(t, v); break;
      case 'mech.pvdf': this.integrity.onPvdf(t, v); break;
      case 'imu.accel': this.integrity.onImu(t, v); break;
      case 'contact.force': this.integrity.onForce(t, v); break;
      case 'actuator.state': this.integrity.onActuator(t, v >= 0.5); break;
      case 'exercise.position': this.exercise.onPosition(t, v); break;
      case 'exercise.load': this.exercise.onLoad(t, v); break;
      case 'imp.r10k': this.exercise.r10k.push(t, v); break;
      case 'imp.r100k': this.exercise.r100k.push(t, v); break;
      default: break;
    }
  }
}

export function createEngine(cfg: EngineConfig): Engine {
  const crews = new Map(cfg.crewIds.map((id) => [id, new CrewState(id, cfg.sensorMeta, cfg.references[id] ?? [])]));
  const machine = new RuleMachine({ missionId: cfg.missionId, runId: cfg.runId, origin: cfg.origin });
  const quarantine: { reason: string; metric: string; atMs: number; crewId: string | null }[] = [];
  let quarantineCount = 0, quarantinedSinceDelta = 0;
  let now = 0, lastRuleEval = -RULE_EVAL_MS;
  let pendingEstimates: Estimate[] = [];
  let pendingEvents: HealthEvent[] = [];
  let estSeq = 0;

  const reject = (reason: string, metric: string, crewId: string | null, atMs: number): void => {
    void atMs; quarantine.push({ reason, metric, atMs: now, crewId }); // arrival time on the engine clock
    if (quarantine.length > 200) quarantine.shift();
    quarantineCount++; quarantinedSinceDelta++;
  };

  /** Shared header validation. Returns the crew + channel or null (after quarantining). */
  const admit = (r: { runId: string; crewId: string | null; metric: string; unit: string; sequence: number; quality: QualityState }, t: number): { crew: CrewState; chan: Chan; metric: Metric } | null => {
    if (r.runId !== cfg.runId) { reject('run-mismatch', String(r.metric), r.crewId, t); return null; }
    if (typeof r.metric !== 'string' || !isMetric(r.metric)) { reject('unknown-metric', String(r.metric), r.crewId, t); return null; }
    const crew = r.crewId ? crews.get(r.crewId) : undefined;
    if (!crew) { reject('unknown-crew', r.metric, r.crewId, t); return null; }
    if (r.unit !== METRICS[r.metric].unit) { reject('unit-mismatch', r.metric, r.crewId, t); return null; }
    if (!Number.isFinite(t) || !Number.isInteger(r.sequence)) { reject('invalid-header', r.metric, r.crewId, t); return null; }
    let chan = crew.chans.get(r.metric);
    if (!chan) { chan = { lastAtMs: null, lastSeq: -1, reported: 'unavailable', reasons: [] }; crew.chans.set(r.metric, chan); }
    if (r.sequence <= chan.lastSeq) { reject('duplicate-or-replayed', r.metric, r.crewId, t); return null; }
    if (chan.lastAtMs !== null && t < chan.lastAtMs) { reject('out-of-order', r.metric, r.crewId, t); return null; }
    return { crew, chan, metric: r.metric };
  };

  const setQuality = (chan: Chan, reported: QualityState, clockUncMs: number, extra: string[]): void => {
    const reasons = [...extra];
    let q = reported;
    if (clockUncMs > 500 && q === 'valid') { q = 'suspect'; reasons.push('clock-uncertainty'); }
    chan.reported = q; chan.reasons = reasons;
  };

  return {
    ingest(batch) {
      if (batch.length > MAX_BATCH_RECORDS) { reject('oversized-batch', '*', null, now); return; }
      for (const r of batch) {
        if (isChunk(r)) {
          const a = admit(r, r.startAtMs);
          if (!a) continue;
          const n = r.samples.length;
          if (n === 0 || n > MAX_CHUNK_SAMPLES) { reject('chunk-size', a.metric, r.crewId, r.startAtMs); continue; }
          if (r.sampleRateHz !== METRICS[a.metric].rateHz) { reject('rate-mismatch', a.metric, r.crewId, r.startAtMs); continue; }
          const { min, max } = METRICS[a.metric];
          let bad = false;
          for (let i = 0; i < n; i++) { const v = r.samples[i]; if (!Number.isFinite(v) || v < min || v > max) { bad = true; break; } }
          if (bad) { reject('non-finite-or-out-of-range', a.metric, r.crewId, r.startAtMs); continue; }
          const step = 1000 / r.sampleRateHz;
          a.chan.lastSeq = r.sequence; a.chan.lastAtMs = r.startAtMs + (n - 1) * step;
          setQuality(a.chan, r.quality, r.clockUncertaintyMs, []);
          if (r.quality === 'invalid' || r.quality === 'unavailable') continue;
          for (let i = 0; i < n; i++) a.crew.route(a.metric, r.startAtMs + i * step, r.samples[i]);
          a.crew.latest[a.metric] = r.samples[n - 1];
        } else {
          const a = admit(r, r.observedAtMs);
          if (!a) continue;
          const { min, max } = METRICS[a.metric];
          if (r.value !== null && (!Number.isFinite(r.value) || r.value < min || r.value > max)) { reject('non-finite-or-out-of-range', a.metric, r.crewId, r.observedAtMs); continue; }
          a.chan.lastSeq = r.sequence; a.chan.lastAtMs = r.observedAtMs;
          if (r.value === null) { setQuality(a.chan, 'invalid', r.clockUncertaintyMs, ['null-value']); a.crew.latest[a.metric] = null; continue; }
          setQuality(a.chan, r.quality, r.clockUncertaintyMs, r.qualityReasons);
          if (r.quality === 'invalid' || r.quality === 'unavailable') continue;
          a.crew.route(a.metric, r.observedAtMs, r.value);
          a.crew.latest[a.metric] = r.value;
        }
      }
    },

    advanceTo(missionTimeMs): EngineDelta {
      now = Math.max(now, missionTimeMs);
      const calibrationRequests: string[] = [];
      for (const crew of crews.values()) {
        const q = (m: string) => crew.quality(m, now);
        const gasQ = q('co2.local');
        for (const b of crew.exposure.advance(gasQ.state, gasQ.lastAtMs)) {
          const v = b.estimates[EXPOSURE_METHODS.candidate.id];
          pendingEstimates.push({
            id: `${cfg.runId}:est:${crew.crewId}:${estSeq++}`, missionId: cfg.missionId, runId: cfg.runId, crewId: crew.crewId,
            metric: 'co2.inhaled.timeweighted', value: v, unit: 'ppm', window: { startMs: b.startMs, endMs: b.inhaleEndMs },
            inputIds: [`${crew.crewId}.resp.displacement`, `${crew.crewId}.co2.local`], methodId: EXPOSURE_METHODS.candidate.id, methodVersion: EXPOSURE_METHODS.candidate.version,
            origin: cfg.origin, strength: b.strength, reasons: b.reasons, validCoverage: b.coverage,
          });
        }
        crew.integrity.advance(now, q('mech.pvdf').state);
        if (crew.integrity.wantCalibration) { crew.integrity.wantCalibration = false; calibrationRequests.push(crew.crewId); }
        const cq = crew.integrity.windows.length ? crew.integrity.windows[crew.integrity.windows.length - 1].contact : 'unavailable';
        crew.exercise.advance(now, { load: q('exercise.load').state, imp: q('imp.r10k').state, contact: cq });
      }
      if (now - lastRuleEval >= RULE_EVAL_MS) {
        lastRuleEval = now;
        for (const crew of crews.values()) {
          const rq = quarantine.filter((x) => x.crewId === crew.crewId && now - x.atMs <= 10000 && x.atMs <= now + 1);
          machine.evaluate({
            nowMs: now, crewId: crew.crewId, q: (m) => crew.quality(m, now), exposure: crew.exposure, integrity: crew.integrity, exercise: crew.exercise,
            quarantineRecent: { count: rq.length, reason: rq.length ? rq[rq.length - 1].reason : '' },
            everSeen: [...crew.chans.entries()].filter(([, c]) => c.lastAtMs !== null).map(([m]) => m),
          }, pendingEvents);
        }
      }
      const delta: EngineDelta = { nowMs: now, estimates: pendingEstimates, events: pendingEvents, quarantined: quarantinedSinceDelta, calibrationRequests };
      pendingEstimates = []; pendingEvents = []; quarantinedSinceDelta = 0;
      return delta;
    },

    snapshot(): EngineSnapshot {
      const out: Record<string, CrewEngineState> = {};
      for (const crew of crews.values()) {
        const channelQuality: CrewEngineState['channelQuality'] = {};
        for (const m of Object.keys(METRICS)) channelQuality[m] = crew.quality(m, now);
        out[crew.crewId] = {
          crewId: crew.crewId, channelQuality, latest: { ...crew.latest },
          breaths: crew.exposure.breaths.slice(-400), exposureHistoryPpmMin: crew.exposure.historyPpmMin, lagEstimateMs: crew.exposure.lagEstimateMs,
          integrity: crew.integrity.windows.slice(-300), calibration: { ...crew.integrity.cal },
          reps: crew.exercise.reps.slice(-200), session: { ...crew.exercise.session }, comparison: crew.exercise.comparison,
        };
      }
      return { nowMs: now, crews: out, events: [...machine.latest.values()], quarantine: { count: quarantineCount, recent: quarantine.slice(-20).map(({ reason, metric, atMs }) => ({ reason, metric, atMs })) } };
    },

    acknowledge(eventId) {
      const ev = machine.acknowledge(eventId, now);
      if (ev) pendingEvents.push(ev);
      return ev;
    },
  };
}

export const METHOD_VERSIONS: Record<string, string> = Object.fromEntries(
  [...Object.values(EXPOSURE_METHODS), ...Object.values(INTEGRITY_METHODS), ...Object.values(EXERCISE_METHODS)].map((m) => [m.id, m.version]),
);
export const RULE_VERSIONS: Record<string, string> = Object.fromEntries(RULES.map((r) => [r.id, r.version]));
