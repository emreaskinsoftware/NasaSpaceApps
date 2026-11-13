import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { HealthEvent } from '@aster/contracts';
import { GUIDANCE, ruleCards } from '@aster/engine';
import { downloadText, NO_CREW, useApp } from '../../app/store';
import { EmergeList } from '../../components/motion';
import { Card, Empty, fmtNum, fmtTime, InterpBadge, OriginBadge, PageHead, QualityBadge, reasonKey, SeverityBadge, useExplain } from '../../components/ui';

const RANK = { priority: 3, review: 2, info: 1 } as const;
const CARDS = ruleCards();

export function EventList({ events, empty }: { events: HealthEvent[]; empty: string }) {
  const { t } = useTranslation();
  const explain = useExplain(), crew = useApp((s) => s.view?.crew ?? NO_CREW);
  if (!events.length) return <p className="muted small">{empty}</p>;
  return (
    <EmergeList items={events} keyOf={(e) => e.id} render={(e) => (
        <Link className="item" to={`/mission/cases/${encodeURIComponent(e.id)}`} data-testid={`event-${e.ruleId}`}>
          <span className={`sev ${e.state === 'resolved' ? '' : e.severity}`} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="ttl" style={{ display: 'block' }}>{t(`rule.${e.ruleId}`)}</span>
            <span className="small muted" style={{ display: 'block' }}>{explain(e)}</span>
            <span className="row" style={{ marginTop: 6 }}><SeverityBadge ev={e} /><span className="badge">{crew.find((c) => c.id === e.crewId)?.pseudonym}</span><span className="badge mono">r{e.revision} · {fmtTime(e.updatedAtMs)}</span></span>
          </span>
        </Link>
      )} />
  );
}

export function Cases() {
  const { t } = useTranslation();
  const view = useApp((s) => s.view)!, command = useApp((s) => s.command);
  const [sev, setSev] = useState<'all' | 'review+' | 'info'>('all'), [state, setState] = useState<'all' | 'open' | 'resolved'>('all'), [mod, setMod] = useState('all');
  const events = view.events
    .filter((e) => (sev === 'all' ? true : sev === 'info' ? e.severity === 'info' : e.severity !== 'info'))
    .filter((e) => (state === 'all' ? true : state === 'resolved' ? e.state === 'resolved' : e.state !== 'resolved'))
    .filter((e) => mod === 'all' || e.module === mod)
    .sort((a, b) => (a.state === 'resolved' ? 0 : RANK[a.severity]) < (b.state === 'resolved' ? 0 : RANK[b.severity]) ? 1 : (a.state === 'resolved' ? 0 : RANK[a.severity]) > (b.state === 'resolved' ? 0 : RANK[b.severity]) ? -1 : b.updatedAtMs - a.updatedAtMs);
  return (
    <div className="page">
      <PageHead title={t('nav.cases')} lead={t('cases.lead')}>
        <label className="row small muted">{t('cases.autoQueue')}
          <input type="checkbox" checked={view.autoQueue} onChange={(e) => command({ type: 'autoQueue', on: e.target.checked })} />
        </label>
      </PageHead>
      <div className="row" role="group" aria-label={t('cases.filters')}>
        <select aria-label={t('cases.fSeverity')} value={sev} onChange={(e) => setSev(e.target.value as typeof sev)}><option value="all">{t('cases.allSeverities')}</option><option value="review+">{t('cases.reviewPlus')}</option><option value="info">{t('severity.info')}</option></select>
        <select aria-label={t('cases.fState')} value={state} onChange={(e) => setState(e.target.value as typeof state)}><option value="all">{t('cases.allStates')}</option><option value="open">{t('cases.openOnly')}</option><option value="resolved">{t('eventState.resolved')}</option></select>
        <select aria-label={t('cases.fModule')} value={mod} onChange={(e) => setMod(e.target.value)}><option value="all">{t('cases.allModules')}</option>{['exposure', 'integrity', 'exercise', 'environment', 'data'].map((m) => <option key={m} value={m}>{t(`module.${m}`)}</option>)}</select>
        <span className="small muted">{t('cases.count', { n: events.length })}</span>
      </div>
      <div className="grid g-main">
        <Card title={t('cases.list')}><EventList events={events} empty={t('cases.empty')} /></Card>
        <Card title={t('cases.outbox')} right={<span className={`badge ${view.link.effectiveUp ? 'ok' : 'warn'}`}>{view.link.effectiveUp ? t('strip.linkUp') : t('strip.linkDown')}</span>}>
          <OutboxTable />
          <p className="small muted">{t('cases.outboxNote')}</p>
        </Card>
      </div>
    </div>
  );
}

export function OutboxTable({ eventId }: { eventId?: string }) {
  const { t } = useTranslation();
  const view = useApp((s) => s.view)!, command = useApp((s) => s.command);
  const rows = view.outbox.filter((o) => !eventId || o.eventId === eventId);
  if (!rows.length) return <p className="muted small">{t('cases.outboxEmpty')}</p>;
  return (
    <div className="scroll-x" tabIndex={0} role="group" aria-label={t('common.tableRegion')}><table className="t" data-testid="outbox">
      <thead><tr><th>{t('cases.package')}</th><th>{t('cases.pstate')}</th><th className="n">{t('cases.bytes')}</th><th className="n">{t('cases.attempts')}</th><th className="n">{t('cases.delivered')}</th><th /></tr></thead>
      <tbody>{rows.map((o) => (
        <tr key={o.id}>
          <td className="small">{t(`rule.${o.eventId.split(':')[1]}`)} <span className="mono">r{o.eventRevision}</span></td>
          <td><span className={`badge ${o.state === 'delivered' || o.state === 'acknowledged' ? 'ok' : o.state === 'failed' ? 'crit' : o.state === 'superseded' ? '' : 'warn'}`} data-state={o.state}>{t(`pstate.${o.state}`)}</span>{o.lastError ? <span className="small muted"> {t(reasonKey(o.lastError))}</span> : null}</td>
          <td className="n">{o.sizeBytes}</td><td className="n">{o.attempts}</td><td className="n">{o.deliveredAtMs === null ? '—' : fmtTime(o.deliveredAtMs)}</td>
          <td>{(o.state === 'failed' || o.state === 'queued') && <button className="btn sm" onClick={() => command({ type: 'retry', packageId: o.id })}>{t('banner.retry')}</button>}</td>
        </tr>))}
      </tbody>
    </table></div>
  );
}

export function CaseDetail() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const view = useApp((s) => s.view)!, setReq = useApp((s) => s.setReq), command = useApp((s) => s.command), role = useApp((s) => s.settings.role), setToast = useApp((s) => s.setToast);
  const explain = useExplain();
  useEffect(() => { setReq({ eventId: id }); return () => setReq({ eventId: null }); }, [id, setReq]);
  const ev = view.events.find((e) => e.id === id);
  if (!ev) return <div className="page"><Empty title={t('cases.notFound')}><Link className="btn" to="/mission/cases">{t('cases.back')}</Link></Empty></div>;
  const rule = CARDS.find((r) => r.id === ev.ruleId), guidance = ev.guidanceId ? GUIDANCE[ev.guidanceId] : null;
  const replies = view.replies.filter((r) => r.reply.eventId === ev.id);
  const crew = view.crew.find((c) => c.id === ev.crewId);
  const exportJson = () => downloadText(`aster-case-${ev.ruleId}-r${ev.revision}.json`, JSON.stringify({ manifest: view.manifest, event: ev, revisions: view.revisions, rule, outbox: view.outbox.filter((o) => o.eventId === ev.id), replies, prototypeNotice: 'Research prototype. Simulated data. Not a clinical record.' }, null, 1));
  return (
    <div className="page">
      <PageHead title={t(`rule.${ev.ruleId}`)} lead={explain(ev)}>
        <Link className="btn sm no-print" to="/mission/cases">{t('cases.back')}</Link>
        <button className="btn sm no-print" onClick={exportJson}>{t('cases.exportJson')}</button>
        <button className="btn sm no-print" onClick={() => window.print()}>{t('cases.exportPdf')}</button>
        <button className="btn sm no-print" data-testid="ack" disabled={ev.state !== 'open' || role === 'crew'} onClick={() => command({ type: 'ack', eventId: ev.id })}>{t('cases.ack')}</button>
        <button className="btn sm primary no-print" data-testid="queue" onClick={() => { command({ type: 'queue', eventId: ev.id }); setToast(t('cases.queued')); }}>{t('cases.queue')}</button>
      </PageHead>
      <div className="row"><SeverityBadge ev={ev} /><OriginBadge /><InterpBadge status="research-guidance" /><span className="badge">{crew?.pseudonym} · {crew?.name}</span><span className="badge mono" data-testid="revision">{t('cases.revision', { n: ev.revision })}</span><span className="badge mono">{fmtTime(ev.openedAtMs)} → {fmtTime(ev.updatedAtMs)}</span></div>
      <Card title={t('cases.chain')}>
        <div className="chain">
          <div><h4>{t('cases.cObservation')}</h4>{ev.evidence.filter((e) => e.kind === 'observation').map((e) => <p key={e.id}>{t(`emetric.${e.metric}`, { defaultValue: e.metric })}: <b className="mono">{fmtNum(e.value, 2) ?? t('common.unavailable')} {e.value !== null ? e.unit : ''}</b></p>)}{!ev.evidence.some((e) => e.kind === 'observation') && <p className="muted">—</p>}</div>
          <div><h4>{t('cases.cQuality')}</h4>{ev.evidence.map((e) => <p key={e.id}><QualityBadge state={e.quality} label={t(`emetric.${e.metric}`, { defaultValue: e.metric })} /></p>)}</div>
          <div><h4>{t('cases.cRule')}</h4><p className="mono">{ev.ruleId} v{ev.ruleVersion}</p><p>{rule?.expression}</p><p className="muted">{t('cases.dwell', { s: (rule?.dwellMs ?? 0) / 1000 })}</p></div>
          <div><h4>{t('cases.cEvidence')}</h4>{ev.evidence.filter((e) => e.kind !== 'observation').map((e) => <p key={e.id}>{t(`emetric.${e.metric}`, { defaultValue: e.metric })}: <b className="mono">{fmtNum(e.value, 2) ?? t('common.unavailable')}{e.value !== null ? ` ${e.unit}` : ''}</b>{e.methodId ? <span className="muted"> · {e.methodId}</span> : null}{e.note ? <span className="muted"> · {e.note.split(', ').map((n) => t(reasonKey(n), { defaultValue: n })).join(', ')}</span> : null}</p>)}</div>
          <div><h4>{t('cases.cNext')}</h4><p>{guidance ? t(guidance.titleKey) : t('cases.noGuidance')}</p><p className="muted">{t('cases.guidanceStatus')}</p></div>
        </div>
        <p className="small muted">{t('cases.window', { a: fmtTime(Math.min(...ev.evidence.map((e) => e.window.startMs), ev.openedAtMs), true), b: fmtTime(Math.max(...ev.evidence.map((e) => e.window.endMs), ev.updatedAtMs), true) })}</p>
      </Card>
      <div className="grid g2">
        <Card title={t('cases.limitations')}>
          <ul className="small">{ev.limitations.map((l) => <li key={l}>{t(`limitation.${l}`)}</li>)}</ul>
          <h3>{t('cases.alternatives')}</h3>
          <p className="small">{t(`alt.${ev.module}`)}</p>
        </Card>
        <Card title={t('cases.guidance')} right={<span className="badge warn">{t('cases.notValidated')}</span>}>
          {guidance ? (<><b>{t(guidance.titleKey)}</b><p className="small">{t(guidance.stepsKey)}</p></>) : <p className="small muted">{t('cases.noGuidance')}</p>}
          <p className="small muted">{t('cases.guidanceNote')}</p>
        </Card>
      </div>
      {replies.length > 0 && (
        <Card title={t('cases.replies')}>
          {replies.map((r) => (
            <div key={r.reply.replyId} className="item" style={{ cursor: 'default' }} data-testid="reply">
              <span className={`sev ${r.stale ? 'review' : 'info'}`} />
              <div style={{ flex: 1 }}>
                {r.stale && <p className="badge warn" data-testid="stale">{t('cases.stale', { a: r.reply.eventRevision, b: ev.revision })}</p>}
                <p>{r.reply.text}</p>
                {r.reply.requestedEvidence.length > 0 && <p className="small">{t('cases.requested')}: {r.reply.requestedEvidence.join('; ')}</p>}
                <p className="small muted">{t(`role.${r.reply.authorRole}`)} · {t('cases.refersTo', { n: r.reply.eventRevision })} · {t('cases.receivedAt', { time: fmtTime(r.receivedAtMs) })}</p>
                <p className="small muted">{t('cases.replyNote')}</p>
              </div>
            </div>
          ))}
        </Card>
      )}
      <div className="grid g2">
        <Card title={t('cases.outbox')}><OutboxTable eventId={ev.id} /></Card>
        <Card title={t('cases.history')}>
          <table className="t"><thead><tr><th>{t('cases.rev')}</th><th>{t('chart.time')}</th><th>{t('cases.pstate')}</th><th>{t('cases.summary')}</th></tr></thead>
            <tbody>{[...view.revisions].reverse().map((r) => <tr key={r.revision}><td className="mono">r{r.revision}</td><td className="mono">{fmtTime(r.updatedAtMs)}</td><td>{t(`eventState.${r.state}`)}</td><td className="small">{explain(r)}</td></tr>)}</tbody></table>
        </Card>
      </div>
    </div>
  );
}
