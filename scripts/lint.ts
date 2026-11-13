/**
 * Project lint (replaces ESLint, whose TypeScript plugin does not support TypeScript 7 yet — see docs/IMPLEMENTATION_DECISIONS.md).
 * Enforces architecture boundaries and security-sensitive bans; unused code is covered by `tsc` (noUnusedLocals/Parameters).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => {
  if (['node_modules', 'dist', '.aster-data', 'test-results', 'deliverables'].includes(f)) return [];
  const p = join(d, f);
  return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|mjs|js)$/.test(f) ? [p] : [];
});
const files = ['packages', 'apps', 'scripts', 'tests'].flatMap((d) => walk(join(root, d)));
const problems: string[] = [];
const rel = (f: string) => relative(root, f).split(sep).join('/');
const imports = (src: string) => [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

const BOUNDARIES: { scope: RegExp; allow?: (i: string) => boolean; deny?: RegExp; why: string }[] = [
  { scope: /^packages\/engine\//, allow: (i) => i.startsWith('./') || i === '@aster/contracts', why: 'engine may import contracts only (never simulator, evaluation, runtime or UI)' },
  { scope: /^packages\/contracts\//, allow: (i) => i === 'zod', why: 'contracts depend on zod only' },
  { scope: /^packages\/simulator\//, deny: /@aster\/(engine|evaluation|runtime|comms|adapters)|react/, why: 'simulator must not share code with the estimator' },
  { scope: /^packages\/(comms|adapters)\//, deny: /@aster\/(simulator|evaluation|engine)|^node:|react/, why: 'comms/adapters stay browser-safe and truth-free' },
  { scope: /^apps\/web\//, deny: /@aster\/evaluation|^node:|\/packages\/evaluation\//, why: 'operator UI must not import the truth evaluation package or Node APIs' },
  { scope: /^apps\/(gateway|ground)\//, deny: /@aster\/evaluation/, why: 'servers must not import truth evaluation' },
];
const BANS: { re: RegExp; why: string; skip?: RegExp }[] = [
  { re: /\beval\s*\(|new Function\s*\(/, why: 'no dynamic code execution' },
  { re: /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write/, why: 'never inject HTML' },
  { re: /https?:\/\/(?!127\.0\.0\.1|localhost|www\.w3\.org)[a-z0-9.-]+\.[a-z]{2,}[^'"`\s]*\.(js|css|woff2?)\b/i, why: 'no remote scripts, styles or fonts', skip: /sources\.ts$/ },
  { re: /(api[_-]?key|secret|password|bearer)\s*[:=]\s*['"][A-Za-z0-9+/_-]{16,}['"]/i, why: 'possible hard-coded secret', skip: /\.test\.ts$|\.spec\.ts$/ },
  { re: /console\.log\(/, why: 'no console.log in shipped web code', skip: /^(scripts|tests|apps\/(gateway|ground))\// },
  { re: /\bTODO\b|\bFIXME\b/, why: 'no unfinished markers in release code' },
];
for (const f of files) {
  const r = rel(f), src = readFileSync(f, 'utf8');
  if (r === 'scripts/lint.ts') continue;
  for (const b of BOUNDARIES) if (b.scope.test(r)) for (const i of imports(src)) {
    if (b.allow && !b.allow(i)) problems.push(`${r}: imports "${i}" — ${b.why}`);
    if (b.deny && b.deny.test(i)) problems.push(`${r}: imports "${i}" — ${b.why}`);
  }
  src.split('\n').forEach((line, n) => { for (const b of BANS) if (!(b.skip && b.skip.test(r)) && b.re.test(line)) problems.push(`${r}:${n + 1}: ${b.why}`); });
}
if (problems.length) { console.error(problems.join('\n')); console.error(`\n${problems.length} problem(s)`); process.exit(1); }
console.log(`lint ok — ${files.length} files, ${BOUNDARIES.length} boundary rules, ${BANS.length} security bans`);
