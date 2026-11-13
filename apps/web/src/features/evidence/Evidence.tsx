import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RuleCard } from '@aster/contracts';
import { EXERCISE_METHODS, EXPOSURE_METHODS, INTEGRITY_METHODS, ruleCards } from '@aster/engine';
import { Card, Drawer, PageHead } from '../../components/ui';
import { CLAIMS, SOURCES } from './sources';

const RULES = ruleCards();
const METHODS = [...Object.values(EXPOSURE_METHODS).map((m) => ({ ...m, module: 'exposure' })), ...Object.values(INTEGRITY_METHODS).map((m) => ({ ...m, module: 'integrity' })), ...Object.values(EXERCISE_METHODS).map((m) => ({ ...m, module: 'exercise' }))];

export function Evidence() {
  const { t } = useTranslation();
  const [q, setQ] = useState(''), [rule, setRule] = useState<RuleCard | null>(null);
  const k = q.trim().toLowerCase();
  const hit = (...s: string[]) => !k || s.some((x) => x.toLowerCase().includes(k));
  const sources = SOURCES.filter((s) => hit(s.id, s.title, s.supports, s.boundary));
  const rules = RULES.filter((r) => hit(r.id, r.expression, r.rationale, t(`rule.${r.id}`)));
  const methods = METHODS.filter((m) => hit(m.id, t(`methodCard.${m.id}`)));
  return (
    <div className="page">
      <PageHead title={t('nav.evidence')} lead={t('evidence.lead')}>
        <label className="row small muted">{t('common.search')}<input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('evidence.searchPh')} data-testid="evidence-search" /></label>
      </PageHead>
      <Card title={`${t('evidence.rules')} (${rules.length})`}>
        <div className="scroll-x" tabIndex={0} role="group" aria-label={t('common.tableRegion')}><table className="t">
          <thead><tr><th>ID</th><th>{t('evidence.rule')}</th><th>{t('evidence.expression')}</th><th>{t('evidence.severity')}</th><th /></tr></thead>
          <tbody>{rules.map((r) => (
            <tr key={r.id}><td className="mono">{r.id} <span className="muted">v{r.version}</span></td><td>{t(`rule.${r.id}`)}</td><td className="small">{r.expression}{r.demonstrationThreshold && <span className="badge warn" style={{ marginInlineStart: 6 }}>{t('evidence.demo')}</span>}</td><td>{t(`severity.${r.severity}`)}</td>
              <td><button className="btn sm" onClick={() => setRule(r)}>{t('common.inspect')}</button></td></tr>))}
          </tbody>
        </table></div>
      </Card>
      <Card title={`${t('evidence.methods')} (${methods.length})`}>
        <div className="grid g3">{methods.map((m) => (
          <div key={m.id} className="card flat"><div className="row"><b className="mono">{m.id}</b><span className="badge mono">v{m.version}</span><span className="badge">{t(`module.${m.module}`)}</span></div><p className="small">{t(`methodCard.${m.id}`)}</p></div>))}
        </div>
      </Card>
      <Card title={t('evidence.claims')}>
        <table className="t"><thead><tr><th>{t('evidence.claim')}</th><th>{t('evidence.status')}</th></tr></thead>
          <tbody>{CLAIMS.filter((c) => hit(t(`claim.${c.id}`))).map((c) => <tr key={c.id}><td>{t(`claim.${c.id}`)}</td><td><span className={`badge ${c.status === 'verified' ? 'ok' : c.status === 'prohibited' ? 'crit' : 'accent'}`}>{t(`claimStatus.${c.status}`)}</span></td></tr>)}</tbody></table>
        <p className="small muted">{t('evidence.claimsNote')}</p>
      </Card>
      <Card title={`${t('evidence.sources')} (${sources.length})`}>
        <div className="scroll-x" tabIndex={0} role="group" aria-label={t('common.tableRegion')}><table className="t">
          <thead><tr><th>ID</th><th>{t('evidence.source')}</th><th>{t('evidence.supports')}</th><th>{t('evidence.boundary')}</th></tr></thead>
          <tbody>{sources.map((s) => <tr key={s.id}><td className="mono">{s.id}</td><td><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a></td><td className="small">{s.supports}</td><td className="small muted">{s.boundary}</td></tr>)}</tbody>
        </table></div>
        <p className="small muted">{t('evidence.sourcesNote')}</p>
      </Card>
      <Card title={t('evidence.limitations')}>
        <ul className="small">{['sim', 'spatial', 'transfer', 'confound', 'thresholds', 'browser'].map((x) => <li key={x}>{t(`evidence.lim.${x}`)}</li>)}</ul>
      </Card>
      {rule && (
        <Drawer title={`${rule.id} · v${rule.version}`} onClose={() => setRule(null)}>
          <p><b>{t(`rule.${rule.id}`)}</b></p>
          <dl className="kv">
            <dt>{t('evidence.inputs')}</dt><dd className="mono">{rule.inputs.join(', ')}</dd>
            <dt>{t('evidence.eligibility')}</dt><dd>{rule.eligibility}</dd>
            <dt>{t('evidence.expression')}</dt><dd>{rule.expression}</dd>
            <dt>{t('evidence.dwell')}</dt><dd className="mono">{rule.dwellMs / 1000} s</dd>
            <dt>{t('evidence.reset')}</dt><dd>{rule.reset}</dd>
            <dt>{t('evidence.severity')}</dt><dd>{t(`severity.${rule.severity}`)}</dd>
            <dt>{t('evidence.unavailable')}</dt><dd>{rule.unavailable}</dd>
            <dt>{t('evidence.guidance')}</dt><dd className="mono">{rule.guidanceId ?? '—'}</dd>
          </dl>
          <p className="small">{rule.rationale}</p>
          {rule.demonstrationThreshold && <p className="badge warn">{t('evidence.demoLong')}</p>}
          <p className="small muted">{t('evidence.ruleLang')}</p>
        </Drawer>
      )}
    </div>
  );
}
