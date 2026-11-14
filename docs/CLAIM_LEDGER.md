# Claim ledger

Every statement used in the README, report, slides or video script must appear here with its evidence. Data origin for all rows: **simulated**. Evaluated code: the commit that contains this file; regenerate with the listed command.

| # | Claim (as worded in release material) | Status | Evidence | Reproduce |
|---|---|---|---|---|
| C1 | A simulation-first research prototype for offline, evidence-linked space health monitoring | Allowed description | — | — |
| C2 | Runs offline after provisioning (browser profile) | Verified | e2e "provisioned app reloads and runs with the network blocked" | `pnpm test:e2e` |
| C3 | Persists and resends case packages across interrupted connections; duplicate deliveries are ignored | Verified | unit "SIM-12 …", e2e "ground round trip …", servers test over real HTTP | `pnpm test`, `pnpm test:e2e` |
| C4 | The same scenario and seed reproduce identical observations and events | Verified | unit "deterministic simulation", runtime replay test, `evaluation.json: deterministic` | `pnpm test`, `pnpm evaluate` |
| C5 | Exposure candidate MAE 284 ± 175 ppm vs 1250 (phase-gated), 1259 (local mean), 1192 (cabin); lowest error in 70 % of runs | Verified in simulation | `deliverables/reports/evaluation.json` → `exposure`; scenarios SIM-01/02/03/11, seeds 101–120, held-out dynamics, reference = simulator inhalation-phase mean | `pnpm evaluate` |
| C6 | With a slow sensor the estimate is withheld (0 % coverage) and no false exposure event is raised | Verified in simulation | `evaluation.json` → `exposureEvents`; unit "SIM-04" | `pnpm evaluate` |
| C7 | During a coupling fault the released gate raised no false exercise-deviation event; contact event after ≈ 5.1 s | Verified in simulation | `evaluation.json` → `integrityEvents` | `pnpm evaluate` |
| C8 | Gain compensation leaves a systematic error (0.299) and is experimental | Verified (negative result) | `evaluation.json` → `integrity.SIM-05` | `pnpm evaluate` |
| C9 | Matched comparison abstains on load mismatch (100 %) while the unconditioned baseline flags 54 % | Verified in simulation | `evaluation.json` → `exercise.SIM-09` | `pnpm evaluate` |
| C10 | A fluid shift alone caused a false deviation event in 10 % of runs | Verified (negative result) | `evaluation.json` → `exerciseDeviationEventRate.SIM-10` | `pnpm evaluate` |
| C11 | 95 unit/integration tests pass; 10 browser tests pass in each of Chrome, Firefox and WebKit (Playwright builds) | Verified | `deliverables/reports/test-summary.json` | `npx tsx scripts/test-summary.ts` |
| C12 | Automated accessibility checks pass on every route in both themes | Verified (automated rules only) | e2e "automated accessibility checks …" | `pnpm test:e2e` |
| C13 | Seven core locales with key parity | Verified (parity); translation quality **not** reviewed by native speakers | unit "localisation", `scripts/i18n-check.ts` | `pnpm lint` |
| C14 | Serial, WebSocket and replay paths are emulator-verified | Verified at that level only | adapters and servers tests, `pnpm device:emulator` | `pnpm test` |
| C15 | Independent security review: no critical/high finding; 10 findings fixed | Verified | `docs/SECURITY.md`, regression tests | `pnpm test` |
| C16 | 4 crew, 30 simulated minutes in 2–4 s across runs; bounded heap | Measured on one machine (win32 x64, Node 24.11) | `evaluation.json` → `performance` | `pnpm evaluate` |

## Not claimed (must not appear anywhere)

Clinically validated · flight-ready · NASA-approved or endorsed · patented · first-ever · real astronaut telemetry · hardware-verified sensor support · diagnoses hypercapnia / predicts atrophy / treats astronauts · reduces communication propagation delay · clinical sensitivity or specificity figures.

## Wording rules

- Always pair a number with "in simulation" (or the scenario set) and its comparator.
- "Withheld" is a result, not a failure.
- NASA and other organisations are cited as sources, never as partners.
