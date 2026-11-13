/**
 * ASTER public contracts. Runtime schemas validate everything that crosses a
 * trust boundary (imports, device frames, HTTP bodies). No simulator truth type
 * is defined here on purpose: inference must never be able to name it.
 */
import { z } from 'zod';

// The app ships a CSP without 'unsafe-eval': keep zod on its interpreter path so it never probes `new Function`.
z.config({ jitless: true });

export const SCHEMA_VERSION = 1 as const;

export const DataOrigin = z.enum(['simulated', 'recorded', 'hardware', 'mixed']);
export type DataOrigin = z.infer<typeof DataOrigin>;
export const QualityState = z.enum(['valid', 'suspect', 'invalid', 'stale', 'unavailable']);
export type QualityState = z.infer<typeof QualityState>;
export const EvidenceStrength = z.enum(['insufficient', 'limited', 'supported']);
export type EvidenceStrength = z.infer<typeof EvidenceStrength>;
export type InterpretationStatus = 'observation' | 'experimental-estimate' | 'research-guidance';

const id = z.string().min(1).max(160);
const finite = z.number().refine(Number.isFinite, 'must be finite');

/** Canonical unit per metric. Anything else is rejected, never silently converted. */
export const METRICS = {
  'co2.cabin': { unit: 'ppm', rateHz: 1, min: 0, max: 100000 },
  'co2.local': { unit: 'ppm', rateHz: 20, min: 0, max: 100000 },
  'pressure.cabin': { unit: 'kPa', rateHz: 1, min: 20, max: 120 },
  'temp.cabin': { unit: 'Cel', rateHz: 1, min: -20, max: 60 },
  'resp.displacement': { unit: 'a.u.', rateHz: 25, min: -1e6, max: 1e6 },
  'mech.pvdf': { unit: 'a.u.', rateHz: 200, min: -1e6, max: 1e6 },
  'imu.accel': { unit: 'm/s2', rateHz: 100, min: -400, max: 400 },
  'contact.force': { unit: 'N', rateHz: 10, min: 0, max: 200 },
  'actuator.state': { unit: '1', rateHz: 10, min: 0, max: 1 },
  'imp.r10k': { unit: 'ohm', rateHz: 1, min: 0, max: 5000 },
  'imp.x10k': { unit: 'ohm', rateHz: 1, min: -2000, max: 2000 },
  'imp.r100k': { unit: 'ohm', rateHz: 1, min: 0, max: 5000 },
  'imp.x100k': { unit: 'ohm', rateHz: 1, min: -2000, max: 2000 },
  'exercise.load': { unit: 'N', rateHz: 25, min: 0, max: 5000 },
  'exercise.position': { unit: 'a.u.', rateHz: 25, min: -10, max: 10 },
  'pulse.rate': { unit: 'beats/min', rateHz: 1, min: 20, max: 250 },
} as const;
export type Metric = keyof typeof METRICS;
export const METRIC_NAMES = Object.keys(METRICS) as Metric[];
export const isMetric = (m: string): m is Metric => Object.prototype.hasOwnProperty.call(METRICS, m);

export const Observation = z.object({
  schemaVersion: z.literal(1),
  id,
  missionId: id,
  runId: id,
  crewId: id.nullable(),
  streamId: id,
  sourceId: id,
  sequence: z.number().int().nonnegative(),
  observedAtMs: finite,
  receivedAtUtc: z.string().max(40),
  clockUncertaintyMs: finite.nonnegative(),
  metric: z.string().min(1).max(64),
  value: finite.nullable(),
  unit: z.string().min(1).max(24),
  origin: DataOrigin,
  quality: QualityState,
  qualityReasons: z.array(z.string().max(120)).max(12),
  provenanceId: id,
});
export type Observation = z.infer<typeof Observation>;

/** Signal chunk. `samples` is a Float32Array in memory; the transport codec is an explicit number[] (see codec below). */
export interface SignalChunk {
  schemaVersion: 1;
  missionId: string;
  runId: string;
  crewId: string;
  streamId: string;
  sourceId: string;
  sequence: number;
  startAtMs: number;
  sampleRateHz: number;
  samples: Float32Array;
  unit: string;
  origin: DataOrigin;
  quality: QualityState;
  clockUncertaintyMs: number;
  provenanceId: string;
  metric: string;
}
export const MAX_CHUNK_SAMPLES = 4096;
export const MAX_BATCH_RECORDS = 5000;

/** Versioned wire codec for chunks: codec "f32-array-v1" = plain JSON number array (NaN encoded as null). */
export const SignalChunkWire = z.object({
  codec: z.literal('f32-array-v1'),
  schemaVersion: z.literal(1),
  missionId: id,
  runId: id,
  crewId: id,
  streamId: id,
  sourceId: id,
  sequence: z.number().int().nonnegative(),
  startAtMs: finite,
  sampleRateHz: finite.positive().max(10000),
  samples: z.array(finite.nullable()).max(MAX_CHUNK_SAMPLES),
  unit: z.string().min(1).max(24),
  origin: DataOrigin,
  quality: QualityState,
  clockUncertaintyMs: finite.nonnegative(),
  provenanceId: id,
  metric: z.string().min(1).max(64),
});
export type SignalChunkWire = z.infer<typeof SignalChunkWire>;
export function encodeChunk(c: SignalChunk): SignalChunkWire {
  return { ...c, codec: 'f32-array-v1', samples: Array.from(c.samples, (v) => (Number.isFinite(v) ? v : null)) };
}
export function decodeChunk(w: SignalChunkWire): SignalChunk {
  const { codec: _codec, samples, ...rest } = w;
  return { ...rest, samples: Float32Array.from(samples, (v) => (v === null ? NaN : v)) };
}
export const isChunk = (r: Observation | SignalChunk): r is SignalChunk => (r as SignalChunk).samples !== undefined;

/** Declared (datasheet-style) instrument characteristics. Device metadata, NOT simulator truth. */
export interface SensorMeta {
  co2LocalResponseTauMs: number;
  co2LocalTransportDelayMs: number;
  calToneHz: number;
  impedanceFrequenciesHz: [number, number];
}

export interface Estimate {
  id: string;
  missionId: string;
  runId: string;
  crewId: string;
  metric: string;
  value: number | null;
  unit: string;
  window: { startMs: number; endMs: number };
  inputIds: string[];
  methodId: string;
  methodVersion: string;
  origin: DataOrigin;
  strength: EvidenceStrength;
  reasons: string[];
  validCoverage: number;
}

export type Severity = 'info' | 'review' | 'priority';
export type EventState = 'open' | 'acknowledged' | 'resolved';
export interface EvidenceItem {
  id: string;
  kind: 'observation' | 'quality' | 'estimate';
  metric: string;
  value: number | null;
  unit: string;
  quality: QualityState;
  window: { startMs: number; endMs: number };
  methodId?: string;
  note?: string;
}
export interface HealthEvent {
  id: string;
  revision: number;
  missionId: string;
  runId: string;
  crewId: string;
  openedAtMs: number;
  updatedAtMs: number;
  severity: Severity;
  state: EventState;
  ruleId: string;
  ruleVersion: string;
  evidenceIds: string[];
  explanationKey: string;
  explanationParams: Record<string, string | number>;
  limitations: string[];
  guidanceId: string | null;
  origin: DataOrigin;
  /** Evidence snapshot frozen with this revision so historical revisions stay inspectable. */
  evidence: EvidenceItem[];
  module: 'exposure' | 'integrity' | 'exercise' | 'environment' | 'data';
}

export interface RuleCard {
  id: string;
  version: string;
  module: HealthEvent['module'];
  inputs: string[];
  eligibility: string;
  expression: string;
  dwellMs: number;
  reset: string;
  rationale: string;
  severity: Severity;
  explanationKey: string;
  unavailable: string;
  guidanceId: string | null;
  demonstrationThreshold: boolean;
}

export type CalibrationState = 'not_available' | 'scheduled' | 'active' | 'evaluating' | 'accepted' | 'rejected' | 'expired';

export interface BreathRecord {
  index: number;
  startMs: number;
  inhaleEndMs: number;
  endMs: number;
  phaseUncertaintyMs: number;
  /** method id -> value (ppm) or null when withheld */
  estimates: Record<string, number | null>;
  coverage: number;
  lagMs: number;
  reasons: string[];
  strength: EvidenceStrength;
}
export interface IntegrityWindowRecord {
  startMs: number;
  endMs: number;
  contact: QualityState;
  contactForceN: number | null;
  transferGain: number | null;
  rms: { fixed: number | null; paired: number | null; candidate: number | null };
  decision: 'accepted' | 'corrected' | 'rejected' | 'masked';
  reasons: string[];
}
export interface RepRecord {
  index: number;
  startMs: number;
  endMs: number;
  loadN: number | null;
  cadenceRpm: number | null;
  mmgRms: number | null;
  /** Ablation only: paired-cleaned RMS without integrity gating/correction. */
  mmgRmsUngated: number | null;
  quality: QualityState;
  reasons: string[];
}
export interface ReferenceSession {
  id: string;
  label: string;
  exerciseId: string;
  dayOffset: number;
  loadN: number;
  cadenceRpm: number;
  mmgRms: number;
  r10k: number;
  r100k: number;
  origin: DataOrigin;
}
export interface ExerciseComparison {
  eligible: boolean;
  reasons: string[];
  referenceIds: string[];
  /** method id -> deviation z-score, null when not eligible */
  deviation: Record<string, number | null>;
  percentDiff: number | null;
  impedanceShiftPct: number | null;
  repsUsed: number;
  strength: EvidenceStrength;
}

export interface CrewEngineState {
  crewId: string;
  channelQuality: Record<string, { state: QualityState; reasons: string[]; lastAtMs: number | null }>;
  latest: Record<string, number | null>;
  breaths: BreathRecord[];
  exposureHistoryPpmMin: number;
  lagEstimateMs: number | null;
  integrity: IntegrityWindowRecord[];
  calibration: { state: CalibrationState; lastAtMs: number | null; nextAtMs: number | null; referenceGain: number | null; lastGain: number | null; reason: string | null };
  reps: RepRecord[];
  session: { active: boolean; startedAtMs: number | null; exerciseId: string | null };
  comparison: ExerciseComparison | null;
}

export interface EngineDelta {
  nowMs: number;
  estimates: Estimate[];
  events: HealthEvent[];
  quarantined: number;
  /** Instrument operation requests (run the reference actuator); never a crew task or life-support actuation. */
  calibrationRequests: string[];
}
export interface EngineSnapshot {
  nowMs: number;
  crews: Record<string, CrewEngineState>;
  events: HealthEvent[];
  quarantine: { count: number; recent: { reason: string; metric: string; atMs: number }[] };
}
export interface Engine {
  ingest(batch: readonly (Observation | SignalChunk)[]): void;
  advanceTo(missionTimeMs: number): EngineDelta;
  snapshot(): EngineSnapshot;
  acknowledge(eventId: string): HealthEvent | null;
}

/* ---------- adapters ---------- */
export type VerificationLevel = 'emulator-verified' | 'recording-verified' | 'hardware-verified' | 'not implemented';
export interface AdapterCapabilities {
  id: string;
  transport: 'replay' | 'websocket' | 'serial' | 'ble' | 'camera' | 'simulator';
  supported: boolean;
  requiresUserGesture: boolean;
  verification: VerificationLevel;
  note: string;
}
export type AdapterConfig =
  | { kind: 'replay'; text: string; format: 'ndjson' | 'csv' }
  | { kind: 'websocket'; url: string }
  | { kind: 'serial'; baudRate: number };
export interface TelemetryAdapter {
  id: string;
  capabilities(): Promise<AdapterCapabilities>;
  connect(config: AdapterConfig): Promise<void>;
  observations(signal: AbortSignal): AsyncIterable<Observation | SignalChunk>;
  disconnect(): Promise<void>;
}

/* ---------- communication ---------- */
export const PackageState = z.enum(['queued', 'sending', 'delivered', 'acknowledged', 'failed', 'superseded']);
export type PackageState = z.infer<typeof PackageState>;

export const CasePackage = z.object({
  schemaVersion: z.literal(1),
  packageId: id,
  missionId: id,
  runId: id,
  eventId: id,
  eventRevision: z.number().int().positive(),
  crewPseudonym: id,
  generatedAtMs: finite,
  inputInterval: z.object({ startMs: finite, endMs: finite }),
  summary: z.object({
    ruleId: id,
    ruleVersion: z.string().max(24),
    severity: z.enum(['info', 'review', 'priority']),
    module: z.string().max(24),
    explanationKey: z.string().max(120),
    explanationParams: z.record(z.string().max(60), z.union([z.string().max(200), finite])).refine((o) => Object.keys(o).length <= 32, 'too many parameters'),
  }),
  evidence: z
    .array(
      z.object({
        id,
        kind: z.enum(['observation', 'quality', 'estimate']),
        metric: z.string().max(64),
        value: finite.nullable(),
        unit: z.string().max(24),
        quality: QualityState,
        window: z.object({ startMs: finite, endMs: finite }),
        methodId: z.string().max(64).optional(),
        note: z.string().max(300).optional(),
      }),
    )
    .max(64),
  snippets: z.array(z.object({ metric: z.string().max(64), unit: z.string().max(24), startMs: finite, stepMs: finite, values: z.array(finite.nullable()).max(600) })).max(8),
  limitations: z.array(z.string().max(200)).max(16),
  missing: z.array(z.string().max(200)).max(16),
  origin: DataOrigin,
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
}).refine((p) => p.packageId === `${p.eventId}@r${p.eventRevision}`, 'packageId must equal eventId@rRevision');
export type CasePackage = z.infer<typeof CasePackage>;

export const Receipt = z.object({
  packageId: id,
  runId: id,
  receivedAtMs: finite,
  duplicate: z.boolean(),
  hashOk: z.boolean(),
});
export type Receipt = z.infer<typeof Receipt>;

export const GroundReply = z.object({
  schemaVersion: z.literal(1),
  replyId: id,
  runId: id,
  packageId: id,
  eventId: id,
  eventRevision: z.number().int().positive(),
  authorRole: z.enum(['ground-specialist', 'simulated-responder']),
  createdAtMs: finite,
  requestedEvidence: z.array(z.string().max(200)).max(8),
  text: z.string().min(1).max(2000),
});
export type GroundReply = z.infer<typeof GroundReply>;

export interface OutboxEntry<T = CasePackage> {
  id: string;
  payload: T;
  priority: number;
  state: PackageState;
  attempts: number;
  queuedAtMs: number;
  nextAttemptAtMs: number;
  deliveredAtMs: number | null;
  sizeBytes: number;
  lastError: string | null;
}
export interface LinkConfig {
  profile: 'near-real-time demonstration' | 'delayed exploration demonstration';
  oneWayDelayMs: number;
  bandwidthBytesPerSec: number;
  packetLoss: number;
  up: boolean;
}
export const LINK_PROFILES: Record<LinkConfig['profile'], Omit<LinkConfig, 'up' | 'profile'>> = {
  'near-real-time demonstration': { oneWayDelayMs: 1300, bandwidthBytesPerSec: 20000, packetLoss: 0.02 },
  'delayed exploration demonstration': { oneWayDelayMs: 20000, bandwidthBytesPerSec: 2000, packetLoss: 0.05 },
};

/* ---------- scenario (public, engine-safe description only) ---------- */
export interface ScenarioInfo {
  id: string;
  version: string;
  titleKey: string;
  descriptionKey: string;
  durationMs: number;
  modules: ('exposure' | 'integrity' | 'exercise' | 'comms' | 'data')[];
}

export interface RunManifest {
  schemaVersion: 1;
  missionId: string;
  runId: string;
  parentRunId: string | null;
  forkedAtMs: number | null;
  scenarioId: string;
  scenarioVersion: string;
  seed: number;
  generatorVersion: string;
  engineVersion: string;
  ruleVersions: Record<string, string>;
  methodVersions: Record<string, string>;
  startedAtUtc: string;
  origin: DataOrigin;
  units: Record<string, string>;
  sampleRatesHz: Record<string, number>;
  codeCommit: string;
}
