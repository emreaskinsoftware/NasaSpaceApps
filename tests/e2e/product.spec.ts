import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { autoAccept, go, loadScenario, met, run, setPrefs, trackErrors, waitMet } from './helpers';

test('demo launches in two actions; three modules produce inspectable, evidence-linked output (SIM-11)', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByText('Research prototype').first()).toBeVisible();
  await page.getByTestId('start-demo').click(); // action 1
  await page.getByTestId('speed').selectOption('60');
  await run(page); // action 2
  await expect(page.getByTestId('event-EXP-INH-01').first()).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId('event-INT-CON-01').first()).toBeVisible({ timeout: 40_000 });
  await waitMet(page, '03:30'); // 40 s after the slip: every repetition in the comparison window was recorded with degraded contact
  await run(page);
  await go(page, '/mission/integrity');
  await expect(page.getByTestId('int-decision')).not.toHaveText('Accepted');
  await go(page, '/mission/exercise');
  await expect(page.getByTestId('cmp-state')).toHaveText('Not comparable'); // dependent interpretation withheld
  await go(page, '/mission/exposure');
  await expect(page.getByText('Experimental estimate').first()).toBeVisible(); // independent channel still available
  await page.getByTestId('method-select').selectOption('phase-gated');
  await page.getByRole('button', { name: 'Inspect' }).first().click();
  await expect(page.getByRole('dialog')).toContainText('not a volume-weighted dose');
  await page.keyboard.press('Escape');
  await go(page, '/mission/cases');
  await page.getByTestId('event-INT-CON-01').first().click();
  await expect(page.getByText('INT-CON-01 v1.0.0')).toBeVisible();
  await expect(page.getByText('Operational procedure not validated in this prototype', { exact: false })).toBeVisible();
  const rev = await page.getByTestId('revision').innerText();
  await page.getByTestId('ack').click();
  await expect(page.getByTestId('revision')).not.toHaveText(rev);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  expect((await dl).suggestedFilename()).toMatch(/aster-case-INT-CON-01-r\d+\.json/);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('ground round trip: outage keeps the case local, delivery is deduplicated, the reply is linked to its revision (SIM-12)', async ({ page }) => {
  await loadScenario(page, 'SIM-12');
  await run(page);
  await go(page, '/mission/cases');
  await expect(page.locator('[data-state="queued"]').first()).toBeVisible({ timeout: 30_000 });
  await go(page, '/ground');
  await expect(page.getByTestId('ground-count')).toHaveText('0');
  await expect(page.getByTestId('link-state')).toHaveText('Unavailable');
  await waitMet(page, '02:10');
  await expect(page.getByTestId('ground-case').first()).toBeVisible({ timeout: 20_000 });
  await run(page);
  await expect(page.getByText('duplicate deliveries ignored').first()).toBeVisible();
  await expect(page.getByText('Content hash verified')).toBeVisible();
  await page.getByTestId('reply-text').fill('Confirm garment fit <img src=x onerror="window.__xss=1"> and resend contact force.');
  await page.getByTestId('reply-send').click();
  await run(page);
  await go(page, '/mission/cases');
  await page.getByTestId('event-INT-CON-01').first().click();
  await expect(page.getByTestId('reply')).toContainText('Confirm garment fit <img src=x', { timeout: 30_000 }); // rendered as inert text
  await expect(page.getByTestId('reply')).toContainText('refers to revision 1');
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  expect(await page.locator('[data-testid="reply"] img').count()).toBe(0);
  await expect(page.locator('[data-state="acknowledged"]').first()).toBeVisible();
});

test('late reply to a superseded revision is shown as stale next to the newer local state (SIM-13)', async ({ page }) => {
  await loadScenario(page, 'SIM-13');
  await run(page);
  await go(page, '/ground');
  await expect(page.getByTestId('ground-case').first()).toBeVisible({ timeout: 40_000 });
  await page.getByTestId('reply-sim').click();
  await go(page, '/mission/cases');
  await page.getByTestId('event-INT-CON-01').first().click();
  await expect(page.getByTestId('stale')).toContainText('refers to revision 1', { timeout: 40_000 });
  await expect(page.getByTestId('reply')).toContainText('Simulated responder');
});

test('provisioned app reloads and runs with the network blocked; no request ever leaves the origin', async ({ page, context }) => {
  const foreign: string[] = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (u.host !== '127.0.0.1:4173' && !['data:', 'blob:'].includes(u.protocol)) foreign.push(r.url()); });
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await go(page, '/settings');
  await page.reload();
  await expect(page.getByTestId('sw-state')).toContainText('Provisioned', { timeout: 20_000 });
  await context.setOffline(true);
  await page.reload();
  await loadScenario(page, 'SIM-05', 3);
  await run(page);
  await go(page, '/mission/cases');
  await page.getByTestId('event-INT-CON-01').first().click({ timeout: 40_000 });
  await expect(page.getByText('INT-CON-01 v1.0.0')).toBeVisible();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  expect((await dl).suggestedFilename()).toContain('aster-case');
  await run(page); // pause, then reload while still offline
  const before = await met(page);
  await page.waitForTimeout(2600);
  await page.reload();
  await expect(page.getByText('Run recovered from local storage', { exact: false })).toBeVisible({ timeout: 20_000 });
  expect(Math.abs((await met(page)) - before)).toBeLessThanOrEqual(1);
  await go(page, '/mission/cases');
  await expect(page.getByTestId('event-INT-CON-01').first()).toBeVisible();
  expect(foreign).toEqual([]);
});

test('simulated storage failure is visible and recoverable (SIM-15)', async ({ page }) => {
  await loadScenario(page, 'SIM-15', 3);
  await run(page);
  await expect(page.getByTestId('persist-banner')).toContainText('Persistence failure', { timeout: 40_000 });
  await expect(page.getByTestId('persist-banner')).toContainText('injected by the scenario');
  await page.getByTestId('persist-banner').getByRole('button').click();
  await expect(page.getByTestId('persist-banner')).toHaveCount(0);
});

test('lab: fault injection, read-only historical inspection, fork creates a new run, truth is researcher-only', async ({ page }) => {
  await loadScenario(page, 'SIM-01', 2, 10); // 10×: the 3-minute scenario must still be running when the fault is injected
  await run(page);
  await waitMet(page, '00:40');
  await go(page, '/lab');
  await page.getByTestId('fault-contact-0.5').click();
  await go(page, '/mission/overview');
  await expect(page.getByTestId('event-INT-CON-01').first()).toBeVisible({ timeout: 30_000 });
  await run(page);
  await go(page, '/lab');
  await expect(page.getByTestId('truth-toggle')).toHaveCount(0); // hidden in the default (medical officer) role
  await expect(page.getByTestId('eval-table')).toHaveCount(0);
  const runId = await page.getByTestId('run-id').innerText();
  await page.getByTestId('scrub').fill('30000');
  await expect(page.getByTestId('inspect-banner')).toContainText('read-only');
  autoAccept(page);
  await page.getByRole('button', { name: 'Resume from here (new run)' }).click();
  await expect(page.getByTestId('inspect-banner')).toHaveCount(0);
  await expect(page.getByTestId('run-id')).not.toHaveText(runId);
  await expect(page.getByTestId('met')).toContainText('00:30');
  await expect(page.getByText('Preserved').first()).toBeVisible();
  await go(page, '/settings');
  await page.getByTestId('role-select').selectOption('researcher');
  await go(page, '/lab');
  await page.getByTestId('truth-toggle').check();
  await expect(page.getByTestId('eval-table')).toContainText('Aligned, quality-aware');
});

test('theme and locale persist across reload; Arabic mirrors layout but not the time axis; navigation is keyboard reachable', async ({ page, browserName }) => {
  const TAB = browserName === 'webkit' ? 'Alt+Tab' : 'Tab'; // Safari moves focus to links with Option+Tab by default
  await go(page, '/settings');
  await page.locator('main').getByLabel('Theme').selectOption('light');
  await page.locator('main').getByLabel('Language').selectOption('ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await go(page, '/lab');
  await page.getByTestId('scenario-SIM-02').click();
  autoAccept(page);
  await page.getByTestId('load-scenario').click();
  await run(page);
  await go(page, '/mission/exposure');
  await expect(page.locator('.chart').first()).toHaveAttribute('dir', 'ltr');
  for (const l of ['de', 'ja', 'tr', 'fr', 'es']) {
    await setPrefs(page, { theme: 'dark', locale: l });
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', l);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${l} overflows`).toBe(true);
  }
  await setPrefs(page, { theme: 'dark', locale: 'en' });
  await go(page, '/mission/overview');
  await page.reload();
  // Playwright's WebKit build does not move focus to links with Tab/Option+Tab; keyboard traversal is verified in Chrome and Firefox only.
  if (browserName === 'webkit') return;
  await page.keyboard.press(TAB);
  await expect(page.locator('.skip')).toBeFocused();
  const seen = new Set<string>();
  for (let i = 0; i < 45; i++) { await page.keyboard.press(TAB); const h = await page.evaluate(() => document.activeElement?.getAttribute('href') ?? ''); if (h.startsWith('#/')) seen.add(h); }
  for (const r of ['#/mission/overview', '#/mission/exposure', '#/mission/integrity', '#/mission/exercise', '#/mission/cases', '#/ground', '#/lab', '#/devices', '#/evidence', '#/settings']) expect(seen.has(r), r).toBe(true);
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
});

test('automated accessibility checks pass on every route in both themes (WCAG 2.x AA rules)', async ({ page }) => {
  await loadScenario(page, 'SIM-11', 11);
  await run(page); await waitMet(page, '03:10'); await run(page);
  for (const theme of ['dark', 'light']) {
    await setPrefs(page, { theme, locale: 'en', reduceMotion: true });
    await page.reload();
    for (const route of ['/', '/mission/overview', '/mission/exposure', '/mission/integrity', '/mission/exercise', '/mission/cases', '/ground', '/lab', '/devices', '/evidence', '/settings']) {
      await go(page, route);
      await page.waitForTimeout(600);
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      const bad = res.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      expect(bad, `${theme} ${route}\n${bad.join('\n')}`).toEqual([]);
    }
  }
});

test('security posture of the built app: strict CSP, no inline script, truthful verification levels, validated import', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).not.toContain('unsafe-eval');
  expect(await page.locator('script:not([src])').count()).toBe(0);
  await go(page, '/devices');
  await expect(page.getByTestId('caps')).not.toContainText('Hardware-verified');
  await expect(page.getByTestId('caps')).toContainText('Emulator-verified');
  await page.getByTestId('import-sample').click();
  await expect(page.getByTestId('import-result')).toContainText('2 rejected'); // unit mismatch + malformed line reported by row, not guessed
  await page.getByTestId('ws-connect').click();
  await expect(page.getByTestId('ws-state')).toHaveText('Failed', { timeout: 15_000 }); // no gateway running: honest failure state
  expect(errors.filter((e) => !/WebSocket|ERR_CONNECTION_REFUSED|establish a connection|ws:\/\/127/.test(e))).toEqual([]);
});
