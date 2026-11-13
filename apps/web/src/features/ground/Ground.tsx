import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { Card, Empty, fmtNum, fmtTime, PageHead, QualityBadge, reasonKey, useExplain } from '../../components/ui';

const REQUESTS = ['contact.force 60 s', 'mech.pvdf 60 s', 'co2.local 120 s', 'calibration log', 'reference sessions'];

/** Mini sparkline for a transmitted signal snippet (what the ground actually received — nothing more). */
function Snippet({ values }: { values: (number | null)[] }) {
  const v = values.filter((x): x is number => x !== null);
  if (v.length < 2) return null;
  const lo = Math.min(...v), hi = Math.max(...v), w = 260, h = 44;
  const d = values.map((y, i) => (y === null ? '' : `${i === 0 || values[i - 1] === null ? 'M' : 'L'}${((i / (values.length - 1)) * w).toFixed(1)} ${(h - 3 - ((y - lo) / Math.max(1e-9, hi - lo)) * (h - 6)).toFixed(1)}`)).join('');
  return <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} aria-hidden="true" style={{ direction: 'ltr' }}><path d={d} fill="none" stroke="var(--chart-1)" strokeWidth="1.5" /></svg>;
}

/** Ground Console: reads ONLY packages that crossed the (simulated) link. Operated by a person or a labelled simulated responder — not a live NASA service. */
export function Ground() {
  const { t } = useTranslation();
  const view = useApp((s) => s.view)!, command = useApp((s) => s.command), setToast = useApp((s) => s.setToast);
  const explain = useExplain();
  const [sel, setSel] = useState<string | null>(null), [text, setText] = useState(''), [req, setReq] = useState<string[]>([]);
  const cases = [...view.ground.cases].sort((a, b) => b.receivedAtMs - a.receivedAtMs);
  const cur = cases.find((c) => c.pkg.packageId === sel) ?? cases[0] ?? null;
  const link = view.link;
  const send = (role: 'ground-specialist' | 'simulated-responder', body: string) => {
    if (!cur || !body.trim()) return;
    command({ type: 'groundReply', packageId: cur.pkg.packageId, text: body.trim().slice(0, 2000), requestedEvidence: req, authorRole: role });
    setText(''); setReq([]); setToast(t('ground.replyQueued'));
  };
  return (
    <div className="page">
      <PageHead title={t('nav.ground')} lead={t('ground.lead')} />
      <Card title={t('ground.link')} right={<span className="badge accent">{link.simulated ? t('ground.accelerated') : t('ground.realTransport')}</span>}>
        <div className="row">
          <span className={`badge ${link.effectiveUp ? 'ok' : 'warn'}`} data-testid="link-state">{link.effectiveUp ? t('strip.linkUp') : t('strip.linkDown')}</span>
          <span className="badge">{t(`profile.${link.cfg.profile}`)}</span>
          <span className="badge mono">{t('ground.delay', { s: (link.cfg.oneWayDelayMs / 1000).toFixed(1) })}</span>
          <span className="badge mono">{t('ground.bandwidth', { n: link.cfg.bandwidthBytesPerSec })}</span>
          <span className="badge mono">{t('ground.loss', { n: Math.round(link.cfg.packetLoss * 100) })}</span>
          {link.stats && <span className="badge mono">{t('ground.stats', { sent: link.stats.sent, lost: link.stats.lost, bytes: link.stats.bytes })}</span>}
        </div>
        <div className={`linkline ${link.effectiveUp ? 'up' : ''} ${view.outbox.some((o) => o.state === 'sending') ? 'tx-up' : ''} ${view.ground.replies.some((r) => r.state === 'sending') ? 'tx-down' : ''}`} aria-hidden="true"><i /><i /></div>
        <div className="row">
          <button className="btn sm" data-testid="link-toggle" aria-pressed={!link.cfg.up} onClick={() => command({ type: 'link', up: !link.cfg.up })}>{link.cfg.up ? t('ground.setDown') : t('ground.setUp')}</button>
          <select aria-label={t('ground.profile')} value={link.cfg.profile} onChange={(e) => command({ type: 'linkProfile', profile: e.target.value as typeof link.cfg.profile })}>
            {(['near-real-time demonstration', 'delayed exploration demonstration'] as const).map((p) => <option key={p} value={p}>{t(`profile.${p}`)}</option>)}
          </select>
        </div>
        <p className="small muted">{t('ground.linkNote')}</p>
      </Card>
      <div className="split">
        <Card title={t('ground.received')} right={<span className="badge" data-testid="ground-count">{cases.length}</span>}>
          {cases.length === 0 ? <Empty title={t('ground.none')}>{t('ground.noneHint')}</Empty> : (
            <div className="list">{cases.map((c) => (
              <button key={c.pkg.packageId} className={`item ${cur?.pkg.packageId === c.pkg.packageId ? 'sel' : ''}`} onClick={() => setSel(c.pkg.packageId)} data-testid="ground-case">
                <span className={`sev ${c.pkg.summary.severity}`} />
                <span style={{ flex: 1 }}>
                  <span className="ttl" style={{ display: 'block' }}>{t(`rule.${c.pkg.summary.ruleId}`)} <span className="mono">r{c.pkg.eventRevision}</span></span>
                  <span className="small muted">{c.pkg.crewPseudonym} · {t('ground.receivedAt', { time: fmtTime(c.receivedAtMs) })} · {t('ground.generatedAt', { time: fmtTime(c.pkg.generatedAtMs) })}{c.duplicates ? ` · ${t('ground.duplicates', { n: c.duplicates })}` : ''}</span>
                </span>
              </button>))}
            </div>)}
          {view.ground.rejected.length > 0 && <p className="small" role="status">{t('ground.rejected', { n: view.ground.rejected.length })}: {view.ground.rejected.slice(-3).map((r) => t(reasonKey(r.reason))).join(', ')}</p>}
        </Card>
        <Card title={t('ground.review')}>
          {!cur ? <p className="muted small">{t('ground.selectCase')}</p> : (<>
            <p><b>{explain(cur.pkg.summary)}</b></p>
            <div className="row"><span className="badge accent">{t(`origin.${cur.pkg.origin}`)}</span><span className="badge ok">{t('ground.hashOk')}</span><span className="badge mono" title={cur.pkg.contentHash}>{cur.pkg.contentHash.slice(0, 12)}…</span><span className="badge mono">{t('cases.revision', { n: cur.pkg.eventRevision })}</span></div>
            <table className="t"><thead><tr><th>{t('cases.cEvidence')}</th><th className="n">{t('ground.value')}</th><th>{t('cases.cQuality')}</th></tr></thead>
              <tbody>{cur.pkg.evidence.map((e) => <tr key={e.id}><td>{t(`emetric.${e.metric}`, { defaultValue: e.metric })}{e.methodId ? <span className="muted small"> · {e.methodId}</span> : null}</td><td className="n">{fmtNum(e.value, 2) ?? t('common.unavailable')}{e.value !== null ? ` ${e.unit}` : ''}</td><td><QualityBadge state={e.quality} /></td></tr>)}</tbody></table>
            {cur.pkg.snippets.map((s) => <div key={s.metric}><span className="small muted">{t(`metric.${s.metric}`, { defaultValue: s.metric })} ({s.unit})</span><Snippet values={s.values} /></div>)}
            {cur.pkg.missing.length > 0 && <p className="small"><b>{t('ground.missing')}:</b> {cur.pkg.missing.join('; ')}</p>}
            <ul className="small muted">{cur.pkg.limitations.map((l) => <li key={l}>{t(`limitation.${l}`)}</li>)}</ul>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="small muted">{t('ground.requestEvidence')}</legend>
              <div className="row">{REQUESTS.map((r) => <label key={r} className="badge" style={{ cursor: 'pointer' }}><input type="checkbox" checked={req.includes(r)} onChange={(e) => setReq(e.target.checked ? [...req, r] : req.filter((x) => x !== r))} />{r}</label>)}</div>
            </fieldset>
            <label className="field">{t('ground.replyLabel', { n: cur.pkg.eventRevision })}
              <textarea value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} data-testid="reply-text" />
            </label>
            <div className="row">
              <button className="btn primary" disabled={!text.trim()} onClick={() => send('ground-specialist', text)} data-testid="reply-send">{t('ground.sendReply')}</button>
              <button className="btn" onClick={() => send('simulated-responder', t('ground.cannedReply'))} data-testid="reply-sim">{t('ground.simResponder')}</button>
            </div>
            <p className="small muted">{t('ground.replyNote')}</p>
          </>)}
        </Card>
      </div>
      <Card title={t('ground.sent')}>
        {view.ground.replies.length === 0 ? <p className="muted small">{t('ground.noReplies')}</p> : (
          <table className="t"><thead><tr><th>{t('ground.reply')}</th><th>{t('cases.pstate')}</th><th className="n">{t('cases.delivered')}</th></tr></thead>
            <tbody>{view.ground.replies.map((r) => <tr key={r.id}><td className="small">{r.payload.text.slice(0, 90)} <span className="muted">· {t(`role.${r.payload.authorRole}`)} · r{r.payload.eventRevision}</span></td><td><span className={`badge ${r.state === 'delivered' ? 'ok' : 'warn'}`}>{t(`pstate.${r.state}`)}</span></td><td className="n">{r.deliveredAtMs === null ? '—' : fmtTime(r.deliveredAtMs)}</td></tr>)}</tbody></table>)}
      </Card>
    </div>
  );
}
