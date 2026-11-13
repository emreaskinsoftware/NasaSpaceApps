import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CalibrationState, IntegrityWindowRecord, QualityState } from '@aster/contracts';
import type { SeriesData } from '@aster/runtime';
import { useApp } from '../../app/store';
import { Chart } from '../../components/Chart';
import { motion } from '../../components/motion';
import { Card, fmtNum, fmtTime, InterpBadge, PageHead, QualityBadge, reasonKey, Stat, useSeries, WindowPicker } from '../../components/ui';

const LIFECYCLE: CalibrationState[] = ['not_available', 'scheduled', 'active', 'evaluating', 'accepted', 'rejected', 'expired'];
const winSeries = (w: IntegrityWindowRecord[], f: (x: IntegrityWindowRecord) => number | null): SeriesData => {
  const s: SeriesData = { t: [], v: [], stepMs: 2000, unit: 'a.u.' };
  for (const x of w) { const v = f(x); if (v !== null) { s.t.push((x.startMs + x.endMs) / 2); s.v.push(v); } }
  return s;
};

/** Accessible sensor map: communicates location and quality only. Not a 3D organ model or a digital twin. */
function BodyMap({ sites }: { sites: { id: string; label: string; x: number; y: number; state: QualityState }[] }) {
  const { t } = useTranslation();
  return (
    <svg className="bodymap" viewBox="0 0 340 300" role="img" aria-label={t('integrity.mapLabel')} width="100%" style={{ maxWidth: 380 }}>
      <title>{t('integrity.mapLabel')}</title>
      <desc>{sites.map((s) => `${s.label}: ${t(`quality.${s.state}`)}`).join('. ')}</desc>
      <g className="fig"><circle cx="90" cy="38" r="20" /><path d="M90 58v20M56 86c0-6 6-8 34-8s34 2 34 8l8 78M56 86l-8 78M66 90v84l-6 106M114 90v84l6 106M90 174v10" /></g>
      {sites.map((s) => (
        <g key={s.id}><circle className={`site ${s.state}`} cx={s.x} cy={s.y} r="8" /><line x1={s.x + 9} y1={s.y} x2="150" y2={s.y} stroke="var(--border)" /><text x="154" y={s.y - 2}>{s.label}</text><text x="154" y={s.y + 11} style={{ fontWeight: 600 }}>{t(`quality.${s.state}`)}</text></g>
      ))}
    </svg>
  );
}

export function Integrity() {
  const { t } = useTranslation();
  const view = useApp((s) => s.view)!, command = useApp((s) => s.command), crewId = useApp((s) => s.req.crewId), setToast = useApp((s) => s.setToast);
  const domain = useSeries(['mech.pvdf', 'contact.force']);
  const [show, setShow] = useState({ fixed: true, paired: true, candidate: true });
  const d = view.detail, q = d.channelQuality, cal = d.calibration, wins = d.integrity, last = wins[wins.length - 1];
  const contact: QualityState = last?.contact ?? 'unavailable';
  const s = useMemo(() => ({ fixed: winSeries(wins, (w) => w.rms.fixed), paired: winSeries(wins, (w) => w.rms.paired), candidate: winSeries(wins, (w) => w.rms.candidate) }), [wins]);
  const bands = wins.filter((w) => w.decision !== 'accepted').map((w) => ({ a: w.startMs, b: w.endMs, kind: w.decision === 'rejected' ? ('invalid' as const) : w.decision === 'corrected' ? ('corrected' as const) : ('masked' as const) }));
  const accepted = wins.length ? wins.filter((w) => w.decision === 'accepted').length / wins.length : null;
  const sites = [
    { id: 'gas', label: t('integrity.site.gas'), x: 104, y: 44, state: q['co2.local'].state },
    { id: 'resp', label: t('integrity.site.resp'), x: 90, y: 104, state: q['resp.displacement'].state },
    { id: 'imu', label: t('integrity.site.imu'), x: 90, y: 150, state: q['imu.accel'].state },
    { id: 'pvdf', label: t('integrity.site.pvdf'), x: 112, y: 206, state: q['mech.pvdf'].state === 'valid' ? contact : q['mech.pvdf'].state },
    { id: 'imp', label: t('integrity.site.imp'), x: 116, y: 250, state: q['imp.r10k'].state },
  ];
  return (
    <div className="page">
      <PageHead title={t('nav.integrity')} lead={t('integrity.lead')}>
        <WindowPicker />
        <button className="btn sm primary" data-testid="run-cal" onClick={() => { command({ type: 'inject', injection: { atMs: 0, kind: 'calibrate', crewId } }); setToast(t('integrity.calRequested')); }}>{t('integrity.runCal')}</button>
      </PageHead>
      <div className="grid g4">
        <Card><Stat label={t('integrity.contact')} value={last?.contactForceN} unit="N" digits={1} note={<QualityBadge state={contact} />} /></Card>
        <Card><Stat label={t('integrity.gain')} value={cal.lastGain} digits={2} note={<InterpBadge status="experimental-estimate" />} /></Card>
        <Card><Stat label={t('integrity.accepted')} value={accepted === null ? null : accepted * 100} unit="%" note={t('integrity.acceptedNote')} /></Card>
        <Card>
          <div className="stat"><span className="l">{t('integrity.decision')}</span><span className="v" style={{ fontSize: '1.25rem', padding: '6px 0' }} data-testid="int-decision">{last ? t(`decision.${last.decision}`) : t('common.unavailable')}</span>
            <span className="small muted">{last?.reasons.map((r) => t(reasonKey(r))).join(' · ') || '—'}</span></div>
        </Card>
      </div>
      <div className="grid g-main">
        <div className="grid">
          <Card title={t('integrity.lifecycle')} right={<span className="small muted">{cal.lastAtMs !== null ? t('integrity.lastCal', { time: fmtTime(cal.lastAtMs) }) : ''}{cal.nextAtMs !== null ? ` · ${t('integrity.nextCal', { time: fmtTime(cal.nextAtMs) })}` : ''}</span>}>
            <div className="steps" role="list" aria-label={t('integrity.lifecycle')}>
              {LIFECYCLE.map((x) => <span key={x} role="listitem" className={x === cal.state ? `on ${x === 'rejected' || x === 'expired' ? 'bad' : ''}` : ''} aria-current={x === cal.state ? 'step' : undefined}>{x === cal.state && <motion.i layoutId="cal-step" className="step-pill" transition={{ duration: 0.22 }} />}<b>{t(`cal.${x}`)}</b></span>)}
            </div>
            <p className="small">{cal.reason ? t(reasonKey(cal.reason)) : t('integrity.noCal')}</p>
            <p className="small muted">{t('integrity.calCaveat')}</p>
          </Card>
          <Card title={t('integrity.rawChart')} right={<QualityBadge state={q['mech.pvdf'].state} />}>
            <Chart title={t('integrity.rawChart')} unit="a.u." digits={2} domain={domain} height={170} bands={bands} origin={t('origin.simulated')}
              series={[{ id: 'pvdf', label: t('metric.mech.pvdf'), data: view.series['mech.pvdf'], color: 'var(--chart-1)', quality: q['mech.pvdf'].state }]} />
            <Chart title={t('metric.contact.force')} unit="N" digits={1} domain={domain} height={110} yMin={0} origin={t('origin.simulated')}
              series={[{ id: 'force', label: t('metric.contact.force'), data: view.series['contact.force'], color: 'var(--chart-4)', quality: q['contact.force'].state }]} />
          </Card>
          <Card title={t('integrity.methodChart')} right={
            <div className="row" role="group" aria-label={t('integrity.compare')}>
              {(['fixed', 'paired', 'candidate'] as const).map((k) => <button key={k} className="btn sm" aria-pressed={show[k]} onClick={() => setShow({ ...show, [k]: !show[k] })}>{t(`imethod.${k}`)}</button>)}
            </div>}>
            <Chart title={t('integrity.methodChart')} unit="a.u." digits={3} domain={domain} height={170} bands={bands} yMin={0}
              series={[
                ...(show.fixed ? [{ id: 'fixed', label: t('imethod.fixed'), data: s.fixed, color: 'var(--chart-2)' }] : []),
                ...(show.paired ? [{ id: 'paired', label: t('imethod.paired'), data: s.paired, color: 'var(--chart-4)', dashed: true }] : []),
                ...(show.candidate ? [{ id: 'cand', label: `${t('imethod.candidate')} · ${t('interp.experimental-estimate')}`, data: s.candidate, color: 'var(--chart-3)', estimate: true }] : []),
              ]} />
            <p className="small muted">{t('integrity.methodNote')}</p>
          </Card>
        </div>
        <div className="grid" style={{ alignContent: 'start' }}>
          <Card title={t('integrity.map')}><BodyMap sites={sites} /><p className="small muted">{t('integrity.mapNote')}</p></Card>
          <Card title={t('integrity.windows')}>
            <div className="scroll-x" tabIndex={0} role="group" aria-label={t('common.tableRegion')}><table className="t">
              <thead><tr><th>{t('chart.time')}</th><th>{t('integrity.decision')}</th><th className="n">{t('integrity.gain')}</th><th>{t('integrity.why')}</th></tr></thead>
              <tbody>{wins.slice(-8).reverse().map((w) => (
                <tr key={w.startMs}><td className="mono">{fmtTime(w.startMs)}</td><td>{t(`decision.${w.decision}`)}</td><td className="n">{fmtNum(w.transferGain, 2) ?? '—'}</td><td className="small">{w.reasons.map((r) => t(reasonKey(r))).join('; ') || '—'}</td></tr>))}
              </tbody>
            </table></div>
          </Card>
        </div>
      </div>
    </div>
  );
}
