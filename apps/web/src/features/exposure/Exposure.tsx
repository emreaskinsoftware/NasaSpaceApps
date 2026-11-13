import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BreathRecord } from '@aster/contracts';
import { downloadText, useApp } from '../../app/store';
import { Chart } from '../../components/Chart';
import { Card, Drawer, fmtNum, fmtTime, InterpBadge, PageHead, QualityBadge, reasonKey, Stat, useSeries, WindowPicker } from '../../components/ui';

const METHODS = ['aligned-quality-aware', 'phase-gated', 'local-window', 'cabin'] as const;

export function Exposure() {
  const { t } = useTranslation();
  const view = useApp((s) => s.view)!;
  const domain = useSeries(['resp.displacement', 'co2.local', 'co2.cabin']);
  const [method, setMethod] = useState<(typeof METHODS)[number]>('aligned-quality-aware');
  const [raw, setRaw] = useState(true), [showEst, setShowEst] = useState(true), [sel, setSel] = useState<BreathRecord | null>(null);
  const d = view.detail, q = d.channelQuality, breaths = d.breaths;
  const last = breaths[breaths.length - 1];
  const recent = breaths.slice(-20);
  const coverage = recent.length ? recent.filter((b) => b.estimates['aligned-quality-aware'] !== null).length / recent.length : null;
  const declared = view.sensorMeta.co2LocalTransportDelayMs;
  const exportWindow = () => downloadText(`aster-exposure-window-${view.manifest.runId}.json`, JSON.stringify({
    manifest: view.manifest, window: { startMs: domain[0], endMs: domain[1] }, interpretation: 'experimental time-weighted inhalation-phase concentration estimate; not an inhaled dose',
    breaths, series: { 'co2.local': view.series['co2.local'], 'co2.cabin': view.series['co2.cabin'], 'resp.displacement': view.series['resp.displacement'] },
  }, null, 1));
  return (
    <div className="page">
      <PageHead title={t('nav.exposure')} lead={t('exposure.lead')}>
        <WindowPicker />
        <button className="btn sm" onClick={exportWindow}>{t('exposure.export')}</button>
      </PageHead>
      <div className="grid g4">
        <Card><Stat label={t('exposure.estimate')} value={last?.estimates['aligned-quality-aware']} unit="ppm" note={last && last.estimates['aligned-quality-aware'] === null ? `${t('exposure.withheld')}: ${t(reasonKey(last.reasons[0] ?? 'none'))}` : <InterpBadge status="experimental-estimate" />} /></Card>
        <Card><Stat label={t('metric.co2.cabin')} value={d.latest['co2.cabin']} unit="ppm" note={<QualityBadge state={q['co2.cabin'].state} />} /></Card>
        <Card><Stat label={t('exposure.coverage')} value={coverage === null ? null : coverage * 100} unit="%" note={t('exposure.coverageNote')} /></Card>
        <Card><Stat label={t('exposure.lag')} value={d.lagEstimateMs} unit="ms" note={t('exposure.lagNote', { declared })} /></Card>
      </div>
      <Card title={t('exposure.respChart')} right={<div className="row"><QualityBadge state={q['resp.displacement'].state} /><span className="badge dashed">{t('exposure.phaseOnly')}</span></div>}>
        <Chart title={t('exposure.respChart')} unit="a.u." digits={2} domain={domain} height={150} origin={t('origin.simulated')}
          bands={breaths.map((b) => ({ a: b.startMs, b: b.inhaleEndMs, kind: 'inhale' as const }))}
          series={[{ id: 'resp', label: t('metric.resp.displacement'), data: view.series['resp.displacement'], color: 'var(--chart-4)', quality: q['resp.displacement'].state }]} />
      </Card>
      <Card title={t('exposure.gasChart')} right={
        <div className="row">
          <button className="btn sm" aria-pressed={raw} onClick={() => setRaw(!raw)}>{t('exposure.rawTraces')}</button>
          <button className="btn sm" aria-pressed={showEst} onClick={() => setShowEst(!showEst)}>{t('exposure.estTraces')}</button>
          <label className="row small muted">{t('exposure.method')}
            <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} data-testid="method-select">{METHODS.map((m) => <option key={m} value={m}>{t(`method.${m}`)}</option>)}</select>
          </label>
        </div>}>
        <Chart title={t('exposure.gasChart')} unit="ppm" domain={domain} height={230} origin={t('origin.simulated')}
          bands={breaths.map((b) => ({ a: b.startMs, b: b.inhaleEndMs, kind: 'inhale' as const }))}
          series={raw ? [
            { id: 'local', label: t('metric.co2.local'), data: view.series['co2.local'], color: 'var(--chart-1)', quality: q['co2.local'].state },
            { id: 'cabin', label: t('metric.co2.cabin'), data: view.series['co2.cabin'], color: 'var(--chart-2)', quality: q['co2.cabin'].state },
          ] : []}
          points={showEst ? breaths.map((b) => ({ t: (b.startMs + b.inhaleEndMs) / 2, w: b.inhaleEndMs - b.startMs, v: b.estimates[method] ?? null, color: 'var(--chart-3)', label: t(`method.${method}`) })) : []}
          pointsLabel={showEst ? `${t(`method.${method}`)} · ${t('interp.experimental-estimate')}` : undefined} />
        <p className="small muted">{t('exposure.caveat')}</p>
      </Card>
      <div className="grid g-main">
        <Card title={t('exposure.breaths')} right={<span className="small muted">{t('exposure.inspectHint')}</span>}>
          <div className="scroll-x" tabIndex={0} role="group" aria-label={t('common.tableRegion')}><table className="t">
            <thead><tr><th>#</th><th>{t('chart.time')}</th>{METHODS.map((m) => <th key={m} className="n">{t(`method.${m}`)}</th>)}<th>{t('exposure.strength')}</th><th /></tr></thead>
            <tbody>{breaths.slice(-10).reverse().map((b) => (
              <tr key={b.index}>
                <td className="mono">{b.index}</td><td className="mono">{fmtTime(b.startMs, true)}</td>
                {METHODS.map((m) => <td key={m} className="n">{fmtNum(b.estimates[m]) ?? <span className="muted">{t('exposure.withheld')}</span>}</td>)}
                <td>{t(`strength.${b.strength}`)}</td>
                <td><button className="btn sm" onClick={() => setSel(b)}>{t('common.inspect')}</button></td>
              </tr>))}
            </tbody>
          </table></div>
          {breaths.length === 0 && <p className="muted small">{t('exposure.noBreaths')}</p>}
        </Card>
        <Card title={t('exposure.history')} right={<InterpBadge status="experimental-estimate" />}>
          <Stat label={t('exposure.historyLabel')} value={d.exposureHistoryPpmMin} unit="ppm·min" />
          <p className="small muted">{t('exposure.historyNote')}</p>
        </Card>
      </div>
      {sel && (
        <Drawer title={t('exposure.breathTitle', { n: sel.index })} onClose={() => setSel(null)}>
          <dl className="kv">
            <dt>{t('exposure.inhaleWindow')}</dt><dd className="mono">{fmtTime(sel.startMs, true)} – {fmtTime(sel.inhaleEndMs, true)}</dd>
            <dt>{t('exposure.breathEnd')}</dt><dd className="mono">{fmtTime(sel.endMs, true)}</dd>
            <dt>{t('exposure.phaseUnc')}</dt><dd className="mono">± {sel.phaseUncertaintyMs} ms</dd>
            <dt>{t('exposure.lagUsed')}</dt><dd className="mono">{sel.lagMs} ms</dd>
            <dt>{t('exposure.sampleCoverage')}</dt><dd className="mono">{Math.round(sel.coverage * 100)} %</dd>
            <dt>{t('exposure.strength')}</dt><dd>{t(`strength.${sel.strength}`)}</dd>
            {METHODS.map((m) => (<span key={m} style={{ display: 'contents' }}><dt>{t(`method.${m}`)}</dt><dd className="mono">{fmtNum(sel.estimates[m]) ? `${fmtNum(sel.estimates[m])} ppm` : t('exposure.withheld')}</dd></span>))}
          </dl>
          <h3>{t('exposure.assumptions')}</h3>
          <ul className="small">{sel.reasons.map((r) => <li key={r}>{t(reasonKey(r))}</li>)}<li>{t('exposure.notDose')}</li></ul>
        </Drawer>
      )}
    </div>
  );
}
