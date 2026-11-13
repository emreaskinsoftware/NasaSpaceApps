import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { LocaleSelect, ThemeSelect } from '../../app/App';
import { Icon } from '../../components/ui';
import { Stagger, motion, EASE } from '../../components/motion';
import SpotlightCard from '../../components/reactbits/SpotlightCard';
import { LiveTrace } from './LiveTrace';

/** Demo entry. Two deliberate actions launch a seeded scenario: "Start demo" here, then "Run". */
export function Landing() {
  const { t } = useTranslation();
  const nav = useNavigate(), send = useApp((s) => s.send), hasRun = useApp((s) => s.status?.hasRun), owner = useApp((s) => s.status?.owner ?? true);
  const start = () => { send({ type: 'start', scenarioId: 'SIM-11', seed: 11 }); nav('/mission/overview'); };
  return (
    <div className="landing">
      <header>
        <span className="brand"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 38h10l5-16 7 26 6-20 4 10h16" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /></svg>ASTER</span>
        <span className="badge dashed">{t('strip.prototype')}</span>
        <span style={{ flex: 1 }} />
        <LocaleSelect /><ThemeSelect />
      </header>
      <main id="main">
        <section className="hero">
          <Stagger className="hero-copy">
            <p className="hero-kicker">{t('landing.kicker')}</p>
            <h1>{t('landing.title1')} {t('landing.title2')}</h1>
            <p className="lead">{t('landing.lead')}</p>
            <div className="row">
              <button className="btn primary lg" onClick={start} disabled={!owner} data-testid="start-demo"><Icon name="play" size={15} />{t('landing.start')}</button>
              {hasRun && <Link className="btn lg" to="/mission/overview">{t('landing.continue')}</Link>}
              <Link className="btn ghost lg" to="/lab">{t('landing.lab')}</Link>
              <Link className="btn ghost lg" to="/evidence">{t('landing.docs')}</Link>
            </div>
            <p className="small muted hero-status">{t('landing.status')}</p>
          </Stagger>
          <motion.div className="hero-art" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.25, ease: EASE }}>
            <LiveTrace />
          </motion.div>
        </section>
        <section className="modules" aria-label={t('landing.modules')}>
          {(['exposure', 'integrity', 'exercise'] as const).map((m) => (
            <SpotlightCard key={m} className="module-card" intensity={0.16} spotlightSize={260} borderGlow={0.75}>
              <p className="module-name"><Icon name={m} size={16} /> {t(`nav.${m}`)}</p>
              <p className="q">{t(`landing.q.${m}`)}</p>
              <p className="muted">{t(`landing.a.${m}`)}</p>
            </SpotlightCard>
          ))}
        </section>
      </main>
    </div>
  );
}
