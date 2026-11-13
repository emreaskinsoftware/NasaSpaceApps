import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useReducedMotionPref } from '../../components/motion';

/**
 * Entry-screen illustration of the product's central behaviour, drawn live:
 * a mechanical signal shrinks because the sensor contact slips, ASTER withholds the dependent interpretation
 * (hatched interval) while the independent breathing/CO2 channel continues.
 * This is an explanatory illustration with invented shapes, clearly labelled — not product data.
 */
const W = 560, H = 330, SPEED = 46;           // px per second
const CYCLE = 13, SLIP_A = 4.6, SLIP_B = 9.4; // seconds
const inSlip = (tau: number): boolean => { const c = ((tau % CYCLE) + CYCLE) % CYCLE; return c >= SLIP_A && c < SLIP_B; };
/** Smooth 0..1 contact level around the slip edges. */
const contact = (tau: number): number => {
  const c = ((tau % CYCLE) + CYCLE) % CYCLE;
  const ramp = (x: number) => Math.min(1, Math.max(0, x / 0.5));
  return 1 - 0.62 * Math.min(ramp(c - SLIP_A), ramp(SLIP_B + 0.5 - c));
};
const resp = (tau: number) => Math.sin(tau * 1.75) * 0.8 + Math.sin(tau * 3.5 + 1) * 0.12;
const mech = (tau: number) => {
  const rep = (tau * 0.7) % 1, env = rep < 0.55 ? Math.sin((Math.PI * rep) / 0.55) ** 2 : 0.06;
  return (Math.sin(tau * 31) * 0.6 + Math.sin(tau * 47 + 2) * 0.4) * env * contact(tau);
};

function frame(t: number): { r: string; m: string; band: [number, number][] } {
  let r = '', m = '';
  const band: [number, number][] = [];
  let open: number | null = null;
  for (let x = 0; x <= W; x += 3) {
    const tau = t - (W - x) / SPEED;
    r += `${x === 0 ? 'M' : 'L'}${x} ${(92 - resp(tau) * 44).toFixed(1)}`;
    m += `${x === 0 ? 'M' : 'L'}${x} ${(236 - mech(tau) * 52).toFixed(1)}`;
    const s = inSlip(tau);
    if (s && open === null) open = x;
    if (!s && open !== null) { band.push([open, x]); open = null; }
  }
  if (open !== null) band.push([open, W]);
  return { r, m, band };
}

export function LiveTrace() {
  const { t } = useTranslation();
  const reduce = useReducedMotionPref();
  const svg = useRef<SVGSVGElement>(null), rp = useRef<SVGPathElement>(null), mp = useRef<SVGPathElement>(null), bg = useRef<SVGGElement>(null);
  const chip = useRef<SVGGElement>(null), chipText = useRef<SVGTextElement>(null), note = useRef<SVGGElement>(null);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const paint = (time: number) => {
      const f = frame(time);
      rp.current?.setAttribute('d', f.r);
      mp.current?.setAttribute('d', f.m);
      if (bg.current) {
        const rects = bg.current.querySelectorAll('rect');
        rects.forEach((rc, i) => { const b = f.band[i]; rc.setAttribute('x', String(b ? b[0] : 0)); rc.setAttribute('width', String(b ? b[1] - b[0] : 0)); });
      }
      const level = contact(time), slipping = level < 0.8;
      if (chipText.current) chipText.current.textContent = `${t('landing.artContact')} ${Math.round(level * 100)} %`;
      chip.current?.setAttribute('data-state', slipping ? 'bad' : 'ok');
      if (note.current) note.current.style.opacity = f.band.length ? '1' : '0';
    };
    if (reduce) { paint(8.2); return; }
    let raf = 0, visible = true, start = performance.now() - 2500;
    const loop = (now: number) => { raf = 0; if (!visible || document.hidden) return; paint((now - start) / 1000); raf = requestAnimationFrame(loop); };
    const wake = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(loop); };
    const io = new IntersectionObserver((e) => { visible = e.some((x) => x.isIntersecting); wake(); });
    io.observe(el);
    document.addEventListener('visibilitychange', wake);
    wake();
    return () => { cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', wake); };
  }, [reduce, t]);

  return (
    <figure className="livetrace" aria-label={t('landing.artLabel')}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t('landing.artLabel')} style={{ direction: 'ltr' }}>
        <defs>
          <pattern id="lt-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="var(--warning)" strokeWidth="1.6" opacity="0.5" /></pattern>
          <linearGradient id="lt-fade" x1="0" x2="1"><stop offset="0" stopColor="var(--surface)" stopOpacity="1" /><stop offset="0.12" stopColor="var(--surface)" stopOpacity="0" /></linearGradient>
        </defs>
        <g stroke="var(--chart-grid)" strokeWidth="1">{[36, 92, 148, 180, 236, 292].map((y) => <line key={y} x1="0" x2={W} y1={y} y2={y} strokeDasharray={y === 92 || y === 236 ? undefined : '2 6'} />)}</g>
        <g ref={bg}>{[0, 1].map((i) => <rect key={i} y="172" height="128" width="0" fill="url(#lt-hatch)" />)}</g>
        <path ref={rp} fill="none" stroke="var(--chart-1)" strokeWidth="2.4" strokeLinejoin="round" />
        <path ref={mp} fill="none" stroke="var(--chart-2)" strokeWidth="1.8" strokeLinejoin="round" />
        <rect x="0" y="0" width={W} height={H} fill="url(#lt-fade)" />
        <g className="lt-text">
          <text x="14" y="24">{t('landing.artResp')}</text>
          <text x="14" y="168">{t('landing.artMech')}</text>
          <g ref={chip} className="lt-chip" data-state="ok" transform={`translate(${W - 150} 150)`}>
            <rect width="136" height="24" rx="12" />
            <text ref={chipText} x="68" y="16" textAnchor="middle">{t('landing.artContact')} 100 %</text>
          </g>
          <g ref={note} className="lt-note" style={{ opacity: 0 }}>
            <text x={W - 14} y="318" textAnchor="end" className="warn">{t('landing.artWithheld')}</text>
            <text x={W - 14} y="52" textAnchor="end" className="ok">{t('landing.artContinues')}</text>
          </g>
        </g>
        <line x1={W - 1} x2={W - 1} y1="30" y2={H - 26} stroke="var(--text-2)" strokeWidth="1" strokeDasharray="3 3" />
      </svg>
      <figcaption>{t('landing.artSim')}</figcaption>
    </figure>
  );
}
