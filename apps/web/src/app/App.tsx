import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { HashRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { bootWorker, LOCALES, NO_EVENTS, useApp, type Locale, type Theme } from './store';
import { fmtTime, Icon, OriginBadge } from '../components/ui';
import { MotionRoot, RouteTransition, motion } from '../components/motion';
import { Landing } from '../features/landing/Landing';
import { Overview } from '../features/overview/Overview';
import { Exposure } from '../features/exposure/Exposure';
import { Integrity } from '../features/integrity/Integrity';
import { Exercise } from '../features/exercise/Exercise';
import { Cases, CaseDetail } from '../features/cases/Cases';
import { Ground } from '../features/ground/Ground';
import { Settings } from '../features/settings/Settings';
import { Evidence } from '../features/evidence/Evidence';

const Lab = lazy(() => import('../features/simulation/Lab').then((m) => ({ default: m.Lab })));
const Devices = lazy(() => import('../features/integrations/Devices').then((m) => ({ default: m.Devices })));

export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', tr: 'Türkçe', de: 'Deutsch', fr: 'Français', es: 'Español', ar: 'العربية', ja: '日本語' };
const NAV = [
  ['/mission/overview', 'overview'], ['/mission/exposure', 'exposure'], ['/mission/integrity', 'integrity'], ['/mission/exercise', 'exercise'], ['/mission/cases', 'cases'],
  ['/ground', 'ground'], ['/lab', 'lab'], ['/devices', 'devices'], ['/evidence', 'evidence'], ['/settings', 'settings'],
] as const;

/** Applies theme, direction, language and motion preference to the document. */
export function usePreferences(): void {
  const s = useApp((x) => x.settings);
  const { i18n } = useTranslation();
  useEffect(() => {
    const root = document.documentElement;
    if (s.theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', s.theme);
    if (s.reduceMotion) root.setAttribute('data-motion', 'reduce'); else root.removeAttribute('data-motion');
    root.lang = s.locale; root.dir = s.locale === 'ar' ? 'rtl' : 'ltr';
    if (i18n.language !== s.locale) void i18n.changeLanguage(s.locale);
  }, [s.theme, s.locale, s.reduceMotion, i18n]);
}

export function LocaleSelect() {
  const { t } = useTranslation();
  const locale = useApp((s) => s.settings.locale), set = useApp((s) => s.setSettings);
  return (
    <select aria-label={t('settings.language')} value={locale} onChange={(e) => set({ locale: e.target.value as Locale })}>
      {LOCALES.map((l) => <option key={l} value={l} lang={l}>{LOCALE_NAMES[l]}</option>)}
    </select>
  );
}
export function ThemeSelect() {
  const { t } = useTranslation();
  const theme = useApp((s) => s.settings.theme), set = useApp((s) => s.setSettings);
  return (
    <select aria-label={t('settings.theme')} value={theme} onChange={(e) => set({ theme: e.target.value as Theme })}>
      {(['system', 'light', 'dark'] as const).map((x) => <option key={x} value={x}>{t(`theme.${x}`)}</option>)}
    </select>
  );
}

function Transport() {
  const { t } = useTranslation();
  const st = useApp((s) => s.status), send = useApp((s) => s.send);
  if (!st?.hasRun) return null;
  return (
    <div className="row" role="group" aria-label={t('transport.label')}>
      <button className="btn sm primary" onClick={() => send({ type: 'control', action: st.running ? 'pause' : 'run' })} disabled={st.finished || !st.owner} data-testid="run-toggle">
        <Icon name={st.running ? 'pause' : 'play'} size={14} />{st.running ? t('transport.pause') : t('transport.run')}
      </button>
      <button className="btn sm" onClick={() => send({ type: 'control', action: 'step' })} disabled={st.running || st.finished} aria-label={t('transport.step')} title={t('transport.step')}><Icon name="step" size={14} /></button>
      <select aria-label={t('transport.speed')} data-testid="speed" value={st.speed} onChange={(e) => send({ type: 'speed', speed: Number(e.target.value) })}>
        {[1, 10, 60].map((x) => <option key={x} value={x}>{x}×</option>)}
      </select>
    </div>
  );
}

function Strip() {
  const { t } = useTranslation();
  const view = useApp((s) => s.view), st = useApp((s) => s.status), req = useApp((s) => s.req), setReq = useApp((s) => s.setReq);
  const online = useOnline();
  return (
    <header className="strip">
      <Link to="/" className="brand" aria-label="ASTER"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 38h10l5-16 7 26 6-20 4 10h16" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>ASTER</Link>
      <span className="badge dashed hide-sm">{t('strip.prototype')}</span>
      <OriginBadge />
      {view && (<>
        <div className="strip-item hide-md"><span>{t('strip.mission')}</span><b>{t(view.scenario.titleKey)}</b></div>
        <label className="strip-item"><span>{t('strip.crew')}</span>
          <select value={req.crewId} onChange={(e) => setReq({ crewId: e.target.value })} data-testid="crew-select">
            {view.crew.map((c) => <option key={c.id} value={c.id}>{c.pseudonym} · {c.name}</option>)}
          </select>
        </label>
        <div className="strip-item"><span>{t('strip.met')}</span><b className="mono" data-testid="met">{fmtTime(view.nowMs)} / {fmtTime(view.scenario.durationMs)}</b></div>
        <div className="strip-item hide-sm"><span>{t('strip.engine')}</span><b>{st?.recovering ? t('strip.recovering') : st?.finished ? t('strip.finished') : st?.running ? `${t('strip.running')} ${st.speed}×` : t('strip.paused')}</b></div>
        <div className="strip-item hide-sm"><span>{t('strip.link')}</span><b style={{ color: view.link.effectiveUp ? 'var(--success)' : 'var(--warning)' }}>{view.link.effectiveUp ? t('strip.linkUp') : t('strip.linkDown')}</b></div>
      </>)}
      <div className="strip-item hide-md"><span>{t('strip.gateway')}</span><b>{t('strip.gatewayBrowser')}</b></div>
      <div className="strip-item hide-md"><span>{t('strip.internet')}</span><b>{online ? t('strip.online') : t('strip.offline')}</b></div>
      <span className="spacer" />
      <Transport />
      <LocaleSelect />
      <ThemeSelect />
    </header>
  );
}
function useOnline(): boolean {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false);
    window.addEventListener('online', a); window.addEventListener('offline', b);
    return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b); };
  }, []);
  return on;
}

function Banners() {
  const { t } = useTranslation();
  const st = useApp((s) => s.status), req = useApp((s) => s.req), setReq = useApp((s) => s.setReq), send = useApp((s) => s.send), err = useApp((s) => s.lastError), clear = useApp((s) => s.clearError);
  const pauseVisual = useApp((s) => s.settings.pauseVisual), setSettings = useApp((s) => s.setSettings);
  return (<>
    {st && !st.owner && <div className="banner warn" role="status"><Icon name="warn" />{t('banner.viewer')}</div>}
    {st?.recovered && <div className="banner info" role="status"><Icon name="ok" />{t('banner.recovered')}</div>}
    {st && !st.persist.ok && (
      <div className="banner crit" role="alert" data-testid="persist-banner"><Icon name="crit" />
        <span>{t('banner.persist', { time: fmtTime(st.persist.lastDurableMs), error: st.persist.error ?? '' })}{st.persist.simulatedFault ? ` ${t('banner.persistSim')}` : ''}</span>
        <button className="btn sm" onClick={() => send({ type: 'retryPersist' })}>{t('banner.retry')}</button>
      </div>
    )}
    {req.endMs !== null && (
      <div className="banner info" role="status" data-testid="inspect-banner"><Icon name="clock" />
        <span>{t('banner.inspect', { time: fmtTime(req.endMs) })}</span>
        <button className="btn sm" onClick={() => setReq({ endMs: null })}>{t('banner.returnCurrent')}</button>
        <button className="btn sm" onClick={() => { if (window.confirm(t('banner.forkConfirm'))) { send({ type: 'fork', atMs: req.endMs! }); setReq({ endMs: null }); } }}>{t('banner.resumeHere')}</button>
      </div>
    )}
    {pauseVisual && <div className="banner warn" role="status"><Icon name="pause" />{t('banner.visualPaused')}<button className="btn sm" onClick={() => setSettings({ pauseVisual: false })}>{t('banner.resumeVisual')}</button></div>}
    {st && st.workerLagMs > 0 && <div className="banner warn" role="status"><Icon name="warn" />{t('banner.lag', { ms: st.workerLagMs })}</div>}
    {err && <div className="banner crit" role="alert"><Icon name="crit" /><span>{t('banner.error', { op: err.op, message: err.message })}</span><button className="btn sm" onClick={clear}>{t('common.dismiss')}</button></div>}
  </>);
}

/** Rate-limited screen-reader announcements: event transitions only, never per-tick telemetry. */
function Announcer() {
  const explain = useTranslation().t;
  const events = useApp((s) => s.view?.events);
  const seen = useRef(new Map<string, number>()), last = useRef(0);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (!events) return;
    for (const e of events) {
      const prev = seen.current.get(e.id);
      seen.current.set(e.id, e.revision);
      if (prev === undefined && e.severity !== 'info' && e.state === 'open' && Date.now() - last.current > 5000) {
        last.current = Date.now();
        setMsg(`${explain(`severity.${e.severity}`)}: ${explain(`rule.${e.ruleId}`)}`);
      }
    }
  }, [events, explain]);
  return <div className="sr-only" role="status" aria-live="polite">{msg}</div>;
}

function Palette({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigate(), send = useApp((s) => s.send), st = useApp((s) => s.status), set = useApp((s) => s.setSettings), theme = useApp((s) => s.settings.theme), events = useApp((s) => s.view?.events ?? NO_EVENTS);
  const [q, setQ] = useState(''), [i, setI] = useState(0);
  const items = useMemo(() => {
    const out: { label: string; run: () => void }[] = NAV.map(([to, key]) => ({ label: `${t('palette.goto')} ${t(`nav.${key}`)}`, run: () => nav(to) }));
    if (st?.hasRun) out.push({ label: st.running ? t('transport.pause') : t('transport.run'), run: () => send({ type: 'control', action: st.running ? 'pause' : 'run' }) });
    out.push({ label: t('palette.startDemo'), run: () => { send({ type: 'start', scenarioId: 'SIM-11', seed: 11 }); nav('/mission/overview'); } });
    out.push({ label: t('palette.toggleTheme'), run: () => set({ theme: theme === 'dark' ? 'light' : 'dark' }) });
    const open = events.filter((e) => e.state !== 'resolved').sort((a, b) => b.updatedAtMs - a.updatedAtMs)[0];
    if (open) out.push({ label: `${t('palette.openEvent')} ${t(`rule.${open.ruleId}`)}`, run: () => nav(`/mission/cases/${encodeURIComponent(open.id)}`) });
    return out.filter((x) => x.label.toLowerCase().includes(q.toLowerCase()));
  }, [q, t, nav, send, st, set, theme, events]);
  return (<>
    <div className="drawer-back" onClick={onClose} />
    <div className="palette" role="dialog" aria-modal="true" aria-label={t('palette.title')}>
      <input autoFocus type="text" value={q} placeholder={t('palette.placeholder')} aria-label={t('palette.title')} role="combobox" aria-expanded="true" aria-controls="palette-list"
        onChange={(e) => { setQ(e.target.value); setI(0); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
          else if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(items.length - 1, x + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
          else if (e.key === 'Enter' && items[i]) { items[i].run(); onClose(); }
        }} />
      <div id="palette-list" role="listbox">
        {items.map((it, k) => <div key={it.label} role="option" aria-selected={k === i} onClick={() => { it.run(); onClose(); }}>{it.label}</div>)}
        {items.length === 0 && <div className="muted small">{t('palette.none')}</div>}
      </div>
    </div>
  </>);
}

function Shell() {
  const { t } = useTranslation();
  const [pal, setPal] = useState(false);
  const toast = useApp((s) => s.toast), events = useApp((s) => s.view?.events ?? NO_EVENTS), hasRun = useApp((s) => s.status?.hasRun), recovering = useApp((s) => s.status?.recovering);
  const loc = useLocation();
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPal((x) => !x); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const open = events.filter((e) => e.state !== 'resolved' && e.severity !== 'info').length;
  const needsRun = loc.pathname.startsWith('/mission') || loc.pathname === '/ground';
  return (
    <div className="shell">
      <a href="#main" className="skip" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>{t('common.skip')}</a>
      <Strip />
      <div className="banners"><Banners /></div>
      <nav className="nav" aria-label={t('nav.label')}><div className="nav-in">
        {NAV.map(([to, key]) => (
          <NavLink key={to} to={to} title={t(`nav.${key}`)}>{loc.pathname.startsWith(to) && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ duration: 0.26 }} />}<Icon name={key} size={18} /><span className="lbl">{t(`nav.${key}`)}</span>{key === 'cases' && open > 0 && <span className="count" aria-label={t('nav.openCases', { n: open })}>{open}</span>}</NavLink>
        ))}
        <span className="nav-sep small muted">{t('nav.paletteHint')}</span>
      </div></nav>
      <main className="main" id="main" tabIndex={-1}>
        {needsRun && !hasRun ? (
          <div className="page"><div className="empty" data-testid="no-run"><b>{recovering ? t('strip.recovering') : t('empty.noRun')}</b><span>{t('empty.noRunHint')}</span><Link className="btn primary" to="/lab">{t('empty.openLab')}</Link></div></div>
        ) : <RouteTransition><Suspense fallback={<div className="page"><div className="empty">{t('common.loading')}</div></div>}><Outlet /></Suspense></RouteTransition>}
      </main>
      <Announcer />
      {pal && <Palette onClose={() => setPal(false)} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

export function App() {
  usePreferences();
  useEffect(() => { bootWorker(); }, []);
  return (
    <MotionRoot><HashRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<Shell />}>
          <Route path="/mission" element={<Navigate to="/mission/overview" replace />} />
          <Route path="/mission/overview" element={<Overview />} />
          <Route path="/mission/exposure" element={<Exposure />} />
          <Route path="/mission/integrity" element={<Integrity />} />
          <Route path="/mission/exercise" element={<Exercise />} />
          <Route path="/mission/cases" element={<Cases />} />
          <Route path="/mission/cases/:id" element={<CaseDetail />} />
          <Route path="/ground" element={<Ground />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="/devices" element={<Devices />} />
          <Route path="/evidence" element={<Evidence />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/mission/overview" replace />} />
        </Route>
      </Routes>
    </HashRouter></MotionRoot>
  );
}
