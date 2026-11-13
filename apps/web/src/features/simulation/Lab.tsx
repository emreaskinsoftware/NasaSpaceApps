import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import report from '../../../../../deliverables/reports/evaluation.json';
import { scenarioCatalog, type TrackName } from '@aster/simulator';
import { downloadText, useApp } from '../../app/store';
import { Chart } from '../../components/Chart';
import { Card, fmtNum, fmtTime, PageHead, useSeries } from '../../components/ui';
import { motion } from '../../components/motion';

const CATALOG = scenarioCatalog();
const FAULTS: { track: TrackName; values: number[]; unit: string }[] = [
  { track: 'contact', values: [1, 0.75, 0.5, 0.3], unit: '' }, { track: 'vent', values: [4, 2, 1.1], unit: '1/s' },
  { track: 'response', values: [1, 0.85, 0.7], unit: '' }, { track: 'fluid', values: [0.2, 0.4, 0.55], unit: '' },
  { track: 'cabinPpm', values: [2800, 4000, 5600], unit: 'ppm' }, { track: 'calPath', values: [1, 0.5], unit: '' },
  { track: 'respNoise', values: [0.02, 0.3], unit: '' }, { track: 'sensorTauMs', values: [250, 2500], unit: 'ms' },
];
interface Report { generated: boolean; generatedAtUtc?: string; evalSeeds?: number[]; exposure?: Record<string, { mae: number; maeSd: number; bias: number; coverage: number; n: number }>; summary?: string[] }
const REPORT = report as Report;
const METHODS = ['aligned-quality-aware', 'phase-gated', 'local-window', 'cabin'];

export function Lab() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const view = useApp((s) => s.view), st = useApp((s) => s.status), send = useApp((s) => s.send), command = useApp((s) => s.command), req = useApp((s) => s.req), setReq = useApp((s) => s.setReq), role = useApp((s) => s.settings.role), setToast = useApp((s) => s.setToast);
  const [seed, setSeed] = useState(11), [pick, setPick] = useState('SIM-11'), [truth, setTruth] = useState(false);
  const domain = useSeries(['co2.local', 'contact.force']);
  const researcher = role === 'researcher';
  useEffect(() => { setReq({ includeTruth: truth && researcher }); return () => setReq({ includeTruth: false }); }, [truth, researcher, setReq]);
  const start = () => { if (!st?.hasRun || window.confirm(t('lab.newRunConfirm'))) send({ type: 'start', scenarioId: pick, seed: Number.isFinite(seed) ? Math.abs(Math.round(seed)) % 1000000 : 1 }); };
  const crewId = req.crewId;
  /** Researcher-only evaluation: joins engine output with hidden truth after the fact. Truth never reaches the engine. */
  const evalRows = useMemo(() => {
    if (!view?.truth) return null;
    const acc: Record<string, number[]> = Object.fromEntries(METHODS.map((m) => [m, []]));
    let matched = 0;
    for (const tb of view.truth.breaths) {
      const mid = (tb.startMs + tb.inhaleEndMs) / 2;
      const b = view.detail.breaths.find((x) => mid >= x.startMs - 150 && mid < x.inhaleEndMs + 150);
      if (!b) continue;
      matched++;
      for (const m of METHODS) { const v = b.estimates[m]; if (v !== null && v !== undefined) acc[m].push(v - tb.inhaledMeanPpm); }
    }
    return METHODS.map((m) => ({ m, n: acc[m].length, mae: acc[m].length ? acc[m].reduce((s, x) => s + Math.abs(x), 0) / acc[m].length : null, bias: acc[m].length ? acc[m].reduce((s, x) => s + x, 0) / acc[m].length : null, cov: matched ? acc[m].length / matched : null }));
  }, [view]);
  const saveScenario = () => { if (view) downloadText(`aster-scenario-${view.scenario.id}-seed${view.manifest.seed}.json`, JSON.stringify({ kind: 'aster-saved-scenario', scenarioId: view.scenario.id, scenarioVersion: view.scenario.version, seed: view.manifest.seed, note: 'Replaying this scenario and seed reproduces identical observations and events at any playback speed.' }, null, 1)); };
  return (
    <div className="page">
      <PageHead title={t('nav.lab')} lead={t('lab.lead')}>
        {view && (<>
          <button className="btn sm" onClick={() => { if (window.confirm(t('lab.resetConfirm'))) send({ type: 'reset' }); }} data-testid="reset">{t('lab.reset')}</button>
          <button className="btn sm" onClick={saveScenario}>{t('lab.save')}</button>
          <button className="btn sm" onClick={() => send({ type: 'export', kind: 'run' })} data-testid="export-run">{t('lab.exportRun')}</button>
        </>)}
      </PageHead>
      <Card title={t('lab.gallery')} right={
        <div className="row">
          <label className="row small muted">{t('lab.seed')}<input type="number" min={0} max={999999} value={seed} onChange={(e) => setSeed(Number(e.target.value))} style={{ width: 110 }} data-testid="seed" /></label>
          <button className="btn primary sm" onClick={start} disabled={!st?.owner} data-testid="load-scenario">{t('lab.load')}</button>
        </div>}>
        <div className="grid g3" role="radiogroup" aria-label={t('lab.gallery')}>
          {CATALOG.map((s) => (
            <motion.button key={s.id} role="radio" aria-checked={pick === s.id} className={`item ${pick === s.id ? 'sel' : ''}`} onClick={() => setPick(s.id)} data-testid={`scenario-${s.id}`} whileTap={{ scale: 0.985 }}>
              <span style={{ flex: 1 }}>
                <span className="ttl" style={{ display: 'block' }}><span className="mono muted">{s.id}</span> {t(s.titleKey)}</span>
                <span className="small muted" style={{ display: 'block' }}>{t(s.descriptionKey)}</span>
                <span className="row" style={{ marginTop: 6 }}>{s.modules.map((m) => <span key={m} className="badge">{t(`module.${m}`)}</span>)}<span className="badge mono">{fmtTime(s.durationMs)}</span></span>
              </span>
            </motion.button>))}
        </div>
        <p className="small muted">{t('lab.galleryNote')}</p>
      </Card>
      {view && (<>
        <Card title={t('lab.timeline')} right={<span className="badge mono" data-testid="run-id">{view.manifest.runId}{view.manifest.parentRunId ? ` ← ${t('lab.forkOf')}` : ''}</span>}>
          <label className="field">{t('lab.scrub', { time: fmtTime(req.endMs ?? view.nowMs) })}
            <input type="range" min={0} max={view.nowMs} step={1000} value={req.endMs ?? view.nowMs} dir="ltr" data-testid="scrub"
              onChange={(e) => { const v = Number(e.target.value); setReq({ endMs: v >= view.nowMs - 999 ? null : v }); }} />
          </label>
          <p className="small muted">{t('lab.scrubNote')}</p>
          <Chart title={t('metric.co2.local')} unit="ppm" domain={domain} height={140} origin={t('origin.simulated')}
            series={[{ id: 'l', label: t('metric.co2.local'), data: view.series['co2.local'], color: 'var(--chart-1)' }]}
            points={truth && view.truth ? view.truth.breaths.map((b) => ({ t: (b.startMs + b.inhaleEndMs) / 2, w: b.inhaleEndMs - b.startMs, v: b.inhaledMeanPpm, color: 'var(--chart-5)', label: t('lab.truthLabel') })) : []}
            pointsLabel={truth && view.truth ? t('lab.truthLabel') : undefined} />
        </Card>
        <div className="grid g2">
          <Card title={t('lab.faults')} right={<span className="small muted">{view.crew.find((c) => c.id === crewId)?.pseudonym}</span>}>
            <table className="t"><tbody>
              {FAULTS.map((f) => (
                <tr key={f.track}><td>{t(`fault.${f.track}`)}</td><td><div className="row">{f.values.map((v) => (
                  <button key={v} className="btn sm" data-testid={`fault-${f.track}-${v}`} onClick={() => { command({ type: 'inject', injection: { atMs: 0, kind: 'set', crewId, track: f.track, value: v } }); setToast(t('lab.injected', { name: t(`fault.${f.track}`), value: `${v} ${f.unit}` })); }}>{v} {f.unit}</button>))}</div></td></tr>))}
              <tr><td>{t('fault.dropout')}</td><td><div className="row">{(['co2.local', 'mech.pvdf', 'contact.force'] as const).map((m) => <button key={m} className="btn sm" onClick={() => command({ type: 'inject', injection: { atMs: 0, kind: 'dropout', crewId, metric: m, durationMs: 20000 } })}>{t(`metric.${m}`)} · 20 s</button>)}</div></td></tr>
              <tr><td>{t('fault.link')}</td><td><button className="btn sm" aria-pressed={!view.link.cfg.up} onClick={() => command({ type: 'link', up: !view.link.cfg.up })}>{view.link.cfg.up ? t('ground.setDown') : t('ground.setUp')}</button></td></tr>
            </tbody></table>
            <p className="small muted">{t('lab.faultsNote')}</p>
          </Card>
          <Card title={t('lab.evaluation')} right={<span className="badge warn">{t('lab.researcherOnly')}</span>}>
            {!researcher ? <p className="small">{t('lab.needResearcher')} <button className="btn sm" onClick={() => nav('/settings')}>{t('nav.settings')}</button></p> : (<>
              <label className="row"><input type="checkbox" checked={truth} onChange={(e) => setTruth(e.target.checked)} data-testid="truth-toggle" />{t('lab.showTruth')}</label>
              {evalRows && (
                <table className="t" data-testid="eval-table"><thead><tr><th>{t('exposure.method')}</th><th className="n">MAE (ppm)</th><th className="n">{t('lab.bias')}</th><th className="n">{t('exposure.coverage')}</th><th className="n">n</th></tr></thead>
                  <tbody>{evalRows.map((r) => <tr key={r.m}><td>{t(`method.${r.m}`)}</td><td className="n">{fmtNum(r.mae) ?? '—'}</td><td className="n">{fmtNum(r.bias) ?? '—'}</td><td className="n">{r.cov === null ? '—' : `${Math.round(r.cov * 100)} %`}</td><td className="n">{r.n}</td></tr>)}</tbody></table>)}
              <button className="btn sm" onClick={() => send({ type: 'export', kind: 'truth' })}>{t('lab.exportTruth')}</button>
            </>)}
            <p className="small muted">{t('lab.truthNote')}</p>
          </Card>
        </div>
      </>)}
      <Card title={t('lab.heldOut')} right={<span className="badge dashed">{REPORT.generated ? t('lab.frozen', { date: (REPORT.generatedAtUtc ?? '').slice(0, 10) }) : t('lab.notGenerated')}</span>}>
        {REPORT.generated && REPORT.exposure ? (<>
          <table className="t"><thead><tr><th>{t('exposure.method')}</th><th className="n">MAE ± SD (ppm)</th><th className="n">{t('lab.bias')}</th><th className="n">{t('exposure.coverage')}</th></tr></thead>
            <tbody>{METHODS.map((m) => { const r = REPORT.exposure![m]; return r ? <tr key={m}><td>{t(`method.${m}`)}</td><td className="n">{fmtNum(r.mae)} ± {fmtNum(r.maeSd)}</td><td className="n">{fmtNum(r.bias)}</td><td className="n">{Math.round(r.coverage * 100)} %</td></tr> : null; })}</tbody></table>
          <p className="small muted">{t('lab.heldOutNote', { n: REPORT.evalSeeds?.length ?? 0 })}</p>
        </>) : <p className="small muted">{t('lab.runEvaluate')}</p>}
      </Card>
      {st && st.runs.length > 0 && (
        <Card title={t('lab.runs')}>
          <table className="t"><thead><tr><th>{t('lab.run')}</th><th>{t('lab.scenario')}</th><th className="n">{t('lab.seed')}</th><th className="n">{t('strip.met')}</th><th /></tr></thead>
            <tbody>{st.runs.map((r) => <tr key={r.runId}><td className="mono small">{r.runId}{r.parentRunId ? ` ← ${t('lab.forkOf')}` : ''}</td><td>{r.scenarioId}</td><td className="n">{r.seed}</td><td className="n">{fmtTime(r.lastMs)}</td><td>{r.active ? <span className="badge accent">{t('lab.activeRun')}</span> : <span className="badge">{t('lab.preserved')}</span>}</td></tr>)}</tbody></table>
          <p className="small muted">{t('lab.runsNote')}</p>
        </Card>
      )}
    </div>
  );
}
