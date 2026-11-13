# Release checklist

State of the local deliverable at the end of the build session. "Done" items were executed; open items are listed with their exact blocker.

## Product

- [x] Three modules, shared observation/event pipeline, cases, ground console, simulation lab, devices, evidence library, settings (12 routes)
- [x] 15 seeded scenarios; deterministic replay; fork/reset as new runs
- [x] Offline PWA; reload with the network blocked verified
- [x] Light, dark and system themes; reduced motion; 7 locales; RTL
- [x] Gateway + ground processes with real HTTP exchange; device emulator through the real parser
- [ ] Hardware verification — no physical device available
- [x] Firefox and WebKit run the browser suite (Playwright builds; Safari itself not tested)
- [x] React Bits / 21st.dev review — ten candidates, one adopted (`UI_COMPONENT_PROVENANCE.md`)
- [x] Motion for React animation layer; entry screen redesigned around a live illustration

## Verification

- [x] `pnpm lint`, `pnpm typecheck`
- [x] `pnpm test` — 89 unit/integration tests
- [x] `pnpm test:e2e` — 9 browser tests × 3 engines (Chrome, Firefox, WebKit), including automated accessibility checks
- [x] `pnpm evaluate` — held-out evaluation, negative results retained
- [x] Independent security review; all confirmed findings fixed with regression tests
- [x] `pnpm audit` — one low-severity build-time advisory without a published fix
- [ ] Clean-checkout reproduction on a second machine
- [ ] Native-speaker review of the six translated locales

## Documents and media

- [x] README, validation report, claim ledger, security notes, decisions, dependency and skill manifests
- [x] Project report, English and Turkish (PDF + HTML)
- [x] Presentations, English and Turkish, full and short (PPTX + PDF + thumbnails + notes + QA report)
- [x] Real product stills and raw screen recording
- [ ] **Narrated product videos** — not rendered: the Higgsfield connector was not connected and no voice/TTS or full FFmpeg toolchain was available (`deliverables/video/README.md`)

## Publication

- [x] Git repository initialised on top of the existing remote history; pushed to `github.com/umitcancinar/NasaSpaceApps` without force
- [ ] CI result checked, GitHub Release with large media — the GitHub CLI is not installed on the build machine

Still open before a public submission: choose a licence, add the team name, check the first CI run, and attach the raw screen recording (kept out of Git) to a Release if it is wanted.
