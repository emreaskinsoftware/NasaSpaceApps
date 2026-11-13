// Writes a small synthetic NDJSON recording (origin: simulated run exported through the wire codec) for the replay importer.
import { writeFileSync } from 'node:fs';
import { encodeChunk, isChunk } from '@aster/contracts';
import { createSimulator, scenarioById } from '@aster/simulator';
const sim = createSimulator({ scenario: scenarioById('SIM-01'), seed: 3, missionId: 'mission-sample', runId: 'run-sample', crewIds: ['crew-1'] });
const lines: string[] = [];
while (sim.nowMs < 20000) for (const r of sim.step().records) {
  if (!['co2.cabin', 'co2.local', 'contact.force', 'resp.displacement'].includes(r.metric)) continue;
  lines.push(JSON.stringify(isChunk(r) ? encodeChunk(r) : r));
}
lines.splice(40, 0, JSON.stringify({ ...JSON.parse(lines[0]), unit: '%' }), '{"broken": true');
writeFileSync(new URL('../apps/web/public/samples/sample-recording.ndjson', import.meta.url), lines.join('\n') + '\n');
console.log(lines.length, 'lines');
