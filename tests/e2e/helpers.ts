import { expect, type Page } from '@playwright/test';

const accepting = new WeakSet<Page>();
/** Accept confirm dialogs (new-run / fork confirmations) for the rest of the test. */
export function autoAccept(page: Page): void {
  if (accepting.has(page)) return;
  accepting.add(page);
  page.on('dialog', (d) => void d.accept().catch(() => undefined));
}
export async function loadScenario(page: Page, id: string, seed = 7, speed: 1 | 10 | 60 = 60): Promise<void> {
  await go(page, '/lab');
  await page.getByTestId(`scenario-${id}`).click();
  await page.getByTestId('seed').fill(String(seed));
  autoAccept(page);
  await page.getByTestId('load-scenario').click();
  await expect(page.getByTestId('met')).toContainText('00:00');
  await page.getByTestId('speed').selectOption(String(speed));
}
/** In-app navigation (hash change), like clicking a link: never reloads the document, in any browser engine. */
export async function go(page: Page, route: string): Promise<void> {
  if (!page.url().startsWith('http')) { await page.goto(`/#${route}`); return; }
  await page.evaluate((r) => { window.location.hash = r; }, route);
}
export const run = (page: Page) => page.getByTestId('run-toggle').click();
const secs = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
export async function met(page: Page): Promise<number> { return secs(await page.getByTestId('met').innerText()); }
export async function waitMet(page: Page, mmss: string, timeout = 60_000): Promise<void> {
  await expect.poll(() => met(page), { timeout }).toBeGreaterThanOrEqual(secs(mmss));
}
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}
export const setPrefs = (page: Page, prefs: Record<string, unknown>) => page.evaluate((p) => localStorage.setItem('aster.settings.v1', JSON.stringify(p)), prefs);
