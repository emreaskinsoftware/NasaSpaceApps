// Verifies that every literal t('key') used in the web app exists in en.json and that all locales have key parity.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../apps/web/src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : []; });
const en = JSON.parse(readFileSync(join(root, 'locales/en.json'), 'utf8')) as Record<string, string>;
const used = new Set<string>();
for (const f of walk(root)) for (const m of readFileSync(f, 'utf8').matchAll(/\bt\('([A-Za-z0-9_.\- ]+)'/g)) used.add(m[1]);
const missing = [...used].filter((k) => !(k in en));
let bad = missing.length;
if (missing.length) console.log('MISSING in en:', missing);
for (const l of ['tr', 'de', 'fr', 'es', 'ar', 'ja']) {
  const d = JSON.parse(readFileSync(join(root, `locales/${l}.json`), 'utf8')) as Record<string, string>;
  const miss = Object.keys(en).filter((k) => !(k in d)), extra = Object.keys(d).filter((k) => !(k in en));
  const ph = Object.keys(en).filter((k) => k in d && JSON.stringify([...en[k].matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort()) !== JSON.stringify([...d[k].matchAll(/{{(\w+)}}/g)].map((m) => m[1]).sort()));
  const same = Object.keys(en).filter((k) => d[k] === en[k]).length;
  console.log(`${l}: ${Object.keys(d).length} keys, missing ${miss.length}, extra ${extra.length}, placeholder mismatches ${ph.length}${ph.length ? ' ' + ph.slice(0, 5).join(',') : ''}, identical-to-en ${same}`);
  bad += miss.length + extra.length + ph.length;
}
console.log(`en: ${Object.keys(en).length} keys, ${used.size} literal keys used`);
process.exit(bad ? 1 : 0);
