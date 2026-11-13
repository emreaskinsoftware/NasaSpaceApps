/** Small deterministic DSP helpers used by the engine only. */
export class Biquad {
  private x1 = 0; private x2 = 0; private y1 = 0; private y2 = 0;
  private constructor(private b0: number, private b1: number, private b2: number, private a1: number, private a2: number) {}
  static lowpass(fc: number, fs: number, q = Math.SQRT1_2): Biquad {
    const w = (2 * Math.PI * fc) / fs, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
    return new Biquad((1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, (-2 * c) / a0, (1 - al) / a0);
  }
  static highpass(fc: number, fs: number, q = Math.SQRT1_2): Biquad {
    const w = (2 * Math.PI * fc) / fs, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
    return new Biquad((1 + c) / 2 / a0, -(1 + c) / a0, (1 + c) / 2 / a0, (-2 * c) / a0, (1 - al) / a0);
  }
  run(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** Time-stamped bounded series with binary-search range access. */
export class Series {
  t: number[] = [];
  v: number[] = [];
  constructor(private keepMs: number) {}
  push(t: number, v: number): void {
    this.t.push(t); this.v.push(v);
    if (this.t.length > 512 && t - this.t[0] > this.keepMs * 2) this.trim(t - this.keepMs);
  }
  trim(before: number): void {
    const i = this.lower(before);
    if (i > 0) { this.t.splice(0, i); this.v.splice(0, i); }
  }
  /** First index with t >= x. */
  lower(x: number): number {
    let lo = 0, hi = this.t.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.t[m] < x) lo = m + 1; else hi = m; }
    return lo;
  }
  get lastT(): number | null { return this.t.length ? this.t[this.t.length - 1] : null; }
  get last(): number | null { return this.v.length ? this.v[this.v.length - 1] : null; }
  /** Mean of finite samples in [a, b); null if none. */
  mean(a: number, b: number): number | null {
    let s = 0, n = 0;
    for (let i = this.lower(a); i < this.t.length && this.t[i] < b; i++) if (Number.isFinite(this.v[i])) { s += this.v[i]; n++; }
    return n ? s / n : null;
  }
  count(a: number, b: number): number { return this.lower(b) - this.lower(a); }
  rms(a: number, b: number): { rms: number | null; n: number; total: number } {
    let s = 0, n = 0, total = 0;
    for (let i = this.lower(a); i < this.t.length && this.t[i] < b; i++) { total++; if (Number.isFinite(this.v[i])) { s += this.v[i] * this.v[i]; n++; } }
    return { rms: n ? Math.sqrt(s / n) : null, n, total };
  }
}

/** Single-bin amplitude estimate (Goertzel) of a tone at f Hz. */
export function toneAmplitude(samples: number[], f: number, fs: number): number {
  const n = samples.length;
  if (n < 8) return 0;
  const w = (2 * Math.PI * f) / fs, c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) { const s0 = samples[i] + c * s1 - s2; s2 = s1; s1 = s0; }
  const power = s1 * s1 + s2 * s2 - c * s1 * s2;
  return (2 * Math.sqrt(Math.max(0, power))) / n;
}

export const mean = (a: number[]): number => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
export const sd = (a: number[]): number => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
};
export const median = (a: number[]): number => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const round = (x: number, d = 0): number => { const k = 10 ** d; return Math.round(x * k) / k; };
