import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { LocaleSelect, ThemeSelect } from '../../app/App';
import { Card, PageHead } from '../../components/ui';
import { RETENTION } from '../../storage/db';

const mb = (n: number | null) => (n === null ? '—' : `${(n / 1048576).toFixed(1)} MB`);

export function Settings() {
  const { t } = useTranslation();
  const s = useApp((x) => x.settings), set = useApp((x) => x.setSettings), st = useApp((x) => x.status), send = useApp((x) => x.send), setToast = useApp((x) => x.setToast);
  const [sw, setSw] = useState<'unsupported' | 'none' | 'active' | 'waiting'>('none');
  const [reg, setReg] = useState<ServiceWorkerRegistration | null>(null);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) { setSw('unsupported'); return; }
    void navigator.serviceWorker.getRegistration().then((r) => { setReg(r ?? null); setSw(r ? (r.waiting ? 'waiting' : 'active') : 'none'); });
  }, []);
  const check = async (b: boolean, key: 'reduceMotion' | 'pauseVisual' | 'lowPower') => set({ [key]: b });
  const wipe = () => { if (window.prompt(t('settings.wipePrompt')) === 'RESET') { send({ type: 'wipe' }); setToast(t('settings.wiped')); } };
  return (
    <div className="page">
      <PageHead title={t('nav.settings')} lead={t('settings.lead')} />
      <div className="grid g2">
        <Card title={t('settings.display')}>
          <label className="field">{t('settings.language')}<LocaleSelect /></label>
          <label className="field">{t('settings.theme')}<ThemeSelect /></label>
          <label className="field">{t('settings.co2Unit')}
            <select value={s.co2Unit} onChange={(e) => set({ co2Unit: e.target.value as 'ppm' | 'kPa' })} data-testid="unit-select"><option value="ppm">ppm</option><option value="kPa">kPa ({t('settings.partialPressure')})</option></select>
          </label>
          <p className="small muted">{t('settings.unitNote')}</p>
          <label className="field">{t('settings.role')}
            <select value={s.role} onChange={(e) => set({ role: e.target.value as typeof s.role })} data-testid="role-select">{(['crew', 'cmo', 'researcher'] as const).map((r) => <option key={r} value={r}>{t(`roleName.${r}`)}</option>)}</select>
          </label>
          <p className="small muted">{t('settings.roleNote')}</p>
        </Card>
        <Card title={t('settings.motion')}>
          <label className="row"><input type="checkbox" checked={s.reduceMotion} onChange={(e) => check(e.target.checked, 'reduceMotion')} data-testid="reduce-motion" />{t('settings.reduceMotion')}</label>
          <label className="row"><input type="checkbox" checked={s.pauseVisual} onChange={(e) => check(e.target.checked, 'pauseVisual')} />{t('settings.pauseVisual')}</label>
          <p className="small muted">{t('settings.motionNote')}</p>
        </Card>
        <Card title={t('settings.storage')}>
          <dl className="kv">
            <dt>{t('settings.used')}</dt><dd className="mono">{mb(st?.storage.usage ?? null)} / {mb(st?.storage.quota ?? null)}</dd>
            <dt>{t('settings.durable')}</dt><dd>{st?.persist.ok ? <span className="badge ok">{t('settings.saved')}</span> : <span className="badge crit">{t('settings.notSaved')}</span>}</dd>
            <dt>{t('settings.retention')}</dt><dd>{t('settings.retentionValue', { min: RETENTION.rawDetailMinutes, runs: RETENTION.maxRuns })}</dd>
            <dt>{t('settings.runsStored')}</dt><dd className="mono">{st?.runs.length ?? 0}</dd>
          </dl>
          <div className="row">
            <button className="btn sm" onClick={() => send({ type: 'export', kind: 'backup' })} disabled={!st?.hasRun}>{t('settings.backup')}</button>
            <button className="btn sm danger" onClick={wipe} data-testid="wipe">{t('settings.wipe')}</button>
          </div>
          <p className="small muted">{t('settings.storageNote')}</p>
        </Card>
        <Card title={t('settings.offline')}>
          <dl className="kv">
            <dt>{t('settings.swState')}</dt><dd data-testid="sw-state">{t(`settings.sw.${sw}`)}</dd>
            <dt>{t('settings.profile')}</dt><dd>{t('strip.gatewayBrowser')}</dd>
          </dl>
          {sw === 'waiting' && <button className="btn sm" disabled={st?.running} onClick={() => { reg?.waiting?.postMessage({ type: 'SKIP_WAITING' }); setToast(t('settings.updateApplied')); }}>{t('settings.applyUpdate')}</button>}
          <p className="small muted">{t('settings.offlineNote')}</p>
        </Card>
        <Card title={t('settings.privacy')} className="">
          <ul className="small"><li>{t('settings.p1')}</li><li>{t('settings.p2')}</li><li>{t('settings.p3')}</li><li>{t('settings.p4')}</li></ul>
        </Card>
        <Card title={t('settings.connectivity')}>
          <ul className="small"><li>{t('settings.c1')}</li><li>{t('settings.c2')}</li><li>{t('settings.c3')}</li></ul>
        </Card>
      </div>
    </div>
  );
}
