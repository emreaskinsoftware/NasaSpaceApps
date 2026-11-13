/**
 * Evaluation: joins engine outputs with simulator truth AFTER the run. Never imported by the engine or the
 * operator UI event path. Synthetic results are software/method evidence only — not clinical sensitivity.
 */
import type { EngineSnapshot, ExerciseComparison, HealthEvent, ReferenceSession } from '@aster/contracts';
import { createEngine, EXPOSURE_METHODS, EXERCISE_METHODS } from '@aster/engine';
import { createSimulator, NOMINAL_VARIATION, type Injection, type ScenarioDef, type SimVariation, type TruthBreath, type TruthSample } from '@aster/simulator';

export interface HeadlessRun {
  scenarioId: string; seed: number; variation: SimVariation;
  events: HealthEvent[];               // every revision, in order
  snapshot: EngineSnapshot;            // final
  truthBreaths: TruthBreath[];         // target crew
  truth1Hz: TruthSample[];             // target crew, 1 Hz
  comparisons: { tMs: number; c: ExerciseComparison | null }[];
  quarantined: number;
  recordCount: number;
}

export function runHeadless(opts: {
  scenario: ScenarioDef; seed: number; variation?: SimVariation; references: Record<string, ReferenceSession[]>;
  crewIds?: string[]; injections?: Injection[]; untilMs?: number; onTick?: (tMs: number) => void;
}): HeadlessRun {
  const crewIds = opts.crewIds ?? ['crew-1'];
  const runId = `run-${opts.scenario.id}-${opts.seed}`;
  const sim = createSimulator({ scenario: opts.scenario, seed: opts.seed, missionId: 'mission-eval', runId, crewIds, variation: opts.variation, injections: opts.injections });
  const engine = createEngine({ missionId: 'mission-eval', runId, crewIds, sensorMeta: sim.sensorMeta, references: opts.references, origin: 'simulated' });
  const target = crewIds[0];
  const out: HeadlessRun = { scenarioId: opts.scenario.id, seed: opts.seed, variation: opts.variation ?? NOMINAL_VARIATION, events: [], snapshot: engine.snapshot(), truthBreaths: [], truth1Hz: [], comparisons: [], quarantined: 0, recordCount: 0 };
  const end = opts.untilMs ?? opts.scenario.durationMs;
  while (sim.nowMs < end) {
    const b = sim.step();
    engine.ingest(b.records);
    out.recordCount += b.records.length;
    const d = engine.advanceTo(b.tMs + 100);
    for (const c of d.calibrationRequests) sim.inject({ atMs: sim.nowMs, kind: 'calibrate', crewId: c });
    out.events.push(...d.events);
    out.quarantined += d.quarantined;
    const t = b.truth.find((x) => x.crewId === target)!;
    if (t.breath) out.truthBreaths.push(t.breath);
    if (b.tMs % 1000 === 0) out.truth1Hz.push(t);
    if (b.tMs % 5000 === 0 && b.tMs > 0) out.comparisons.push({ tMs: b.tMs, c: engine.snapshot().crews[target].comparison });
    opts.onTick?.(b.tMs);
  }
  out.snapshot = engine.snapshot();
  return out;
}

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const med = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/* ---------- Exposure ---------- */
export interface ExposureEval { breaths: number; byMethod: Record<string, { mae: number; bias: number; n: number; coverage: number }> }
export function evaluateExposure(run: HeadlessRun, crewId = 'crew-1'): ExposureEval {
  const breaths = run.snapshot.crews[crewId].breaths;
  const ids = Object.values(EXPOSURE_METHODS).map((m) => m.id);
  const acc: Record<string, number[]> = Object.fromEntries(ids.map((i) => [i, []]));
  let matched = 0;
  for (const t of run.truthBreaths) {
    const mid = (t.startMs + t.inhaleEndMs) / 2;
    const b = breaths.find((x) => mid >= x.startMs - 150 && mid < x.inhaleEndMs + 150);
    if (!b) continue;
    matched++;
    for (const i of ids) { const v = b.estimates[i]; if (v !== null && v !== undefined) acc[i].push(v - t.inhaledMeanPpm); }
  }
  const byMethod: ExposureEval['byMethod'] = {};
  for (const i of ids) byMethod[i] = { mae: mean(acc[i].map(Math.abs)), bias: mean(acc[i]), n: acc[i].length, coverage: matched ? acc[i].length / matched : 0 };
  return { breaths: matched, byMethod };
}

/* ---------- Integrity ---------- */
export interface IntegrityEval { windows: number; byMethod: Record<string, { featureErr: number; coverage: number; flaggedChange: number; n: number }>; }
/** Feature = RMS ratio vs. pre-fault baseline; reference = latent source-amplitude ratio (held outside the engine). */
export function evaluateIntegrity(run: HeadlessRun, baselineEndMs: number, endMs = Infinity, crewId = 'crew-1'): IntegrityEval {
  const wins = run.snapshot.crews[crewId].integrity;
  const truthAt = (t: number) => run.truth1Hz[Math.min(run.truth1Hz.length - 1, Math.max(0, Math.round(t / 1000)))];
  const amp = (t: TruthSample) => t.response * Math.pow(Math.max(t.loadN, 1) / 400, 0.8) * (1 - run.variation.fluidAtten * t.fluid);
  const active = wins.filter((w) => { const a = truthAt(w.startMs), b = truthAt(w.endMs); return a.exerciseActive && b.exerciseActive && w.startMs >= 30000 && w.decision !== 'masked'; });
  const base = active.filter((w) => w.endMs <= baselineEndMs), post = active.filter((w) => w.startMs >= baselineEndMs + 15000 && w.endMs <= endMs);
  const tb = mean(base.map((w) => amp(truthAt((w.startMs + w.endMs) / 2))));
  const methods: Record<string, (w: (typeof wins)[number]) => number | null> = {
    'fixed-filter': (w) => w.rms.fixed, 'paired-reference': (w) => w.rms.paired,
    'calibration-aware-gate': (w) => (w.decision === 'accepted' ? w.rms.candidate : null),
    'calibration-aware-compensate': (w) => (w.decision === 'accepted' || w.decision === 'corrected' ? w.rms.candidate : null),
  };
  const byMethod: IntegrityEval['byMethod'] = {};
  for (const [id, f] of Object.entries(methods)) {
    // Feature = RMS over a rolling 6 s (three decision windows) so that it spans whole repetitions.
    const roll = (w: (typeof wins)[number]): number | null => {
      const k = wins.indexOf(w), v = [wins[k - 2], wins[k - 1], w].map((x) => (x ? f(x) : null));
      return v.every((x): x is number => x !== null) ? Math.sqrt(v.reduce((a2: number, x) => a2 + (x as number) * (x as number), 0) / 3) : null;
    };
    const b0 = med(base.map(roll).filter((x): x is number => x !== null));
    const errs: number[] = []; let flagged = 0;
    for (const w of post) {
      const v = roll(w);
      if (v === null || !Number.isFinite(b0)) continue;
      const r = v / b0, rt = amp(truthAt((w.startMs + w.endMs) / 2)) / tb;
      errs.push(Math.abs(r - rt));
      if (r < 0.8 || r > 1.25) flagged++;
    }
    byMethod[id] = { featureErr: mean(errs), coverage: post.length ? errs.length / post.length : 0, flaggedChange: errs.length ? flagged / errs.length : 0, n: errs.length };
  }
  return { windows: post.length, byMethod };
}

/* ---------- Exercise ---------- */
export interface ExerciseEval { samples: number; byMethod: Record<string, { flagged: number; abstained: number; n: number }>; truthChanged: boolean }
export function evaluateExercise(run: HeadlessRun, afterMs: number, endMs = Infinity): ExerciseEval {
  const ids = Object.values(EXERCISE_METHODS).map((m) => m.id);
  const samples = run.comparisons.filter((x) => x.tMs >= afterMs && x.tMs <= endMs && run.truth1Hz[Math.min(run.truth1Hz.length - 1, Math.round(x.tMs / 1000))].exerciseActive);
  const last = run.truth1Hz.filter((t) => t.tMs >= afterMs && t.tMs <= endMs && t.exerciseActive);
  const truthChanged = last.length > 0 && Math.abs(mean(last.map((t) => t.response)) - 1) > 0.15;
  const byMethod: ExerciseEval['byMethod'] = {};
  for (const id of ids) {
    let flagged = 0, abst = 0;
    for (const s of samples) {
      const z = s.c?.deviation[id] ?? null;
      if (z === null || z === undefined) abst++;
      else if (Math.abs(z) > 3) flagged++;
    }
    byMethod[id] = { flagged: samples.length - abst ? flagged / (samples.length - abst) : NaN, abstained: samples.length ? abst / samples.length : 1, n: samples.length };
  }
  return { samples: samples.length, byMethod, truthChanged };
}

export const firstOpen = (run: HeadlessRun, ruleId: string): number | null => run.events.find((e) => e.ruleId === ruleId && e.revision === 1)?.openedAtMs ?? null;
export const openedRules = (run: HeadlessRun): string[] => [...new Set(run.events.filter((e) => e.revision === 1).map((e) => e.ruleId))];

/** Reproducibility fingerprint: payloads and relative timestamps with run-specific identifiers removed. */
export function fingerprint(run: HeadlessRun): string {
  const strip = (s: string) => s.replace(/run-[A-Za-z0-9-]+/g, 'RUN');
  return JSON.stringify({
    ev: run.events.map((e) => [strip(e.id), e.revision, e.ruleId, e.state, e.updatedAtMs, e.explanationParams]),
    br: run.snapshot.crews['crew-1']?.breaths.map((b) => [b.startMs, b.inhaleEndMs, b.estimates]),
    n: run.recordCount,
  });
}

/** Generated-history reference sessions: produced by running the simulator through the real engine (no shortcuts). */
export function generateReferences(crewIds: string[], variation: SimVariation, seed: number, base: ScenarioDef): Record<string, ReferenceSession[]> {
  const loads = [300, 400, 400, 500, 400, 400, 300, 500, 400, 400];
  const fluids = [0.05, 0.1, 0.3, 0.0, 0.2, 0.4, 0.15, 0.25, 0.35, 0.05];
  const out: Record<string, ReferenceSession[]> = {};
  crewIds.forEach((crewId, ci) => {
    out[crewId] = loads.map((loadN, k) => {
      const scenario: ScenarioDef = { ...base, durationMs: 80000, tracks: { fluid: [[0, fluids[k]]] }, exercise: [{ startMs: 5000, endMs: 76000, loadN, cadenceRpm: 20, exerciseId: 'leg-press' }], dropouts: [], malformed: null };
      const runId = `ref-${crewId}-${k}`;
      const sim = createSimulator({ scenario, seed: seed + ci * 100 + k, missionId: 'mission-ref', runId, crewIds, targetCrew: ci, variation });
      const engine = createEngine({ missionId: 'mission-ref', runId, crewIds, sensorMeta: sim.sensorMeta, references: {}, origin: 'simulated' });
      while (sim.nowMs < scenario.durationMs) { const b = sim.step(); engine.ingest(b.records); engine.advanceTo(b.tMs + 100); }
      const c = engine.snapshot().crews[crewId];
      const reps = c.reps.filter((r) => r.index >= 2 && r.mmgRms !== null && r.endMs < 76000);
      const imp = (m: string) => c.latest[m] ?? NaN;
      return {
        id: `REF-${crewId}-${String(k + 1).padStart(2, '0')}`, label: `Day −${(loads.length - k) * 3}`, exerciseId: 'leg-press', dayOffset: -(loads.length - k) * 3,
        loadN: Math.round(mean(reps.map((r) => r.loadN ?? NaN))), cadenceRpm: Math.round(mean(reps.map((r) => r.cadenceRpm ?? NaN)) * 10) / 10,
        mmgRms: Math.round(mean(reps.map((r) => r.mmgRms!)) * 1e5) / 1e5, r10k: Math.round(imp('imp.r10k') * 100) / 100, r100k: Math.round(imp('imp.r100k') * 100) / 100, origin: 'simulated' as const,
      };
    });
  });
  return out;
}
