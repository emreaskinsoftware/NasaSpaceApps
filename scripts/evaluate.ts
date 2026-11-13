/**
 * Frozen held-out evaluation. Methods and rules are frozen (versions recorded); development seeds 1–5 were used
 * while tuning, evaluation seeds 101–120 are held out and use VARIED observation dynamics (heldOutVariation),
 * including a two-time-constant gas sensor the estimator does not model. Negative results are kept.
 * Output: deliverables/reports/evaluation.{json,csv} and docs/VALIDATION_REPORT.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ENGINE_VERSION, METHOD_VERSIONS, RULE_VERSIONS } from '@aster/engine';
import { DEFAULT_CREW, GENERATOR_VERSION, heldOutVariation, NOMINAL_VARIATION, scenarioById } from '@aster/simulator';
import { evaluateExercise, evaluateExposure, evaluateIntegrity, fingerprint, firstOpen, generateReferences, openedRules, runHeadless } from '@aster/evaluation';
import { MissionRuntime, newRunSpec } from '@aster/runtime';

const EVAL_SEEDS = Array.from({ length: 20 }, (_, i) => 101 + i), DEV_SEEDS = [1, 2, 3, 4, 5];
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sd = (a: number[]) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const r = (x: number, d = 0) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);
const base = scenarioById('SIM-01');
const runs = new Map<string, ReturnType<typeof runHeadless>>();
const refCache = new Map<number, ReturnType<typeof generateReferences>>();
function get(id: string, seed: number, held: boolean) {
  const key = `${id}|${seed}|${held}`;
  if (!runs.has(key)) {
    const variation = held ? heldOutVariation(seed) : NOMINAL_VARIATION;
    // Reference sessions are regenerated in the same "world" (variation) as the evaluated run.
    if (!refCache.has(held ? seed : 0)) refCache.set(held ? seed : 0, generateReferences(['crew-1'], variation, 9000 + seed, base));
    runs.set(key, runHeadless({ scenario: scenarioById(id), seed, variation, references: refCache.get(held ? seed : 0)! }));
  }
  return runs.get(key)!;
}
const t0 = Date.now();

/* ---------- exposure ---------- */
const EXP_SC = ['SIM-01', 'SIM-02', 'SIM-03', 'SIM-11'];
const EXP_M = ['cabin', 'local-window', 'phase-gated', 'aligned-quality-aware'];
function exposureTable(seeds: number[], held: boolean) {
  const out: Record<string, { mae: number; maeSd: number; bias: number; coverage: number; n: number }> = {};
  for (const m of EXP_M) {
    const maes: number[] = [], biases: number[] = [], cov: number[] = []; let n = 0;
    for (const sc of EXP_SC) for (const s of seeds) { const e = evaluateExposure(get(sc, s, held)).byMethod[m]; if (e.n) { maes.push(e.mae); biases.push(e.bias); } cov.push(e.coverage); n += e.n; }
    out[m] = { mae: r(mean(maes))!, maeSd: r(sd(maes))!, bias: r(mean(biases))!, coverage: r(mean(cov), 3)!, n };
  }
  return out;
}
const exposure = exposureTable(EVAL_SEEDS, true), exposureDev = exposureTable(DEV_SEEDS, false);
const perScenario = Object.fromEntries(EXP_SC.map((sc) => [sc, Object.fromEntries(EXP_M.map((m) => { const e = EVAL_SEEDS.map((s) => evaluateExposure(get(sc, s, true)).byMethod[m]); return [m, { mae: r(mean(e.filter((x) => x.n).map((x) => x.mae))), bias: r(mean(e.filter((x) => x.n).map((x) => x.bias))) }]; }))]));
const candWins = EVAL_SEEDS.flatMap((s) => EXP_SC.map((sc) => { const e = evaluateExposure(get(sc, s, true)).byMethod; return e['aligned-quality-aware'].mae < Math.min(e['phase-gated'].mae, e['local-window'].mae, e['cabin'].mae) ? 1 : 0; }));
const expEvents = {
  missedWhenElevated: r(mean(EVAL_SEEDS.flatMap((s) => ['SIM-02', 'SIM-11'].map((sc) => (firstOpen(get(sc, s, true), 'EXP-INH-01') === null ? 1 : 0)))), 3),
  falseWhenNotElevated: r(mean(EVAL_SEEDS.flatMap((s) => ['SIM-01', 'SIM-03'].map((sc) => (firstOpen(get(sc, s, true), 'EXP-INH-01') !== null ? 1 : 0)))), 3),
  slowSensorCoverage: r(mean(EVAL_SEEDS.map((s) => evaluateExposure(get('SIM-04', s, true)).byMethod['aligned-quality-aware'].coverage)), 3),
  slowSensorWithheldEvent: r(mean(EVAL_SEEDS.map((s) => (openedRules(get('SIM-04', s, true)).includes('EXP-WH-01') ? 1 : 0))), 3),
  slowSensorFalseExposureEvent: r(mean(EVAL_SEEDS.map((s) => (openedRules(get('SIM-04', s, true)).includes('EXP-INH-01') ? 1 : 0))), 3),
  slowSensorGatedMae: r(mean(EVAL_SEEDS.map((s) => evaluateExposure(get('SIM-04', s, true)).byMethod['phase-gated'].mae))),
};

/* ---------- integrity ---------- */
const INT_M = ['fixed-filter', 'paired-reference', 'calibration-aware-gate', 'calibration-aware-compensate'];
const INT_SC: Record<string, [number, number, string]> = { 'SIM-05': [88000, 170000, 'coupling fault, source unchanged'], 'SIM-06': [98000, 220000, 'source changed, contact stable'], 'SIM-07': [78000, 220000, 'actuator-path mismatch, source unchanged'], 'SIM-01': [80000, 150000, 'nominal'] };
const integrity = Object.fromEntries(Object.entries(INT_SC).map(([sc, [b, e, label]]) => [sc, { label, methods: Object.fromEntries(INT_M.map((m) => {
  const v = EVAL_SEEDS.map((s) => evaluateIntegrity(get(sc, s, true), b, e).byMethod[m]);
  return [m, { featureErr: r(mean(v.filter((x) => x.n).map((x) => x.featureErr)), 3), coverage: r(mean(v.map((x) => x.coverage)), 3), flaggedChange: r(mean(v.filter((x) => x.n).map((x) => x.flaggedChange)), 3) }];
})) }]));
const intEvents = {
  contactEventLatencyMs: r(mean(EVAL_SEEDS.map((s) => (firstOpen(get('SIM-05', s, true), 'INT-CON-01') ?? NaN) - 90000).filter(Number.isFinite))),
  contactEventMissed: r(mean(EVAL_SEEDS.map((s) => (firstOpen(get('SIM-05', s, true), 'INT-CON-01') === null ? 1 : 0))), 3),
  falseDeviationEventDuringCouplingFault: r(mean(EVAL_SEEDS.map((s) => (get('SIM-05', s, true).events.some((e) => e.ruleId === 'EXR-DEV-01' && e.revision === 1 && e.openedAtMs > 90000 && e.openedAtMs < 180000) ? 1 : 0))), 3),
  pathMismatchRejected: r(mean(EVAL_SEEDS.map((s) => (get('SIM-07', s, true).events.some((e) => e.ruleId === 'INT-CAL-01') ? 1 : 0))), 3),
};

/* ---------- exercise ---------- */
const EX_M = ['unconditioned', 'matched-conditioned', 'fluid-aware', 'ablation-no-integrity'];
const EX_SC: Record<string, [number, number, string]> = { 'SIM-01': [60000, 150000, 'no change (should not flag)'], 'SIM-08': [115000, 220000, 'response changed (should flag)'], 'SIM-09': [50000, 220000, 'load mismatch (should abstain)'], 'SIM-10': [125000, 220000, 'fluid shift only (should not flag)'], 'SIM-05': [110000, 170000, 'contact fault (should abstain or not flag)'] };
const exercise = Object.fromEntries(Object.entries(EX_SC).map(([sc, [a, e, label]]) => [sc, { label, methods: Object.fromEntries(EX_M.map((m) => {
  const v = EVAL_SEEDS.map((s) => evaluateExercise(get(sc, s, true), a, e).byMethod[m]);
  return [m, { flagged: r(mean(v.map((x) => x.flagged).filter(Number.isFinite)), 3), abstained: r(mean(v.map((x) => x.abstained)), 3) }];
})) }]));
const exEvents = Object.fromEntries(Object.keys(EX_SC).map((sc) => [sc, r(mean(EVAL_SEEDS.map((s) => (get(sc, s, true).events.some((e) => e.ruleId === 'EXR-DEV-01' && e.revision === 1) ? 1 : 0))), 3)]));

/* ---------- reproducibility, operations, performance ---------- */
const refs = generateReferences(DEFAULT_CREW.map((c) => c.id), NOMINAL_VARIATION, 9000, base);
const fp = (seed: number) => fingerprint(runHeadless({ scenario: scenarioById('SIM-11'), seed, references: refs }));
const deterministic = fp(42) === fp(42) && fp(42) !== fp(43);
const rt = new MissionRuntime(newRunSpec('SIM-12', 7), refs);
while (rt.nowMs < rt.scenario.durationMs) rt.tick();
const v = rt.view({ crewId: 'crew-1', metrics: [], windowMs: 60000, endMs: null, eventId: null, includeTruth: false });
const first = v.outbox[0];
const operations = { scenario: 'SIM-12 seed 7', packages: v.outbox.length, firstPackageBytes: first.sizeBytes, queueWaitMs: (first.deliveredAtMs ?? NaN) - first.queuedAtMs, outageMs: 100000, duplicatesInjected: v.link.stats?.duplicatesInjected, casesStoredOnGround: v.ground.cases.length, duplicateDeliveriesIgnored: v.ground.cases.reduce((s, c) => s + c.duplicates, 0), bytesOnLink: v.link.stats?.bytes };
(globalThis as { gc?: () => void }).gc?.();
const heap0 = process.memoryUsage().heapUsed, p0 = Date.now();
const long = new MissionRuntime(newRunSpec('SIM-01', 5), refs);
let maxTick = 0, heapMid = 0;
while (long.nowMs < 30 * 60000) { const a = performance.now(); long.tick(); maxTick = Math.max(maxTick, performance.now() - a); if (long.nowMs === 10 * 60000) heapMid = process.memoryUsage().heapUsed; }
const performanceReport = { run: '4 crew, 30 simulated minutes, SIM-01 seed 5', wallMs: Date.now() - p0, realTimeFactor: r((30 * 60000) / (Date.now() - p0)), maxTickMs: r(maxTick, 1), heapAt10MinMb: r((heapMid - heap0) / 1048576, 1), heapAt30MinMb: r((process.memoryUsage().heapUsed - heap0) / 1048576, 1), machine: `${process.platform} ${process.arch}, Node ${process.version}` };

const report = {
  generated: true, generatedAtUtc: new Date().toISOString(), engineVersion: ENGINE_VERSION, generatorVersion: GENERATOR_VERSION, methodVersions: METHOD_VERSIONS, ruleVersions: RULE_VERSIONS,
  codeCommit: process.env.ASTER_COMMIT ?? 'local-uncommitted', dataOrigin: 'simulated', devSeeds: DEV_SEEDS, evalSeeds: EVAL_SEEDS,
  heldOutVariation: 'gas sensor tau ×[0.6,1.6], transport delay offset [−100,+150] ms, second (4× slower) response stage weight [0,0.4], spatial gain ×[0.85,1.15], fluid attenuation [0,0.4], coupling exponent [1.1,1.9], actuator exponent [0.9,1.5], noise ×[0.7,1.6]',
  reference: { exposure: 'simulator inhalation-phase mean pocket concentration per breath', integrity: 'latent source-amplitude ratio vs. pre-fault baseline (rolling 6 s RMS)', exercise: 'latent response change > 15 %' },
  exposure, exposureDev, exposurePerScenario: perScenario, exposureCandidateBestShare: r(mean(candWins), 3), exposureEvents: expEvents,
  integrity, integrityEvents: intEvents, exercise, exerciseDeviationEventRate: exEvents, deterministic, operations, performance: performanceReport, runs: runs.size, wallSeconds: r((Date.now() - t0) / 1000, 1),
};
mkdirSync(new URL('../deliverables/reports/', import.meta.url), { recursive: true });
writeFileSync(new URL('../deliverables/reports/evaluation.json', import.meta.url), JSON.stringify(report, null, 1));
const csv = ['module,scenario,method,metric,value',
  ...EXP_M.flatMap((m) => Object.entries(exposure[m]).map(([k, x]) => `exposure,all,${m},${k},${x}`)),
  ...Object.entries(integrity).flatMap(([sc, o]) => Object.entries(o.methods).flatMap(([m, x]) => Object.entries(x).map(([k, y]) => `integrity,${sc},${m},${k},${y}`))),
  ...Object.entries(exercise).flatMap(([sc, o]) => Object.entries(o.methods).flatMap(([m, x]) => Object.entries(x).map(([k, y]) => `exercise,${sc},${m},${k},${y}`)))];
writeFileSync(new URL('../deliverables/reports/evaluation.csv', import.meta.url), csv.join('\n') + '\n');

const pct = (x: number | null) => (x === null ? 'n/a' : `${Math.round(x * 100)} %`);
const md = `# ASTER Validation Report (simulation only)

> Generated by \`pnpm evaluate\` on ${report.generatedAtUtc}. Engine ${ENGINE_VERSION}, generator ${GENERATOR_VERSION}, commit \`${report.codeCommit}\`.
> **All data are synthetic.** These numbers describe software and method behaviour under stated simulated conditions. They are not clinical sensitivity, not flight validation, and not evidence of physiological benefit.

## Protocol
- Methods and rules were frozen before the held-out runs (versions in \`deliverables/reports/evaluation.json\`).
- Development seeds ${DEV_SEEDS.join(', ')} (nominal dynamics) were used while tuning. Evaluation seeds ${EVAL_SEEDS[0]}–${EVAL_SEEDS.at(-1)} (n = ${EVAL_SEEDS.length} per scenario) are held out.
- Held-out runs change the observation model: ${report.heldOutVariation}.
- The simulator never passes scenario labels or latent state to the engine; the evaluator joins outputs with truth by timestamp afterwards.
- ${runs.size} headless runs, ${report.wallSeconds} s wall time.

## 1. Breathing & Exposure — per-breath estimate error
Reference: ${report.reference.exposure}. Scenarios ${EXP_SC.join(', ')}; ${EVAL_SEEDS.length} seeds each. Mean absolute error (MAE) is averaged per run; SD is across runs.

| Method | MAE ± SD (ppm) | Mean bias (ppm) | Valid-breath coverage | Breaths |
|---|---:|---:|---:|---:|
${EXP_M.map((m) => `| ${m}${m === 'aligned-quality-aware' ? ' (candidate)' : ''} | ${exposure[m].mae} ± ${exposure[m].maeSd} | ${exposure[m].bias} | ${pct(exposure[m].coverage)} | ${exposure[m].n} |`).join('\n')}

Per scenario (MAE / bias, ppm):

| Scenario | ${EXP_M.join(' | ')} |
|---|${EXP_M.map(() => '---:').join('|')}|
${EXP_SC.map((sc) => `| ${sc} | ${EXP_M.map((m) => `${perScenario[sc][m].mae} / ${perScenario[sc][m].bias}`).join(' | ')} |`).join('\n')}

- The candidate had the lowest MAE of the four methods in ${pct(report.exposureCandidateBestShare)} of held-out runs.
- Event behaviour: exposure event missed when the inhaled reference was elevated (SIM-02, SIM-11): ${pct(expEvents.missedWhenElevated)}; exposure event raised when it was not (SIM-01, SIM-03): ${pct(expEvents.falseWhenNotElevated)}.
- Slow sensor (SIM-04, declared τ = 2.5 s): candidate coverage ${pct(expEvents.slowSensorCoverage)} — the estimate is withheld; "estimate withheld" event raised in ${pct(expEvents.slowSensorWithheldEvent)} of runs; false exposure event in ${pct(expEvents.slowSensorFalseExposureEvent)}. A baseline that answers anyway (phase-gated) has MAE ≈ ${expEvents.slowSensorGatedMae} ppm there.
- Development-seed MAE for comparison (nominal dynamics): candidate ${exposureDev['aligned-quality-aware'].mae} ppm, phase-gated ${exposureDev['phase-gated'].mae} ppm.

**Limitations and negative results.** (1) The residual bias of the candidate is dominated by spatial sampling mismatch, which software cannot remove. (2) An estimator-driven lag (onset detection) was tried during development and performed *worse* than the declared sampling delay because its bias depends on local ventilation; the released method uses the declared delay and reports the observed lag only as a diagnostic. (3) The simulator's gas-pocket model is an engineering assumption; agreement with it does not show that the estimate equals inhaled gas in a human.

## 2. Sensor Integrity — feature error together with accepted coverage
Reference: ${report.reference.integrity}. "Flagged" = share of evaluated windows whose RMS ratio left [0.8, 1.25] (would look like a physiological change).

${Object.entries(integrity).map(([sc, o]) => `**${sc} — ${o.label}**

| Method | Feature error | Coverage | Flagged as change |
|---|---:|---:|---:|
${INT_M.map((m) => `| ${m} | ${o.methods[m].featureErr ?? 'n/a'} | ${pct(o.methods[m].coverage)} | ${pct(o.methods[m].flaggedChange)} |`).join('\n')}
`).join('\n')}
- Contact event latency after the slip began (SIM-05): ${intEvents.contactEventLatencyMs} ms mean (includes the 3 s ramp and 3 s dwell); missed: ${pct(intEvents.contactEventMissed)}.
- False exercise-deviation event during the coupling fault with the released gate: ${pct(intEvents.falseDeviationEventDuringCouplingFault)}.
- Calibration-path mismatch detected and correction rejected (SIM-07): ${pct(intEvents.pathMismatchRejected)}.

**Limitations and negative results.** (1) The gate achieves low error by *rejecting* data: coverage must be read together with error. (2) Gain compensation recovers coverage but leaves a systematic error whenever the actuator path and the physiological path scale differently (they do in the held-out runs); it is therefore displayed as experimental and never feeds the exercise comparison. (3) Paired-reference cancellation did not materially improve on a fixed filter during coupling faults in this simulator. (4) In SIM-06 every method correctly keeps the real source change (high "flagged" is the desired outcome there).

## 3. Exercise & Muscle Response — flagging versus abstention
"Flagged" = share of 5 s comparison samples with |z| > 3 among samples where the method answered; "Abstained" = share where it declined.

${Object.entries(exercise).map(([sc, o]) => `**${sc} — ${o.label}** (deviation event opened in ${pct(exEvents[sc])} of runs)

| Method | Flagged | Abstained |
|---|---:|---:|
${EX_M.map((m) => `| ${m} | ${pct(o.methods[m].flagged)} | ${pct(o.methods[m].abstained)} |`).join('\n')}
`).join('\n')}
**Limitations and negative results.** (1) The unconditioned baseline answers in the load-mismatch scenario and is misleading there; the matched method abstains. (2) Removing the integrity gate (ablation) produces flags during a pure contact fault. (3) The fluid-aware variant is reported honestly above: where it does not improve on the matched method, or abstains outside the reference impedance range, it is not used — the released rule (EXR-DEV-01) uses the matched-conditioned method. (4) False positives remain: with a fluid shift alone (SIM-10) a deviation event still opened in ${pct(exEvents['SIM-10'])} of held-out runs, because fluid state changes the mechanical transmission in the simulator and the matched method does not model it. (5) The synthetic "response" parameter is a simulator variable; nothing here shows that it is identifiable in a human or that any change is clinically meaningful.

## 4. Software verification
- Deterministic replay (same scenario and seed → identical observations/events; different seed differs): **${deterministic ? 'pass' : 'FAIL'}**. Playback speed only changes wall-clock scheduling of the same fixed 100 ms ticks.
- Store-and-forward (${operations.scenario}): first case queued during a ${operations.outageMs / 1000} s outage, delivered ${operations.queueWaitMs} ms after queueing; package size ${operations.firstPackageBytes} B; ${operations.duplicatesInjected} duplicate deliveries injected by the link, ${operations.duplicateDeliveriesIgnored} ignored by the ground, ${operations.casesStoredOnGround} cases stored for ${operations.packages} packages; ${operations.bytesOnLink} B on the link.
- Performance (${performanceReport.run}; ${performanceReport.machine}): ${performanceReport.wallMs} ms wall (${performanceReport.realTimeFactor}× real time), longest tick ${performanceReport.maxTickMs} ms, heap growth ${performanceReport.heapAt10MinMb} MB at 10 min and ${performanceReport.heapAt30MinMb} MB at 30 min (bounded buffers; display store capped at 30 min).

## What this report does not establish
No clinical validity, no hardware performance, no NASA or agency endorsement, no patentability, no claim that simulated classification equals clinical sensitivity. The next evidence steps are reference-instrument comparison, a controlled human study, an analogue environment, and only then flight evaluation.
`;
writeFileSync(new URL('../docs/VALIDATION_REPORT.md', import.meta.url), md);
console.log(md.slice(md.indexOf('## 1.')));
