/**
 * Sensor Integrity. Uses a known reference excitation, a contact measurement and a motion reference to decide
 * whether a mechanical-signal window may be interpreted. A successful instrument self-check is NOT a physiological
 * calibration: the actuator path can differ from the physiological path, so the policy is a conservative gate.
 */
import type { CalibrationState, IntegrityWindowRecord, QualityState, SensorMeta } from '@aster/contracts';
import { Biquad, Series, toneAmplitude } from './dsp';

export const INTEGRITY_METHODS = {
  fixed: { id: 'fixed-filter', version: '1.0.0' },
  paired: { id: 'paired-reference', version: '1.0.0' },
  candidate: { id: 'calibration-aware', version: '1.0.1' },
} as const;

export const INTEGRITY_CONFIG = {
  windowMs: 2000,
  gainNominal: [0.8, 1.25] as [number, number],
  contactValid: 0.85,
  contactInvalid: 0.7,
  minCorrectableGain: 0.4,
  calibrationExpiryMs: 100000,
  calRequestMinGapMs: 8000,
};

export class IntegrityProcessor {
  private hp = Biquad.highpass(10, 200); private lp1 = Biquad.lowpass(45, 200); private lp2 = Biquad.lowpass(45, 200);
  private ihp = Biquad.highpass(10, 100); private ilp = Biquad.lowpass(45, 100);
  private dec = 0;
  private raw = new Series(6000);
  private p = new Series(8000);
  private i = new Series(8000);
  readonly force = new Series(30000);
  /** candidate-processed samples (NaN where rejected/masked), 100 Hz */
  readonly clean = new Series(40000);
  /** paired-cleaned samples without gating (ablation), 100 Hz */
  readonly ungated = new Series(40000);
  windows: IntegrityWindowRecord[] = [];
  closedUntilMs = 0;
  private nextWin = 0;
  private actOn: number | null = null;
  private masks: [number, number][] = [];
  private pendingCal: [number, number] | null = null;
  cal: { state: CalibrationState; lastAtMs: number | null; nextAtMs: number | null; referenceGain: number | null; lastGain: number | null; reason: string | null } =
    { state: 'not_available', lastAtMs: null, nextAtMs: null, referenceGain: null, lastGain: null, reason: null };
  private aRef: number | null = null; private fRef: number | null = null;
  private calPeriod: number | null = null;
  private contactCat: QualityState = 'unavailable'; private contactChangedAt = 0;
  private lastCalReq = -1e9;
  wantCalibration = false;

  constructor(private meta: SensorMeta) {}

  onPvdf(t: number, v: number): void {
    this.raw.push(t, v);
    const y = this.lp2.run(this.lp1.run(this.hp.run(v)));
    if (this.dec++ % 2 === 0) this.p.push(t, y);
  }
  onImu(t: number, v: number): void { this.i.push(t, this.ilp.run(this.ihp.run(v))); }
  onForce(t: number, v: number): void { this.force.push(t, v); }
  onActuator(t: number, on: boolean): void {
    if (this.cal.state === 'not_available') this.cal.state = 'scheduled';
    if (on && this.actOn === null) { this.actOn = t; this.cal.state = 'active'; }
    else if (!on && this.actOn !== null) {
      this.masks.push([this.actOn - 50, t + 150]);
      if (this.masks.length > 40) this.masks.shift();
      this.pendingCal = [this.actOn, t];
      if (this.cal.lastAtMs !== null) this.calPeriod = this.actOn - this.cal.lastAtMs;
      this.actOn = null; this.cal.state = 'evaluating';
    }
  }

  private fRatio(a: number, b: number): number | null {
    const f = this.force.mean(a, b);
    if (f === null) return null;
    if (this.fRef === null) return 1;
    return f / this.fRef;
  }
  private masked(t: number): boolean {
    if (this.actOn !== null && t >= this.actOn - 50) return true;
    for (let k = this.masks.length - 1; k >= 0; k--) { const [a, b] = this.masks[k]; if (t >= a && t < b) return true; if (b < t - 5000) break; }
    return false;
  }

  private evaluateCalibration(nowMs: number, quality?: (metric: string, a: number, b: number) => QualityState): void {
    const [a, b] = this.pendingCal!;
    if ((this.raw.lastT ?? 0) < b && nowMs < b + 1500) return;
    this.pendingCal = null;
    const lo = this.raw.lower(a + 100), hi = this.raw.lower(b - 100);
    const amp = toneAmplitude(this.raw.v.slice(lo, hi), this.meta.calToneHz, 200);
    const f = this.force.mean(a - 500, b);
    this.cal.lastAtMs = b; this.cal.nextAtMs = this.calPeriod ? b + this.calPeriod : null;
    if (quality && ['mech.pvdf', 'contact.force', 'actuator.state'].some((m) => quality(m, a, b) !== 'valid')) { this.cal.state = 'rejected'; this.cal.reason = 'calibration-input-quality'; return; }
    if (hi - lo < 80 || f === null) { this.cal.state = 'rejected'; this.cal.reason = 'insufficient-calibration-data'; return; }
    if (this.aRef === null) {
      // First calibration becomes the frozen instrument reference. It is never updated during a run,
      // so a slowly degrading stream cannot silently redefine "normal".
      this.aRef = amp; this.fRef = f; this.cal.referenceGain = 1; this.cal.lastGain = 1;
      this.cal.state = 'accepted'; this.cal.reason = 'reference-established';
      return;
    }
    const g = amp / this.aRef, fr = f / this.fRef!;
    this.cal.lastGain = g;
    const [gl, gh] = INTEGRITY_CONFIG.gainNominal;
    if (g > gh) { this.cal.state = 'rejected'; this.cal.reason = 'gain-above-reference'; }
    else if (g >= gl && fr >= INTEGRITY_CONFIG.contactValid) { this.cal.state = 'accepted'; this.cal.reason = 'nominal'; }
    else if (g < gl && fr < 0.9) { this.cal.state = 'accepted'; this.cal.reason = 'coupling-change-confirmed'; }
    else if (g < gl) { this.cal.state = 'rejected'; this.cal.reason = 'path-mismatch'; }
    else { this.cal.state = 'rejected'; this.cal.reason = 'contact-changed-response-unchanged'; }
  }

  private closeWindow(a: number, quality?: (metric: string, a: number, b: number) => QualityState): void {
    const b = a + INTEGRITY_CONFIG.windowMs;
    const lo = this.p.lower(a), hi = this.p.lower(b);
    // Paired-reference cancellation: 5-tap least squares of the mechanical channel on the motion reference
    // (lags -2..+2 samples absorb the small phase difference between the two filter chains).
    const L = 5, H = 2;
    let sp = 0, n = 0, total = 0;
    const A = new Float64Array(L * L), rhs = new Float64Array(L);
    const iv: number[][] = [];
    let ii = this.i.lower(a - 5);
    const iN = this.i.t.length;
    for (let k = lo; k < hi; k++) {
      const t = this.p.t[k];
      while (ii < iN - 1 && this.i.t[ii] < t - 4) ii++;
      const x: number[] = [];
      for (let l = -H; l <= H; l++) { const j = ii + l; x.push(j >= 0 && j < iN ? this.i.v[j] : 0); }
      iv.push(x); total++;
      if (this.masked(t)) continue;
      const y = this.p.v[k];
      sp += y * y; n++;
      for (let r = 0; r < L; r++) { rhs[r] += y * x[r]; for (let c = 0; c < L; c++) A[r * L + c] += x[r] * x[c]; }
    }
    const beta = solve(A, rhs, L);
    let sres = 0;
    for (let k = lo, j = 0; k < hi; k++, j++) {
      if (this.masked(this.p.t[k])) continue;
      let e = this.p.v[k];
      for (let r = 0; r < L; r++) e -= beta[r] * iv[j][r];
      sres += e * e;
    }
    const fr = this.fRatio(a, b), fMean = this.force.mean(a, b);
    const contact: QualityState = fr === null ? 'unavailable' : fr >= INTEGRITY_CONFIG.contactValid ? 'valid' : fr >= INTEGRITY_CONFIG.contactInvalid ? 'suspect' : 'invalid';
    if (contact !== this.contactCat) { this.contactCat = contact; this.contactChangedAt = a; }
    const rec: IntegrityWindowRecord = {
      startMs: a, endMs: b, contact, contactForceN: fMean, transferGain: this.cal.lastGain,
      rms: { fixed: null, paired: null, candidate: null }, decision: 'masked', reasons: [],
    };
    if (total === 0) { rec.decision = 'rejected'; rec.reasons.push('mechanical-channel-missing'); }
    else if (n < total * 0.5) rec.reasons.push('excitation-window');
    else {
      rec.rms.fixed = Math.sqrt(sp / n);
      rec.rms.paired = Math.sqrt(sres / n);
      const g = this.cal.lastGain;
      const calAfterChange = this.cal.lastAtMs !== null && this.cal.lastAtMs >= this.contactChangedAt;
      if (contact === 'unavailable') { rec.decision = 'rejected'; rec.reasons.push('contact-unavailable'); }
      else if (contact === 'valid') {
        // Contact is as at reference: keep the data. A failed self-check rejects the CORRECTION, not the measurement.
        rec.decision = 'accepted'; rec.rms.candidate = rec.rms.paired;
        if (this.aRef === null) rec.reasons.push('no-calibration-yet');
        if (this.cal.state === 'rejected') rec.reasons.push(`self-check-failed:${this.cal.reason}`);
      } else if (this.cal.state === 'rejected') { rec.decision = 'rejected'; rec.reasons.push(`calibration-rejected:${this.cal.reason}`); }
      else if (calAfterChange && this.cal.reason === 'coupling-change-confirmed' && g !== null && g >= INTEGRITY_CONFIG.minCorrectableGain) {
        rec.decision = 'corrected'; rec.rms.candidate = rec.rms.paired / g; rec.reasons.push('experimental-gain-compensation');
      } else {
        rec.decision = 'rejected';
        rec.reasons.push(calAfterChange ? 'coupling-loss-beyond-correctable-range' : 'contact-changed-awaiting-calibration');
      }
    }
    if (quality) {
      const bad = ['mech.pvdf', 'imu.accel', 'contact.force'].map((m) => ({ m, q: quality(m, a, b) })).filter((x) => x.q !== 'valid');
      if (bad.length) {
        rec.decision = 'rejected'; rec.rms.candidate = null;
        rec.reasons.push(...bad.map(({ m, q }) => `input-quality:${m}:${q}`));
        const contactQuality = bad.find((x) => x.m === 'contact.force');
        if (contactQuality) rec.contact = contactQuality.q;
      }
    }
    const scale = rec.decision === 'corrected' && this.cal.lastGain ? 1 / this.cal.lastGain : 1;
    const usable = rec.decision === 'accepted' || rec.decision === 'corrected';
    for (let k = lo, j = 0; k < hi; k++, j++) {
      const t = this.p.t[k], m = this.masked(t);
      let y = this.p.v[k];
      for (let r = 0; r < L; r++) y -= beta[r] * iv[j][r];
      this.ungated.push(t, m ? NaN : y);
      this.clean.push(t, m || !usable ? NaN : y * scale);
    }
    this.windows.push(rec);
    if (this.windows.length > 300) this.windows.shift();
    this.closedUntilMs = b;
    // Ask the instrument for a calibration when contact changed after the last one (instrument operation, not a crew task).
    if (contact !== 'unavailable' && this.contactChangedAt > 0 && !calAfterChangeOk(this.cal.lastAtMs, this.contactChangedAt) && b - this.lastCalReq > INTEGRITY_CONFIG.calRequestMinGapMs) {
      this.wantCalibration = true; this.lastCalReq = b;
    }
  }

  advance(nowMs: number, pvdfQuality: QualityState, quality?: (metric: string, a: number, b: number) => QualityState): void {
    if (this.pendingCal) this.evaluateCalibration(nowMs, quality);
    if (this.cal.lastAtMs !== null && this.cal.state !== 'active' && this.cal.state !== 'evaluating' && nowMs - this.cal.lastAtMs > INTEGRITY_CONFIG.calibrationExpiryMs) {
      this.cal.state = 'expired'; this.cal.reason = 'no-recent-calibration';
    }
    const dataT = pvdfQuality === 'stale' || pvdfQuality === 'unavailable' ? nowMs - 500 : (this.p.lastT ?? -1);
    while (dataT >= this.nextWin + INTEGRITY_CONFIG.windowMs) { this.closeWindow(this.nextWin, quality); this.nextWin += INTEGRITY_CONFIG.windowMs; }
  }
  /** Fraction of contact reference currently measured (1 = as at reference). */
  contactRatio(nowMs: number): number | null { return this.fRatio(nowMs - 1500, nowMs + 1); }
}
/** Solve the small ridge-regularised normal equations A·b = r (Gaussian elimination with partial pivoting). */
function solve(A0: Float64Array, r0: Float64Array, n: number): Float64Array {
  const A = Float64Array.from(A0), r = Float64Array.from(r0);
  let tr = 0;
  for (let i = 0; i < n; i++) tr += A[i * n + i];
  if (tr < 1e-12) return new Float64Array(n);
  for (let i = 0; i < n; i++) A[i * n + i] += 1e-6 * tr;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(A[i * n + c]) > Math.abs(A[p * n + c])) p = i;
    if (p !== c) { for (let k = 0; k < n; k++) { const t = A[c * n + k]; A[c * n + k] = A[p * n + k]; A[p * n + k] = t; } const t = r[c]; r[c] = r[p]; r[p] = t; }
    const d = A[c * n + c];
    if (Math.abs(d) < 1e-18) return new Float64Array(n);
    for (let i = c + 1; i < n; i++) { const f = A[i * n + c] / d; for (let k = c; k < n; k++) A[i * n + k] -= f * A[c * n + k]; r[i] -= f * r[c]; }
  }
  const b = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = r[i]; for (let k = i + 1; k < n; k++) s -= A[i * n + k] * b[k]; b[i] = s / A[i * n + i]; }
  return b;
}
const calAfterChangeOk = (calAt: number | null, changedAt: number): boolean => calAt !== null && calAt >= changedAt;
