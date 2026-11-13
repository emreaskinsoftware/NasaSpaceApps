/**
 * Exercise & Muscle Response. Compares MMG features only between matched segments (crew, exercise, load band,
 * cadence, quality). MMG amplitude is not force; impedance is context, not a fluid volume or a diagnosis.
 */
import type { EvidenceStrength, ExerciseComparison, QualityState, ReferenceSession, RepRecord } from '@aster/contracts';
import { Series, mean, sd } from './dsp';
import type { IntegrityProcessor } from './integrity';

export const EXERCISE_METHODS = {
  unconditioned: { id: 'unconditioned', version: '1.0.0' },
  conditioned: { id: 'matched-conditioned', version: '1.0.0' },
  fluidAware: { id: 'fluid-aware', version: '1.0.0' },
  noIntegrity: { id: 'ablation-no-integrity', version: '1.0.0' },
} as const;

export const EXERCISE_CONFIG = { loadBand: 0.12, cadenceBand: 0.15, minReps: 4, repsWindow: 8, warmupReps: 2, sdFloor: 0.04, minMatched: 3 };

export interface ExerciseCurrent { rms: number; loadN: number; cadenceRpm: number; r10k: number | null; anySuspect: boolean; reps: number }

/** Pure comparison of a current exercise summary with reference sessions. */
export function compareExercise(cur: ExerciseCurrent | null, refs: ReferenceSession[], exerciseId: string, ablation: { rms: number; loadN: number; cadenceRpm: number } | null, preReasons: string[] = []): ExerciseComparison {
  const out: ExerciseComparison = {
    eligible: false, reasons: [...preReasons], referenceIds: [], deviation: { [EXERCISE_METHODS.unconditioned.id]: null, [EXERCISE_METHODS.conditioned.id]: null, [EXERCISE_METHODS.fluidAware.id]: null, [EXERCISE_METHODS.noIntegrity.id]: null },
    percentDiff: null, impedanceShiftPct: null, repsUsed: cur?.reps ?? 0, strength: 'insufficient',
  };
  const all = refs.filter((r) => r.exerciseId === exerciseId);
  const z = (x: number, vals: number[]): number => (x - mean(vals)) / Math.max(sd(vals), EXERCISE_CONFIG.sdFloor * mean(vals));
  const match = (loadN: number, cad: number) => all.filter((r) => Math.abs(r.loadN - loadN) / r.loadN <= EXERCISE_CONFIG.loadBand && Math.abs(r.cadenceRpm - cad) / r.cadenceRpm <= EXERCISE_CONFIG.cadenceBand);
  if (cur && all.length >= EXERCISE_CONFIG.minMatched) out.deviation[EXERCISE_METHODS.unconditioned.id] = z(cur.rms, all.map((r) => r.mmgRms));
  // Ablation (evaluation only): same matching, but repetitions are NOT gated by sensor integrity.
  if (ablation) { const m = match(ablation.loadN, ablation.cadenceRpm); if (m.length >= EXERCISE_CONFIG.minMatched) out.deviation[EXERCISE_METHODS.noIntegrity.id] = z(ablation.rms, m.map((r) => r.mmgRms)); }
  if (!cur) return out;
  if (all.length === 0) { out.reasons.push('no-reference-sessions'); return out; }
  const loadOk = all.filter((r) => Math.abs(r.loadN - cur.loadN) / r.loadN <= EXERCISE_CONFIG.loadBand);
  const matched = loadOk.filter((r) => Math.abs(r.cadenceRpm - cur.cadenceRpm) / r.cadenceRpm <= EXERCISE_CONFIG.cadenceBand);
  if (loadOk.length === 0) out.reasons.push('load-mismatch');
  else if (matched.length === 0) out.reasons.push('cadence-mismatch');
  else if (matched.length < EXERCISE_CONFIG.minMatched) out.reasons.push('insufficient-references');
  if (out.reasons.length) return out;
  out.eligible = true;
  out.referenceIds = matched.map((r) => r.id);
  const vals = matched.map((r) => r.mmgRms), m = mean(vals);
  out.deviation[EXERCISE_METHODS.conditioned.id] = z(cur.rms, vals);
  out.percentDiff = ((cur.rms - m) / m) * 100;
  const rr = matched.map((r) => r.r10k), rm = mean(rr);
  if (cur.r10k !== null) {
    out.impedanceShiftPct = ((cur.r10k - rm) / rm) * 100;
    // Fluid-aware: regress reference MMG RMS on low-frequency resistance; compare with the prediction at the current value.
    const sxx = rr.reduce((s, x) => s + (x - rm) * (x - rm), 0);
    if (matched.length >= 4 && sxx > 1e-6) {
      const b = rr.reduce((s, x, i) => s + (x - rm) * (vals[i] - m), 0) / sxx;
      const resid = vals.map((v, i) => v - (m + b * (rr[i] - rm)));
      const s = Math.max(Math.sqrt(resid.reduce((a, x) => a + x * x, 0) / Math.max(1, resid.length - 2)), EXERCISE_CONFIG.sdFloor * m);
      // Extrapolating far outside the reference range is flagged rather than trusted.
      const span = Math.max(...rr) - Math.min(...rr);
      if (cur.r10k >= Math.min(...rr) - 0.6 * span && cur.r10k <= Math.max(...rr) + 0.6 * span) out.deviation[EXERCISE_METHODS.fluidAware.id] = (cur.rms - (m + b * (cur.r10k - rm))) / s;
      else out.reasons.push('impedance-outside-reference-range');
    }
  } else out.reasons.push('impedance-unavailable');
  const st: EvidenceStrength = matched.length >= 4 && !cur.anySuspect ? 'supported' : 'limited';
  out.strength = st;
  return out;
}

export class ExerciseProcessor {
  readonly pos = new Series(30000);
  readonly load = new Series(30000);
  readonly r10k = new Series(600000);
  readonly r100k = new Series(600000);
  reps: RepRecord[] = [];
  session = { active: false, startedAtMs: null as number | null, exerciseId: null as string | null };
  comparison: ExerciseComparison | null = null;
  private armed = false; private prev: number | null = null; private lastCross: number | null = null; private lastPeriod = 3000;
  private pending: { startMs: number; endMs: number }[] = [];
  private repIdx = 0;

  constructor(private integ: IntegrityProcessor, private refs: ReferenceSession[], private exerciseId = 'leg-press') {}

  onPosition(t: number, v: number): void {
    this.pos.push(t, v);
    if (v < -0.3) this.armed = true;
    if (this.armed && this.prev !== null && this.prev < 0 && v >= 0) {
      this.armed = false;
      if (this.lastCross !== null) {
        const d = t - this.lastCross;
        if (d >= 1000 && d <= 10000) { this.pending.push({ startMs: this.lastCross, endMs: t }); this.lastPeriod = d; }
      }
      this.lastCross = t;
    }
    this.prev = v;
  }
  onLoad(t: number, v: number): void { this.load.push(t, v); }

  advance(nowMs: number, q: { load: QualityState; imp: QualityState; contact: QualityState }): boolean {
    let changed = false;
    const lastRepEnd = this.reps.length ? this.reps[this.reps.length - 1].endMs : null;
    const recent = this.lastCross !== null && nowMs - this.lastCross < this.lastPeriod * 2.5;
    if (recent && !this.session.active) {
      this.session = { active: true, startedAtMs: this.lastCross, exerciseId: this.exerciseId };
      this.repIdx = 0; this.reps = []; this.comparison = null; changed = true;
    } else if (!recent && this.session.active) { this.session.active = false; this.lastCross = null; this.armed = false; changed = true; }
    while (this.pending.length && (this.integ.closedUntilMs >= this.pending[0].endMs || nowMs - this.pending[0].endMs > 6000)) {
      const r = this.pending.shift()!;
      const loadN = q.load === 'valid' ? this.load.mean(r.startMs, r.endMs) : null;
      const g = this.integ.clean.rms(r.startMs, r.endMs), u = this.integ.ungated.rms(r.startMs, r.endMs);
      const wins = this.integ.windows.filter((w) => w.endMs > r.startMs && w.startMs < r.endMs);
      const reasons = [...new Set(wins.flatMap((w) => w.reasons))];
      let quality: QualityState = 'valid';
      let rms = g.rms;
      if (g.total === 0 || g.n < g.total * 0.6) { quality = 'invalid'; rms = null; if (!reasons.length) reasons.push('mechanical-channel-missing'); }
      else if (wins.some((w) => w.decision === 'corrected')) quality = 'suspect';
      this.reps.push({ index: this.repIdx++, startMs: r.startMs, endMs: r.endMs, loadN, cadenceRpm: 60000 / (r.endMs - r.startMs), mmgRms: rms, mmgRmsUngated: u.n ? u.rms : null, quality, reasons });
      if (this.reps.length > 200) this.reps.shift();
      changed = true;
    }
    if (changed && this.session.active && (this.reps.length ? this.reps[this.reps.length - 1].endMs : null) !== lastRepEnd) this.recompute(nowMs, q);
    return changed;
  }

  private recompute(nowMs: number, q: { load: QualityState; imp: QualityState }): void {
    const sess = this.reps.filter((r) => r.index >= EXERCISE_CONFIG.warmupReps).slice(-EXERCISE_CONFIG.repsWindow);
    const pre: string[] = [];
    if (q.load !== 'valid' || sess.some((r) => r.loadN === null)) pre.push('load-unavailable');
    // Conservative gate: repetitions that needed experimental gain compensation never feed the comparison.
    const ok = sess.filter((r) => r.mmgRms !== null && r.loadN !== null && r.quality === 'valid');
    if (sess.length >= EXERCISE_CONFIG.minReps && ok.length < EXERCISE_CONFIG.minReps) pre.push('insufficient-valid-repetitions');
    const ung = sess.filter((r) => r.mmgRmsUngated !== null && r.loadN !== null);
    const ablation = ung.length >= EXERCISE_CONFIG.minReps ? { rms: mean(ung.map((r) => r.mmgRmsUngated!)), loadN: mean(ung.map((r) => r.loadN!)), cadenceRpm: mean(ung.map((r) => r.cadenceRpm!)) } : null;
    const cur: ExerciseCurrent | null = ok.length >= EXERCISE_CONFIG.minReps && !pre.length
      ? {
          rms: mean(ok.map((r) => r.mmgRms!)), loadN: mean(ok.map((r) => r.loadN!)), cadenceRpm: mean(ok.map((r) => r.cadenceRpm!)),
          r10k: q.imp === 'valid' ? this.r10k.mean(nowMs - 20000, nowMs + 1) : null, anySuspect: ok.some((r) => r.quality === 'suspect'), reps: ok.length,
        }
      : null;
    if (!cur && !pre.length) { this.comparison = null; return; }
    this.comparison = compareExercise(cur, this.refs, this.exerciseId, ablation, pre);
    this.comparison.repsUsed = ok.length;
  }
}
