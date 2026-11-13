import { useId, useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { QualityState } from '@aster/contracts';
import type { SeriesData } from '@aster/runtime';
import { useApp } from '../app/store';
import { fmtTime } from './ui';

export interface ChartSeries { id: string; label: string; data: SeriesData | undefined; color: string; dashed?: boolean; quality?: QualityState; estimate?: boolean; transform?: (v: number) => number; unit?: string }
export interface ChartBand { a: number; b: number; kind: 'inhale' | 'invalid' | 'masked' | 'corrected' | 'exercise' }
export interface ChartPoint { t: number; v: number | null; color: string; label: string; w?: number }
interface Props {
  title: string; series: ChartSeries[]; domain: [number, number]; height?: number; unit: string;
  bands?: ChartBand[]; points?: ChartPoint[]; pointsLabel?: string; yMin?: number; yMax?: number; digits?: number; origin?: string;
}
const W = 900, PAD = { l: 58, r: 14, t: 10, b: 24 };
const BAND_FILL: Record<ChartBand['kind'], string> = { inhale: 'var(--accent-soft)', invalid: 'url(#hatch)', masked: 'var(--hatch)', corrected: 'var(--warning-soft)', exercise: 'var(--success-soft)' };

/** Faithful time-series chart: gaps stay gaps (no interpolation across missing or invalid intervals), time always runs left to right. */
export function Chart({ title, series, domain, height = 190, unit, bands = [], points = [], pointsLabel, yMin, yMax, digits = 0, origin }: Props) {
  const { t } = useTranslation();
  const cursor = useApp((s) => s.cursorMs), setCursor = useApp((s) => s.setCursor);
  const live = useApp((s) => !!s.status?.running && s.req.endMs === null && !s.settings.pauseVisual);
  const ref = useRef<SVGSVGElement>(null);
  const uid = useId();
  const [t0, t1] = domain;
  const H = height, iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b;
  const sx = (x: number) => PAD.l + ((x - t0) / Math.max(1, t1 - t0)) * iw;

  const { paths, lo, hi } = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const s of series) if (s.data) for (let i = 0; i < s.data.v.length; i++) { if (s.data.t[i] < t0 || s.data.t[i] > t1) continue; const v = s.transform ? s.transform(s.data.v[i]) : s.data.v[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
    for (const p of points) if (p.v !== null) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.08;
    lo = yMin ?? lo - pad; hi = yMax ?? hi + pad;
    const sy = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo)) * ih;
    const paths = series.map((s) => {
      if (!s.data) return '';
      let d = '', prev = -Infinity;
      const gap = s.data.stepMs * 3.5 + 1;
      for (let i = 0; i < s.data.t.length; i++) {
        const x = s.data.t[i];
        if (x < t0 || x > t1) continue;
        const v = s.transform ? s.transform(s.data.v[i]) : s.data.v[i];
        d += `${x - prev > gap ? 'M' : 'L'}${sx(x).toFixed(1)} ${sy(v).toFixed(1)}`;
        prev = x;
      }
      return d;
    });
    return { paths, lo, hi };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, points, t0, t1, yMin, yMax, H]);
  const sy = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo)) * ih;

  const readAt = (s: ChartSeries, x: number): number | null => {
    const d = s.data;
    if (!d || !d.t.length) return null;
    let a = 0, b = d.t.length - 1;
    while (a < b) { const m = (a + b) >> 1; if (d.t[m] < x) a = m + 1; else b = m; }
    const i = a > 0 && Math.abs(d.t[a - 1] - x) < Math.abs(d.t[a] - x) ? a - 1 : a;
    if (Math.abs(d.t[i] - x) > d.stepMs * 3.5 + 1) return null; // inside a gap: no value, never an invented one
    return s.transform ? s.transform(d.v[i]) : d.v[i];
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    if (x < PAD.l || x > W - PAD.r) return;
    setCursor(t0 + ((x - PAD.l) / iw) * (t1 - t0));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = (t1 - t0) / 100, cur = cursor ?? t1;
    if (e.key === 'ArrowLeft') setCursor(Math.max(t0, cur - step * (e.shiftKey ? 10 : 1)));
    else if (e.key === 'ArrowRight') setCursor(Math.min(t1, cur + step * (e.shiftKey ? 10 : 1)));
    else if (e.key === 'Home') setCursor(t0);
    else if (e.key === 'End') setCursor(t1);
    else if (e.key === 'Escape') setCursor(null);
    else return;
    e.preventDefault();
  };
  const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * (hi - lo));
  const ticksX = [0, 0.25, 0.5, 0.75, 1].map((f) => t0 + f * (t1 - t0));
  const cur = cursor !== null && cursor >= t0 && cursor <= t1 ? cursor : null;
  const fmt = (v: number | null) => (v === null ? t('common.noValue') : v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits }));
  const nearPoint = cur !== null ? points.filter((p) => Math.abs(p.t - cur) < (t1 - t0) / 40).sort((a, b) => Math.abs(a.t - cur) - Math.abs(b.t - cur))[0] : undefined;
  const rows = useMemo(() => {
    const n = 24, out: { t: number; vals: (number | null)[] }[] = [];
    for (let i = 0; i <= n; i++) { const x = t0 + (i / n) * (t1 - t0); out.push({ t: x, vals: series.map((s) => readAt(s, x)) }); }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, t0, t1]);
  const empty = series.every((s) => !s.data || s.data.t.length === 0) && points.length === 0;

  return (
    <div className="chart" dir="ltr">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" tabIndex={0} aria-label={`${title}. ${t('chart.kbd')}`} aria-describedby={`${uid}-r`}
        onPointerMove={onMove} onPointerDown={onMove} onKeyDown={onKey}>
        <defs>
          <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="var(--critical)" strokeWidth="1.5" opacity="0.55" /></pattern>
        </defs>
        {bands.filter((b) => b.b > t0 && b.a < t1).map((b, i) => (
          <rect key={i} x={sx(Math.max(b.a, t0))} y={PAD.t} width={Math.max(1, sx(Math.min(b.b, t1)) - sx(Math.max(b.a, t0)))} height={ih} fill={BAND_FILL[b.kind]} />
        ))}
        {ticksY.map((v, i) => (<g key={i}><line className="grid-line" x1={PAD.l} x2={W - PAD.r} y1={sy(v)} y2={sy(v)} /><text className="axis" x={PAD.l - 8} y={sy(v) + 4} textAnchor="end">{v.toLocaleString(undefined, { maximumFractionDigits: digits })}</text></g>))}
        {ticksX.map((x, i) => (<text key={i} className="axis" x={sx(x)} y={H - 6} textAnchor={i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}>{fmtTime(x)}</text>))}
        {series.map((s, i) => (<path key={s.id} d={paths[i]} fill="none" stroke={s.color} strokeWidth={s.estimate ? 2 : 1.6} strokeDasharray={s.dashed ? '6 4' : undefined} strokeLinejoin="round" />))}
        {points.filter((p) => p.t >= t0 && p.t <= t1).map((p, i) => p.v === null
          ? <g key={i} stroke="var(--text-2)" strokeWidth="1.5"><line x1={sx(p.t) - 4} x2={sx(p.t) + 4} y1={PAD.t + ih - 4} y2={PAD.t + ih - 12} /><line x1={sx(p.t) - 4} x2={sx(p.t) + 4} y1={PAD.t + ih - 12} y2={PAD.t + ih - 4} /></g>
          : <g key={i}>{p.w ? <line x1={sx(p.t - p.w / 2)} x2={sx(p.t + p.w / 2)} y1={sy(p.v)} y2={sy(p.v)} stroke={p.color} strokeWidth="2.5" /> : null}<circle cx={sx(p.t)} cy={sy(p.v)} r="3.5" fill="var(--surface)" stroke={p.color} strokeWidth="2" /></g>)}
        {live && <line className="live-edge" x1={W - PAD.r} x2={W - PAD.r} y1={PAD.t} y2={PAD.t + ih} />}
        {cur !== null && <line x1={sx(cur)} x2={sx(cur)} y1={PAD.t} y2={PAD.t + ih} stroke="var(--text)" strokeWidth="1" strokeDasharray="3 3" />}
        {empty && <text className="axis" x={W / 2} y={H / 2} textAnchor="middle">{t('chart.noData')}</text>}
        <text className="axis" x={PAD.l + 6} y={PAD.t + 13} opacity="0.85">{unit}</text>
      </svg>
      <div className="chart-legend" aria-hidden="true">
        {series.map((s) => (<span key={s.id}><i className={s.dashed ? 'dash' : ''} style={{ borderColor: s.color }} />{s.label}</span>))}
        {pointsLabel && <span><i style={{ borderColor: points[0]?.color ?? 'var(--chart-3)' }} />{pointsLabel}</span>}
        {[...new Set(bands.map((b) => b.kind))].map((k) => (<span key={k}><i className="band" style={{ background: k === 'invalid' ? 'var(--critical)' : k === 'inhale' ? 'var(--accent)' : k === 'corrected' ? 'var(--warning)' : k === 'exercise' ? 'var(--success)' : 'var(--text-2)' }} />{t(`chart.band.${k}`)}</span>))}
      </div>
      <div className="readout" id={`${uid}-r`} aria-live="off">
        {cur === null ? <span>{t('chart.hint')}</span> : (<>
          <span>{t('chart.time')} <b>{fmtTime(cur, true)}</b></span>
          {series.map((s) => { const v = readAt(s, cur); return <span key={s.id}>{s.label} <b>{fmt(v)}{v !== null ? ` ${s.unit ?? unit}` : ''}</b>{s.quality ? ` · ${t(`quality.${s.quality}`)}` : ''}</span>; })}
          {nearPoint && <span>{nearPoint.label} <b>{fmt(nearPoint.v)}{nearPoint.v !== null ? ` ${unit}` : ''}</b></span>}
          {origin && <span>{t('common.source')} <b>{origin}</b></span>}
        </>)}
      </div>
      <details className="alt">
        <summary>{t('chart.table')}</summary>
        <div className="scroll" tabIndex={0} role="group" aria-label={t('common.tableRegion')}><table className="t">
          <thead><tr><th>{t('chart.time')}</th>{series.map((s) => <th key={s.id} className="n">{s.label} ({s.unit ?? unit})</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => (<tr key={i}><td className="mono">{fmtTime(r.t, true)}</td>{r.vals.map((v, k) => <td key={k} className="n">{fmt(v)}</td>)}</tr>))}</tbody>
        </table></div>
      </details>
    </div>
  );
}
