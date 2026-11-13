/** Runs the unit and browser suites and records the actual counts used by README, report and slides. */
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmp = mkdtempSync(join(tmpdir(), 'aster-tests-'));
const run = (cmd: string, env: Record<string, string> = {}): void => { try { execSync(cmd, { stdio: 'ignore', env: { ...process.env, ...env } }); } catch { /* failures are read from the report */ } };
run(`npx vitest run --reporter=json --outputFile="${join(tmp, 'unit.json')}"`);
run('npx playwright test --reporter=json', { PLAYWRIGHT_JSON_OUTPUT_NAME: join(tmp, 'e2e.json') });
const v = JSON.parse(readFileSync(join(tmp, 'unit.json'), 'utf8')), p = JSON.parse(readFileSync(join(tmp, 'e2e.json'), 'utf8'));
const summary = {
  generatedAtUtc: new Date().toISOString(),
  unit: v.numPassedTests as number, unitTotal: v.numTotalTests as number, unitFailed: v.numFailedTests as number, unitFiles: (v.testResults as unknown[]).length,
  e2e: p.stats.expected as number, e2eFailed: (p.stats.unexpected as number) + (p.stats.flaky as number),
  e2eEngines: ['Chrome', 'Firefox (Playwright build)', 'WebKit (Playwright build)'], e2ePerEngine: Math.round((p.stats.expected as number) / 3),
  node: process.version,
};
mkdirSync(new URL('../deliverables/reports/', import.meta.url), { recursive: true });
writeFileSync(new URL('../deliverables/reports/test-summary.json', import.meta.url), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary));
if (summary.unitFailed || summary.e2eFailed || summary.unit !== summary.unitTotal) process.exit(1);
