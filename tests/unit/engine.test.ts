import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MAX_BATCH_RECORDS, type Observation, type ReferenceSession, type SignalChunk } from '@aster/contracts';
import { compareExercise, createEngine, estimateBreath, EXPOSURE_METHODS, EXERCISE_METHODS } from '@aster/engine';
import { Series } from '../../packages/engine/src/dsp';
import { createSimulator, heldOutVariation, scenarioById } from '@aster/simulator';
import { evaluateExposure, fingerprint, firstOpen, openedRules, runHeadless } from '@aster/evaluation';

const ROOT = join(__dirname, '../..');
const refs = JSON.parse(readFileSync(join(ROOT, 'data/reference/sessions.json'), 'utf8')) as Record<string, ReferenceSession[]>;
const meta = { co2LocalResponseTauMs: 250, co2LocalTransportDelayMs: 300, calToneHz: 80, impedanceFrequenciesHz: [10000, 100000] as [number, number] };
const mk = () => createEngine({ missionId: 'm', runId: 'r', crewIds: ['crew-1'], sensorMeta: meta, references: refs, origin: 'simulated' });
let seq = 0;
const obs = (metric: string, value: number | null, t: number, patch: Partial<Observation> = {}): Observation => ({
  schemaVersion: 1, id: `o${seq}`, missionId: 'm', runId: 'r', crewId: 'crew-1', streamId: `crew-1.${metric}`, sourceId: 's', sequence: seq++, observedAtMs: t,
  receivedAtUtc: '2026-01-01T00:00:00Z', clockUncertaintyMs: 5, metric, value, unit: metric === 'co2.cabin' ? 'ppm' : metric === 'contact.force' ? 'N' : 'kPa', origin: 'simulated', quality: 'valid', qualityReasons: [], provenanceId: 'p', ...patch,
});
const run = (id: string, seed = 1, held = false) => runHeadless({ scenario: scenarioById(id), seed, references: refs, variation: held ? heldOutVariation(seed) : undefined });

describe('ingestion and channel quality', () => {
  it('quarantines unit mismatch, duplicates, out-of-order, out-of-range and unknown metrics without fabricating values', () => {
    const e = mk();
    e.ingest([obs('co2.cabin', 2800, 1000)]);
    const dup = obs('co2.cabin', 2810, 2000);
    e.ingest([dup, { ...dup }, obs('co2.cabin', 0.28, 3000, { unit: '%' }), obs('co2.cabin', 2800, 500), obs('co2.cabin', 1e9, 4000), obs('nope.metric', 1, 4000), obs('co2.cabin', 2805, 4000, { runId: 'other' })]);
    const s = e.snapshot();
    expect(s.quarantine.count).toBe(6);
    expect(s.quarantine.recent.map((q) => q.reason).sort()).toEqual(['duplicate-or-replayed', 'non-finite-or-out-of-range', 'out-of-order', 'run-mismatch', 'unit-mismatch', 'unknown-metric']);
    expect(s.crews['crew-1'].latest['co2.cabin']).toBe(2810);
  });
  it('treats a null value as invalid (not zero) and flags large clock uncertainty as suspect', () => {
    const e = mk();
    e.ingest([obs('co2.cabin', null, 1000)]); e.advanceTo(1100);
    expect(e.snapshot().crews['crew-1'].channelQuality['co2.cabin'].state).toBe('invalid');
    expect(e.snapshot().crews['crew-1'].latest['co2.cabin']).toBeNull();
    e.ingest([obs('co2.cabin', 2800, 2000, { clockUncertaintyMs: 900 })]); e.advanceTo(2100);
    expect(e.snapshot().crews['crew-1'].channelQuality['co2.cabin']).toMatchObject({ state: 'suspect', reasons: ['clock-uncertainty'] });
  });
  it('marks channels stale using a source-specific age and never-received channels as unavailable', () => {
    const e = mk();
    e.ingest([obs('co2.cabin', 2800, 1000), obs('contact.force', 12, 1000)]);
    e.advanceTo(3000);
    const q = e.snapshot().crews['crew-1'].channelQuality;
    expect(q['contact.force'].state).toBe('stale');   // 10 Hz channel: stale after 1.5 s
    expect(q['co2.cabin'].state).toBe('valid');       // 1 Hz channel: still fresh after 2 s
    expect(q['mech.pvdf'].state).toBe('unavailable');
  });
  it('rejects an oversized batch as a whole', () => {
    const e = mk();
    e.ingest(Array.from({ length: MAX_BATCH_RECORDS + 1 }, (_, i) => obs('co2.cabin', 2800, 1000 + i)));
    expect(e.snapshot().quarantine.recent.at(-1)?.reason).toBe('oversized-batch');
    expect(e.snapshot().crews['crew-1'].latest['co2.cabin']).toBeUndefined();
  });
  it('rejects chunks with non-finite samples or a wrong sample rate', () => {
    const e = mk();
    const chunk = (samples: number[], rate = 200, sequence = 0): SignalChunk => ({ schemaVersion: 1, missionId: 'm', runId: 'r', crewId: 'crew-1', streamId: 'crew-1.mech.pvdf', sourceId: 's', sequence, startAtMs: 0, sampleRateHz: rate, samples: Float32Array.from(samples), unit: 'a.u.', origin: 'simulated', quality: 'valid', clockUncertaintyMs: 5, provenanceId: 'p', metric: 'mech.pvdf' });
    e.ingest([chunk([0.1, NaN, 0.2]), chunk([0.1, 0.2], 50, 1)]);
    expect(e.snapshot().quarantine.recent.map((q) => q.reason)).toEqual(['non-finite-or-out-of-range', 'rate-mismatch']);
  });
  it('an invalid mechanical stream does not invalidate an independent CO2 observation (SIM-14)', () => {
    const r = run('SIM-14');
    const q = r.snapshot.crews['crew-1'].channelQuality;
    expect(r.quarantined).toBeGreaterThan(20);
    expect(openedRules(r)).toEqual(expect.arrayContaining(['DQ-QUAR-01', 'DQ-STALE-01']));
    const stale = r.events.filter((e) => e.ruleId === 'DQ-STALE-01' && e.revision === 1);
    expect(stale.some((e) => String(e.explanationParams.channels).includes('mech.pvdf'))).toBe(true);
    expect(q['co2.cabin'].state).toBe('valid');
    expect(openedRules(r)).not.toContain('ENV-CO2-01');
  });
});

describe('architecture boundaries', () => {
  it('the engine imports contracts only — never simulator, evaluation, runtime or UI code', () => {
    const dir = join(ROOT, 'packages/engine/src');
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), 'utf8');
      const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
      for (const i of imports) expect(i.startsWith('./') || i === '@aster/contracts', `${f} imports ${i}`).toBe(true);
    }
  });
  it('no simulator truth field crosses into the records handed to the engine', () => {
    const sim = createSimulator({ scenario: scenarioById('SIM-11'), seed: 1, missionId: 'm', runId: 'r', crewIds: ['crew-1'] });
    const keys = new Set<string>();
    for (let i = 0; i < 50; i++) for (const r of sim.step().records) Object.keys(r).forEach((k) => keys.add(k));
    for (const banned of ['truth', 'contact', 'response', 'fluid', 'vent', 'scenario', 'scenarioId', 'inhaledMeanPpm', 'label', 'expected']) expect(keys.has(banned)).toBe(false);
    const provenance = sim.step().records.map((r) => r.provenanceId).join();
    expect(provenance).not.toContain('SIM-');
  });
  it('contracts expose no truth type', () => {
    expect(readFileSync(join(ROOT, 'packages/contracts/src/index.ts'), 'utf8')).not.toMatch(/interface Truth|inhaledMeanPpm/);
  });
});

describe('deterministic simulation', () => {
  it('the same scenario and seed reproduce identical observations and events; a different seed does not', () => {
    const a = fingerprint(run('SIM-11', 5)), b = fingerprint(run('SIM-11', 5)), c = fingerprint(run('SIM-11', 6));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it('SIM-01 nominal baseline raises no review or priority event across seeds', () => {
    for (const seed of [1, 2, 3, 4]) expect(run('SIM-01', seed).events.filter((e) => e.severity !== 'info')).toEqual([]);
  });
});

describe('Breathing & Exposure', () => {
  const series = (fn: (t: number) => number, step: number, end: number) => { const s = new Series(1e9); for (let t = 0; t <= end; t += step) s.push(t, fn(t)); return s; };
  const breath = { startMs: 1000, inhaleEndMs: 3000, endMs: 6000, phaseUncertaintyMs: 30, plausible: true };
  it('time-weights eligible samples over the delay-shifted inhalation window', () => {
    // sensor reads 3000 ppm for gas inhaled in [1000, 3000] after a 300 ms delay, 9000 ppm otherwise
    const co2 = series((t) => (t >= 1300 && t < 3300 ? 3000 : 9000), 50, 8000), cabin = series(() => 2800, 1000, 8000);
    const r = estimateBreath(breath, co2, cabin, { ...meta, co2LocalResponseTauMs: 0 }, 300, true, 'valid', 0);
    expect(r.estimates[EXPOSURE_METHODS.candidate.id]).toBeCloseTo(3000, 0);
    expect(r.estimates[EXPOSURE_METHODS.gated.id]!).toBeGreaterThan(3500); // no delay compensation: contaminated by the exhaled plume
    expect(r.estimates[EXPOSURE_METHODS.cabin.id]).toBe(2800);
    expect(r.reasons).toContain('spatial-sampling-uncertainty');
  });
  it('withholds (never fabricates) when the sensor is too slow, the phase is too uncertain or samples are missing', () => {
    const co2 = series(() => 4000, 50, 8000), cabin = series(() => 2800, 1000, 8000);
    const slow = estimateBreath(breath, co2, cabin, { ...meta, co2LocalResponseTauMs: 2500 }, 300, true, 'valid', 0);
    expect(slow.estimates[EXPOSURE_METHODS.candidate.id]).toBeNull();
    expect(slow.reasons).toContain('sensor-bandwidth');
    const noisy = estimateBreath({ ...breath, phaseUncertaintyMs: 700 }, co2, cabin, meta, 300, true, 'valid', 0);
    expect(noisy.reasons).toContain('phase-uncertainty');
    const sparse = estimateBreath(breath, series(() => 4000, 50, 1500), cabin, meta, 300, true, 'valid', 0);
    expect(sparse.estimates[EXPOSURE_METHODS.candidate.id]).toBeNull();
    expect(sparse.reasons).toContain('insufficient-samples');
    const stale = estimateBreath(breath, co2, cabin, meta, 300, true, 'stale', 0);
    expect(stale.estimates[EXPOSURE_METHODS.candidate.id]).toBeNull();
    expect(stale.estimates[EXPOSURE_METHODS.cabin.id]).toBe(2800); // the cabin observation stays available
  });
  it('SIM-02: flags elevated local inhalation-phase CO2 while the cabin trace is stable, without a cabin alarm', () => {
    const r = run('SIM-02');
    expect(firstOpen(r, 'EXP-INH-01')).toBeGreaterThan(70000);
    expect(openedRules(r)).not.toContain('ENV-CO2-01');
    const ev = evaluateExposure(r).byMethod;
    expect(ev['aligned-quality-aware'].mae).toBeLessThan(ev['phase-gated'].mae);
    expect(ev['aligned-quality-aware'].mae).toBeLessThan(ev['cabin'].mae);
  });
  it('SIM-03: an exhalation spike without elevated inhaled reference does not open an exposure event', () => {
    const r = run('SIM-03');
    expect(openedRules(r)).not.toContain('EXP-INH-01');
    const ev = evaluateExposure(r).byMethod;
    expect(ev['local-window'].bias).toBeGreaterThan(1000); // the naive baseline is fooled by the plume
    expect(Math.abs(ev['aligned-quality-aware'].bias)).toBeLessThan(300);
  });
  it('SIM-04: a slow sensor leads to a withheld estimate with an explicit reason, not a number', () => {
    const r = run('SIM-04');
    expect(evaluateExposure(r).byMethod['aligned-quality-aware'].n).toBe(0);
    expect(openedRules(r)).toContain('EXP-WH-01');
    expect(openedRules(r)).not.toContain('EXP-INH-01');
    expect(r.events.find((e) => e.ruleId === 'EXP-WH-01')!.explanationParams.reason).toBe('sensor-bandwidth');
  });
});

describe('Sensor Integrity', () => {
  it('SIM-05: contact slip opens an integrity event and suppresses the dependent muscle interpretation', () => {
    const r = run('SIM-05');
    const t = firstOpen(r, 'INT-CON-01')!;
    expect(t).toBeGreaterThan(90000); expect(t).toBeLessThan(100000);
    expect(openedRules(r)).not.toContain('EXR-DEV-01'); // no false "physiological" event from a coupling fault
    const during = r.comparisons.filter((c) => c.tMs > 125000 && c.tMs < 170000);
    expect(during.every((c) => c.c === null || !c.c.eligible)).toBe(true);
    expect(during.some((c) => c.c?.reasons.includes('insufficient-valid-repetitions'))).toBe(true);
    expect(r.events.some((e) => e.ruleId === 'INT-CON-01' && e.state === 'resolved')).toBe(true);
  });
  it('SIM-06: a real source change with stable contact is NOT normalised away', () => {
    const r = run('SIM-06');
    expect(openedRules(r)).not.toContain('INT-CON-01');
    expect(openedRules(r)).toContain('EXR-DEV-01');
    const wins = r.snapshot.crews['crew-1'].integrity.filter((w) => w.startMs > 130000 && w.startMs < 210000 && w.decision !== 'masked');
    expect(wins.every((w) => w.decision === 'accepted')).toBe(true);
  });
  it('SIM-07: a calibration-path mismatch rejects the correction but keeps contact-valid data uncorrected', () => {
    const r = run('SIM-07');
    const ev = r.events.find((e) => e.ruleId === 'INT-CAL-01')!;
    expect(ev.explanationParams.reason).toBe('path-mismatch');
    const wins = r.snapshot.crews['crew-1'].integrity.filter((w) => w.startMs > 110000 && w.startMs < 210000);
    expect(wins.some((w) => w.decision === 'corrected')).toBe(false);
    expect(wins.filter((w) => w.decision === 'accepted').length).toBeGreaterThan(30);
    expect(wins.some((w) => w.reasons.some((x) => x.startsWith('self-check-failed')))).toBe(true);
  });
  it('masks the excitation window and freezes the calibration reference for the whole run', () => {
    const r = run('SIM-05');
    const c = r.snapshot.crews['crew-1'];
    expect(c.integrity.some((w) => w.decision === 'masked' || w.reasons.includes('excitation-window'))).toBe(true);
    expect(c.calibration.referenceGain).toBe(1);
    expect(c.calibration.state).toBe('accepted');
  });
});

describe('Exercise & Muscle Response', () => {
  const R = refs['crew-1'];
  const cur = { rms: 0.32, loadN: 400, cadenceRpm: 20, r10k: 58.5, anySuspect: false, reps: 8 };
  it('refuses a like-for-like comparison when the load differs from every reference', () => {
    const c = compareExercise({ ...cur, loadN: 620 }, R, 'leg-press', null);
    expect(c.eligible).toBe(false);
    expect(c.reasons).toContain('load-mismatch');
    expect(c.deviation[EXERCISE_METHODS.conditioned.id]).toBeNull();
    expect(c.deviation[EXERCISE_METHODS.unconditioned.id]).not.toBeNull(); // the naive baseline would still answer
  });
  it('is not eligible when the external load is unavailable or repetitions are invalid', () => {
    expect(compareExercise(null, R, 'leg-press', null, ['load-unavailable'])).toMatchObject({ eligible: false, reasons: ['load-unavailable'] });
    expect(compareExercise(null, R, 'leg-press', null, ['insufficient-valid-repetitions']).eligible).toBe(false);
  });
  it('reports an impedance-only change as context without flagging a response deviation', () => {
    const c = compareExercise({ ...cur, r10k: 55.6 }, R, 'leg-press', null);
    expect(c.eligible).toBe(true);
    expect(Math.abs(c.deviation[EXERCISE_METHODS.conditioned.id]!)).toBeLessThan(3);
    expect(c.impedanceShiftPct!).toBeLessThan(-4);
  });
  it('SIM-08 opens a bounded experimental deviation; SIM-09 refuses to compare; SIM-10 reports impedance only', () => {
    const r8 = run('SIM-08'), r9 = run('SIM-09'), r10 = run('SIM-10');
    const ev = r8.events.find((e) => e.ruleId === 'EXR-DEV-01')!;
    expect(Number(ev.explanationParams.pct)).toBeLessThan(-10);
    expect(ev.limitations).toEqual(expect.arrayContaining(['not-an-atrophy-diagnosis', 'mmg-amplitude-is-not-force']));
    expect(openedRules(r9)).toContain('EXR-CMP-01');
    expect(openedRules(r9)).not.toContain('EXR-DEV-01');
    expect(openedRules(r10)).toContain('EXR-IMP-01');
    expect(openedRules(r10)).not.toContain('EXR-DEV-01');
  });
});

describe('rules and cross-module behaviour', () => {
  it('SIM-11: an invalid muscle interpretation does not suppress a valid, independent exposure event', () => {
    const r = run('SIM-11');
    const exp = firstOpen(r, 'EXP-INH-01')!, int = firstOpen(r, 'INT-CON-01')!;
    expect(exp).toBeLessThan(int);
    const expRevs = r.events.filter((e) => e.ruleId === 'EXP-INH-01');
    expect(expRevs.at(-1)!.state).not.toBe('resolved'); // still active while contact is degraded
    expect(r.snapshot.crews['crew-1'].breaths.filter((b) => b.startMs > 180000 && b.startMs < 280000).every((b) => b.estimates['aligned-quality-aware'] !== null)).toBe(true);
  });
  it('event revisions are monotonic per event, respect dwell, and every revision carries its evidence', () => {
    for (const id of ['SIM-05', 'SIM-11', 'SIM-14']) {
      const r = run(id);
      const last = new Map<string, number>();
      for (const e of r.events) {
        expect(e.revision).toBe((last.get(e.id) ?? 0) + 1);
        last.set(e.id, e.revision);
        expect(e.evidence.length).toBeGreaterThan(0);
        expect(e.evidenceIds).toEqual(e.evidence.map((x) => x.id));
        expect(e.limitations).toContain('simulated-data-not-clinical-evidence');
      }
    }
    const r5 = run('SIM-05');
    expect(firstOpen(r5, 'INT-CON-01')! - 93000).toBeGreaterThanOrEqual(1000); // contact ramp + 3 s dwell, not instant
  });
  it('acknowledging creates a new revision and a resolved event stays resolved', () => {
    const sim = createSimulator({ scenario: scenarioById('SIM-05'), seed: 1, missionId: 'm', runId: 'r', crewIds: ['crew-1'] });
    const e = createEngine({ missionId: 'm', runId: 'r', crewIds: ['crew-1'], sensorMeta: sim.sensorMeta, references: refs, origin: 'simulated' });
    let id: string | null = null, acked = 0;
    const all: number[] = [];
    while (sim.nowMs < 200000) {
      const b = sim.step(); e.ingest(b.records);
      const d = e.advanceTo(b.tMs + 100);
      for (const c of d.calibrationRequests) sim.inject({ atMs: sim.nowMs, kind: 'calibrate', crewId: c });
      for (const ev of d.events) if (ev.ruleId === 'INT-CON-01') { all.push(ev.revision); if (!id) { id = ev.id; acked = e.acknowledge(ev.id)!.revision; } }
    }
    expect(acked).toBe(2);
    expect(e.acknowledge(id!)).toBeNull();
    const final = e.snapshot().events.find((x) => x.id === id)!;
    expect(final.state).toBe('resolved');
    expect(final.revision).toBeGreaterThan(acked);
  });
});
