/// <reference lib="webworker" />
/**
 * Mission worker: owns deterministic scenario execution and analysis for the browser demo profile.
 * Browser closure or OS suspension stops this computation — it is not background medical monitoring.
 */
import refs from '../../../../data/reference/sessions.json';
import type { ReferenceSession } from '@aster/contracts';
import { MissionHost } from './host';
import type { FromWorker, ToWorker } from './protocol';

const post = (m: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);
const host = new MissionHost(refs as unknown as Record<string, ReferenceSession[]>, post);
let started = false;
let pending = 0;
let markReady: () => void = () => undefined;
/** Resolves once this worker owns the mission session AND reload recovery has finished. */
const ready = new Promise<void>((res) => { markReady = res; });

function begin(): void {
  if (started) return;
  started = true;
  void host.init().finally(markReady);
  setInterval(() => host.pump(performance.now()), 50);
  setInterval(() => host.emit(), 250);
}
/** Single explicit mission-session owner: other tabs wait as viewers until the lease is released. */
function acquire(): void {
  const locks = (self.navigator as Navigator | undefined)?.locks;
  if (!locks) { begin(); return; }
  host.owner = false; host.emit();
  void locks.request('aster-mission-owner', () => {
    host.owner = true; begin();
    return new Promise<void>(() => undefined);
  });
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'init') { acquire(); return; }
  if (m.type === 'view') { host.setView(m.req); return; }
  // Requests wait (bounded) until ownership and recovery are settled, so an early "Start demo" is neither
  // dropped nor overtaken by the recovery of a previous run.
  if (pending >= 16) return;
  pending++;
  void ready.then(() => { pending--; handle(m); });
};
function handle(m: ToWorker): void {
  switch (m.type) {
    case 'start': void host.start(m.scenarioId, m.seed); break;
    case 'control': host.control(m.action); break;
    case 'speed': host.setSpeed(m.speed); break;
    case 'command': void host.command(m.input); break;
    case 'reset': if (host.rt) void host.start(host.rt.spec.scenarioId, host.rt.spec.seed); break;
    case 'fork': if (host.rt) void host.start(host.rt.spec.scenarioId, host.rt.spec.seed, { runId: host.rt.spec.runId, atMs: m.atMs }); break;
    case 'export': host.export(m.kind); break;
    case 'retryPersist': void host.retryPersist(); break;
    case 'wipe': void host.wipe(); break;
  }
}
