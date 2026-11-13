/**
 * Breathing & Exposure. Produces a TIME-weighted inhalation-phase CO2 concentration estimate.
 * It is not a volume-weighted dose, not end-tidal CO2 and not a diagnosis: no flow signal is assumed.
 */
import type { BreathRecord, EvidenceStrength, QualityState, SensorMeta } from '@aster/contracts';
import { Series, median } from './dsp';

export const EXPOSURE_METHODS = {
  cabin: { id: 'cabin', version: '1.0.0' },
  localWindow: { id: 'local-window', version: '1.0.0' },
  gated: { id: 'phase-gated', version: '1.0.0' },
  candidate: { id: 'aligned-quality-aware', version: '1.0.1' },
} as const;

/** Demonstration settings (software constants, not clinical limits). */
export const EXPOSURE_CONFIG = {
  bandwidthRatioMax: 0.35,   // declared sensor tau / inhalation duration above which the estimate is withheld
  phaseUncertaintyMax: 0.2,  // phase uncertainty / inhalation duration above which the estimate is withheld
  minCoverage: 0.6,
  lagClampMs: 0,
  lagMismatchMs: 300,
  onsetModelOffsetMs: 120,   // assumed plume-onset latency used by the lag estimator
  onsetFraction: 0.05,       // fraction of the breath swing that marks the onset
};

export interface ExposureBreathInput {
  startMs: number; inhaleEndMs: number; endMs: number; phaseUncertaintyMs: number; plausible: boolean;
}

/** Pure estimator: all four methods for one breath. */
export function estimateBreath(
  b: ExposureBreathInput, co2: Series, cabin: Series, meta: SensorMeta, lagMs: number, lagConsistent: boolean, gasQuality: QualityState, index: number, inputQualityReasons: string[] = [],
): BreathRecord {
  const inh = b.inhaleEndMs - b.startMs;
  const reasons: string[] = [...inputQualityReasons];
  const cab = cabin.mean(b.startMs - 1000, b.endMs + 1) ?? cabin.last;
  const estimates: Record<string, number | null> = {
    [EXPOSURE_METHODS.cabin.id]: cab,
    [EXPOSURE_METHODS.localWindow.id]: gasQuality === 'valid' || gasQuality === 'suspect' ? co2.mean(b.startMs, b.endMs) : null,
    [EXPOSURE_METHODS.gated.id]: gasQuality === 'valid' || gasQuality === 'suspect' ? co2.mean(b.startMs, b.inhaleEndMs) : null,
    [EXPOSURE_METHODS.candidate.id]: null,
  };
  const tau = meta.co2LocalResponseTauMs;
  if (!b.plausible) reasons.push('implausible-breath');
  if (gasQuality !== 'valid') reasons.push(`gas-channel-${gasQuality}`);
  if (tau > EXPOSURE_CONFIG.bandwidthRatioMax * inh) reasons.push('sensor-bandwidth');
  if (b.phaseUncertaintyMs > EXPOSURE_CONFIG.phaseUncertaintyMax * inh) reasons.push('phase-uncertainty');
  let coverage = 0;
  if (reasons.length === 0) {
    const guard = Math.min(b.phaseUncertaintyMs, 0.25 * inh);
    const a = b.startMs + lagMs + guard, z = b.inhaleEndMs + lagMs - guard;
    const m = co2.mean(a, z);
    const expected = Math.max(1, ((z - a) / 1000) * 20);
    coverage = Math.min(1, co2.count(a, z) / expected);
    if (m === null || coverage < EXPOSURE_CONFIG.minCoverage) reasons.push('insufficient-samples');
    else {
      // mean(y + tau*dy/dt) over the window == mean(y) + tau*(y_end - y_start)/duration (first-order inverse).
      const y0 = co2.mean(a - 75, a + 76), y1 = co2.mean(z - 75, z + 76);
      const corr = y0 !== null && y1 !== null ? (tau * (y1 - y0)) / (z - a) : 0;
      estimates[EXPOSURE_METHODS.candidate.id] = Math.max(0, m + corr);
    }
  }
  let strength: EvidenceStrength = 'insufficient';
  if (estimates[EXPOSURE_METHODS.candidate.id] !== null) {
    strength = b.phaseUncertaintyMs < 0.08 * inh && tau < 0.2 * inh && lagConsistent ? 'supported' : 'limited';
    if (!lagConsistent) reasons.push('lag-mismatch');
    reasons.push('spatial-sampling-uncertainty');
  }
  return { index, startMs: b.startMs, inhaleEndMs: b.inhaleEndMs, endMs: b.endMs, phaseUncertaintyMs: Math.round(b.phaseUncertaintyMs), estimates, coverage, lagMs: Math.round(lagMs), reasons, strength };
}

/** Streaming breath detection from a respiratory displacement waveform (phase only; never airflow or tidal volume). */
export class BreathDetector {
  private ema: number | null = null;
  private dir = 1; private ext = -Infinity; private extT = 0;
  private amp = 0.6; private prevTrough: number | null = null; private peakT: number | null = null; private peakV = 0; private troughV = 0;
  private d1 = 0; private d2 = 0; private n = 0; private noiseAcc = 0; private noiseN = 0;
  private static readonly ALPHA = 0.35;
  private static readonly DELAY_MS = ((1 - 0.35) / 0.35) * 40;

  push(t: number, v: number): ExposureBreathInput | null {
    // noise from second differences of the raw samples (waveform curvature is negligible at 25 Hz)
    if (this.n >= 2) { const s = v - 2 * this.d1 + this.d2; this.noiseAcc += s * s; this.noiseN++; }
    this.d2 = this.d1; this.d1 = v; this.n++;
    this.ema = this.ema === null ? v : this.ema + BreathDetector.ALPHA * (v - this.ema);
    const e = this.ema, h = 0.25 * this.amp;
    let out: ExposureBreathInput | null = null;
    if (this.dir > 0) {
      if (e > this.ext) { this.ext = e; this.extT = t; }
      else if (e < this.ext - h) { this.peakT = this.extT - BreathDetector.DELAY_MS; this.peakV = this.ext; this.dir = -1; this.ext = e; this.extT = t; }
    } else {
      if (e < this.ext) { this.ext = e; this.extT = t; }
      else if (e > this.ext + h) {
        const trough = this.extT - BreathDetector.DELAY_MS;
        if (this.prevTrough !== null && this.peakT !== null && this.peakT > this.prevTrough) {
          const swing = Math.max(1e-6, this.peakV - Math.min(this.troughV, this.ext));
          this.amp += 0.2 * (swing - this.amp);
          const inh = this.peakT - this.prevTrough, dur = trough - this.prevTrough;
          const sigma = this.noiseN ? Math.sqrt(this.noiseAcc / this.noiseN / 6) : 0;
          out = {
            startMs: this.prevTrough, inhaleEndMs: this.peakT, endMs: trough,
            phaseUncertaintyMs: Math.min(5000, (sigma / swing) * inh),
            plausible: dur >= 1500 && dur <= 12000 && inh >= 500 && inh <= 6000,
          };
        }
        this.prevTrough = trough; this.troughV = this.ext; this.peakT = null;
        this.noiseAcc = 0; this.noiseN = 0;
        this.dir = 1; this.ext = e; this.extT = t;
      }
    }
    return out;
  }
}

export class ExposureProcessor {
  readonly resp = new Series(90000);
  readonly co2 = new Series(90000);
  readonly cabin = new Series(600000);
  private det = new BreathDetector();
  private lagObs: number[] = [];
  breaths: BreathRecord[] = [];
  historyPpmMin = 0;
  lagEstimateMs: number | null = null;
  private idx = 0;
  private pending: ExposureBreathInput[] = [];

  constructor(private meta: SensorMeta) {}

  onResp(t: number, v: number): void {
    this.resp.push(t, v);
    const b = this.det.push(t, v);
    if (b) this.pending.push(b);
  }

  /** Estimate onset lag: time from exhalation onset to the first clear rise of local CO2, minus the assumed plume latency. */
  private observeLag(b: ExposureBreathInput): void {
    const a = this.co2.lower(b.inhaleEndMs - 200), z = this.co2.lower(b.inhaleEndMs + 1500);
    if (z - a < 12) return;
    let lo = Infinity, hi = -Infinity, loI = a;
    for (let i = a; i < z; i++) { const y = this.co2.v[i]; if (y < lo) { lo = y; loI = i; } if (y > hi) hi = y; }
    if (hi - lo < 150) return;
    for (let i = loI; i < z; i++) {
      if (this.co2.v[i] >= lo + EXPOSURE_CONFIG.onsetFraction * (hi - lo)) {
        const lag = this.co2.t[i] - b.inhaleEndMs - EXPOSURE_CONFIG.onsetModelOffsetMs - 0.1 * this.meta.co2LocalResponseTauMs;
        this.lagObs.push(lag);
        if (this.lagObs.length > 9) this.lagObs.shift();
        this.lagEstimateMs = median(this.lagObs);
        return;
      }
    }
  }

  /** Resolve breaths whose gas samples have arrived. Returns newly completed records. */
  advance(gasQuality: QualityState, gasLastT: number | null, quality?: (metric: string, a: number, b: number) => QualityState): BreathRecord[] {
    const done: BreathRecord[] = [];
    const declared = this.meta.co2LocalTransportDelayMs;
    while (this.pending.length) {
      const b = this.pending[0];
      const need = b.inhaleEndMs + declared + 1700;
      const haveGas = gasLastT !== null && gasLastT >= need;
      const gasGone = gasQuality === 'stale' || gasQuality === 'unavailable' || gasQuality === 'invalid';
      if (!haveGas && !gasGone && (this.resp.lastT ?? 0) < need + 2000) break;
      this.pending.shift();
      if (haveGas && b.plausible) this.observeLag(b);
      const est = this.lagEstimateMs;
      const consistent = est === null || Math.abs(est - declared) <= EXPOSURE_CONFIG.lagMismatchMs;
      const lag = est === null ? declared : Math.max(declared - EXPOSURE_CONFIG.lagClampMs, Math.min(declared + EXPOSURE_CONFIG.lagClampMs, est));
      const respQ = quality?.('resp.displacement', b.startMs, b.endMs) ?? 'valid';
      const windowGasQ = quality?.('co2.local', b.startMs + lag, b.inhaleEndMs + lag) ?? gasQuality;
      const rec = estimateBreath(b, this.co2, this.cabin, this.meta, lag, consistent, windowGasQ, this.idx++, respQ === 'valid' ? [] : [`resp-channel-${respQ}`]);
      if (quality && quality('co2.cabin', b.startMs, b.endMs) !== 'valid') rec.estimates[EXPOSURE_METHODS.cabin.id] = null;
      const c = rec.estimates[EXPOSURE_METHODS.candidate.id];
      if (c !== null) this.historyPpmMin += (c * (b.endMs - b.startMs)) / 60000;
      this.breaths.push(rec);
      if (this.breaths.length > 400) this.breaths.shift();
      done.push(rec);
    }
    return done;
  }
}
