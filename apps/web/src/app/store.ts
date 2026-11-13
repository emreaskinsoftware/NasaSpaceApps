import { create } from 'zustand';
import type { CommandInput, ViewRequest, ViewState } from '@aster/runtime';
import type { FromWorker, RunStatus, ToWorker } from '../workers/protocol';

/** Stable empty references: selectors must not return a fresh array each render. */
export const NO_EVENTS: import('@aster/contracts').HealthEvent[] = [];
export const NO_CREW: { id: string; pseudonym: string; name: string }[] = [];
export type Theme = 'system' | 'light' | 'dark';
export const LOCALES = ['en', 'tr', 'de', 'fr', 'es', 'ar', 'ja'] as const;
export type Locale = (typeof LOCALES)[number];
export interface Settings { theme: Theme; locale: Locale; reduceMotion: boolean; pauseVisual: boolean; co2Unit: 'ppm' | 'kPa'; lowPower: boolean; role: 'crew' | 'cmo' | 'researcher' }
const DEFAULTS: Settings = { theme: 'system', locale: 'en', reduceMotion: false, pauseVisual: false, co2Unit: 'ppm', lowPower: false, role: 'cmo' };
const KEY = 'aster.settings.v1';

function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    const s = { ...DEFAULTS, ...raw };
    if (!LOCALES.includes(s.locale)) s.locale = 'en';
    if (!['system', 'light', 'dark'].includes(s.theme)) s.theme = 'system';
    if (!['crew', 'cmo', 'researcher'].includes(s.role)) s.role = 'cmo';
    if (!['ppm', 'kPa'].includes(s.co2Unit)) s.co2Unit = 'ppm';
    for (const k of ['reduceMotion', 'pauseVisual', 'lowPower'] as const) s[k] = s[k] === true;
    return s;
  } catch { return { ...DEFAULTS }; }
}

interface AppState {
  settings: Settings;
  setSettings(p: Partial<Settings>): void;
  status: RunStatus | null;
  view: ViewState | null;
  req: ViewRequest;
  cursorMs: number | null;
  setCursor(t: number | null): void;
  lastError: { op: string; message: string } | null;
  clearError(): void;
  setReq(p: Partial<ViewRequest>): void;
  send(m: ToWorker): void;
  command(input: CommandInput): void;
  toast: string | null;
  setToast(t: string | null): void;
}

let worker: Worker | null = null;
export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const useApp = create<AppState>((set, get) => ({
  settings: loadSettings(),
  setSettings(p) {
    const settings = { ...get().settings, ...p };
    try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* preference persistence is best-effort */ }
    set({ settings });
  },
  status: null, view: null,
  req: { crewId: 'crew-1', metrics: [], windowMs: 60000, endMs: null, eventId: null, includeTruth: false },
  cursorMs: null,
  setCursor: (cursorMs) => set({ cursorMs }),
  lastError: null,
  clearError: () => set({ lastError: null }),
  setReq(p) {
    const prev = get().req, req = { ...prev, ...p };
    if (JSON.stringify(prev) === JSON.stringify(req)) return;
    set({ req });
    get().send({ type: 'view', req });
  },
  send(m) { worker?.postMessage(m); },
  command(input) { get().send({ type: 'command', input }); },
  toast: null,
  setToast(toast) { set({ toast }); if (toast) setTimeout(() => { if (get().toast === toast) set({ toast: null }); }, 4000); },
}));

export function bootWorker(): void {
  if (worker) return;
  worker = new Worker(new URL('../workers/mission.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if (m.type === 'state') {
      // "Pause visual updates" freezes rendering only; the engine keeps running.
      const s = useApp.getState();
      if (s.settings.pauseVisual && s.view && m.status.running) useApp.setState({ status: m.status });
      else useApp.setState({ status: m.status, view: m.view });
    } else if (m.type === 'export') downloadText(m.filename, m.json);
    else useApp.setState({ lastError: { op: m.op, message: m.message } });
  };
  worker.onerror = (e) => useApp.setState({ lastError: { op: 'worker', message: e.message } });
  worker.postMessage({ type: 'init' } satisfies ToWorker);
  worker.postMessage({ type: 'view', req: useApp.getState().req } satisfies ToWorker);
}
