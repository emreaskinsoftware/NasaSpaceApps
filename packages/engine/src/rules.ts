/**
 * Versioned rule cards and the event state machine (dwell, hysteresis/reset, monotonic revisions).
 * Thresholds are "demonstration threshold — not a clinical limit" unless a rule says otherwise.
 */
import type { DataOrigin, EvidenceItem, HealthEvent, QualityState, RuleCard } from '@aster/contracts';
import { EXPOSURE_METHODS } from './exposure';
import { EXERCISE_METHODS, type ExerciseProcessor } from './exercise';
import type { ExposureProcessor } from './exposure';
import type { IntegrityProcessor } from './integrity';
import { round } from './dsp';

export interface RuleCtx {
  nowMs: number;
  crewId: string;
  q: (metric: string) => { state: QualityState; reasons: string[]; lastAtMs: number | null };
  exposure: ExposureProcessor;
  integrity: IntegrityProcessor;
  exercise: ExerciseProcessor;
  quarantineRecent: { count: number; reason: string };
  everSeen: string[];
}
export interface RuleResult { key?: string; active: boolean; params: Record<string, string | number>; evidence: EvidenceItem[]; limitations: string[] }
interface RuleDef extends RuleCard { resetMs: number; test(c: RuleCtx): RuleResult | null }

const DEMO = 'demonstration-threshold-not-clinical-limit';
const SIMLIM = 'simulated-data-not-clinical-evidence';
const win = (a: number, b: number) => ({ startMs: Math.round(a), endMs: Math.round(b) });

export const RULE_CONSTANTS = { cabinPpm: 5000, inhaledExcessPpm: 1500, deviationZ: 3, impedanceShiftPct: 6 };

export const RULES: RuleDef[] = [
  {
    id: 'ENV-CO2-01', version: '1.0.0', module: 'environment', inputs: ['co2.cabin'], eligibility: 'Cabin CO2 channel valid',
    expression: `mean(co2.cabin, 30 s) > ${RULE_CONSTANTS.cabinPpm} ppm`, dwellMs: 10000, resetMs: 15000, reset: 'condition false for 15 s',
    rationale: 'Demonstration threshold — not a clinical limit. Environmental trend rule kept independent from wearable channels.', severity: 'priority',
    explanationKey: 'event.envCo2', unavailable: 'No event while the cabin channel is stale or invalid.', guidanceId: 'G-ENV-REVIEW', demonstrationThreshold: true,
    test(c) {
      if (c.q('co2.cabin').state !== 'valid') return null;
      const m = c.exposure.cabin.mean(c.nowMs - 30000, c.nowMs + 1);
      if (m === null) return null;
      return {
        key: `${Math.round(m / 1000)}`, active: m > RULE_CONSTANTS.cabinPpm, params: { ppm: round(m, -1) },
        evidence: [{ id: `obs:${c.crewId}:co2.cabin:${win(c.nowMs - 30000, c.nowMs).startMs}`, kind: 'observation', metric: 'co2.cabin', value: round(m), unit: 'ppm', quality: 'valid', window: win(c.nowMs - 30000, c.nowMs) }],
        limitations: [DEMO, SIMLIM],
      };
    },
  },
  {
    id: 'EXP-INH-01', version: '1.0.0', module: 'exposure', inputs: ['resp.displacement', 'co2.local', 'co2.cabin'],
    eligibility: 'At least 4 of the last 6 breaths have a non-withheld aligned estimate',
    expression: `estimate − cabin > ${RULE_CONSTANTS.inhaledExcessPpm} ppm in ≥ 4 of last 6 breaths`, dwellMs: 12000, resetMs: 20000, reset: 'condition false for 20 s',
    rationale: 'Demonstration threshold — not a clinical limit. Flags a local inhalation-phase concentration well above the cabin trace.', severity: 'review',
    explanationKey: 'event.expInhaled', unavailable: 'Withheld estimates never open this event; see EXP-WH-01.', guidanceId: 'G-EXP-VENT', demonstrationThreshold: true,
    test(c) {
      const last = c.exposure.breaths.slice(-6).filter((b) => b.endMs > c.nowMs - 45000);
      const cid = EXPOSURE_METHODS.candidate.id, kid = EXPOSURE_METHODS.cabin.id;
      const ok = last.filter((b) => b.estimates[cid] !== null && b.estimates[kid] !== null);
      if (ok.length < 4) return null;
      const hi = ok.filter((b) => b.estimates[cid]! - b.estimates[kid]! > RULE_CONSTANTS.inhaledExcessPpm);
      const est = ok.reduce((s, b) => s + b.estimates[cid]!, 0) / ok.length, cab = ok.reduce((s, b) => s + b.estimates[kid]!, 0) / ok.length;
      const w = win(ok[0].startMs, ok[ok.length - 1].endMs);
      const limited = ok.some((b) => b.strength !== 'supported');
      return {
        key: `${Math.floor((est - cab) / 3000)}|${limited}`, active: hi.length >= 4, params: { ppm: round(est, -1), cabin: round(cab, -1), breaths: ok.length, phase: limited ? 'limited' : 'supported' },
        evidence: [
          { id: `est:${c.crewId}:inh:${w.startMs}`, kind: 'estimate', metric: 'co2.inhaled.timeweighted', value: round(est), unit: 'ppm', quality: limited ? 'suspect' : 'valid', window: w, methodId: `${cid}@${EXPOSURE_METHODS.candidate.version}` },
          { id: `obs:${c.crewId}:co2.cabin:${w.startMs}`, kind: 'observation', metric: 'co2.cabin', value: round(cab), unit: 'ppm', quality: 'valid', window: w },
          { id: `q:${c.crewId}:resp:${w.startMs}`, kind: 'quality', metric: 'resp.phase-uncertainty', value: Math.max(...ok.map((b) => b.phaseUncertaintyMs)), unit: 'ms', quality: c.q('resp.displacement').state, window: w },
        ],
        limitations: ['time-weighted-not-inhaled-dose', 'spatial-sampling-uncertainty', DEMO, SIMLIM],
      };
    },
  },
  {
    id: 'EXP-WH-01', version: '1.0.0', module: 'exposure', inputs: ['resp.displacement', 'co2.local'], eligibility: 'Respiratory channel present',
    expression: 'aligned estimate withheld in ≥ 5 of last 6 breaths', dwellMs: 15000, resetMs: 20000, reset: 'estimates available again for 20 s',
    rationale: 'A withheld estimate is a result: the unsupported condition is surfaced rather than filled in.', severity: 'info',
    explanationKey: 'event.expWithheld', unavailable: 'Not raised when no breaths are detected at all (see DQ-STALE-01).', guidanceId: 'G-CHECK-SENSOR', demonstrationThreshold: false,
    test(c) {
      const last = c.exposure.breaths.slice(-6).filter((b) => b.endMs > c.nowMs - 45000);
      if (last.length < 5) return null;
      const wh = last.filter((b) => b.estimates[EXPOSURE_METHODS.candidate.id] === null);
      const reasons = [...new Set(wh.flatMap((b) => b.reasons))];
      const w = win(last[0].startMs, last[last.length - 1].endMs);
      return {
        key: reasons[0] ?? 'none', active: wh.length >= 5, params: { reason: reasons[0] ?? 'none', withheld: wh.length },
        evidence: [{ id: `q:${c.crewId}:exp:${w.startMs}`, kind: 'quality', metric: 'co2.inhaled.timeweighted', value: null, unit: 'ppm', quality: 'unavailable', window: w, note: reasons.join(', ') }],
        limitations: ['estimate-unavailable-not-zero', SIMLIM],
      };
    },
  },
  {
    id: 'INT-CON-01', version: '1.0.0', module: 'integrity', inputs: ['contact.force', 'mech.pvdf', 'actuator.state'], eligibility: 'Contact channel present with a frozen reference',
    expression: 'contact < 85 % of reference, or last two windows not accepted', dwellMs: 3000, resetMs: 8000, reset: 'contact valid and windows accepted for 8 s',
    rationale: 'A mechanical waveform change during degraded contact cannot be attributed to the body.', severity: 'review',
    explanationKey: 'event.intContact', unavailable: 'If the contact channel is missing the dependent interpretation is unavailable (DQ-STALE-01).', guidanceId: 'G-CHECK-CONTACT', demonstrationThreshold: true,
    test(c) {
      const ws = c.integrity.windows.slice(-2).filter((w) => w.endMs > c.nowMs - 8000);
      const fr = c.integrity.contactRatio(c.nowMs);
      if (fr === null || c.q('contact.force').state !== 'valid' || ws.length === 0) return null;
      const bad = ws.every((w) => w.contact === 'invalid' || w.contact === 'suspect');
      const w = win(ws[0].startMs, ws[ws.length - 1].endMs), lw = ws[ws.length - 1];
      // An excitation (masked) window is transient: report the latest substantive decision instead.
      const decision = [...c.integrity.windows].reverse().find((x) => x.decision !== 'masked')?.decision ?? lw.decision;
      const ev: EvidenceItem[] = [
        { id: `obs:${c.crewId}:contact:${w.startMs}`, kind: 'observation', metric: 'contact.force', value: lw.contactForceN === null ? null : round(lw.contactForceN, 1), unit: 'N', quality: lw.contact, window: w, note: `${round(fr * 100)} % of reference` },
        { id: `est:${c.crewId}:gain:${w.startMs}`, kind: 'estimate', metric: 'mech.transfer-gain', value: lw.transferGain === null ? null : round(lw.transferGain, 2), unit: 'ratio', quality: c.integrity.cal.state === 'accepted' ? 'valid' : 'suspect', window: w, methodId: 'calibration-aware@1.0.1', note: `calibration ${c.integrity.cal.state}` },
        { id: `obs:${c.crewId}:rms:${w.startMs}`, kind: 'observation', metric: 'mech.pvdf.rms', value: lw.rms.fixed === null ? null : round(lw.rms.fixed, 4), unit: 'a.u.', quality: lw.contact, window: w, note: `decision ${decision}` },
      ];
      return { key: decision, active: bad || fr < 0.85, params: { pct: round(fr * 100), decision }, evidence: ev, limitations: ['self-check-is-not-physiological-calibration', DEMO, SIMLIM] };
    },
  },
  {
    id: 'INT-CAL-01', version: '1.0.0', module: 'integrity', inputs: ['actuator.state', 'mech.pvdf', 'contact.force'], eligibility: 'A calibration has been evaluated',
    expression: 'calibration state = rejected', dwellMs: 0, resetMs: 2000, reset: 'next calibration accepted',
    rationale: 'A calibration response that disagrees with the contact measurement does not justify a correction.', severity: 'info',
    explanationKey: 'event.intCalRejected', unavailable: 'Not raised before the first calibration.', guidanceId: 'G-CHECK-SENSOR', demonstrationThreshold: true,
    test(c) {
      const k = c.integrity.cal;
      if (k.lastAtMs === null) return null;
      if (k.state === 'active' || k.state === 'evaluating') return null;
      const w = win(k.lastAtMs - 1000, k.lastAtMs);
      return {
        active: k.state === 'rejected', params: { reason: k.reason ?? 'unknown', gain: k.lastGain === null ? 'n/a' : round(k.lastGain, 2) },
        evidence: [{ id: `est:${c.crewId}:cal:${w.startMs}`, kind: 'estimate', metric: 'mech.transfer-gain', value: k.lastGain === null ? null : round(k.lastGain, 2), unit: 'ratio', quality: 'suspect', window: w, methodId: 'calibration-aware@1.0.1', note: k.reason ?? '' }],
        limitations: ['actuator-path-may-differ-from-physiological-path', SIMLIM],
      };
    },
  },
  {
    id: 'EXR-DEV-01', version: '1.0.0', module: 'exercise', inputs: ['mech.pvdf', 'exercise.load', 'exercise.position', 'contact.force'], eligibility: 'Comparison eligible (matched load, cadence, valid repetitions)',
    expression: `|z(matched-conditioned)| > ${RULE_CONSTANTS.deviationZ}`, dwellMs: 9000, resetMs: 15000, reset: 'condition false for 15 s',
    rationale: 'Demonstration threshold — not a clinical limit. Within-person deviation from matched reference sessions.', severity: 'review',
    explanationKey: 'event.exrDeviation', unavailable: 'No event when sessions are not comparable or repetitions are invalid.', guidanceId: 'G-REVIEW-CMO', demonstrationThreshold: true,
    test(c) {
      const k = c.exercise.comparison;
      if (!c.exercise.session.active || !k || !k.eligible) return null;
      const z = k.deviation[EXERCISE_METHODS.conditioned.id];
      if (z === null) return null;
      const reps = c.exercise.reps.slice(-k.repsUsed), w = win(reps[0]?.startMs ?? c.nowMs, reps[reps.length - 1]?.endMs ?? c.nowMs);
      const zf = k.deviation[EXERCISE_METHODS.fluidAware.id];
      return {
        key: `${Math.sign(z)}|${k.strength}`, active: Math.abs(z) > RULE_CONSTANTS.deviationZ, params: { pct: round(k.percentDiff ?? 0), z: round(z, 1), refs: k.referenceIds.length, strength: k.strength },
        evidence: [
          { id: `est:${c.crewId}:dev:${w.startMs}`, kind: 'estimate', metric: 'mmg.response-deviation', value: round(z, 2), unit: 'z', quality: k.strength === 'supported' ? 'valid' : 'suspect', window: w, methodId: 'matched-conditioned@1.0.1', note: `${k.referenceIds.length} matched reference sessions` },
          { id: `est:${c.crewId}:devf:${w.startMs}`, kind: 'estimate', metric: 'mmg.response-deviation', value: zf === null ? null : round(zf, 2), unit: 'z', quality: zf === null ? 'unavailable' : 'suspect', window: w, methodId: 'fluid-aware@1.0.0', note: 'experimental comparison method' },
          { id: `obs:${c.crewId}:imp:${w.startMs}`, kind: 'observation', metric: 'imp.r10k.shift', value: k.impedanceShiftPct === null ? null : round(k.impedanceShiftPct, 1), unit: '%', quality: c.q('imp.r10k').state, window: w },
        ],
        limitations: ['mmg-amplitude-is-not-force', 'not-an-atrophy-diagnosis', DEMO, SIMLIM],
      };
    },
  },
  {
    id: 'EXR-CMP-01', version: '1.0.0', module: 'exercise', inputs: ['exercise.load', 'exercise.position'], eligibility: 'Session active with ≥ 6 repetitions',
    expression: 'comparison not eligible', dwellMs: 6000, resetMs: 10000, reset: 'comparison eligible or session ended',
    rationale: 'Unmatched segments must not be compared like for like.', severity: 'info',
    explanationKey: 'event.exrNotComparable', unavailable: '—', guidanceId: null, demonstrationThreshold: false,
    test(c) {
      const k = c.exercise.comparison;
      if (!c.exercise.session.active || c.exercise.reps.length < 6 || !k) return null;
      const w = win(c.exercise.session.startedAtMs ?? c.nowMs, c.nowMs);
      return {
        active: !k.eligible, params: { reason: k.reasons[0] ?? 'none' },
        evidence: [{ id: `q:${c.crewId}:cmp:${w.startMs}`, kind: 'quality', metric: 'mmg.response-deviation', value: null, unit: 'z', quality: 'unavailable', window: w, note: k.reasons.join(', ') }],
        limitations: ['comparison-withheld', SIMLIM],
      };
    },
  },
  {
    id: 'EXR-IMP-01', version: '1.0.0', module: 'exercise', inputs: ['imp.r10k', 'mech.pvdf'], eligibility: 'Comparison eligible and impedance valid',
    expression: `|impedance shift vs. matched references| > ${RULE_CONSTANTS.impedanceShiftPct} %`, dwellMs: 10000, resetMs: 15000, reset: 'condition false for 15 s',
    rationale: 'A fluid-sensitive impedance change is reported as context; it is not evidence of muscle loss.', severity: 'info',
    explanationKey: 'event.exrImpedance', unavailable: 'No event if impedance is stale or contact is degraded.', guidanceId: null, demonstrationThreshold: true,
    test(c) {
      const k = c.exercise.comparison;
      if (!c.exercise.session.active || !k || !k.eligible || k.impedanceShiftPct === null) return null;
      const z = k.deviation[EXERCISE_METHODS.conditioned.id] ?? 0;
      const w = win(c.nowMs - 20000, c.nowMs);
      return {
        key: `${Math.sign(k.impedanceShiftPct)}`, active: Math.abs(k.impedanceShiftPct) > RULE_CONSTANTS.impedanceShiftPct, params: { pct: round(k.impedanceShiftPct, 1), z: round(z, 1) },
        evidence: [
          { id: `obs:${c.crewId}:imp:${w.startMs}`, kind: 'observation', metric: 'imp.r10k.shift', value: round(k.impedanceShiftPct, 1), unit: '%', quality: 'valid', window: w },
          { id: `est:${c.crewId}:dev:${w.startMs}`, kind: 'estimate', metric: 'mmg.response-deviation', value: round(z, 2), unit: 'z', quality: 'valid', window: w, methodId: 'matched-conditioned@1.0.1' },
        ],
        limitations: ['impedance-is-not-fluid-volume', 'not-an-atrophy-diagnosis', DEMO, SIMLIM],
      };
    },
  },
  {
    id: 'DQ-STALE-01', version: '1.0.0', module: 'data', inputs: ['*'], eligibility: 'Channel was present earlier in the run',
    expression: 'a previously present channel is stale', dwellMs: 3000, resetMs: 4000, reset: 'all previously present channels fresh for 4 s',
    rationale: 'Missing data is shown as missing; dependent interpretations become unavailable, independent ones continue.', severity: 'info',
    explanationKey: 'event.dqStale', unavailable: '—', guidanceId: 'G-CHECK-SENSOR', demonstrationThreshold: false,
    test(c) {
      const stale = c.everSeen.filter((m) => c.q(m).state === 'stale');
      return {
        active: stale.length > 0, params: { channels: stale.slice(0, 4).join(', ') || '—', n: stale.length },
        evidence: stale.slice(0, 6).map((m) => ({ id: `q:${c.crewId}:${m}:${Math.round(c.nowMs / 1000)}`, kind: 'quality' as const, metric: m, value: null, unit: '-', quality: 'stale' as const, window: win(c.q(m).lastAtMs ?? c.nowMs, c.nowMs) })),
        limitations: ['no-fabricated-continuity', SIMLIM],
      };
    },
  },
  {
    id: 'DQ-QUAR-01', version: '1.0.0', module: 'data', inputs: ['*'], eligibility: 'Always',
    expression: 'records quarantined in the last 10 s', dwellMs: 0, resetMs: 12000, reset: 'no quarantined records for 12 s',
    rationale: 'Malformed, duplicated, out-of-order or unit-mismatched input is rejected, counted and never repaired by guessing.', severity: 'info',
    explanationKey: 'event.dqQuarantine', unavailable: '—', guidanceId: 'G-CHECK-SENSOR', demonstrationThreshold: false,
    test(c) {
      const k = c.quarantineRecent;
      return {
        key: k.reason, active: k.count > 0, params: { n: k.count, reason: k.reason || '—' },
        evidence: [{ id: `q:${c.crewId}:quarantine:${Math.round(c.nowMs / 10000)}`, kind: 'quality', metric: 'ingest.quarantine', value: k.count, unit: 'records', quality: 'invalid', window: win(c.nowMs - 10000, c.nowMs), note: k.reason }],
        limitations: ['rejected-input-not-repaired', SIMLIM],
      };
    },
  },
];
export const ruleCards = (): RuleCard[] => RULES.map(({ test: _t, resetMs: _r, ...card }) => card);

export const GUIDANCE: Record<string, { id: string; titleKey: string; stepsKey: string; status: 'not-validated' }> = {
  'G-CHECK-CONTACT': { id: 'G-CHECK-CONTACT', titleKey: 'guidance.checkContact.title', stepsKey: 'guidance.checkContact.steps', status: 'not-validated' },
  'G-CHECK-SENSOR': { id: 'G-CHECK-SENSOR', titleKey: 'guidance.checkSensor.title', stepsKey: 'guidance.checkSensor.steps', status: 'not-validated' },
  'G-EXP-VENT': { id: 'G-EXP-VENT', titleKey: 'guidance.expVent.title', stepsKey: 'guidance.expVent.steps', status: 'not-validated' },
  'G-ENV-REVIEW': { id: 'G-ENV-REVIEW', titleKey: 'guidance.envReview.title', stepsKey: 'guidance.envReview.steps', status: 'not-validated' },
  'G-REVIEW-CMO': { id: 'G-REVIEW-CMO', titleKey: 'guidance.reviewCmo.title', stepsKey: 'guidance.reviewCmo.steps', status: 'not-validated' },
};

interface Slot { activeSince: number | null; inactiveSince: number | null; event: HealthEvent | null; key: string; lastRevAt: number; n: number }

export class RuleMachine {
  private slots = new Map<string, Slot>();
  readonly latest = new Map<string, HealthEvent>();
  constructor(private ids: { missionId: string; runId: string; origin: DataOrigin }) {}

  private revise(ev: HealthEvent, nowMs: number, patch: Partial<HealthEvent>, out: HealthEvent[]): HealthEvent {
    const next: HealthEvent = { ...ev, ...patch, revision: ev.revision + 1, updatedAtMs: nowMs };
    this.latest.set(next.id, next); out.push(next);
    return next;
  }

  evaluate(c: RuleCtx, out: HealthEvent[]): void {
    for (const rule of RULES) {
      const sk = `${rule.id}|${c.crewId}`;
      let s = this.slots.get(sk);
      if (!s) { s = { activeSince: null, inactiveSince: null, event: null, key: '', lastRevAt: 0, n: 0 }; this.slots.set(sk, s); }
      if (s.event) s.event = this.latest.get(s.event.id) ?? s.event; // pick up acknowledgements
      const r = rule.test(c);
      if (r === null) { s.activeSince = null; continue; } // evidence unavailable: neither open nor resolve
      if (r.active) {
        s.inactiveSince = null;
        if (s.activeSince === null) s.activeSince = c.nowMs;
        const key = r.key ?? JSON.stringify(r.params);
        if (!s.event && c.nowMs - s.activeSince >= rule.dwellMs) {
          const ev: HealthEvent = {
            id: `${this.ids.runId}:${rule.id}:${c.crewId}:${++s.n}`, revision: 1, missionId: this.ids.missionId, runId: this.ids.runId, crewId: c.crewId,
            openedAtMs: c.nowMs, updatedAtMs: c.nowMs, severity: rule.severity, state: 'open', ruleId: rule.id, ruleVersion: rule.version,
            evidenceIds: r.evidence.map((e) => e.id), explanationKey: rule.explanationKey, explanationParams: r.params, limitations: r.limitations,
            guidanceId: rule.guidanceId, origin: this.ids.origin, evidence: r.evidence, module: rule.module,
          };
          s.event = ev; s.key = key; s.lastRevAt = c.nowMs; this.latest.set(ev.id, ev); out.push(ev);
        } else if (s.event && key !== s.key && c.nowMs - s.lastRevAt >= 20000) {
          s.event = this.revise(s.event, c.nowMs, { explanationParams: r.params, evidence: r.evidence, evidenceIds: r.evidence.map((e) => e.id) }, out);
          s.key = key; s.lastRevAt = c.nowMs;
        }
      } else {
        s.activeSince = null;
        if (s.event) {
          if (s.inactiveSince === null) s.inactiveSince = c.nowMs;
          if (c.nowMs - s.inactiveSince >= rule.resetMs) { this.revise(s.event, c.nowMs, { state: 'resolved' }, out); s.event = null; s.inactiveSince = null; }
        }
      }
    }
  }

  acknowledge(eventId: string, nowMs: number): HealthEvent | null {
    const ev = this.latest.get(eventId);
    if (!ev || ev.state !== 'open') return null;
    const out: HealthEvent[] = [];
    return this.revise(ev, nowMs, { state: 'acknowledged' }, out);
  }
}
