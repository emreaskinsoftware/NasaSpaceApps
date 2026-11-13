import type { CommandInput, ViewRequest, ViewState } from '@aster/runtime';

export interface RunStatus {
  hasRun: boolean;
  running: boolean;
  speed: number;
  recovering: boolean;
  recovered: boolean;
  owner: boolean;
  finished: boolean;
  persist: { ok: boolean; lastDurableMs: number; error: string | null; simulatedFault: boolean };
  workerLagMs: number;
  storage: { usage: number | null; quota: number | null };
  runs: { runId: string; scenarioId: string; seed: number; lastMs: number; parentRunId: string | null; startedAtUtc: string; active: boolean }[];
}
export type ToWorker =
  | { type: 'init' }
  | { type: 'start'; scenarioId: string; seed: number }
  | { type: 'control'; action: 'run' | 'pause' | 'step' }
  | { type: 'speed'; speed: number }
  | { type: 'command'; input: CommandInput }
  | { type: 'view'; req: ViewRequest }
  | { type: 'reset' }
  | { type: 'fork'; atMs: number }
  | { type: 'export'; kind: 'run' | 'truth' | 'backup' }
  | { type: 'retryPersist' }
  | { type: 'wipe' };
export type FromWorker =
  | { type: 'state'; status: RunStatus; view: ViewState | null }
  | { type: 'export'; kind: string; filename: string; json: string }
  | { type: 'error'; op: string; message: string };
