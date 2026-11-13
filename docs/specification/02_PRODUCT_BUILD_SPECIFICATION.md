# ASTER Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. If these skills are unavailable, follow the same explicit implementation and verification sequence natively and record the substitution. The intended implementer is Claude Fable 5.2; this handoff does not require switching models.

**Goal:** Deliver a polished, simulation-first, offline-capable space-health research web application with three connected scientific modules, functioning communication workflows, multilingual design, integration adapters, reproducible evaluation, and complete English release media.

**Architecture:** A TypeScript domain core consumes normalized observations, computes features and quality, evaluates versioned rules, and produces evidence-linked events. The same core runs in a browser worker for the standalone demo and in a local gateway for durable workstation operation. A separate ground service receives only transmitted case packages; simulation truth is isolated from inference.

**Tech Stack:** React, TypeScript, Vite, Tailwind CSS, accessible headless UI primitives, Motion, Apache ECharts, i18next, Dexie/IndexedDB, Fastify, SQLite, Zod, Vitest, Playwright, and Remotion. Resolve compatible stable versions from official sources; commit exact versions and the lockfile.

**Spec:** `01_PROJECT_OVERVIEW.md`. Also read the presentation, video, and source documents before implementing.

## 1. Global constraints

- All three research modules are required; they share data contracts and event logic.
- Simulation is the default source and must remain visibly labeled.
- English is the default product language and the only language of README, technical documents, slides, narration, and public release text.
- Core application locales: English (`en`), Turkish (`tr`), German (`de`), French (`fr`), Spanish (`es`), Arabic (`ar`, RTL), and Japanese (`ja`).
- Full light, dark, and system theme modes are required.
- No cloud dependency is allowed in the offline critical path after provisioning.
- Never fabricate physiological measurements, model accuracy, clinical validation, NASA endorsement, or verified hardware support.
- No diagnosis, drug dosing, autonomous treatment, or actuation of real life-support systems.
- No diary, symptom interview, face-emotion diagnosis, or required cognitive test for routine operation.
- Runtime decision logic is local and deterministic. Hosted AI can assist development but is not the health decision engine.
- The simulator cannot pass scenario labels, latent state, or expected answers to inference.
- No unimplemented primary action, decorative fake chart, empty module, or screenshot-only application qualifies as complete.
- Final repository: `https://github.com/umitcancinar/NasaSpaceApps`.

## 2. Review focus

1. A stale/invalid channel can look normal numerically: quality must gate dependent interpretations while independent valid alerts remain active. Pin in Tasks 2, 4, and 7.
2. Offline reload, storage failure, duplicate delivery, and stale replies can silently change a case: persist, deduplicate, version, and show failures. Pin in Tasks 3 and 8.
3. Arabic direction, long German labels, light theme, and reduced motion can break a polished default screen: verify all core workflows under these combinations. Pin in Tasks 1 and 9.
4. Shared simulator/estimator assumptions can create artificial superiority: separate truth, vary generative models, and retain negative results. Pin in Tasks 3 and 10.
5. Sensor APIs and camera permissions vary by browser: provide honest capability states and a real replay/gateway fallback, with no simulated connection reported as hardware. Pin in Task 9.

## 3. Preflight and agent skills

Read `05_RESEARCH_AND_TECHNOLOGY_SOURCES.md`, especially K01–K06. Before product implementation:

1. Inspect the local workspace, repository instructions, current branch, remote, and user changes.
2. Inspect the target remote. It had a minimal README when researched, but recheck. Clone into a safe location or reconcile the existing checkout; preserve its history.
3. Verify the selected model through the actual agent environment. Do not invent a Fable model identifier or claim it was used if another model performed the work.
4. Verify Node LTS, the package manager, Python for skill scripts, a browser, FFmpeg/ffprobe, and a slide-rendering toolchain. Prefer project-scoped dependencies. Record required external services without putting secrets in files.
5. Install/enable UI UX Pro Max, the appropriate Anthropic document/frontend/testing skills, Impeccable, and Remotion skills. Add relevant Vercel React guidance. Verify installers upstream and inspect installed SKILL.md files before use.
6. Produce `docs/SKILL_MANIFEST.md`, `docs/DEPENDENCIES.md`, and a short `docs/IMPLEMENTATION_DECISIONS.md`.
7. Consult React Bits and 21st.dev as explicitly requested by the user. Follow Section 5.5; these are design/component resources, not guaranteed agent skills.

Use UI UX Pro Max for systematic design planning; Impeccable for critique and finishing; React guidance for rendering performance; document skills for editable presentation/PDF; Remotion for video composition and export. Do not install overlapping packages simply to inflate the tool list.

## 4. Technology decisions

### 4.1 Recommended baseline

Use a `pnpm` workspace with one lockfile and a pinned package-manager version. At research time official documentation identified React 19.3, Tailwind 4.3, and Node 26 LTS; verify patch versions and compatibility rather than copying outdated setup commands. Node 24 LTS is an acceptable documented fallback if a required dependency cannot support 26.

Use Vite because the core is an interactive local application with no SEO-driven server rendering requirement. Do not introduce Next.js, a second backend language, Kubernetes, or a cloud database without a concrete requirement.

| Concern | Selection and boundary |
|---|---|
| Routing | React Router; route and selected case should deep-link correctly. |
| UI state | Zustand for small presentation state; authoritative observations/events belong in repositories. |
| UI primitives | shadcn/ui with its current supported accessible primitive implementation; do not assume accessibility without testing. |
| Motion | Motion for React plus CSS transitions. One default motion system; isolate any borrowed GSAP effect. |
| Charts | Apache ECharts with explicit units, gap handling, linked cursors, and accessible tables. |
| Contracts | Zod schemas with inferred TypeScript types; validate external data at boundaries. |
| Browser storage | Dexie/IndexedDB, versioned migrations, bounded raw chunks, export/backup. |
| Gateway storage | SQLite behind repository interfaces; transactional events/outbox and versioned migrations. |
| Gateway/API | Fastify plus WebSocket telemetry; OpenAPI for REST operations. |
| Testing | Vitest for domain/integration tests, Playwright for real browser workflows, axe-core for automated accessibility checks. |
| Media | Remotion in a separate workspace package; FFmpeg/ffprobe for inspection and final audio/video verification. |
| Presentation | An editable PPTX authoring tool supported by the installed presentation skill; produce PPTX and PDF from the same content. |

Keep optional cloud transports and camera models out of the initial critical bundle. Self-host fonts and required assets. Font and library licenses must be documented.

### 4.2 Execution profiles

**Browser demo:** web worker owns deterministic scenario execution and analysis. IndexedDB stores observations, event revisions, outbox, and delivered ground messages. Use a single explicit mission-session owner; duplicate tabs attach as viewers or acquire ownership only after an expired lease. Ground split-view reads the delivered-message store, never the mission's full event store. Do not use BroadcastChannel to bypass simulated link latency.

**Local workstation:** gateway owns acquisition, analysis, SQLite, and transport; UI is a client. A separate ground process has its own database and receives packages through the configured transport. Suggested development ports: UI 5173, gateway 4310, ground 4320. Production local serving should use one documented origin to avoid unnecessary CORS complexity.

Only one engine may own a mission at a time. Reconnecting UI clients recover state using cursor/sequence checkpoints. Browser suspension is explicitly different from continuous gateway operation.

### 4.3 Package layout

```text
apps/web/src/
  app/                         # routing, providers, application shell
  features/overview/
  features/exposure/
  features/integrity/
  features/exercise/
  features/cases/
  features/ground/
  features/simulation/
  features/integrations/
  features/evidence/
  features/settings/
  components/ui/               # accessible primitives
  components/telemetry/        # charts, quality markers, source labels
  workers/mission.worker.ts
  storage/browser-repositories.ts
  locales/{en,tr,de,fr,es,ar,ja}/
  styles/tokens.css
apps/gateway/src/
  server.ts
  acquisition/
  repositories/
  transports/
apps/ground/src/
  server.ts
  repositories/
packages/contracts/src/        # observations, events, devices, scenarios
packages/engine/src/           # quality, features, methods, rules
packages/simulator/src/        # latent generators and observation models
packages/evaluation/src/       # truth comparison; never imported by engine
packages/adapters/src/         # replay, websocket, serial, BLE capabilities
packages/ui-tokens/
media/video/                   # Remotion project, approved audio, captions
media/presentation/            # editable deck source
data/scenarios/
data/reference/                # only lawfully redistributable data
tests/e2e/
tests/fixtures/
scripts/
deliverables/
docs/
```

Enforce import boundaries: engine cannot import simulator, evaluation, React, or media; web cannot read simulator truth except through the explicit researcher evaluation route. Generated research reports retain the evaluated commit and dataset manifest.

## 5. Product design and interaction

### 5.1 Art direction

Create a premium scientific instrument, not a generic startup landing page or a neon science-fiction dashboard. The working visual direction is graphite, cool white, restrained cyan, and semantic amber/red. Use depth sparingly, strong typographic hierarchy, intentional empty space, and thin technical diagrams.

Keep a restrained public introduction/demo-entry route and a focused application shell. Avoid a gratuitous login wall for the synthetic demo. A user should launch a scenario in two deliberate actions from the entry screen.

At desktop width, use a compact left navigation, a persistent top mission strip, a dominant analysis area, and an optional evidence drawer. At tablet width collapse navigation. At narrow widths prioritize current status, active event, and one selected chart; use drawers for context. Do not simply shrink a desktop dashboard.

### 5.2 Starting tokens

These are proposed tokens, not a completed contrast certification. Verify foreground/background pairs and adjust before release.

| Token | Dark | Light |
|---|---|---|
| background | `#0B1016` | `#F4F7FA` |
| surface | `#121B25` | `#FFFFFF` |
| elevated surface | `#1A2633` | `#EAF0F5` |
| primary text | `#EDF4FA` | `#142332` |
| secondary text | `#A7B6C6` | `#4B6073` |
| border | `#304354` | `#CBD5DF` |
| accent | `#66D5E8` | `#006B80` |
| success | `#67D7A0` | `#146C43` |
| warning | `#F5C36B` | `#8A4B00` |
| critical | `#FF8D94` | `#B42335` |

Use semantic aliases, never raw status colors spread through components. Warning/error identity includes an icon and text. Chart palette must remain distinguishable across themes and common color-vision differences.

Self-host a readable sans-serif such as Inter and a restrained technical mono such as IBM Plex Mono, with licensed Arabic and Japanese fallbacks. Use tabular numerals for aligned telemetry. Body 16 px, dense labels 12–14 px, chart labels at least 12 px, major values 28–40 px. Use a 4 px base spacing scale, 8–12 px radii, and a small set of consistent elevation levels.

### 5.3 Motion specification

- Button/hover feedback: 120–160 ms.
- Drawers and local transitions: 180–240 ms.
- Route continuity: 220–320 ms, using subtle opacity/translation rather than large travel.
- Prefer transform/opacity; avoid animating large layout regions, continuous blur, and expensive full-screen effects.
- Animate the emergence of an event, not its measured severity through fictitious intermediate values.
- Waveform scrolling follows actual timestamps and playback state. Do not interpolate across gaps or invalid intervals.
- Pause decorative motion offscreen and when the document is hidden. Offer “Reduce motion” and “Pause visual updates” without stopping data acquisition in gateway mode.
- Reduced motion removes parallax, looping flourishes, dramatic zooms, and number rolling. Essential status changes remain immediate and readable.
- Never pulse critical alerts continuously or rely on motion/audio alone to communicate them.

### 5.4 Global controls and states

Top strip: mission name, crew selector, mission elapsed time, source label, engine status, local gateway status, Earth link status, locale, and theme. Distinguish internet connectivity from mission-link state.

Every screen includes designed empty, loading, running, paused, stale, unavailable, error, and recovered states where applicable. Error text names the failed operation and offers a concrete retry or fallback. Preserve entered values after recoverable errors.

Keyboard-accessible command palette may navigate to modes, start a selected scenario, pause replay, open an event, and switch theme. Destructive data reset requires a clear scoped confirmation; ordinary navigation does not.

### 5.5 React Bits and 21st.dev — explicit user requirement

Inspect https://reactbits.dev/ and https://21st.dev/ before final visual implementation. Consult https://github.com/DavidHDev/react-bits and current https://21st.dev/mcp setup if an MCP integration is useful and available. The older Magic MCP repository describes migration to 21st MCP; do not paste stale setup commands.

Create `docs/UI_COMPONENT_PROVENANCE.md` with at least six reviewed candidates across the two sources. Record component URL, author, license/terms, dependencies, chosen/rejected status, accessibility gaps, performance cost, and intended placement. A justified rejection is acceptable; do not force a decorative component into medical-looking telemetry.

Appropriate areas: demo-entry animation, subtle section transition, navigation/command palette, theme switch, scenario cards, and video title treatments. Avoid magnetic controls, cursor-following effects, animated noise, or 3D backgrounds in operational data views.

Prefer TypeScript versions compatible with the chosen styling system. Inspect source before installing. Copy/adapt selected components into the project where permitted; normalize tokens, focus behavior, motion reduction, RTL, and light theme. Do not iframe either site, load its CDN at runtime, or make a paid generator part of the offline app. No purchase or API key is assumed. Verify individual component terms rather than assuming every marketplace item has the same license.

## 6. Screen-by-screen requirements

| Route | Required content | Required functional actions |
|---|---|---|
| `/` | Product promise, prototype status, three-module explanation, source links, demo entry | Start demo, open documentation, choose locale/theme |
| `/mission/overview` | Crew status, latest observations, quality coverage, active events, selected timeline | Select crew, inspect event, change time range, pause visual updates |
| `/mission/exposure` | Respiratory phase, local/cabin CO2, lag, estimate coverage, method comparison | Toggle raw/estimated traces, inspect breath, select method, export window |
| `/mission/integrity` | Sensor map, attachment state, calibration lifecycle, raw/corrected traces | Run simulated calibration, inspect rejection, compare methods |
| `/mission/exercise` | Session load/cadence, MMG features, impedance trends, matched references | Start/stop simulated session, select prior session, inspect comparability, export |
| `/mission/cases` | Prioritized event list and revision history | Filter, acknowledge, open evidence, queue package |
| `/mission/cases/:id` | Observation→quality→rule→evidence chain, alternatives, guidance status, history | Export JSON/PDF, queue/update package, view reply |
| `/ground` | Delivered cases only, link-delay context, ground review queue | Open received case, request evidence, send reply linked to revision |
| `/lab` | Scenario gallery, timeline, seeded controls, fault injections, evaluation entry | Load locally, run/pause/step/reset, set speed, save scenario, export run |
| `/devices` | Adapter inventory and capability/verification status | Connect/disconnect, permission flow, replay import, open gateway setup |
| `/evidence` | Sources, methods, rules, limitations, claim ledger | Search, inspect rule version, open bundled source metadata |
| `/settings` | Locale, units, theme, motion, storage, privacy, connectivity | Persist choices, export backup, inspect storage, scoped reset |

Use one linked cursor across synchronized charts. Tooltips expose exact value, unit, timestamp, source, and quality. Provide a table alternative and keyboard-accessible selected-time control. Hover is never the only way to obtain evidence.

The body/sensor diagram should be an accessible SVG initially. It communicates location and quality; it is not a 3D organ simulation or a physiological digital twin. Camera previews and derived pose must be optional and user-enabled.

## 7. Core contracts and units

Define runtime schemas in `packages/contracts/src`. Suggested public interfaces:

```ts
type DataOrigin = 'simulated' | 'recorded' | 'hardware' | 'mixed';
type QualityState = 'valid' | 'suspect' | 'invalid' | 'stale' | 'unavailable';
type EvidenceStrength = 'insufficient' | 'limited' | 'supported';

interface Observation {
  schemaVersion: 1;
  id: string;
  missionId: string;
  runId: string;
  crewId: string | null;
  streamId: string;
  sourceId: string;
  sequence: number;
  observedAtMs: number;          // mission-relative acquisition time
  receivedAtUtc: string;        // ISO timestamp for audit, not analysis ordering
  clockUncertaintyMs: number;
  metric: string;
  value: number | null;
  unit: string;
  origin: DataOrigin;
  quality: QualityState;
  qualityReasons: string[];
  provenanceId: string;
}

interface SignalChunk {
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
}

interface Estimate {
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

interface HealthEvent {
  id: string;
  revision: number;
  missionId: string;
  runId: string;
  crewId: string;
  openedAtMs: number;
  updatedAtMs: number;
  severity: 'info' | 'review' | 'priority';
  state: 'open' | 'acknowledged' | 'resolved';
  ruleId: string;
  ruleVersion: string;
  evidenceIds: string[];
  explanationKey: string;
  explanationParams: Record<string, string | number>;
  limitations: string[];
  guidanceId: string | null;
  origin: DataOrigin;
}

interface TelemetryAdapter {
  id: string;
  capabilities(): Promise<AdapterCapabilities>;
  connect(config: AdapterConfig): Promise<void>;
  observations(signal: AbortSignal): AsyncIterable<Observation | SignalChunk>;
  disconnect(): Promise<void>;
}

interface Engine {
  ingest(batch: readonly (Observation | SignalChunk)[]): void;
  advanceTo(missionTimeMs: number): EngineDelta;
  snapshot(): EngineSnapshot;
  restore(snapshot: EngineSnapshot): void;
}
```

Define `AdapterCapabilities`, discriminated `AdapterConfig`, `EngineDelta`, `EngineSnapshot`, scenario, method, rule, message, and provenance schemas in the same contracts package before consumers. `EngineDelta` contains new estimates and event revisions; snapshots include state-machine timers and baseline state. Do not expose simulator truth in any engine type.

Serialization: JSON/NDJSON for scalar records; binary or array-encoded signal chunks with an explicitly versioned transport codec. Convert typed arrays intentionally; do not rely on accidental JSON behavior. Validate finite values, monotonically interpreted acquisition timestamps, range metadata, maximum batch size, and unit compatibility. Preserve the raw received record separately when normalization changes units.

Canonical units: CO2 concentration `ppm`; partial pressure `kPa`; respiratory rate `breaths/min`; pulse `beats/min`; force `N`; time `ms`; impedance resistance/reactance `ohm`; phase `deg`; temperature `Cel`; acceleration `m/s2`. Uncalibrated PVDF is `a.u.` and must never be relabeled as force or displacement.

CO2 conversion, when sensor metadata supports it: `partialPressureKPa = concentrationPpm * 1e-6 * ambientPressureKPa`. This is gas partial pressure, not arterial pressure. Define pressure and humidity assumptions; avoid double-correcting a device output already compensated by its manufacturer.

## 8. Simulation engine and data

### 8.1 Deterministic design

Use a seeded PRNG, source-specific random streams, a fixed simulation tick of 100 ms, and rate-specific sampling inside each tick. Playback controls wall-clock scheduling only; 1×, 10×, and 60× must produce identical samples/events for the same scenario and seed. Implement pause, single tick, seek through checkpoint restore/replay, reset, and export.

### Run identity, time, and replay semantics

A mission groups crew and runs; every execution has an immutable `runId`. Observations, signal chunks, estimates, events, packages, receipts, replies, and checkpoints carry that ID. Event/record identifiers are namespaced by run; event revisions increase only within that run. Reproducibility compares payloads and relative timestamps after removing run-specific identifiers and wall-clock audit fields.

Backward seek is read-only historical inspection. It may reconstruct an isolated engine snapshot with side effects disabled; it cannot rewrite events, revoke acknowledgements, retract delivered packages, or send messages. The active execution is paused during historical inspection. “Return to current” returns to its unchanged state. “Resume from here” creates a new run with a parent-run/checkpoint reference, reconstructs the needed prior observations/state into the new namespace, and starts with no inherited acknowledgements, outbox, or ground replies. Reset creates a new run at time zero and preserves the previous run for inspection/export. The UI must make creating a new run explicit.

Pure simulation uses one persisted virtual clock for observation generation, dwell timers, calibration, communication delay, retries, and simulated ground responses. Pause freezes all those simulated activities; playback acceleration scales them together. Audit timestamps remain wall-clock timestamps. Historical inspection never advances either active run's queue.

Actual hardware acquisition and real gateway-to-ground transport use monotonic elapsed wall time for scheduling and do not support accelerated playback. Run the required localhost HTTP transport verification at 1× with wall-clock delay semantics. If simulated sources are attached to this profile, keep them at 1× too. Network/internet status is independent of simulated link configuration.

Default mission: four fictional crew members, one selected detailed view, six-minute scenario. Do not use real astronaut identities or claim real mission telemetry. Support eight crew members as an additional scale test, not a promise of medical capacity.

Default synthetic acquisition settings, explicitly engineering assumptions:

| Stream | Rate | Notes |
|---|---:|---|
| PVDF/MMG or illustrative SCG | 200 Hz | Band-limited synthetic mechanical signal; ensure anti-aliasing before downsampling. |
| IMU/reference motion | 100 Hz | Common motion plus independent noise. |
| Respiratory displacement | 25 Hz | Asymmetric cycles with variable rate; arbitrary units unless calibrated. |
| Fast local CO2 | 20 Hz | Observation rate is not physical response speed. |
| Cabin CO2/pressure/temp | 1 Hz | Separate environmental process. |
| Contact measurement | 10 Hz | Simulated force or pressure, never infer from PVDF DC. |
| Impedance features | 1 Hz per frequency | Declared frequencies, e.g. 10 and 100 kHz; generate resistance and reactance. |
| Exercise load/position | 25 Hz | Matched to movement and equipment state. |
| Pulse/SpO2 context | 1 Hz summaries | Optional synthetic support channels; not inferred from PVDF alone. |

Physiological time constants and waveform parameters are configurable assumptions, not a validated digital twin. Do not generate every signal as an independent sine wave. Encode bounded relationships: load can affect respiratory rhythm; contact affects measured mechanics; fluid-state changes affect the synthetic impedance process. Unmodeled causal relationships must remain absent rather than invented.

### 8.2 Three distinct data layers

1. **Latent scenario state:** source physiology, local gas field, attachment state, fluid-sensitive parameters, and scheduled faults.
2. **Observed telemetry:** delayed, filtered, noisy, quantized, and occasionally missing measurements.
3. **Inference and evaluation:** engine uses observations only; evaluator later joins outputs to latent references by timestamp.

Keep truth files under an evaluation namespace, not in normalized imports or the operator event stream. Researcher truth overlays must be visibly labeled and hidden in crew/ground mode. They must never influence event generation.

### 8.3 Generative models

Exposure generator: construct respiratory cycles, an exhaled/local mixing component, and an inhaled reference concentration. Apply spatial sampling mismatch, transport delay, first-order response, filtering, and noise to create observed gas data. Include a held-out two-time-constant response model to avoid evaluating only the inverse of the estimator's own assumptions.

Integrity generator: create a band-limited source, apply a variable coupling filter, add correlated movement plus independent noise, and generate calibration-response windows. Include unequal actuation and physiological transfer paths and frequency-dependent changes. A method must be able to reject a poor correction.

Exercise generator: create load and cadence segments, mechanical response features, fluid-sensitive impedance variation, and coupling changes as separate latent factors. A synthetic “fatigue” parameter is a simulator variable, not evidence that the same parameter is clinically identifiable in a human.

### 8.4 Required scenario catalog

| ID | Scenario | Required observable behavior |
|---|---|---|
| SIM-01 | Quiet nominal baseline | Stable display; no unsupported priority events. |
| SIM-02 | Local mixing change with stable cabin trace | Exposure estimate changes if supported; no claim cabin sensor is broken. |
| SIM-03 | Exhalation spike without elevated inhaled reference | Candidate avoids treating all near-face peaks as sustained inhalation exposure. |
| SIM-04 | Slow gas response / uncertain phase | Estimate withheld or downgraded with an explicit reason. |
| SIM-05 | Garment contact slip | Integrity event; dependent MMG interpretation suppressed. |
| SIM-06 | Physiological source changes, contact stable | Candidate must not normalize away the source change. |
| SIM-07 | Calibration path mismatch | Calibration can fail; reject unjustified correction. |
| SIM-08 | Same exercise, changed response | Matched reference comparison and bounded experimental interpretation. |
| SIM-09 | Different load, unchanged underlying response | Refuse a misleading like-for-like comparison. |
| SIM-10 | Impedance shift with stable muscle response | Show fluid-sensitive change; no muscle-loss diagnosis. |
| SIM-11 | Combined exercise, contact, and exposure changes | Independent channels remain usable; explanations show dependency. |
| SIM-12 | Link outage, restoration, duplicate receipt | Persist, retry, deduplicate, and display delivery state. |
| SIM-13 | Late reply to superseded event revision | Mark stale context; do not overwrite current state. |
| SIM-14 | Missing, out-of-order, unit-mismatched data | Reject/quarantine malformed input; surface quality without fabricated continuity. |
| SIM-15 | Storage capacity or process interruption | Visible persistence failure and documented recovery behavior. |

Add a long-history synthetic exercise fixture for session comparison. Label it as generated history, not six minutes of actual physiological adaptation compressed into real time.

### 8.5 Data manifests and imports

Every run export contains schema version, scenario version, seed, generator version, rule version, method versions, start time, data origin, units, sample rates, and code commit. Keep observational data, outputs, truth, and evaluation separate.

Support CSV and NDJSON imports with a preview/mapping step. Reject ambiguous units and duplicate identifiers rather than guessing silently. Cap file size, validate timestamps, and show parse errors by row. Imported terrestrial data retain their original context. Referencing NASA papers is not equivalent to using a NASA telemetry dataset; document any actual data use precisely.

## 9. Analysis, rules, and research guidance

Processing order: ingestion → time/unit validation → channel quality → features → module estimates → cross-module eligibility → rule state machines → event revisions → evidence packages.

Quality is channel-specific. Detect stale age using source-specific expected rate; do not use one timeout for 200 Hz waveforms and historical session records. Use hysteresis/dwell to avoid repeated event chatter; document those constants as software demonstration settings unless grounded in applicable guidance.

Personal references are context-specific snapshots. Keep preconfigured synthetic references and runtime observations distinct. Freeze updates during detected faults/events. Never let a slowly worsening stream silently redefine normal. Display reference age, sample count, context, and provenance. Do not call a z-score baseline a physiological digital twin.

Rule cards must include ID/version, input metrics, eligibility, expression, dwell, reset condition, source or demonstration rationale, severity, explanation template, unavailable behavior, and guidance link. Rule thresholds derived from NASA documents require correct scope, units, averaging periods, and revision. Otherwise mark them “demonstration threshold — not a clinical limit.”

Examples of permitted event text:

- “Mechanical signal changed while contact quality deteriorated. Muscle-response interpretation is unavailable for this interval.”
- “Local inhalation-phase CO2 estimate increased. Phase alignment is supported; spatial sampling uncertainty remains.”
- “This session cannot be compared directly: external load differs from the selected reference.”
- “The ground reply refers to revision 2. The local case is now revision 4.”

Research guidance may recommend checking a data connection, inspecting a source-linked procedure, or reviewing the event with the medical officer. Actual medical instructions must come from an appropriately reviewed, versioned procedure. Until available, show “Operational procedure not validated in this prototype” and an illustrative workflow clearly labeled as such. Do not invent emergency treatment steps to fill a card.

## 10. Module algorithms and evaluation baselines

### Exposure

Implement a time-weighted inhalation estimate using only eligible aligned samples. Track transport/response uncertainty and valid-breath coverage. A time-average over inspiration is `integral(C(t) dt) / inspirationDuration`; a flow-weighted average requires a measured/calibrated flow signal and is a different output.

Comparators: cabin concentration, local-window mean, basic phase-gated estimate without delay compensation, and the candidate alignment/quality-aware method. Do not compare only with an intentionally poor baseline. Report failure under insufficient response bandwidth.

### Integrity

Implement known-excitation response features and a quality/correction policy. Start with a conservative gate; add compensation only when held-out results justify it. Compare fixed filtering, paired-reference cancellation, and the proposed calibration-aware method. Report source-feature error and accepted coverage together so rejecting all data cannot appear optimal.

### Exercise

Extract windowed MMG RMS and selected spectral features after declared filtering. Match by crew, exercise identity, load band, cadence, joint/movement context, and quality. Add impedance trends as covariates or contextual evidence; do not force a linear clinical interpretation.

Comparators: unconditioned personal deviation, load/motion/quality-conditioned deviation, and the proposed fluid-aware version. Include ablations removing integrity context and impedance context. If the additional channels do not improve the outcome, report that honestly.

### Evaluation protocol

Freeze methods/rules before final held-out runs. Use at least 20 seeded parameter combinations per applicable core scenario; separate development and evaluation seeds. Include model mismatch and negative/no-event cases. Split real data by participant/session, not random adjacent waveform windows. Report estimates with spread, sample count, valid coverage, reference definition, and limitations.

Evaluate operational outcomes separately: event latency, queue size, delivered bytes, duplicate handling, and time to complete a defined case package. Do not describe software timing or simulated classification as clinical sensitivity.

## 11. Communication and integrations

### 11.1 Event packages

Each package has a unique ID, immutable run ID, event ID/revision, mission/crew pseudonym, generated time, input interval, summary, relevant signal snippets, quality, method/rule versions, limitations, and content hash. Include a manifest of attachments and explicit missing items. Receipts and replies retain the run ID; reject cross-run attachment even when local sequence numbers match. A hash checks content integrity; it is not an authentication signature.

States: `queued → sending → delivered → acknowledged`; support `failed`, retry scheduling, and superseded revisions. Delivery acknowledgement and clinician acknowledgement are different. Persist outbox transitions transactionally. Use message IDs and idempotent receiving to prevent duplicate cases.

Ground replies contain reply ID, source package/event revision, author role, timestamp, requested evidence, and structured review text. Never automatically execute a reply as device control or treatment. Show newer local revisions prominently.

### 11.2 Link simulator

Parameters: one-way propagation delay, bandwidth in bytes/second, packet loss, contact windows, outages, and retry behavior. Use neutral profile names “near-real-time demonstration” and “delayed exploration demonstration”; configurable values are not a precise orbital calculation.

Schedule arrival no earlier than propagation plus serialization time. Scale demonstration time visibly. Priority scheduling may reduce queue wait; it cannot beat propagation delay. Preserve ordering rules and avoid starvation of lower-priority cases.

### 11.3 External interfaces

Required implemented paths: versioned CSV/NDJSON replay, local WebSocket telemetry, HTTP case transfer between gateway and ground, and a reference device emulator that exercises the actual parser. Document a serial frame format and provide a functioning parser/adapter; add browser Web Serial where supported. BLE includes a real selected-profile implementation only when device characteristics are known; otherwise expose a documented capability and emulator, labeled hardware-unverified.

Generic sensor support is not permission to invent proprietary protocols. List each integration as `emulator-verified`, `recording-verified`, `hardware-verified`, or `not implemented`.

REST endpoints should include:

```text
GET  /health
GET  /api/v1/capabilities
GET  /api/v1/missions/:id/snapshot
GET  /api/v1/events?after=<cursor>
POST /api/v1/imports
POST /api/v1/cases/:id/packages
POST /api/v1/ground/packages
POST /api/v1/ground/replies
GET  /api/v1/exports/:id
WS   /api/v1/telemetry
```

Validate request/response schemas, size limits, authentication for non-loopback connections, timeouts, and backpressure. Browser permissions require a user gesture for applicable device APIs. No silent camera/device activation. HTTPS pages cannot assume access to arbitrary insecure local WebSocket services; provide a documented local-origin or secure-gateway setup.

Camera integration: provide a working opt-in local preview, permission-denied/unsupported states, visible activity indicator, and stop control. Movement/pose analysis is an optional experimental extension, not a prerequisite for the three core modules. If implemented, download and cache its model explicitly before offline use and record the verification level. No facial emotion, mental-health, blood-pressure, SpO2, or identity inference from an ordinary camera in this release. Raw video is not retained or transmitted by default.

## 12. Persistence, privacy, and failure recovery

Store settings, missions, metadata, observation chunks, estimates, event revisions, outbox, delivered packages, and replies with schema migrations. Preserve source data and derived data separately. Set bounded raw retention (default 30 minutes of selected detailed streams) and retain event snippets before eviction; expose storage use and export controls.

Do not claim browser storage is automatically encrypted. Synthetic demo records are public-safe; future real health records require an explicit deployment threat model and appropriate access/key management. Use TLS and authentication for remote transport, loopback defaults for local services, origin checks, input validation, and no secrets in frontend bundles.

If quota is exceeded, show persistence failure and the last durable checkpoint. Never show “saved” until the transaction succeeds. Recovery must not duplicate events or reset acknowledgement history. Service-worker updates are opt-in between sessions; do not auto-reload an active run.

## 13. Localization and accessibility

Bundle all core translations locally. Include navigation, controls, errors, quality states, scenario descriptions, event explanations, and export labels. Use message keys and structured parameters instead of concatenated translated strings. Format numbers/dates with Intl; keep canonical stored units independent of locale.

Arabic mirrors layout and directional navigation, not temporal signal order or numeric units blindly. Japanese fonts must be bundled or use a documented local fallback. Sources and external paper titles may remain in their original language. Generated clinical-looking guidance must not be silently machine-translated as validated medical text; retain prototype/review status.

Target WCAG 2.2 AA: keyboard navigation, visible focus, screen-reader names, 4.5:1 normal-text contrast, non-color status cues, reflow, 200% zoom, modal focus restoration, reduced motion, and sufficient touch targets. Do not flood live regions with every telemetry tick. Announce event transitions using a rate-limited meaningful summary.

## 14. Performance and observability budgets

Targets are acceptance goals to measure on a documented machine, not pre-existing achievements:

- Initial application JS at most 400 KiB gzip excluding lazy-loaded chart/media/camera modules; explain any justified overrun.
- Normal UI interaction feedback under 100 ms; local event update under 500 ms after the necessary input window closes at 1× speed.
- Charts target 30 fps during live updates, with a 10 fps low-power mode. Display scalar summaries at 2–5 Hz instead of rerendering on each raw sample.
- Use bounded buffers and min/max-preserving chart decimation. Analysis uses the appropriate raw data, not display-decimated traces.
- No sustained memory growth after a 30-minute four-crew run; document observed memory and storage behavior.
- Navigation and active controls remain usable during 60× replay and exports.
- Cold reload of a provisioned offline demo must work with external network blocked.

Collect local structured diagnostics for dropped samples, parse failures, worker lag, storage failures, and transport retries. Do not enable third-party analytics by default.

## 15. Implementation work packages

Each package ends with a runnable vertical slice and recorded verification. Use the specified public contracts. Add meaningful tests around inference, persistence, communication, and accessibility; do not write tests that merely mirror styling implementation.

### Task 1 — Foundation and visual system

**Files:** root package/lockfile, `apps/web/src/app`, `styles/tokens.css`, `locales`, `docs/SKILL_MANIFEST.md`, `docs/UI_COMPONENT_PROVENANCE.md`.

**Interfaces:** produces `AppShell`, `ThemeProvider`, `LocaleProvider`, and route definitions.

- [ ] Verify tools/skills and record exact versions.
- [ ] Create workspace and accessible shell with all routes, source/status strip, theme and locale persistence.
- [ ] Review React Bits/21st candidates and implement only suitable locally owned adaptations.
- [ ] Add `theme-locale.spec.ts`: reload preserves preference; Arabic direction is correct; all navigation is keyboard reachable.
- [ ] Run typecheck, build, and the shell browser test; capture both themes at 1440 px and 390 px.
- [ ] Commit the functioning shell, not an ornamental mockup.

### Task 2 — Contracts, ingestion, and quality

**Files:** `packages/contracts/src/{observations,events,adapters,engine}.ts`, `packages/engine/src/{ingest,quality}.ts`, corresponding tests.

**Interfaces:** produces the schemas and `createEngine(config): Engine`; consumes no simulator internals.

- [ ] Add failing tests for null/missing values, incompatible units, duplicates, clock uncertainty, stale channels, and oversized batches.
- [ ] Implement normalization, quarantine, quality derivation, and bounded signal storage.
- [ ] Assert an invalid MMG stream does not invalidate an independent CO2 observation.
- [ ] Run targeted tests and typecheck; commit only after they pass.

### Task 3 — Simulator, persistence, and replay

**Files:** `packages/simulator/src/{clock,generators,scenarios}.ts`, `data/scenarios`, `apps/web/src/workers/mission.worker.ts`, browser repositories.

**Interfaces:** `createSimulator(config): { step(tickMs): SimBatch; checkpoint(): SimCheckpoint }`; `SimBatch` exposes observations to the engine, with truth routed separately to evaluator storage.

- [ ] Add deterministic replay tests: same seed produces identical observations/events at 1×/10×/60×.
- [ ] Implement generators, required scenario catalog, checkpoint restore, pause/step/reset, and origin labels.
- [ ] Add owner-lease, duplicate-tab, quota-failure, reload-recovery, and invalid-import tests. Assert that backward inspection is read-only, reset/fork create a new run ID, and prior delivered cases/replies remain unchanged.
- [ ] Run SIM-01 and SIM-14 end to end; verify no truth field crosses into the engine.
- [ ] Commit and export a reproducible reference run.

### Task 4 — Exposure vertical slice

**Files:** `packages/engine/src/exposure`, `apps/web/src/features/exposure`, relevant tests.

**Interfaces:** `estimateExposure(input: ExposureWindow, config: ExposureMethodConfig): Estimate`; types reference validated signals and phase uncertainty.

- [ ] Add tests for time weighting, unit conversion, transport delay, missing inspiration samples, and slow-sensor abstention.
- [ ] Implement baseline and candidate estimators, breath inspection, linked charts, and export.
- [ ] Verify SIM-02/03/04; show unsupported conditions instead of fabricated estimates.
- [ ] Compare against held-out reference data and preserve negative results; commit.

### Task 5 — Integrity vertical slice

**Files:** `packages/engine/src/integrity`, `apps/web/src/features/integrity`, calibration fixtures/tests.

**Interfaces:** `assessIntegrity(input: IntegrityWindow, config: IntegrityConfig): IntegrityAssessment`; optional correction returns validity and provenance, never an unlabeled replacement of raw data.

- [ ] Add tests for contact change, true source change, calibration-path mismatch, and calibration-window masking.
- [ ] Implement state machine, baseline comparison, response visualization, and conservative correction eligibility.
- [ ] Verify SIM-05/06/07 and compare accepted coverage as well as error.
- [ ] Commit the working sensor-quality workflow.

### Task 6 — Exercise vertical slice

**Files:** `packages/engine/src/exercise`, `apps/web/src/features/exercise`, synthetic session fixtures/tests.

**Interfaces:** `compareExercise(current: ExerciseWindow, reference: ReferenceWindow, config: ExerciseConfig): ExerciseComparison` with explicit eligibility/reasons.

- [ ] Add tests for load mismatch, missing force, contact failure, and impedance-only change.
- [ ] Implement feature extraction, matched references, session history, and experimental deviation output.
- [ ] Verify SIM-08/09/10 with no unsupported atrophy or absolute-force claims.
- [ ] Commit a complete exercise session and comparison flow.

### Task 7 — Rules, overview, and case evidence

**Files:** `packages/engine/src/rules`, `apps/web/src/features/{overview,cases,evidence}`, bundled rule/procedure metadata.

**Interfaces:** `evaluateRules(state: EngineSnapshot, nowMs: number): HealthEvent[]`; event revisions are monotonic and explanations reference evidence IDs.

- [ ] Add tests for dwell/reset hysteresis, baseline freeze, missing evidence, cross-module gating, and monotonic revisions.
- [ ] Implement overview prioritization, case chronology, reasoning drawer, acknowledgement, and JSON/PDF export.
- [ ] Verify SIM-11: invalid muscle interpretation cannot suppress a valid exposure event.
- [ ] Review guidance provenance and prototype labels; commit.

### Task 8 — Ground console and disrupted communication

**Files:** `packages/contracts/src/messages.ts`, `apps/gateway/src/transports`, `apps/ground/src`, `apps/web/src/features/ground`.

**Interfaces:** `enqueuePackage(eventId, revision): Promise<PackageId>`; `receivePackage(envelope): Promise<Receipt>`; `submitGroundReply(reply): Promise<ReplyId>`.

- [ ] Add tests for latency lower bounds, outage persistence, duplicate delivery, checksum mismatch, stale replies, cross-run reply rejection, and queue priority without starvation. Assert that virtual pause/speed affect simulated transport and inference together, while the real HTTP profile remains at 1× wall time.
- [ ] Implement durable outbox, link simulator, receiver deduplication, requests/replies, and two-sided UI.
- [ ] Verify SIM-12/13 with a process restart and browser reload.
- [ ] Run a real localhost HTTP exchange between separate gateway and ground processes; commit.

### Task 9 — Devices, optional camera, localization, and offline hardening

**Files:** `packages/adapters/src`, `scripts/device-emulator.ts`, `apps/web/src/features/{integrations,settings}`, PWA configuration, locale resources.

**Interfaces:** adapter contracts from Task 2; no alternative data pipeline.

- [ ] Implement replay, WebSocket producer/consumer, serial parser, capability detection, cancellation, and reconnect handling.
- [ ] Test denied permissions, unsupported browser, malformed device packets, disconnected gateway, and mixed-origin provenance.
- [ ] Implement opt-in local camera preview, stop, permission-denied, and unsupported-browser states. Add pose analysis only as an explicitly verified experimental extension; do not label unimplemented pose inference as available.
- [ ] Complete seven-locale core UI, both themes, RTL, reduced motion, offline assets, and service-worker update behavior.
- [ ] Verify offline reload, keyboard-only use, and stale data states in Chromium, Firefox, and WebKit where applicable. Hardware API support differences are expected and must be documented.
- [ ] Commit evidence and an integration-status matrix.

### Task 10 — Scientific evaluation and performance

**Files:** `packages/evaluation/src`, `scripts/evaluate.ts`, `docs/VALIDATION_REPORT.md`, `docs/CLAIM_LEDGER.md`, `deliverables/reports`.

**Interfaces:** `evaluateRun(observedOutputs, truth, evaluationConfig): EvaluationReport`; not available to production inference.

- [ ] Freeze methods, generate held-out runs, and include alternative observation dynamics.
- [ ] Run required baselines and ablations; output JSON/CSV plus readable figures and limitations.
- [ ] Test at four crew for 30 minutes and record performance; investigate bounded-memory and UI-lag failures.
- [ ] Complete accessibility and locale/theme matrix; no fabricated metric or unverifiable percentage may enter release text.
- [ ] Commit reports with their configuration, seed set, and evaluated commit.

### Task 11 — README, presentation, and product video

**Files:** root `README.md`, `media/presentation`, `media/video`, `deliverables/presentation`, `deliverables/video`, media manifests.

**Interfaces:** consume actual UI captures and frozen validation artifacts; do not synthesize better results for media.

- [ ] Rewrite README to describe the implemented release, including exact setup, offline operation, limitations, architecture, data origin, and reproduction.
- [ ] Follow `03_PRESENTATION_BRIEF.md` to create editable PPTX and PDF; render and inspect every slide.
- [ ] Follow `04_VIDEO_PRODUCTION_BRIEF.md` to capture the product, record/generate licensed English narration, compose, caption, mix, and render both master and vertical videos.
- [ ] Verify all presentation/video claims against `docs/CLAIM_LEDGER.md`; remove or qualify unsupported lines.
- [ ] Commit sources and small deliverables; prepare large files for GitHub Releases/LFS according to Section 17.

### Task 12 — Final delivery

**Files:** CI workflows, `docs/RELEASE_CHECKLIST.md`, release manifest, final documentation links.

- [ ] Run the complete documented verification command set on the final code.
- [ ] Reproduce setup from a clean checkout using the committed lockfile.
- [ ] Audit repository changes for credentials, private recordings, generated caches, and unlicensed assets.
- [ ] Push to the specified repository using existing authenticated access without rewriting others' history; verify remote commit and CI.
- [ ] Publish versioned release assets where authorized and available; verify downloads and README links.
- [ ] Report actual completion, known limitations, and any blocked external step precisely.

## 16. Required command interface and acceptance matrix

The implementation must provide these workspace scripts or document an explicit equivalent. These commands are a future interface contract; they are not runnable in this documentation-only bundle yet.

```text
pnpm install --frozen-lockfile
pnpm dev
pnpm dev:mission
pnpm dev:ground
pnpm device:emulator
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm evaluate
pnpm capture:product
pnpm slides:build
pnpm slides:verify
pnpm video:render
pnpm release:verify
```

| Requirement | Evidence required for acceptance |
|---|---|
| Three modules | Working SIM-02, SIM-05, and SIM-08 flows with inspectable outputs. |
| Shared reasoning | SIM-11 proves quality gating and independent-channel continuity. |
| Offline | Provision, block external network, reload, run scenario, inspect case, export. |
| Ground round trip | Actual transport exchange, outage/retry test, reply to correct revision. |
| Sensor readiness | Emulator through real parser; per-adapter verification labels. |
| Multilingual | Complete core key parity for seven locales; visual checks for Arabic/German/Japanese. |
| Light/dark | Reviewed screenshots and contrast checks for both. |
| Animation | Smooth main workflow, reduced-motion alternative, no invented measurement transitions. |
| Research honesty | Ground-truth separation, baselines, held-out report, limitations, claim ledger. |
| Presentation | Editable PPTX, PDF, slide renders, speaker notes, source notes. |
| Video | Narrated English MP4s, captions, verified real-product footage, audio/video checks. |
| Repository | Verified pushed commit, CI result, working README/artifact links. |

## 17. README, repository, and release policy

Final README sections: clear product statement; representative real screenshot; prototype/data-origin status; what works; three-module explanation; architecture; prerequisites; quick start; scenario guide; offline profile differences; device/gateway setup; test/evaluation reproduction; results with limitations; sources; media links; accessibility/localization; contribution structure; asset/license notices; AI assistance disclosure.

Do not claim a license until one is actually adopted. Record third-party licenses and data redistribution restrictions. Include `.env.example` containing placeholders only, `.gitignore`, reproducible scripts, CI, and security-conscious default network bindings.

Preserve this specification as history but mark implementation deviations. Do not replace a truthful README with marketing claims. Keep the remote repository name `NasaSpaceApps`; ASTER is the provisional product label.

For publication: fetch current remote state, reconcile existing files, commit scoped changes, push normally, and verify the remote SHA. Never force-push or erase unknown content. User authorization covers delivering this project to the named repository; it does not cover unrelated repositories or paid subscriptions. If authentication or branch protection prevents publication, leave the complete local deliverable ready and report the exact blocker.

Store editable source and modest-size assets in Git. Prefer GitHub Releases for rendered MP4s and large decks; use Git LFS only if configured and appropriate. Link them from README and include checksums. Do not commit `node_modules`, large raw recordings, private health data, credentials, or unbounded simulator exports.

## 18. Definition of finished

Finish means the application runs, the core scenarios work, reasoning is inspectable, offline behavior is verified, interfaces are implemented to their stated verification level, and the English presentation/video accurately depict the shipped product. A beautiful shell, an autoplay animation, a collection of TODO buttons, or a simulated scientific success without a comparator is not the requested outcome.

The implementation agent should make routine engineering choices within this specification, record them, and keep progressing. Request missing information only when it changes an external commitment, requires unavailable credentials/equipment, or prevents a truthful deliverable. Do not silently remove one of the three core modules to meet a self-imposed time limit.
