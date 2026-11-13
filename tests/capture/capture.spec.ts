/**
 * Product capture for slides and video: drives the REAL built application with a fixed scenario and seed.
 * Every value in every capture comes from the running app; nothing is painted in afterwards.
 */
import { mkdirSync, writeFileSync, renameSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { loadScenario, run, setPrefs, waitMet } from '../e2e/helpers';

const OUT = join(process.cwd(), 'deliverables/captures');
const shots: Record<string, unknown>[] = [];
mkdirSync(OUT, { recursive: true });

async function shot(page: Page, name: string, meta: Record<string, unknown>, opts: { fullPage?: boolean; clip?: { x: number; y: number; width: number; height: number } } = {}): Promise<void> {
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(OUT, `${name}.png`), ...opts });
  shots.push({ file: `${name}.png`, met: await page.getByTestId('met').innerText().catch(() => null), url: page.url().replace(/^.*#/, '#'), dataOrigin: 'simulated', ...meta });
}
/** Change preferences, reload (the run is recovered paused at 1×) and restore 60× playback. */
async function relo(page: Page, theme: string, locale = 'en'): Promise<void> {
  await prefs(page, theme, locale); await page.reload();
  await page.getByTestId('speed').selectOption('1'); // also waits until the run has been recovered
  await run(page); await page.waitForTimeout(350); await run(page); // a short 1× step clears the "recovered" notice
  await page.getByTestId('speed').selectOption('60');
}
const prefs = (page: Page, theme: string, locale = 'en', extra: Record<string, unknown> = {}) => setPrefs(page, { theme, locale, reduceMotion: true, ...extra });

test('stills: combined scenario SIM-11 seed 11', async ({ page }) => {
  const base = { scenario: 'SIM-11', seed: 11, viewport: '1600x900@1.5x', browser: 'Chrome (Playwright channel)' };
  await page.goto('/');
  await prefs(page, 'dark');
  await page.reload();
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, 'landing-dark.png') });
  shots.push({ file: 'landing-dark.png', url: '#/', ...base });
  await loadScenario(page, 'SIM-11', 11);
  await run(page);
  await waitMet(page, '02:20');
  await run(page);
  await page.goto('/#/mission/exposure'); await shot(page, 'exposure-dark', { ...base, theme: 'dark' });
  await relo(page, 'light'); await shot(page, 'exposure-light', { ...base, theme: 'light' });
  await page.locator('.card', { hasText: 'Measured CO₂ and per-breath estimate' }).scrollIntoViewIfNeeded(); await shot(page, 'exposure-gas-light', { ...base, theme: 'light' });
  await relo(page, 'dark');
  await run(page); await waitMet(page, '03:20'); await run(page);
  await page.goto('/#/mission/overview'); await shot(page, 'overview-dark', { ...base, theme: 'dark' });
  await page.goto('/#/mission/integrity'); await shot(page, 'integrity-dark', { ...base, theme: 'dark' }); await shot(page, 'integrity-dark-full', { ...base, theme: 'dark' }, { fullPage: true });
  await relo(page, 'light'); await page.goto('/#/mission/integrity'); await shot(page, 'integrity-light', { ...base, theme: 'light', note: 'during the contact slip' });
  await page.goto('/#/mission/overview'); await shot(page, 'overview-light', { ...base, theme: 'light' });
  await relo(page, 'dark');
  await page.goto('/#/mission/exercise'); await shot(page, 'exercise-withheld-dark', { ...base, theme: 'dark' });
  await page.goto('/#/mission/cases'); await shot(page, 'cases-queued-dark', { ...base, theme: 'dark', note: 'link outage: package queued locally' });
  await page.getByTestId('event-INT-CON-01').first().click(); await shot(page, 'case-detail-dark', { ...base, theme: 'dark' });
  await page.goto('/#/ground'); await shot(page, 'ground-empty-dark', { ...base, theme: 'dark', note: 'nothing delivered during outage' });
  await page.getByTestId('speed').selectOption('10'); // slower playback: pause points stay well inside the 6-minute scenario
  await run(page); await waitMet(page, '04:25'); await run(page);
  await page.goto('/#/ground');
  await page.getByTestId('ground-case').filter({ hasText: 'Sensor contact degraded' }).first().click();
  await page.getByTestId('reply-text').fill('Package received. Please confirm garment fit at the thigh sensor and send 60 s of contact force after the next calibration.');
  await shot(page, 'ground-received-dark', { ...base, theme: 'dark' });
  await shot(page, 'ground-received-dark-full', { ...base, theme: 'dark' }, { fullPage: true });
  await page.getByTestId('reply-send').click();
  await run(page); await waitMet(page, '05:10'); await run(page);
  await page.goto('/#/mission/cases'); await page.getByTestId('event-INT-CON-01').first().click();
  await page.getByTestId('reply').scrollIntoViewIfNeeded();
  await shot(page, 'case-reply-dark', { ...base, theme: 'dark', note: 'ground reply linked to its case revision' });
  await shot(page, 'case-reply-dark-full', { ...base, theme: 'dark' }, { fullPage: true });
  await page.goto('/#/settings'); await page.getByTestId('role-select').selectOption('researcher');
  await page.goto('/#/lab'); await page.getByTestId('truth-toggle').check(); await page.getByTestId('truth-toggle').scrollIntoViewIfNeeded();
  await shot(page, 'lab-evaluation-dark', { ...base, theme: 'dark', note: 'researcher-only hidden-truth view' });
  await page.goto('/#/lab'); await shot(page, 'lab-gallery-dark', { ...base, theme: 'dark' });
  await page.goto('/#/evidence'); await shot(page, 'evidence-dark', { ...base, theme: 'dark' });
  await page.goto('/#/devices'); await shot(page, 'devices-dark', { ...base, theme: 'dark' });
  // light theme + localized layouts of the same run
  for (const l of ['tr', 'ar', 'ja', 'de']) { await relo(page, l === 'ar' ? 'light' : 'dark', l); await page.goto('/#/mission/overview'); await shot(page, `overview-${l}`, { ...base, locale: l }); }
  await relo(page, 'dark', 'tr');
  for (const r of ['exposure', 'integrity', 'cases']) { await page.goto(`/#/mission/${r}`); await shot(page, `${r}-tr`, { ...base, locale: 'tr', theme: 'dark' }); }
  await page.goto('/#/mission/cases'); await page.getByTestId('event-INT-CON-01').first().click(); await shot(page, 'case-detail-tr', { ...base, locale: 'tr', theme: 'dark' });
  await page.goto('/#/ground'); await shot(page, 'ground-tr', { ...base, locale: 'tr', theme: 'dark' });
  await prefs(page, 'dark');
});

test('stills: matched exercise comparison SIM-08 seed 8', async ({ page }) => {
  const base = { scenario: 'SIM-08', seed: 8, viewport: '1600x900@1.5x' };
  await page.goto('/'); await prefs(page, 'light'); await page.reload();
  await loadScenario(page, 'SIM-08', 8);
  await run(page); await waitMet(page, '02:40'); await run(page);
  await page.goto('/#/mission/exercise'); await shot(page, 'exercise-matched-light', { ...base, theme: 'light' }); await shot(page, 'exercise-matched-light-full', { ...base, theme: 'light' }, { fullPage: true });
  await relo(page, 'dark'); await shot(page, 'exercise-matched-dark', { ...base, theme: 'dark' });
  await relo(page, 'dark', 'tr'); await shot(page, 'exercise-matched-tr', { ...base, theme: 'dark', locale: 'tr' });
  await prefs(page, 'dark');
});

test('footage: continuous SIM-11 run recorded from the real product', async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: join(OUT, 'video-tmp'), size: { width: 1920, height: 1080 } } });
  const page = await ctx.newPage();
  await page.goto('/');
  await prefs(page, 'dark'); await page.reload();
  await page.waitForTimeout(2500);
  await page.getByTestId('start-demo').click();
  await page.waitForTimeout(1200);
  await page.getByTestId('speed').selectOption('10');
  await run(page);
  const visit = async (route: string, ms: number) => { await page.goto(`/#${route}`); await page.waitForTimeout(ms); };
  await visit('/mission/overview', 5000);
  await waitMet(page, '01:55');
  await visit('/mission/exposure', 7000);
  await page.mouse.move(900, 520); await page.mouse.move(1200, 520, { steps: 40 }); await page.waitForTimeout(1500);
  await waitMet(page, '03:00');
  await visit('/mission/integrity', 9000);
  await visit('/mission/exercise', 6000);
  await visit('/mission/cases', 2500);
  await page.getByTestId('event-INT-CON-01').first().click(); await page.waitForTimeout(6000);
  await visit('/ground', 3000);
  await waitMet(page, '04:22');
  await page.waitForTimeout(2500);
  await page.getByTestId('reply-sim').click(); await page.waitForTimeout(4500);
  await visit('/mission/cases', 1500);
  await page.getByTestId('event-INT-CON-01').first().click(); await page.waitForTimeout(5000);
  await visit('/lab', 4000);
  const video = page.video();
  await ctx.close();
  const p = await video!.path();
  const dest = join(OUT, 'ASTER_product_capture_SIM-11_seed11_1080p.webm');
  if (existsSync(p)) renameSync(p, dest);
  shots.push({ file: 'ASTER_product_capture_SIM-11_seed11_1080p.webm', scenario: 'SIM-11', seed: 11, viewport: '1920x1080', playback: '10× accelerated simulation (labelled in the product strip)', dataOrigin: 'simulated', note: 'Silent raw screen recording of the real application; no post-production.' });
});

test.afterAll(() => {
  const file = join(OUT, 'capture-manifest.json');
  const prev = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')).captures as Record<string, unknown>[]) : [];
  const merged = [...prev.filter((p) => !shots.some((s) => s.file === p.file)), ...shots];
  writeFileSync(file, JSON.stringify({ capturedAtUtc: new Date().toISOString(), appBuild: 'dist/ (vite build of the working tree)', codeCommit: 'local-uncommitted', locale: 'en unless stated', captures: merged }, null, 1));
});
