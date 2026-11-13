import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { HealthEvent, InterpretationStatus, Metric, QualityState } from '@aster/contracts';
import { useApp } from '../app/store';
import { useChangeFlash } from './motion';

export function fmtTime(ms: number, precise = false): string {
  const s = Math.max(0, ms) / 1000, m = Math.floor(s / 60), r = s - m * 60;
  return `${String(m).padStart(2, '0')}:${precise ? r.toFixed(1).padStart(4, '0') : String(Math.floor(r)).padStart(2, '0')}`;
}
export const fmtNum = (v: number | null | undefined, digits = 0): string | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : v.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const ICONS: Record<string, ReactNode> = {
  overview: <><rect x="3" y="3" width="8" height="8" rx="2" /><rect x="13" y="3" width="8" height="5" rx="2" /><rect x="13" y="10" width="8" height="11" rx="2" /><rect x="3" y="13" width="8" height="8" rx="2" /></>,
  exposure: <><path d="M3 12c2.5 0 2.5-5 5-5s2.5 10 5 10 2.5-7 5-7 1.5 2 3 2" /></>,
  integrity: <><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.500-7-10V6z" /><path d="M9 12l2 2 4-4" /></>,
  exercise: <><path d="M4 9v6M7 6v12M17 6v12M20 9v6M7 12h10" /></>,
  cases: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 12h7M9 16h7M9 8h3" /></>,
  ground: <><circle cx="12" cy="12" r="3" /><path d="M5 5a10 10 0 000 14M19 5a10 10 0 010 14M8 8a6 6 0 000 8M16 8a6 6 0 010 8" /></>,
  lab: <><path d="M9 3v6l-5 9a2 2 0 002 3h12a2 2 0 002-3l-5-9V3M8 3h8M7 15h10" /></>,
  devices: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /><rect x="9" y="9" width="6" height="6" rx="1" /></>,
  evidence: <><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" /><path d="M4 21V5M9 8h6M9 12h6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.900 4.900l2.100 2.100M17 17l2.100 2.100M4.900 19.100L7 17M17 7l2.100-2.100" /></>,
  ok: <path d="M5 12l4 4 10-10" />,
  warn: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>,
  crit: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6M12 16v.5" /></>,
  off: <><circle cx="12" cy="12" r="9" /><path d="M6 6l12 12" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  play: <path d="M7 4l13 8-13 8z" />, pause: <path d="M7 4v16M17 4v16" />, step: <path d="M5 4l10 8-10 8zM19 4v16" />,
  sim: <><path d="M4 18l4-8 4 5 3-9 5 12" /></>,
};
export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" {...P}>{ICONS[name] ?? ICONS.off}</svg>;
}

const Q_CLASS: Record<QualityState, string> = { valid: 'ok', suspect: 'warn', invalid: 'crit', stale: 'warn', unavailable: '' };
const Q_ICON: Record<QualityState, string> = { valid: 'ok', suspect: 'warn', invalid: 'crit', stale: 'clock', unavailable: 'off' };
/** Measurement state: always icon + text, never colour alone. */
export function QualityBadge({ state, label }: { state: QualityState; label?: string }) {
  const { t } = useTranslation();
  const flash = useChangeFlash(state);
  return <span className={`badge ${Q_CLASS[state]} ${flash}`}><Icon name={Q_ICON[state]} size={12} />{label ? `${label}: ` : ''}{t(`quality.${state}`)}</span>;
}
export function OriginBadge() {
  const { t } = useTranslation();
  const origin = useApp((s) => s.view?.manifest.origin ?? 'simulated');
  return <span className="badge accent" title={t('origin.title')}><Icon name="sim" size={12} />{t(`origin.${origin}`)}</span>;
}
export function InterpBadge({ status }: { status: InterpretationStatus }) {
  const { t } = useTranslation();
  return <span className="badge dashed">{t(`interp.${status}`)}</span>;
}
export function SeverityBadge({ ev }: { ev: Pick<HealthEvent, 'severity' | 'state'> }) {
  const { t } = useTranslation();
  const cls = ev.state === 'resolved' ? '' : ev.severity === 'priority' ? 'crit' : ev.severity === 'review' ? 'warn' : 'accent';
  return <span className={`badge ${cls}`}><Icon name={ev.severity === 'info' ? 'crit' : 'warn'} size={12} />{t(`severity.${ev.severity}`)} · {t(`eventState.${ev.state}`)}</span>;
}

export function Stat({ label, value, unit, note, digits = 0 }: { label: string; value: number | null | undefined; unit?: string; note?: ReactNode; digits?: number }) {
  const { t } = useTranslation();
  const f = fmtNum(value, digits);
  return (
    <div className="stat">
      <span className="l">{label}</span>
      {f === null ? <span className="v na">{t('common.unavailable')}</span> : <span className="v">{f}{unit && <small>{unit}</small>}</span>}
      {note && <span className="small muted">{note}</span>}
    </div>
  );
}
export function Card({ title, right, children, className = '' }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && <div className="card-head">{title ? <h3>{title}</h3> : <span />}{right}</div>}
      {children}
    </section>
  );
}
export function PageHead({ title, lead, children }: { title: string; lead: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1><p>{lead}</p></div>
      <div className="row">{children}</div>
    </div>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children}</div>;
}

/** Modal drawer with focus trap entry, Escape to close and focus restoration. */
export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [onClose]);
  return (<>
    <div className="drawer-back" onClick={onClose} />
    <div className="drawer" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
      <div className="card-head"><h2>{title}</h2><button className="btn sm" onClick={onClose}>{t('common.close')}</button></div>
      {children}
    </div>
  </>);
}

/** Translate an event explanation from its key + structured parameters (never concatenated strings). */
export function useExplain() {
  const { t } = useTranslation();
  return (ev: Pick<HealthEvent, 'explanationKey' | 'explanationParams'>): string => {
    const p: Record<string, string | number> = { ...ev.explanationParams };
    for (const k of ['reason', 'decision', 'phase', 'strength']) if (typeof p[k] === 'string') p[k] = t(`reason.${String(p[k]).split(':')[0]}`, { defaultValue: String(p[k]) });
    return t(ev.explanationKey, p);
  };
}
export const reasonKey = (r: string): string => `reason.${r.split(':')[0]}`;

/** Register which metrics and window the current screen needs from the worker. */
export function useSeries(metrics: Metric[]): [number, number] {
  const setReq = useApp((s) => s.setReq);
  const key = metrics.join(',');
  useEffect(() => { setReq({ metrics }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [key]);
  const now = useApp((s) => s.view?.nowMs ?? 0), end = useApp((s) => s.req.endMs), windowMs = useApp((s) => s.req.windowMs);
  const e = end ?? now;
  return [Math.max(0, e - windowMs), Math.max(e, 1000)];
}
export function WindowPicker() {
  const { t } = useTranslation();
  const w = useApp((s) => s.req.windowMs), setReq = useApp((s) => s.setReq);
  return (
    <div className="row" role="group" aria-label={t('common.timeRange')}>
      {[30000, 60000, 180000, 360000].map((ms) => (<button key={ms} className="btn sm" aria-pressed={w === ms} onClick={() => setReq({ windowMs: ms })}>{ms < 60000 ? `${ms / 1000} s` : `${ms / 60000} min`}</button>))}
    </div>
  );
}
