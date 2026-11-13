// Generates the bundled "generated history" reference sessions by running simulator -> engine.
import { writeFileSync } from 'node:fs';
import { generateReferences } from '@aster/evaluation';
import { DEFAULT_CREW, NOMINAL_VARIATION, scenarioById } from '@aster/simulator';

const refs = generateReferences(DEFAULT_CREW.map((c) => c.id), NOMINAL_VARIATION, 9000, scenarioById('SIM-01'));
writeFileSync(new URL('../data/reference/sessions.json', import.meta.url), JSON.stringify(refs, null, 1));
for (const [k, v] of Object.entries(refs)) console.log(k, v.map((r) => `${r.loadN}N:${r.mmgRms}:${r.r10k}`).join('  '));
