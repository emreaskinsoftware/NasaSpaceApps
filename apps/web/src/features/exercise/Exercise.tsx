import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import refs from '../../../../../data/reference/sessions.json';
import type { ReferenceSession } from '@aster/contracts';
import { downloadText, useApp } from '../../app/store';
import { Chart } from '../../components/Chart';
import { Card, fmtNum, InterpBadge, PageHead, QualityBadge, reasonKey, Stat, useSeries, WindowPicker } from '../../components/ui';

const REFS = refs as unknown as Record<string, ReferenceSession[]>;
const METHODS = ['matched-conditioned', 'fluid-aware', 'unconditioned'] as const;

export function Exercise() {
  const { t } = useTranslation();
  const view = useApp((s) => s.view)!, command = useApp((s) => s.command), crewId = useApp((s) => s.req.crewId);
  const domain = useSeries(['exercise.load', 'imp.r10k', 'imp.r100k']);
  const [load, setLoad] = useState(400), [selRef, setSelRef] = useState<string | null>(null);
  const d = view.detail, q = d.channelQuality, cmp = d.comparison, reps = d.reps;
  const crewRefs = REFS[crewId] ?? [];
  const lastRep = reps[reps.length - 1];
  const ref = crewRefs.find((r) => r.id === selRef) ?? null;
  const valid = reps.filter((r) => r.quality === 'valid' && r.loadN !== null);
  const curLoad = valid.length ? valid.slice(-8).reduce((s, r) => s + r.loadN!, 0) / Math.min(8, valid.length) : null;
  const refCheck = useMemo(() => {
    if (!ref) return null;
    if (curLoad === null) return { ok: false, why: 'insufficient-valid-repetitions' };
    return Math.abs(ref.loadN - curLoad) / ref.loadN <= 0.12 ? { ok: true, why: 'matched' } : { ok: false, why: 'load-mismatch' };
  }, [ref, curLoad]);
  const exportSession = () => downloadText(`aster-exercise-${view.manifest.runId}.json`, JSON.stringify({ manifest: view.manifest, session: d.session, repetitions: reps, comparison: cmp, references: crewRefs, note: 'MMG amplitude is not force; no atrophy diagnosis; generated-history references' }, null, 1));
  return (
    <div className="page">
      <PageHead title={t('nav.exercise')} lead={t('exercise.lead')}>
        <WindowPicker />
        <label className="row small muted">{t('exercise.load')}
          <select value={load} onChange={(e) => setLoad(Number(e.target.value))} aria-label={t('exercise.load')}>{[300, 400, 500, 620].map((x) => <option key={x} value={x}>{x} N</option>)}</select>
        </label>
        <button className="btn sm" data-testid="ex-start" onClick={() => command({ type: 'inject', injection: { atMs: 0, kind: 'exercise', crewId, on: true, loadN: load, cadenceRpm: 20 } })}>{t('exercise.start')}</button>
        <button className="btn sm" onClick={() => command({ type: 'inject', injection: { atMs: 0, kind: 'exercise', crewId, on: false, loadN: 0, cadenceRpm: 0 } })}>{t('exercise.stop')}</button>
        <button className="btn sm" onClick={exportSession}>{t('common.export')}</button>
      </PageHead>
      <div className="grid g4">
        <Card><Stat label={t('exercise.session')} value={d.session.active ? reps.length : null} unit={t('exercise.reps')} note={d.session.active ? <span className="badge accent">{t('exercise.active')}</span> : t('exercise.inactive')} /></Card>
        <Card><Stat label={t('exercise.load')} value={lastRep?.loadN} unit="N" note={<QualityBadge state={q['exercise.load'].state} />} /></Card>
        <Card><Stat label={t('exercise.cadence')} value={lastRep?.cadenceRpm} unit={t('unit.rpm')} digits={1} /></Card>
        <Card><Stat label={t('exercise.mmg')} value={lastRep?.mmgRms} unit="a.u." digits={3} note={lastRep ? <QualityBadge state={lastRep.quality} /> : undefined} /></Card>
      </div>
      <div className="grid g-main">
        <div className="grid">
          <Card title={t('exercise.sessionChart')}>
            <Chart title={t('exercise.sessionChart')} unit="N" domain={domain} height={130} yMin={0} origin={t('origin.simulated')}
              series={[{ id: 'load', label: t('exercise.load'), data: view.series['exercise.load'], color: 'var(--chart-2)', quality: q['exercise.load'].state }]} />
            <Chart title={t('exercise.mmgChart')} unit="a.u." digits={3} domain={domain} height={170} yMin={0}
              series={[]} pointsLabel={t('exercise.mmgPoints')}
              points={reps.map((r) => ({ t: (r.startMs + r.endMs) / 2, w: r.endMs - r.startMs, v: r.quality === 'valid' ? r.mmgRms : null, color: 'var(--chart-1)', label: t('exercise.mmg') }))} />
            <p className="small muted">{t('exercise.mmgNote')}</p>
          </Card>
          <Card title={t('exercise.impChart')} right={<div className="row"><QualityBadge state={q['imp.r10k'].state} /><span className="badge dashed">{t('exercise.impBadge')}</span></div>}>
            <Chart title={t('exercise.impChart')} unit="ohm" digits={1} domain={domain} height={150} origin={t('origin.simulated')}
              series={[
                { id: 'r10', label: t('metric.imp.r10k'), data: view.series['imp.r10k'], color: 'var(--chart-3)', quality: q['imp.r10k'].state },
                { id: 'r100', label: t('metric.imp.r100k'), data: view.series['imp.r100k'], color: 'var(--chart-4)', quality: q['imp.r100k'].state },
              ]} />
            <p className="small muted">{t('exercise.impNote')}</p>
          </Card>
        </div>
        <div className="grid" style={{ alignContent: 'start' }}>
          <Card title={t('exercise.comparison')} right={<InterpBadge status="experimental-estimate" />}>
            {!cmp ? <p className="muted small" data-testid="cmp-state">{t('exercise.noComparison')}</p> : cmp.eligible ? (<>
              <div className="row"><span className="badge ok" data-testid="cmp-state">{t('exercise.eligible')}</span><span className="badge">{t(`strength.${cmp.strength}`)}</span><span className="small muted">{t('exercise.refsUsed', { n: cmp.referenceIds.length, reps: cmp.repsUsed })}</span></div>
              <Stat label={t('exercise.percentDiff')} value={cmp.percentDiff} unit="%" digits={1} />
              <table className="t"><thead><tr><th>{t('exposure.method')}</th><th className="n">z</th></tr></thead>
                <tbody>{METHODS.map((m) => <tr key={m}><td>{t(`emethod.${m}`)}</td><td className="n">{fmtNum(cmp.deviation[m], 2) ?? t('common.unavailable')}</td></tr>)}</tbody></table>
              <Stat label={t('exercise.impShift')} value={cmp.impedanceShiftPct} unit="%" digits={1} />
            </>) : (<>
              <span className="badge warn" data-testid="cmp-state">{t('exercise.notEligible')}</span>
              <ul className="small">{cmp.reasons.map((r) => <li key={r}>{t(reasonKey(r))}</li>)}</ul>
            </>)}
            <p className="small muted">{t('exercise.caveat')}</p>
          </Card>
          <Card title={t('exercise.references')} right={<span className="badge dashed">{t('exercise.generated')}</span>}>
            <div className="scroll-x" tabIndex={0} role="group" aria-label={t('common.tableRegion')}><table className="t">
              <thead><tr><th>{t('exercise.refSession')}</th><th className="n">N</th><th className="n">{t('exercise.mmg')}</th><th className="n">R 10 kHz</th><th /></tr></thead>
              <tbody>{crewRefs.map((r) => (
                <tr key={r.id} style={cmp?.referenceIds.includes(r.id) ? { background: 'var(--accent-soft)' } : undefined}>
                  <td>{t('exercise.dayOffset', { n: -r.dayOffset })}</td><td className="n">{r.loadN}</td><td className="n">{r.mmgRms.toFixed(3)}</td><td className="n">{r.r10k.toFixed(1)}</td>
                  <td><button className="btn sm" aria-pressed={selRef === r.id} onClick={() => setSelRef(selRef === r.id ? null : r.id)}>{t('common.select')}</button></td>
                </tr>))}
              </tbody>
            </table></div>
            {ref && refCheck && <p className="small" role="status"><b>{t('exercise.dayOffset', { n: -ref.dayOffset })}:</b> {refCheck.ok ? t('exercise.refComparable') : `${t('exercise.refNotComparable')} — ${t(reasonKey(refCheck.why))}`}</p>}
            <p className="small muted">{t('exercise.refsNote')}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
