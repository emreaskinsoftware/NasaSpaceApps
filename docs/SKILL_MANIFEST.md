# Skill and tool manifest

What was actually used to build this release, and what the specification asked for but was not available. Loading a skill is not evidence that its checks passed; the resulting artefacts are listed instead.

## Build agent

- Model: Claude Fable 5.2 (`claude-fable-5-2`) in Claude Code (desktop app), as reported by the session environment.
- Sub-agents (same model family, general-purpose): server/adapter slice; three translation agents (tr+de, fr+es, ar+ja); one read-only security reviewer.

## Requested skills

| Source (ledger id) | Status | What replaced it | Resulting artefact |
|---|---|---|---|
| K01 UI UX Pro Max | **Not installed** — third-party plugin installation was not performed in this session | Design specification of the build document applied directly (tokens, type scale, motion limits) | `apps/web/src/styles/tokens.css`, product captures, axe results |
| K02 Anthropic document skills (PPTX/PDF) | Available in the session but **not loaded**; decks built directly with `pptxgenjs` and rendered with local PowerPoint | `scripts/slides-build.ts`, `scripts/slides-render.ps1` | `deliverables/presentation/` (PPTX, PDF, thumbnails) |
| K02 frontend-design / webapp-testing | **frontend-design loaded and applied** for the visual pass (one orchestrated entrance, one signature element, sentence-case headings instead of tracked-out capitals, restraint elsewhere); webapp-testing not loaded | Playwright + axe-core test suite | entry screen, `components/motion.tsx`, `tests/e2e/`, `deliverables/reports/test-summary.json` |
| K03 Impeccable | **Not installed** | Manual review of rendered screenshots in both themes, RTL and mobile width; automated contrast checks | `deliverables/captures/`, e2e accessibility test |
| K04 Remotion skills | **Not installed**; the film is assembled with FFmpeg by `scripts/video-build.py` | — | `deliverables/video/README.md` |
| K05 Vercel React guidance | Not consulted | Scalar summaries posted at 4 Hz, min/max-preserving decimation, lazy-loaded Lab/Devices routes | bundle sizes in `docs/DEPENDENCIES.md` |
| K06 Superpowers workflow | Present in the session; its brainstorming/planning flow was **not** followed because the specification already fixed scope and architecture | Vertical slices verified with probes, unit tests and e2e tests | test suites |

## Tools actually used

Node 24.11, pnpm 11.15, TypeScript 7.0, Vite 8, Vitest 5, Motion 14, Playwright 1.65 (Chrome channel plus its Firefox and WebKit builds; bundled FFmpeg for raw WebM capture only), axe-core, pptxgenjs 4, Microsoft PowerPoint (COM automation for PDF/PNG export), Python 3 + Pillow (contact sheets for slide QA).

## Not available

LibreOffice, the GitHub CLI, any physical sensor. UI UX Pro Max, Impeccable, Remotion and Vercel skills remain uninstalled: they are third-party agent plugins whose installers were not run in this session.
