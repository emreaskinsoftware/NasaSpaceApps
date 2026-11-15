/**
 * Builds the editable ASTER decks (EN + TR; full 14 + 3 appendix slides and a 7-slide short pitch) with pptxgenjs.
 * Headings, diagrams, labels and tables are native editable shapes; product screenshots are real captures
 * (deliverables/captures). Every number comes from deliverables/reports/evaluation.json and test-summary.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { COPY, type Copy, type Lang } from '../media/presentation/content';

const require = createRequire(import.meta.url);
const PptxGenJS = require('pptxgenjs') as typeof import('pptxgenjs').default;
type Pptx = InstanceType<typeof PptxGenJS>;
type Slide = ReturnType<Pptx['addSlide']>;

const ROOT = process.cwd(), CAP = join(ROOT, 'deliverables/captures'), OUT = join(ROOT, 'deliverables/presentation');
mkdirSync(OUT, { recursive: true });
const ev = JSON.parse(readFileSync(join(ROOT, 'deliverables/reports/evaluation.json'), 'utf8'));
const tsFile = join(ROOT, 'deliverables/reports/test-summary.json');
const tests: { unit: number; unitFiles: number; e2e: number; e2ePerEngine: number } = existsSync(tsFile) ? JSON.parse(readFileSync(tsFile, 'utf8')) : { unit: 0, unitFiles: 0, e2e: 0, e2ePerEngine: 0 };

const D = { bg: '0B1016', surface: '121B25', elev: '1A2633', text: 'EDF4FA', text2: 'A7B6C6', border: '304354', accent: '66D5E8', warn: 'F5C36B', crit: 'FF8D94', ok: '67D7A0' };
const L = { bg: 'F4F7FA', surface: 'FFFFFF', elev: 'EAF0F5', text: '142332', text2: '43576A', border: 'CBD5DF', accent: '00586A', warn: '7A4100', crit: 'A31D2E', ok: '0F5F3A' };
type Pal = typeof D;
const FONT = 'Segoe UI', MONO = 'Consolas', W = 13.333, H = 7.5, MX = 0.6;
const REPO = 'github.com/emreaskinsoftware/NasaSpaceApps';
const pct = (x: number | null) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)} %`);
const assets = new Set<string>();

const TEAM = { captain: 'Ümitcan Çınar', members: ['Emre Aşkın', 'Fatma Türkmen'] };
const TEAM_L: Record<Lang, { team: string; captain: string; members: string }> = { en: { team: 'Team', captain: 'Team captain', members: 'Members' }, tr: { team: 'Takım', captain: 'Takım kaptanı', members: 'Üyeler' } };

function deck(lang: Lang, short: boolean): { pptx: Pptx; notes: string[] } {
  const c: Copy = COPY[lang];
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = [TEAM.captain, ...TEAM.members].join(', '); pptx.company = 'ASTER'; pptx.title = `ASTER — ${c.s1.h}`; pptx.subject = c.label;
  const notes: string[] = [];
  let n = 0;
  const cap = (name: string, trName?: string) => { const f = lang === 'tr' && trName && existsSync(join(CAP, `${trName}.png`)) ? trName : name; assets.add(`${f}.png`); return join(CAP, `${f}.png`); };

  const base = (dark: boolean, title: string | null, note: string, src?: string): { s: Slide; p: Pal } => {
    const s = pptx.addSlide(), p = dark ? D : L;
    n++;
    s.background = { color: p.bg };
    if (title) s.addText(title, { x: MX, y: 0.45, w: W - 2 * MX, h: 0.95, fontFace: FONT, fontSize: 34, bold: true, color: p.text, valign: 'top', margin: 0 });
    // persistent prototype label + slide number
    s.addShape('roundRect', { x: MX, y: H - 0.52, w: lang === 'tr' ? 3.3 : 3.5, h: 0.3, fill: { color: p.surface }, line: { color: p.accent, width: 0.75, dashType: 'dash' }, rectRadius: 0.15 });
    s.addText(c.label, { x: MX, y: H - 0.52, w: lang === 'tr' ? 3.3 : 3.5, h: 0.3, fontFace: FONT, fontSize: 11, color: p.accent, align: 'center', valign: 'middle', margin: 0 });
    s.addText(`ASTER · ${n}`, { x: W - MX - 2, y: H - 0.52, w: 2, h: 0.3, fontFace: MONO, fontSize: 11, color: p.text2, align: 'right', valign: 'middle', margin: 0 });
    if (src) s.addText(`${c.src}: ${src}`, { x: MX + 3.7, y: H - 0.52, w: 6.2, h: 0.3, fontFace: FONT, fontSize: 11, color: p.text2, valign: 'middle', margin: 0 });
    s.addNotes(note);
    notes.push(`### ${n}. ${title ?? c.s1.h}\n\n${note}\n`);
    return { s, p };
  };
  const shot = (s: Slide, p: Pal, file: string, x: number, y: number, w: number, label?: string) => {
    const h = (w * 9) / 16;
    s.addShape('rect', { x: x - 0.03, y: y - 0.03, w: w + 0.06, h: h + 0.06, fill: { color: p.border }, line: { color: p.border, width: 0.5 } });
    s.addImage({ path: file, x, y, w, h });
    if (label) { s.addShape('rect', { x, y: y + h - 0.3, w: Math.min(w, 0.4 + label.length * 0.085), h: 0.3, fill: { color: '0B1016', transparency: 15 }, line: { color: '0B1016', width: 0 } }); s.addText(label, { x: x + 0.08, y: y + h - 0.3, w: w - 0.1, h: 0.3, fontFace: FONT, fontSize: 11, color: 'EDF4FA', valign: 'middle', margin: 0 }); }
  };
  const bullets = (s: Slide, p: Pal, items: string[], x: number, y: number, w: number, size = 20, gap = 0.72) =>
    items.forEach((t, i) => { s.addShape('rect', { x, y: y + i * gap + 0.12, w: 0.07, h: 0.34, fill: { color: p.accent }, line: { color: p.accent, width: 0 } }); s.addText(t, { x: x + 0.22, y: y + i * gap, w: w - 0.22, h: gap - 0.06, fontFace: FONT, fontSize: size, color: p.text, valign: 'top', margin: 0 }); });
  const card = (s: Slide, p: Pal, x: number, y: number, w: number, h: number, head: string, body: string, headColor = p.accent) => {
    s.addShape('roundRect', { x, y, w, h, fill: { color: p.surface }, line: { color: p.border, width: 1 }, rectRadius: 0.08 });
    s.addText(head, { x: x + 0.25, y: y + 0.2, w: w - 0.5, h: 0.5, fontFace: FONT, fontSize: 20, bold: true, color: headColor, valign: 'top', margin: 0 });
    s.addText(body, { x: x + 0.25, y: y + 0.78, w: w - 0.5, h: h - 0.95, fontFace: FONT, fontSize: 16, color: p.text, valign: 'top', margin: 0 });
  };
  const chip = (s: Slide, p: Pal, t: string, x: number, y: number, w: number, color = p.accent, h = 0.5, size = 15) => {
    s.addShape('roundRect', { x, y, w, h, fill: { color: p.surface }, line: { color, width: 1.25 }, rectRadius: 0.1 });
    s.addText(t, { x: x + 0.05, y, w: w - 0.1, h, fontFace: FONT, fontSize: size, color, bold: true, align: 'center', valign: 'middle', margin: 0 });
  };
  const arrow = (s: Slide, p: Pal, x: number, y: number, w: number, color = p.text2) => s.addShape('line', { x, y, w, h: 0, line: { color, width: 1.75, endArrowType: 'triangle' } });
  /** Editable polyline from a function (original diagram; not product data). */
  const wave = (s: Slide, x: number, y: number, w: number, h: number, f: (u: number) => number, color: string, dash = false) => {
    const N = 60, pts = Array.from({ length: N + 1 }, (_, i) => ({ x: (i / N) * w, y: (0.5 - 0.5 * f(i / N)) * h, ...(i === 0 ? { moveTo: true } : {}) }));
    s.addShape('custGeom' as never, { x, y, w, h, points: pts as never, line: { color, width: 2, dashType: dash ? 'dash' : 'solid' }, fill: { type: 'none' } as never });
  };
  const table = (s: Slide, p: Pal, rows: string[][], x: number, y: number, colW: number[], size = 13, rowH = 0.42) => {
    const data = rows.map((r, ri) => r.map((t, ci) => ({ text: t, options: { fontFace: ci === 0 || ri === 0 ? FONT : (/^[\d\-+±—.,% /a-zA-Z]*$/.test(t) && /\d/.test(t) ? MONO : FONT), fontSize: size, bold: ri === 0, color: ri === 0 ? p.text2 : p.text, fill: { color: ri === 0 ? p.elev : p.surface }, align: (ci === 0 ? 'left' : 'left') as 'left', valign: 'middle' as const, margin: [0.04, 0.1, 0.04, 0.1] as never } })));
    s.addTable(data as never, { x, y, colW, rowH, border: { type: 'solid', color: p.border, pt: 0.75 } });
  };

  /* ---------------- slides ---------------- */
  const s1 = () => {
    const { s, p } = base(true, null, c.s1.n);
    s.addText('ASTER', { x: MX, y: 0.7, w: 4, h: 0.5, fontFace: FONT, fontSize: 20, bold: true, color: p.accent, charSpacing: 6, margin: 0 });
    s.addText(c.s1.h, { x: MX, y: 1.45, w: 5.3, h: 2.6, fontFace: FONT, fontSize: 38, bold: true, color: p.text, valign: 'top', margin: 0 });
    s.addText(c.s1.sub, { x: MX, y: 4.15, w: 5.2, h: 1.5, fontFace: FONT, fontSize: 20, color: p.text2, valign: 'top', margin: 0 });
    s.addText(c.s1.ctx, { x: MX, y: 5.6, w: 5.3, h: 0.35, fontFace: FONT, fontSize: 14, color: p.text2, margin: 0 });
    s.addText([
      { text: `${TEAM_L[lang].captain}: `, options: { color: p.accent } }, { text: TEAM.captain, options: { color: p.text, breakLine: true } },
      { text: `${TEAM_L[lang].members}: `, options: { color: p.accent } }, { text: TEAM.members.join(', '), options: { color: p.text } },
    ], { x: MX, y: 6.0, w: 5.3, h: 0.72, fontFace: FONT, fontSize: 14, valign: 'top', margin: 0 });
    shot(s, p, cap('overview-dark', 'overview-tr'), 6.25, 1.35, 6.5, 'SIM-11 · seed 11');
  };
  const s2 = () => {
    const { s, p } = base(false, c.s2.h, c.s2.n);
    s.addText(c.s2.line, { x: MX, y: 1.4, w: 12, h: 0.5, fontFace: FONT, fontSize: 24, color: p.accent, bold: true, margin: 0 });
    const cw = 3.85, gx = 0.29;
    c.s2.c.forEach(([h, b], i) => {
      const x = MX + i * (cw + gx), y = 2.15;
      s.addShape('roundRect', { x, y, w: cw, h: 4.4, fill: { color: p.surface }, line: { color: p.border, width: 1 }, rectRadius: 0.08 });
      s.addText(h, { x: x + 0.25, y: y + 0.18, w: cw - 0.5, h: 0.45, fontFace: FONT, fontSize: 20, bold: true, color: p.text, margin: 0 });
      const gx0 = x + 0.3, gy = y + 0.85, gw = cw - 0.6, gh = 1.7;
      s.addShape('rect', { x: gx0, y: gy, w: gw, h: gh, fill: { color: p.bg }, line: { color: p.border, width: 0.5 } });
      if (i === 0) { [0.12, 0.45, 0.78].forEach((u) => s.addShape('rect', { x: gx0 + u * gw, y: gy, w: gw * 0.13, h: gh, fill: { color: p.accent, transparency: 80 }, line: { color: p.accent, width: 0 } })); wave(s, gx0, gy + 0.15, gw, gh - 0.3, (u) => Math.sin(u * 6 * Math.PI - 0.6) * 0.85, p.accent); wave(s, gx0, gy + 0.15, gw, gh - 0.3, () => -0.55, p.warn, true); }
      if (i === 1) { wave(s, gx0, gy + 0.1, gw, gh - 0.2, (u) => Math.sin(u * 30 * Math.PI) * (u < 0.5 ? 0.8 : 0.5) * Math.abs(Math.sin(u * 5 * Math.PI)), p.ok); s.addShape('line', { x: gx0 + gw / 2, y: gy, w: 0, h: gh, line: { color: p.text2, width: 1, dashType: 'dash' } }); }
      if (i === 2) { s.addShape('rect', { x: gx0 + gw * 0.5, y: gy, w: gw * 0.5, h: gh, fill: { color: p.warn, transparency: 82 }, line: { color: p.warn, width: 0 } }); wave(s, gx0, gy + 0.1, gw, gh - 0.2, (u) => Math.sin(u * 34 * Math.PI) * (u < 0.5 ? 0.85 : 0.3), p.warn); }
      s.addText(b, { x: x + 0.25, y: y + 2.75, w: cw - 0.5, h: 1.5, fontFace: FONT, fontSize: 16, color: p.text2, valign: 'top', margin: 0 });
    });
  };
  const s3 = () => {
    const { s, p } = base(true, c.s3.h, c.s3.n, 'S01–S06, S15, S16');
    s.addText(c.s3.line, { x: MX, y: 1.4, w: 12, h: 0.5, fontFace: FONT, fontSize: 22, color: p.text2, margin: 0 });
    c.s3.items.forEach(([h, b], i) => card(s, p, MX + (i % 2) * 6.15, 2.15 + Math.floor(i / 2) * 1.5, 5.95, 1.35, h, b, p.text));
    s.addShape('roundRect', { x: MX, y: 5.3, w: W - 2 * MX, h: 1.2, fill: { color: p.elev }, line: { color: p.accent, width: 1.25 }, rectRadius: 0.08 });
    s.addText(c.s3.ours, { x: MX + 0.3, y: 5.3, w: W - 2 * MX - 0.6, h: 1.2, fontFace: FONT, fontSize: 20, color: p.accent, bold: true, valign: 'middle', margin: 0 });
  };
  const s4 = () => {
    const { s, p } = base(false, c.s4.h, c.s4.n);
    c.s4.q.forEach(([num, q], i) => {
      const x = MX + i * 4.14;
      s.addShape('roundRect', { x, y: 1.55, w: 3.85, h: 1.9, fill: { color: p.surface }, line: { color: p.border, width: 1 }, rectRadius: 0.08 });
      s.addText(num, { x: x + 0.25, y: 1.7, w: 0.8, h: 0.6, fontFace: MONO, fontSize: 30, bold: true, color: p.accent, margin: 0 });
      s.addText(q, { x: x + 0.25, y: 2.35, w: 3.4, h: 1.0, fontFace: FONT, fontSize: 22, bold: true, color: p.text, valign: 'top', margin: 0 });
    });
    const bw = 2.2, gap = 0.28, y = 4.35;
    c.s4.flow.forEach((t, i) => { const x = MX + i * (bw + gap); chip(s, p, t, x, y, bw, i === 3 ? p.warn : p.accent, 1.0, 15); if (i < 4) arrow(s, p, x + bw + 0.02, y + 0.5, gap - 0.04); });
    s.addShape('line', { x: MX, y: 5.75, w: W - 2 * MX, h: 0, line: { color: p.border, width: 1 } });
    s.addText(c.label, { x: MX, y: 5.85, w: 8, h: 0.4, fontFace: FONT, fontSize: 14, color: p.text2, margin: 0 });
  };
  const s5 = () => { const { s, p } = base(true, c.s5.h, c.s5.n, 'S05, S06'); shot(s, p, cap('exposure-dark', 'exposure-tr'), MX, 1.5, 7.9, `SIM-11 · ${c.simLabel}`); bullets(s, p, c.s5.b, 8.85, 1.6, 3.95, 18, 1.08); };
  const s6 = () => {
    const { s, p } = base(false, c.s6.h, c.s6.n, 'S07–S09');
    shot(s, p, cap('integrity-light'), MX, 2.2, 7.3, `SIM-11 · ${c.simLabel}`);
    bullets(s, p, c.s6.b, 8.25, 2.2, 4.5, 16, 0.85);
    const x = 8.25, y = 4.85;
    s.addShape('roundRect', { x, y, w: 4.5, h: 1.75, fill: { color: p.surface }, line: { color: p.border, width: 1, dashType: 'dash' }, rectRadius: 0.08 });
    c.s6.parts.forEach((t, i) => chip(s, p, t, x + 0.15 + (i % 2) * 2.15, y + 0.15 + Math.floor(i / 2) * 0.55, 2.05, i === 1 ? p.warn : p.accent, 0.45, 12));
    s.addText(c.concept, { x: x + 0.15, y: y + 1.3, w: 4.2, h: 0.35, fontFace: FONT, fontSize: 12, italic: true, color: p.text2, margin: 0 });
  };
  const s7 = () => {
    const { s, p } = base(false, c.s7.h, c.s7.n, 'S10–S14');
    shot(s, p, cap('exercise-matched-light'), MX, 1.5, 5.95, c.s7.a);
    shot(s, p, cap('exercise-withheld-dark'), MX + 6.2, 1.5, 5.95, c.s7.b);
    c.s7.bl.forEach((t, i) => { s.addShape('rect', { x: MX + i * 4.1, y: 5.2, w: 0.07, h: 0.8, fill: { color: p.accent }, line: { color: p.accent, width: 0 } }); s.addText(t, { x: MX + 0.2 + i * 4.1, y: 5.15, w: 3.75, h: 1.2, fontFace: FONT, fontSize: 16, color: p.text, valign: 'top', margin: 0 }); });
  };
  const s8 = () => {
    const { s, p } = base(true, c.s8.h, c.s8.n);
    shot(s, p, cap('case-detail-dark', 'case-detail-tr'), MX, 1.5, 7.9, 'INT-CON-01 · SIM-11');
    c.s8.chain.forEach((t, i) => chip(s, p, t, 8.85, 1.5 + i * 0.52, 3.9, i === 4 ? p.warn : p.accent, 0.42, 13));
    bullets(s, p, c.s8.b, 8.85, 4.3, 3.95, 15, 0.72);
  };
  const s9 = () => {
    const { s, p } = base(true, c.s9.h, c.s9.n, 'S15, S16');
    shot(s, p, cap('cases-queued-dark', 'cases-tr'), MX, 1.5, 5.95, c.s9.states[0]);
    shot(s, p, cap('ground-received-dark', 'ground-tr'), MX + 6.2, 1.5, 5.95, c.s9.states[1]);
    c.s9.states.forEach((t, i) => { chip(s, p, t, MX + i * 3.6, 5.05, 3.3, i === 0 ? p.warn : p.ok, 0.45, 13); if (i < 2) arrow(s, p, MX + i * 3.6 + 3.32, 5.27, 0.26); });
    chip(s, p, c.accel, 11.0, 5.05, 1.75, p.accent, 0.45, 10);
    s.addText(c.s9.b.map((t) => `•  ${t}`).join('\n'), { x: MX, y: 5.62, w: 12.1, h: 1.25, fontFace: FONT, fontSize: 14, color: p.text, valign: 'top', margin: 0, paraSpaceAfter: 3 });
  };
  const sim = (s: Slide, p: Pal, y0: number, scale = 1) => {
    const bw = 2.9 * scale, bh = 0.85 * scale, x1 = MX + 0.2, x2 = x1 + bw + 1.0 * scale, x3 = x2 + bw + 1.0 * scale;
    chip(s, p, c.s10.lanes[0], x1, y0, bw, p.warn, bh, 14); chip(s, p, c.s10.lanes[1], x2, y0, bw, p.text2, bh, 14); chip(s, p, c.s10.lanes[2], x3, y0, bw, p.accent, bh, 14);
    arrow(s, p, x1 + bw + 0.05, y0 + bh / 2, 1.0 * scale - 0.1); arrow(s, p, x2 + bw + 0.05, y0 + bh / 2, 1.0 * scale - 0.1);
    // forbidden direct path: truth -> engine
    const ay = y0 - 0.45 * scale;
    s.addShape('line', { x: x1 + bw / 2, y: ay, w: x3 + bw / 2 - (x1 + bw / 2), h: 0, line: { color: p.crit, width: 1.75, dashType: 'dash', endArrowType: 'triangle' } });
    s.addText('✕', { x: x2 + bw / 2 - 0.3, y: ay - 0.33, w: 0.6, h: 0.6, fontFace: FONT, fontSize: 26, bold: true, color: p.crit, align: 'center', valign: 'middle', margin: 0 });
    const y2 = y0 + bh + 0.75 * scale;
    chip(s, p, c.s10.lanes[4], x1, y2, bw + 1.0 * scale + bw, p.warn, bh, 14); chip(s, p, c.s10.lanes[3], x3, y2, bw, p.ok, bh, 14);
    arrow(s, p, x2 + bw + 0.05, y2 + bh / 2, 1.0 * scale - 0.1);
    s.addShape('line', { x: x3 + bw / 2, y: y0 + bh + 0.03, w: 0, h: 0.7 * scale, line: { color: p.text2, width: 1.5, endArrowType: 'triangle' } });
    return y2 + bh;
  };
  const s10 = () => {
    const { s, p } = base(false, c.s10.h, c.s10.n);
    s.addText(c.s10.line, { x: MX, y: 1.4, w: 12, h: 0.5, fontFace: FONT, fontSize: 22, bold: true, color: p.accent, margin: 0 });
    const yEnd = sim(s, p, 2.75);
    c.s10.adv.forEach((t, i) => chip(s, p, t, MX + 0.2 + i * 3.95, yEnd + 0.55, 3.7, p.text2, 0.5, 14));
  };
  const resultRows = (): string[][] => {
    const e = ev.exposure, o = ev.operations, x = ev.exposureEvents, en = lang === 'en';
    return [c.s11.cols,
      [c.s11.rows[0], en ? `Identical observations and events for the same scenario + seed (1×, 10×, 60×)` : `Aynı senaryo + tohumda özdeş gözlem ve olaylar (1×, 10×, 60×)`, en ? 'unit test · evaluation' : 'birim testi · değerlendirme'],
      [c.s11.rows[1], en ? 'Reloads, runs, inspects a case and exports with the network blocked; run recovered after reload' : 'Ağ kapalıyken yeniden yüklenir, çalışır, vaka incelenir, dışa aktarılır; koşu geri yüklenir', en ? 'browser e2e' : 'tarayıcı e2e'],
      [c.s11.rows[2], en ? 'SIM-11: contact fault withholds the muscle comparison while the exposure event stays open' : 'SIM-11: temas arızası kas karşılaştırmasını geri çeker, maruziyet olayı açık kalır', en ? 'unit + browser e2e' : 'birim + tarayıcı e2e'],
      [c.s11.rows[3], en ? `${o.outageMs / 1000} s outage survived; ${o.duplicatesInjected} duplicate deliveries ignored; reply linked to its revision` : `${o.outageMs / 1000} sn kesinti aşıldı; ${o.duplicatesInjected} çift teslim ayıklandı; yanıt revizyonuna bağlı`, en ? 'unit + e2e + real HTTP' : 'birim + e2e + gerçek HTTP'],
      [c.s11.rows[4], en ? `MAE ${e['aligned-quality-aware'].mae} ± ${e['aligned-quality-aware'].maeSd} ppm (candidate) vs ${e['phase-gated'].mae} (phase-gated), ${e['local-window'].mae} (local mean), ${e.cabin.mae} (cabin); best method in ${pct(ev.exposureCandidateBestShare)} of runs` : `MAE ${e['aligned-quality-aware'].mae} ± ${e['aligned-quality-aware'].maeSd} ppm (aday); faz kapılı ${e['phase-gated'].mae}, yerel ortalama ${e['local-window'].mae}, kabin ${e.cabin.mae}; koşuların ${pct(ev.exposureCandidateBestShare)}'inde en iyi`, en ? `held-out, n = ${e.cabin.n} breaths` : `ayrılmış, n = ${e.cabin.n} nefes`],
      [c.s11.rows[5], en ? `Slow sensor: estimate withheld in ${pct(1 - x.slowSensorCoverage)} of breaths, 0 false exposure events; load mismatch: comparison refused in ${pct(ev.exercise['SIM-09'].methods['matched-conditioned'].abstained)}` : `Yavaş sensör: nefeslerin ${pct(1 - x.slowSensorCoverage)}'inde kestirim verilmedi, 0 yanlış olay; yük uyumsuzluğu: karşılaştırma ${pct(ev.exercise['SIM-09'].methods['matched-conditioned'].abstained)} reddedildi`, en ? 'held-out evaluation' : 'ayrılmış değerlendirme'],
    ];
  };
  const s11 = () => {
    const { s, p } = base(false, c.s11.h, c.s11.n);
    table(s, p, resultRows(), MX, 1.5, [3.0, 6.9, 2.23], 13, 0.6);
    s.addText(`${c.s11.note}  ·  ${tests.unit} ${lang === 'en' ? 'unit/integration tests' : 'birim/bütünleşim testi'} · ${tests.e2ePerEngine} ${lang === 'en' ? 'browser tests × 3 engines' : 'tarayıcı testi × 3 motor'} · ${ev.runs} ${lang === 'en' ? 'evaluation runs' : 'değerlendirme koşusu'}`, { x: MX, y: 6.15, w: 12.1, h: 0.7, fontFace: FONT, fontSize: 13, color: p.text2, valign: 'top', margin: 0 });
  };
  const s12 = () => {
    const { s, p } = base(true, c.s12.h, c.s12.n);
    s.addText(c.s12.line, { x: MX, y: 1.4, w: 12.1, h: 0.5, fontFace: FONT, fontSize: 20, bold: true, color: p.accent, margin: 0 });
    const w = 3.9;
    ['overview-light', 'overview-ar', 'overview-tr'].forEach((f, i) => shot(s, p, cap(f), MX + i * (w + 0.2), 2.15, w, c.s12.caps[i]));
    c.s12.entry.forEach((t, i) => chip(s, p, t, MX + i * 3.05, 4.85, 2.85, p.accent, 0.5, 13));
    s.addText(lang === 'en' ? 'All integrations: emulator-verified only · Bluetooth: not implemented · Camera: local preview only' : 'Tüm entegrasyonlar: yalnızca emülatörle doğrulandı · Bluetooth: uygulanmadı · Kamera: yalnızca yerel önizleme', { x: MX, y: 5.6, w: 12.1, h: 0.5, fontFace: FONT, fontSize: 15, color: p.text2, margin: 0 });
  };
  const s13 = () => {
    const { s, p } = base(false, c.s13.h, c.s13.n);
    c.s13.steps.forEach((t, i) => {
      const x = MX + i * 2.45, y = 4.25 - i * 0.62, h = 0.95 + i * 0.62;
      s.addShape('rect', { x, y, w: 2.3, h, fill: { color: i === 0 ? p.accent : p.surface }, line: { color: i === 0 ? p.accent : p.border, width: 1, dashType: i === 0 ? 'solid' : 'dash' } });
      s.addText(t, { x: x + 0.1, y: y + 0.08, w: 2.1, h: 0.85, fontFace: FONT, fontSize: 14, bold: i === 0, color: i === 0 ? 'FFFFFF' : p.text2, valign: 'top', margin: 0 });
    });
    s.addText(`▲ ${c.s13.here}`, { x: MX, y: 5.28, w: 2.3, h: 0.35, fontFace: FONT, fontSize: 14, bold: true, color: p.accent, align: 'center', margin: 0 });
    c.s13.risks.forEach((t, i) => chip(s, p, t, MX + i * 4.1, 5.85, 3.9, p.warn, 0.55, 12));
  };
  const s14 = () => {
    const { s, p } = base(true, null, c.s14.n);
    s.addText(c.s14.h, { x: MX, y: 0.9, w: 5.6, h: 2.6, fontFace: FONT, fontSize: 34, bold: true, color: p.text, valign: 'top', margin: 0 });
    s.addText(c.s14.sub, { x: MX, y: 3.6, w: 5.4, h: 0.9, fontFace: FONT, fontSize: 20, color: p.text2, valign: 'top', margin: 0 });
    s.addText(REPO, { x: MX, y: 4.7, w: 5.6, h: 0.5, fontFace: MONO, fontSize: 18, color: p.accent, margin: 0, hyperlink: { url: `https://${REPO}` } });
    s.addShape('rect', { x: MX, y: 5.32, w: 0.07, h: 0.98, fill: { color: p.accent }, line: { color: p.accent, width: 0 } });
    s.addText(TEAM_L[lang].team, { x: MX + 0.22, y: 5.28, w: 5.2, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: p.accent, margin: 0 });
    s.addText([
      { text: TEAM.captain, options: { bold: true, color: p.text } }, { text: ` — ${TEAM_L[lang].captain}`, options: { color: p.text2, breakLine: true } },
      { text: TEAM.members.join(' · '), options: { color: p.text } }, { text: ` — ${TEAM_L[lang].members}`, options: { color: p.text2 } },
    ], { x: MX + 0.22, y: 5.58, w: 5.3, h: 0.75, fontFace: FONT, fontSize: 16, valign: 'top', margin: 0 });
    s.addText(c.s14.credit, { x: MX, y: 6.42, w: 5.6, h: 0.45, fontFace: FONT, fontSize: 11, color: p.text2, valign: 'top', margin: 0 });
    shot(s, p, cap('case-reply-dark', 'case-detail-tr'), 6.5, 1.55, 6.25, `SIM-11 · ${c.simLabel}`);
  };
  const sModules = () => {
    const { s, p } = base(false, c.m.h, c.m.n);
    const files = ['exposure-light', 'integrity-light', 'exercise-matched-light'], w = 3.9;
    c.m.cards.forEach(([h, b], i) => {
      const x = MX + i * (w + 0.2);
      shot(s, p, cap(files[i]), x, 1.55, w);
      s.addShape('roundRect', { x, y: 3.95, w, h: 2.4, fill: { color: p.surface }, line: { color: p.border, width: 1 }, rectRadius: 0.08 });
      s.addText(h, { x: x + 0.25, y: 4.08, w: w - 0.5, h: 0.8, fontFace: FONT, fontSize: 18, bold: true, color: p.accent, valign: 'top', margin: 0 });
      s.addText(b, { x: x + 0.25, y: 4.95, w: w - 0.5, h: 1.3, fontFace: FONT, fontSize: 15, color: p.text, valign: 'top', margin: 0 });
    });
  };
  const sEvidence = () => {
    const { s, p } = base(false, c.e.h, c.e.n);
    sim(s, p, 2.3, 0.62);
    const r = resultRows();
    table(s, p, [r[0], r[1], r[3], r[5], r[6]], MX, 4.4, [3.0, 6.9, 2.23], 11, 0.4);
  };
  const sA = () => {
    const { s, p } = base(false, c.a.h, c.a.n);
    const b = c.a.boxes, bw = 2.75, y = 1.6;
    [0, 1, 2, 3].forEach((i) => { chip(s, p, b[i], MX + i * 3.11, y, bw, i === 0 ? p.warn : p.accent, 0.9, 13); if (i < 3) arrow(s, p, MX + i * 3.11 + bw + 0.03, y + 0.45, 0.3); });
    chip(s, p, b[4], MX + 9.33, y + 1.35, bw, p.text2, 0.8, 13); chip(s, p, b[5], MX + 6.22, y + 1.35, bw, p.ok, 0.8, 13); chip(s, p, b[6], MX, y + 1.35, bw + 3.11, p.warn, 0.8, 13);
    s.addShape('line', { x: MX + 9.33 + bw / 2, y: y + 0.93, w: 0, h: 0.4, line: { color: p.text2, width: 1.5, endArrowType: 'triangle' } });
    s.addShape('line', { x: MX + 6.22 + bw + 0.03, y: y + 1.75, w: 0.3, h: 0, line: { color: p.text2, width: 1.5, beginArrowType: 'triangle' } });
    s.addShape('line', { x: MX + bw / 2, y: y + 0.93, w: 0, h: 0.4, line: { color: p.warn, width: 1.5, dashType: 'dash', endArrowType: 'triangle' } });
    c.a.labels.forEach((t, i) => { s.addShape('rect', { x: MX, y: 4.25 + i * 0.52 + 0.08, w: 0.07, h: 0.3, fill: { color: p.accent }, line: { color: p.accent, width: 0 } }); s.addText(t, { x: MX + 0.2, y: 4.25 + i * 0.52, w: 11.8, h: 0.46, fontFace: FONT, fontSize: 15, color: p.text, valign: 'middle', margin: 0 }); });
  };
  const sB = () => {
    const { s, p } = base(false, c.b.h, c.b.n);
    s.addText(c.b.t1, { x: MX, y: 1.4, w: 6, h: 0.35, fontFace: FONT, fontSize: 14, bold: true, color: p.accent, margin: 0 });
    const m5 = ev.integrity['SIM-05'].methods;
    table(s, p, [c.b.cols1, ...Object.keys(m5).map((k) => [c.meth[k], m5[k].featureErr === null ? '—' : String(m5[k].featureErr), pct(m5[k].coverage), m5[k].flaggedChange === null ? '—' : pct(m5[k].flaggedChange)])], MX, 1.8, [2.75, 1.2, 0.95, 1.2], 11, 0.4);
    s.addText(c.b.t2, { x: 7.0, y: 1.4, w: 6, h: 0.35, fontFace: FONT, fontSize: 14, bold: true, color: p.accent, margin: 0 });
    const cell = (m: { flagged: number | null; abstained: number }) => (m.abstained >= 0.995 ? (lang === 'en' ? 'abst.' : 'yok') : `${pct(m.flagged)}`);
    table(s, p, [c.b.cols2, ...Object.keys(ev.exercise).map((sc) => { const m = ev.exercise[sc].methods; return [`${sc} ${c.b.sc[sc]}`, cell(m.unconditioned), cell(m['matched-conditioned']), cell(m['fluid-aware']), cell(m['ablation-no-integrity'])]; })], 7.0, 1.8, [2.05, 0.95, 0.95, 0.95, 0.83], 11, 0.4);
    s.addText(c.b.note, { x: MX, y: 4.55, w: 12.1, h: 0.6, fontFace: FONT, fontSize: 12, color: p.text2, valign: 'top', margin: 0 });
    const e = ev.exposurePerScenario;
    table(s, p, [[lang === 'en' ? 'Exposure MAE (ppm)' : 'Maruziyet MAE (ppm)', ...Object.keys(e)], ...['cabin', 'local-window', 'phase-gated', 'aligned-quality-aware'].map((k) => [c.meth[k], ...Object.keys(e).map((sc) => String(e[sc][k].mae))])], MX, 5.15, [3.3, 1.2, 1.2, 1.2, 1.2], 11, 0.32);
  };
  const sC = () => {
    const { s, p } = base(false, c.c.h, c.c.n);
    c.c.claims.forEach(([t, st], i) => {
      const y = 1.5 + i * 0.5;
      chip(s, p, st === 'ok' ? c.c.ok : c.c.no, MX, y, 2.7, st === 'ok' ? p.ok : p.crit, 0.4, 11);
      s.addText(t, { x: MX + 2.9, y, w: 9.2, h: 0.4, fontFace: FONT, fontSize: 15, color: p.text, valign: 'middle', margin: 0 });
    });
    s.addText([
      { text: 'S01–S02 CSA Bio-Monitor / Artemis · ', options: { hyperlink: { url: 'https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp' } } },
      { text: 'S03 MagIC-Space · ', options: { hyperlink: { url: 'https://www.sciencedirect.com/science/article/pii/S0924424717321969' } } },
      { text: 'S05 NASA CO₂ risk record · ', options: { hyperlink: { url: 'https://www.nasa.gov/wp-content/uploads/2025/09/hsrb-co2-risk-risk-record-rev-d-1-web.pdf' } } },
      { text: 'S06 NASA inspired CO₂ methods · ', options: { hyperlink: { url: 'https://ntrs.nasa.gov/citations/20180006659' } } },
      { text: 'S07 PVDF e-tattoo · ', options: { hyperlink: { url: 'https://advanced.onlinelibrary.wiley.com/doi/10.1002/advs.201900290' } } },
      { text: 'S09 MMG reliability · ', options: { hyperlink: { url: 'https://journals.sagepub.com/doi/pdf/10.1177/2055668320916116' } } },
      { text: 'S11 Segmental impedance · ', options: { hyperlink: { url: 'https://www.mdpi.com/1424-8220/23/5/2793' } } },
      { text: 'S15 NASA CHP-IDSP · ', options: { hyperlink: { url: 'https://ntrs.nasa.gov/citations/20250000330' } } },
      { text: 'S16 NASA xEHR', options: { hyperlink: { url: 'https://ntrs.nasa.gov/citations/20230003216' } } },
    ], { x: MX, y: 5.2, w: 12.1, h: 0.9, fontFace: FONT, fontSize: 12, color: p.accent, valign: 'top', margin: 0 });
    s.addText(lang === 'en' ? 'Full source ledger S01–S20 with boundaries: Evidence Library in the app and docs/. Screenshots: deliverables/captures (capture-manifest.json).' : 'Sınırlarıyla tam kaynak listesi S01–S20: uygulamadaki Kanıt Kütüphanesi ve docs/. Ekran görüntüleri: deliverables/captures (capture-manifest.json).', { x: MX, y: 6.1, w: 12.1, h: 0.6, fontFace: FONT, fontSize: 12, color: p.text2, valign: 'top', margin: 0 });
  };

  if (short) [s1, s2, s4, sModules, s8, sEvidence, s14].forEach((f) => f());
  else [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12, s13, s14, sA, sB, sC].forEach((f) => f());
  return { pptx, notes };
}

const FILES: Record<Lang, [string, string]> = { en: ['ASTER_Product_Overview', 'ASTER_Short_Pitch'], tr: ['ASTER_Urun_Sunumu_TR', 'ASTER_Kisa_Sunum_TR'] };
for (const lang of ['en', 'tr'] as Lang[]) {
  let notesMd = `# ASTER — ${lang === 'en' ? 'Speaker notes' : 'Konuşmacı notları'}\n\n`;
  for (const short of [false, true]) {
    const { pptx, notes } = deck(lang, short);
    const name = FILES[lang][short ? 1 : 0];
    await pptx.writeFile({ fileName: join(OUT, `${name}.pptx`) });
    notesMd += `## ${name}${short ? (lang === 'en' ? ' (seven-slide short pitch: slides 1, 2, 4, combined 5–7, 8, combined 10–11, 14 of the main deck)' : ' (yedi slaytlık kısa sunum: ana sunumun 1, 2, 4, birleşik 5–7, 8, birleşik 10–11 ve 14. slaytları)') : ''}\n\n${notes.join('\n')}\n`;
    console.log(`${name}.pptx — ${notes.length} slides`);
  }
  writeFileSync(join(OUT, lang === 'en' ? 'speaker-notes.md' : 'konusmaci-notlari-TR.md'), notesMd);
}
writeFileSync(join(OUT, 'asset-manifest.json'), JSON.stringify({
  generatedAtUtc: new Date().toISOString(), authoringSource: ['media/presentation/content.ts', 'scripts/slides-build.ts'], fonts: 'Segoe UI, Consolas (system fonts; no font files embedded or redistributed)',
  screenshots: [...assets].sort().map((f) => ({ file: `deliverables/captures/${f}`, provenance: 'Captured from the running ASTER build by tests/capture/capture.spec.ts (see capture-manifest.json); simulated data', licence: 'own work' })),
  diagrams: 'Original editable shapes drawn by the build script; no third-party artwork, logos, stock imagery or NASA insignia.',
  numbers: ['deliverables/reports/evaluation.json', 'deliverables/reports/test-summary.json'],
}, null, 1));
