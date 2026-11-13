import { useTranslation } from 'react-i18next';
import { METRIC_NAMES } from '@aster/contracts';
import { useApp } from '../../app/store';
import { Chart } from '../../components/Chart';
import { Card, InterpBadge, PageHead, QualityBadge, Stat, useSeries, WindowPicker } from '../../components/ui';
import { EventList } from '../cases/Cases';

export const CANDIDATE = 'aligned-quality-aware';

export function Overview() {
  const { t } = useTranslation();
  const view = useApp((s) => s.view)!, settings = useApp((s) => s.settings), setSettings = useApp((s) => s.setSettings), setReq = useApp((s) => s.setReq), crewId = useApp((s) => s.req.crewId);
  const domain = useSeries(['co2.cabin', 'co2.local', 'contact.force']);
  const d = view.detail, q = d.channelQuality;
  const lastBreath = [...d.breaths].reverse().find((b) => b.estimates[CANDIDATE] !== undefined);
  const est = lastBreath?.estimates[CANDIDATE] ?? null;
  const valid = METRIC_NAMES.filter((m) => q[m]?.state === 'valid').length;
  const kpa = settings.co2Unit === 'kPa', p = d.latest['pressure.cabin'] ?? 101.3;
  const conv = (v: number | null | undefined) => (v === null || v === undefined ? null : kpa ? v * 1e-6 * p : v);
  const unit = kpa ? 'kPa' : 'ppm', dg = kpa ? 3 : 0;
  const active = view.events.filter((e) => e.state !== 'resolved').sort((a, b) => ({ priority: 3, review: 2, info: 1 }[b.severity] - { priority: 3, review: 2, info: 1 }[a.severity]) || b.updatedAtMs - a.updatedAtMs);
  return (
    <div className="page">
      <PageHead title={t('overview.title')} lead={t('overview.lead')}>
        <WindowPicker />
        <button className="btn sm" aria-pressed={settings.pauseVisual} onClick={() => setSettings({ pauseVisual: !settings.pauseVisual })}>{t('overview.pauseVisual')}</button>
      </PageHead>
      <div className="grid g4" role="group" aria-label={t('overview.crew')}>
        {view.summaries.map((s) => {
          const c = view.crew.find((x) => x.id === s.crewId)!;
          const bad = METRIC_NAMES.filter((m) => { const st = s.channelQuality[m]?.state; return st && st !== 'valid' && st !== 'unavailable'; }).length;
          return (
            <button key={s.crewId} className={`item ${s.crewId === crewId ? 'sel' : ''}`} onClick={() => setReq({ crewId: s.crewId })} aria-pressed={s.crewId === crewId}>
              <div style={{ flex: 1 }}>
                <div className="ttl">{c.pseudonym} · {c.name}</div>
                <div className="small muted">{t('overview.fictional')}</div>
                <div className="row" style={{ marginTop: 6 }}>
                  <span className={`badge ${bad ? 'warn' : 'ok'}`}>{bad ? t('overview.channelsFlagged', { n: bad }) : t('overview.channelsOk')}</span>
                  {s.sessionActive && <span className="badge accent">{t('overview.exercising')}</span>}
                </div>
              </div>
              <div className="stat"><span className="l">{t('metric.pulse.rate')}</span><span className="v" style={{ fontSize: '1.25rem' }}>{s.latest['pulse.rate'] ? Math.round(s.latest['pulse.rate']!) : '—'}<small>{t('unit.bpm')}</small></span></div>
            </button>
          );
        })}
      </div>
      <div className="grid g-main">
        <div className="grid" style={{ alignContent: 'start' }}>
          <Card title={t('overview.latest')} right={<InterpBadge status="observation" />}>
            <div className="grid g4">
              <Stat label={t('metric.co2.cabin')} value={conv(d.latest['co2.cabin'])} unit={unit} digits={dg} note={<QualityBadge state={q['co2.cabin'].state} />} />
              <Stat label={t('overview.inhaledEst')} value={conv(est)} unit={unit} digits={dg} note={est === null ? t('overview.withheld') : <InterpBadge status="experimental-estimate" />} />
              <Stat label={t('metric.contact.force')} value={d.latest['contact.force']} unit="N" digits={1} note={<QualityBadge state={d.integrity.length ? d.integrity[d.integrity.length - 1].contact : 'unavailable'} />} />
              <Stat label={t('metric.pulse.rate')} value={d.latest['pulse.rate']} unit={t('unit.bpm')} note={<QualityBadge state={q['pulse.rate'].state} />} />
            </div>
          </Card>
          <Card title={t('overview.timeline')}>
            <Chart title={t('overview.timeline')} unit={unit} digits={dg} domain={domain} origin={t('origin.simulated')}
              series={[
                { id: 'cabin', label: t('metric.co2.cabin'), data: view.series['co2.cabin'], color: 'var(--chart-2)', quality: q['co2.cabin'].state, transform: kpa ? (v) => v * 1e-6 * p : undefined },
                { id: 'local', label: t('metric.co2.local'), data: view.series['co2.local'], color: 'var(--chart-1)', quality: q['co2.local'].state, transform: kpa ? (v) => v * 1e-6 * p : undefined },
              ]} />
            <Chart title={t('metric.contact.force')} unit="N" digits={1} domain={domain} height={120} yMin={0} origin={t('origin.simulated')}
              bands={d.integrity.filter((w) => w.decision === 'rejected').map((w) => ({ a: w.startMs, b: w.endMs, kind: 'invalid' as const }))}
              series={[{ id: 'force', label: t('metric.contact.force'), data: view.series['contact.force'], color: 'var(--chart-4)', quality: q['contact.force'].state }]} />
          </Card>
        </div>
        <div className="grid" style={{ alignContent: 'start' }}>
          <Card title={t('overview.activeEvents')} right={<span className="badge">{active.length}</span>}>
            <EventList events={active.slice(0, 6)} empty={t('overview.noEvents')} />
          </Card>
          <Card title={t('overview.coverage')} right={<span className="badge">{t('overview.validOf', { a: valid, b: METRIC_NAMES.length })}</span>}>
            <div className="row">{METRIC_NAMES.map((m) => <QualityBadge key={m} state={q[m].state} label={t(`metric.${m}`)} />)}</div>
            <p className="small muted">{t('overview.coverageNote')}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
