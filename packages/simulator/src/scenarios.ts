import type { LinkConfig, Metric, ScenarioInfo } from '@aster/contracts';

/** Piecewise-linear keyframes: [timeMs, value]. */
export type Track = [number, number][];
export type TrackName =
  | 'cabinPpm' | 'vent' | 'kEx' | 'spatialGain' | 'sensorTauMs' | 'sensorDelayMs'
  | 'respNoise' | 'contact' | 'calPath' | 'response' | 'fluid';

export const TRACK_DEFAULTS: Record<TrackName, number> = {
  cabinPpm: 2800, vent: 4, kEx: 0.25, spatialGain: 0.9, sensorTauMs: 250, sensorDelayMs: 300,
  respNoise: 0.02, contact: 1, calPath: 1, response: 1, fluid: 0.2,
};

export interface ExerciseSegment { startMs: number; endMs: number; loadN: number; cadenceRpm: number; exerciseId: string }

/** Full latent scenario definition. Lives in the simulator only; the engine never sees it. */
export interface ScenarioDef extends ScenarioInfo {
  tracks: Partial<Record<TrackName, Track>>;
  exercise: ExerciseSegment[];
  dropouts: { metric: Metric; startMs: number; endMs: number }[];
  malformed: { startMs: number; endMs: number } | null;
  link: { outages: [number, number][]; duplicateDelivery: boolean; profile: LinkConfig['profile'] };
  storageFaultAtMs: number | null;
  /** Declared (datasheet) sensor characteristics handed to the engine as device metadata. */
  declared: { tauMs: number; delayMs: number };
  autoCalPeriodMs: number;
}

const S = 1000;
const base = (
  n: number, durationS: number, modules: ScenarioInfo['modules'], extra: Partial<ScenarioDef>,
): ScenarioDef => {
  const id = `SIM-${String(n).padStart(2, '0')}`;
  return {
    id, version: '1.0.0', titleKey: `scenario.${id}.title`, descriptionKey: `scenario.${id}.description`,
    durationMs: durationS * S, modules,
    tracks: {}, exercise: [], dropouts: [], malformed: null,
    link: { outages: [], duplicateDelivery: false, profile: 'near-real-time demonstration' },
    storageFaultAtMs: null, declared: { tauMs: 250, delayMs: 300 }, autoCalPeriodMs: 45 * S,
    ...extra,
  };
};
const ex = (startS: number, endS: number, loadN = 400, cadenceRpm = 20): ExerciseSegment => ({
  startMs: startS * S, endMs: endS * S, loadN, cadenceRpm, exerciseId: 'leg-press',
});
const step = (atS: number, from: number, to: number, rampS = 3): Track => [[0, from], [atS * S, from], [(atS + rampS) * S, to]];

export const SCENARIOS: ScenarioDef[] = [
  base(1, 180, ['exposure', 'integrity', 'exercise'], { exercise: [ex(40, 150)] }),
  base(2, 240, ['exposure'], { tracks: { vent: step(70, 4, 1.1, 8) } }),
  base(3, 240, ['exposure'], { tracks: { kEx: step(70, 0.25, 0.6, 5), vent: step(70, 4, 6, 5), spatialGain: step(70, 0.9, 1.3, 5) } }),
  base(4, 240, ['exposure'], {
    declared: { tauMs: 2500, delayMs: 300 },
    tracks: { sensorTauMs: [[0, 2500]], vent: step(60, 4, 1.1, 8), respNoise: step(130, 0.02, 0.3, 5) },
  }),
  base(5, 240, ['integrity', 'exercise'], { exercise: [ex(20, 220)], tracks: { contact: [[0, 1], [90 * S, 1], [93 * S, 0.5], [170 * S, 0.5], [173 * S, 1]] } }),
  base(6, 240, ['integrity', 'exercise'], { exercise: [ex(20, 220)], tracks: { response: step(100, 1, 0.68, 10) } }),
  base(7, 240, ['integrity', 'exercise'], { exercise: [ex(20, 220)], tracks: { calPath: step(80, 1, 0.5, 2) } }),
  base(8, 240, ['exercise'], { exercise: [ex(20, 220)], tracks: { response: step(90, 1, 0.7, 12) } }),
  base(9, 240, ['exercise'], { exercise: [ex(20, 220, 620)] }),
  base(10, 240, ['exercise'], { exercise: [ex(20, 220)], tracks: { fluid: step(80, 0.2, 0.55, 30) } }),
  base(11, 360, ['exposure', 'integrity', 'exercise', 'comms'], {
    exercise: [ex(40, 330)],
    tracks: {
      vent: step(100, 4, 1.1, 8), cabinPpm: [[0, 2800], [100 * S, 2800], [200 * S, 3400]],
      contact: [[0, 1], [170 * S, 1], [173 * S, 0.5], [285 * S, 0.5], [288 * S, 1]],
    },
    link: { outages: [[150 * S, 255 * S]], duplicateDelivery: false, profile: 'near-real-time demonstration' },
  }),
  base(12, 300, ['integrity', 'exercise', 'comms'], {
    exercise: [ex(10, 280)], tracks: { contact: [[0, 1], [35 * S, 1], [38 * S, 0.5], [200 * S, 0.5], [203 * S, 1]] },
    link: { outages: [[20 * S, 120 * S]], duplicateDelivery: true, profile: 'near-real-time demonstration' },
  }),
  base(13, 300, ['integrity', 'exercise', 'comms'], {
    exercise: [ex(10, 280)], tracks: { contact: [[0, 1], [35 * S, 1], [38 * S, 0.5], [75 * S, 0.5], [78 * S, 1]] },
    link: { outages: [], duplicateDelivery: false, profile: 'delayed exploration demonstration' },
  }),
  base(14, 180, ['data', 'exposure'], {
    malformed: { startMs: 50 * S, endMs: 110 * S },
    dropouts: [{ metric: 'co2.local', startMs: 70 * S, endMs: 95 * S }, { metric: 'mech.pvdf', startMs: 120 * S, endMs: 150 * S }],
  }),
  base(15, 180, ['data', 'integrity', 'exercise'], {
    exercise: [ex(10, 170)], tracks: { contact: [[0, 1], [40 * S, 1], [43 * S, 0.5], [120 * S, 0.5], [123 * S, 1]] },
    storageFaultAtMs: 70 * S,
  }),
];

export const scenarioById = (id: string): ScenarioDef => {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown scenario ${id}`);
  return s;
};
/** Engine/UI-safe listing: titles and durations only, no latent tracks. */
export const scenarioCatalog = (): ScenarioInfo[] =>
  SCENARIOS.map(({ id, version, titleKey, descriptionKey, durationMs, modules }) => ({ id, version, titleKey, descriptionKey, durationMs, modules }));

export function trackValue(track: Track | undefined, fallback: number, tMs: number): number {
  if (!track || track.length === 0) return fallback;
  if (tMs <= track[0][0]) return track[0][1];
  for (let i = 1; i < track.length; i++) {
    const [t1, v1] = track[i];
    if (tMs <= t1) {
      const [t0, v0] = track[i - 1];
      return t1 === t0 ? v1 : v0 + ((v1 - v0) * (tMs - t0)) / (t1 - t0);
    }
  }
  return track[track.length - 1][1];
}
