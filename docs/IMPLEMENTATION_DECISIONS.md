# Implementation decisions and deviations

The specification in `../nasaspaceapp/docs/` is preserved unchanged. This file records where the implementation differs and why.

| # | Specification | What was built | Reason |
|---|---|---|---|
| 1 | pnpm workspace with separate packages | One root package; `packages/*` and `apps/*` are directories resolved through TypeScript/Vite path aliases | One lockfile and one toolchain; boundaries are enforced by `scripts/lint.ts` and unit tests instead of package manifests |
| 2 | Tailwind 4 + shadcn/ui | Hand-written CSS with semantic tokens (`apps/web/src/styles/tokens.css`) and small accessible primitives | Fewer dependencies in the offline bundle; the token table of the spec is implemented directly and contrast-checked with axe |
| 3 | Apache ECharts | Custom SVG `Chart` component | Exact control of gap handling (no interpolation across missing data), linked cursor, keyboard cursor and table alternative; main bundle stays ≈ 240 KiB gzip |
| 4 | Motion for React | **Adopted** (`motion` 14) for route continuity, the sliding navigation indicator, emerging events, the calibration-lifecycle marker and the entry-screen entrance; small state cues stay in CSS | One motion system, as specified; everything is removed or made instant by "Reduce motion" and `prefers-reduced-motion` |
| 5 | React Router path routes | `HashRouter` (`/#/mission/overview`) | Deep links work from any static host and from the service-worker cache without server rewrites |
| 6 | Engine `restore(snapshot)` and simulator checkpoints | Deterministic replay from `(run spec, command log)` | Simulation, rules and communication share one virtual clock, so replay is exact; used for reload recovery, fork and gateway restart |
| 7 | ESLint | `scripts/lint.ts` (boundaries, security bans, locale parity) + `tsc` strict unused checks | `typescript-eslint` does not support TypeScript 7.0 at the time of writing |
| 8 | Chromium, Firefox and WebKit | **All three run** the browser suite (Chrome, Playwright Firefox and WebKit builds) | One exception: keyboard link traversal is asserted in Chrome and Firefox only, because Playwright's WebKit build does not move focus to links with Tab. WebKit here is the Windows test build, not Safari on macOS/iOS |
| 9 | Lag estimator drives alignment | Declared sampling delay drives alignment; observed onset lag is diagnostic only | In development the estimator's bias depended on local ventilation and increased error (negative result kept in the validation report) |
| 10 | Gain compensation as part of the candidate | Conservative gate released; compensation shown as experimental and excluded from the exercise comparison | Held-out results show a systematic error under actuator/physiological path mismatch |
| 11 | Exercise rule on the fluid-aware method | Rule uses the matched-conditioned method | The fluid-aware variant did not improve held-out results |
| 12 | Truth overlay hidden in crew/ground mode | Truth is only requested when the role is "researcher" and the Lab toggle is on | The role is a UI preference, not access control (documented in SECURITY.md) |
| 13 | External telemetry merged with provenance | External telemetry (replay, WebSocket, serial) is validated, counted and inspected, **not** merged into the simulated run | Avoids any mislabelled mixed-origin run in a release with no hardware verification |
| 14 | React Bits / 21st.dev review with ≥ 6 candidates | **Done**: ten candidates reviewed, one adopted (React Bits SpotlightCard, adapted); 21st.dev rejected because its sources need sign-in | See `UI_COMPONENT_PROVENANCE.md` |
| 15 | UI UX Pro Max, Impeccable, Remotion and Vercel skills | Not installed | See `SKILL_MANIFEST.md` |
| 16 | Narrated product videos (105 s, 35 s, 3–4 min) | Main film only (103 s, 1080p, English narration). Real product footage; narration, music and one abstract insert generated with the Higgsfield connector; assembled by `scripts/video-build.py` | Free Higgsfield plan: 10 credits, cheaper video models refused. Vertical cut and walkthrough not produced; audio not reviewed by ear. See `deliverables/video/README.md` |
| 17 | Push to `github.com/umitcancinar/NasaSpaceApps`, CI, release assets | Source, documents, decks and report are pushed on top of the existing history (no force-push). No GitHub Release was created; the raw screen recording is kept out of Git | The GitHub CLI is not installed, so release assets and the CI result could not be managed from the build session |
| 18 | Eight-crew scale test, 30-minute browser memory test | 4-crew, 30-simulated-minute headless run measured (`pnpm evaluate`) | Browser-side long-run memory was not measured |
| 19 | PDF export of a case | Print stylesheet + browser "Save as PDF" | No PDF library in the offline bundle |

Demonstration constants (thresholds, dwell times, gate limits) live in `packages/engine/src/{exposure,integrity,exercise,rules}.ts` and are labelled as demonstration settings, not clinical limits.
