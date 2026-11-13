# Research, Technology, and Skills Source Ledger

Research date: 13 November 2026. Recheck dependencies, installers, service terms, and competition requirements at implementation time. Publication dates must come from the document, not a search engine's crawl date.

This is a targeted research and prior-art review, not a systematic review, exhaustive novelty search, patent opinion, or clinical validation. A source supporting one component does not validate ASTER's combined method.

## Scientific and mission sources

| ID | Primary source | Supported point | Boundary |
|---|---|---|---|
| S01 | [CSA Bio-Monitor](https://www.asc-csa.gc.ca/eng/sciences/bio-monitor.asp) | Existing astronaut smart-garment monitoring. | Product description does not validate ASTER or establish identical sensor implementation. |
| S02 | [CSA Space Health / Artemis](https://www.asc-csa.gc.ca/eng/sciences/space-flight-improve-monitor-health-earth.asp) | Existing analysis and visualization of Bio-Monitor data. | Do not claim to invent AI analysis of astronaut wearables. |
| S03 | [MagIC-Space, 2018](https://www.sciencedirect.com/science/article/pii/S0924424717321969) | ECG, respiration, and mechanical cardiac monitoring during ISS sleep recordings. | Small study and sleep context do not establish continuous free-motion reliability. |
| S04 | [NASA: Wearable Tech for Space Station Research](https://www.nasa.gov/humans-in-space/wearable-tech-for-space-station-research/) | Personal CO2 monitoring and other wearable research already exist. | Local concentration is not automatically inspired concentration. |
| S05 | [NASA CO2 risk record, Rev. D](https://www.nasa.gov/wp-content/uploads/2025/09/hsrb-co2-risk-risk-record-rev-d-1-web.pdf) | Slide/page labeled 66 distinguishes personal/local measurements from inspired levels. | Large PDF; verify full context before quoting. Historical slides inside a newer revision do not prove the absence of newer solutions. |
| S06 | [NASA: Validation of Inspired Carbon Dioxide Measurement Methods](https://ntrs.nasa.gov/api/citations/20180006659/downloads/20180006659.pdf?attachment=true) | Rebreathing can make cycle minima inadequate; time-weighted and flow-weighted measures differ. | Methodological precedent; respiratory gating alone is not novel. |
| S07 | [PVDF ECG/SCG e-tattoo, 2019](https://advanced.onlinelibrary.wiley.com/doi/10.1002/advs.201900290) | Flexible PVDF mechanical cardiac sensing and paired-sensor motion reduction. | Not proof of all-motion or spaceflight performance. |
| S08 | [Wearable mechano-acoustic elastography](https://pmc.ncbi.nlm.nih.gov/articles/PMC12407073/) | Wearable actuation and mechanical-wave measurement are feasible research techniques. | Tissue-stiffness measurement does not prove calibration transfer to endogenous biosignals. |
| S09 | [MMG validity and reliability, 2020](https://journals.sagepub.com/doi/pdf/10.1177/2055668320916116) | Measurement conditions including attachment and joint angle matter. | MMG is not a universal direct force measurement. |
| S10 | [Nutritional status and bioimpedance in simulated microgravity](https://journals.physiology.org/doi/10.1152/japplphysiol.00721.2002) | Fluid compartments complicate interpretation of body composition. | Do not equate single-frequency impedance with muscle mass. |
| S11 | [Segmental resistance during head-down tilt, 2023](https://www.mdpi.com/1424-8220/23/5/2793) | Segmental impedance changes and the importance of movement-aware monitoring. | Ground analog and controlled protocol; not continuous astronaut validation. |
| S12 | [Wearable dual-frequency bioimpedance and muscle fatigue](https://pubmed.ncbi.nlm.nih.gov/37405890/) | Existing experimental relationship between impedance features and muscle fatigue. | Prior art, small study, and context-specific findings; not an ASTER accuracy claim. |
| S13 | [NASA muscle-risk description](https://www.nasa.gov/directorates/esdmd/hhp/muscle-risk/) | Exercise countermeasures and future mission equipment limitations matter. | Do not imply all ISS astronauts experience the same deterioration. |
| S14 | [NASA ESPRIT task](https://humanresearchroadmap.nasa.gov/Tasks/task.aspx?i=1235) | Exercise sensing and pose reconstruction have already been investigated. | Camera exercise tracking alone is not a novel contribution. |
| S15 | [NASA CHP-IDSP, 2025](https://ntrs.nasa.gov/citations/20250000330) | Integrated crew data infrastructure and decision-support development. | Development status is not equivalent to universal operational deployment. |
| S16 | [NASA xEHR, 2023](https://ntrs.nasa.gov/citations/20230003216) | Asynchronous medical information and crew access are established objectives. | Store-and-forward is infrastructure, not ASTER's standalone novelty. |
| S17 | [NASA Human Research Roadmap](https://humanresearchroadmap.nasa.gov/) | Official risk/gap framework for positioning the project. | Read current status; old closed gaps must not be presented as currently open. |
| S18 | [NASA environmental requirements](https://www.nasa.gov/reference/6-0-natural-and-induced-environments-vol-2/) | Environmental recording and trending context. | Applicability, averaging periods, units, and revision matter when deriving rules. |
| S19 | [NASA spacesuit requirements](https://www.nasa.gov/reference/11-0-spacesuits-vol-2/) | Inspired CO2 is relevant in suit environments. | Suit limits must not be copied blindly into cabin or clinical rules. |
| S20 | [NASA Medical-701](https://humanresearchroadmap.nasa.gov/gaps/gap.aspx?i=716) | Resource-aware, increasingly independent medical capability is a stated research need. | Broad mission relevance does not validate a particular product. |

If an article is inaccessible, use the accessible primary abstract within its limits. Record which sections were actually examined. Never invent a result from an inaccessible full text.

## Technology sources and selection policy

| ID | Official source | Implementation use |
|---|---|---|
| T01 | [React versions](https://react.dev/versions) | React 19.3 documentation was current when researched; resolve and pin the compatible stable patch at build time. |
| T02 | [Vite guide](https://vite.dev/guide/) | Client application build; check its current Node requirements and worker support. |
| T03 | [Node release schedule](https://nodejs.org/en/about/previous-releases) | Node 26 and 24 were listed as LTS; use 26 LTS if the dependency suite supports it, otherwise document the 24 LTS compatibility decision. |
| T04 | [Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite) | Current official documentation showed v4.3; use the corresponding supported Vite integration. |
| T05 | [Motion for React](https://motion.dev/docs/react) | Intentional UI animation and reduced-motion handling. Use the documented current package/import path. |
| T06 | [Vite PWA](https://vite-pwa-org.netlify.app/guide/) | Asset caching, update prompts, and service-worker verification. Does not guarantee persistent background computation. |
| T07 | [Dexie documentation](https://dexie.org/docs/) | Browser-local IndexedDB persistence; review migration and storage-failure behavior. |
| T08 | [Fastify documentation](https://fastify.dev/docs/latest/) | Local gateway and optional ground-server API. |
| T09 | [i18next documentation](https://www.i18next.com/) | Bundled localization and fallback rules. Cloud translation services are not required. |
| T10 | [Playwright documentation](https://playwright.dev/docs/intro) | Browser verification, offline scenarios, screenshot capture, and product recording. |
| T11 | [MDN Web Bluetooth](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API) | Permissions, secure-context requirements, and limited browser support. |
| T12 | [MDN Web Serial](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API) | Supported-browser serial acquisition and user-initiated device access. |
| T13 | [Remotion documentation](https://www.remotion.dev/docs/) | Programmatic composition using real screen recordings, titles, voice, and captions. |
| T14 | [SprintIR-W datasheet](https://www.gassensing.co.uk/wp-content/uploads/2025/09/SprintIR-W-Data-Sheet-Rev-4.14.pdf) | Example of why output rate, gas exchange, filtering, and response time are different concepts. This is not a procurement recommendation or validated hardware selection. |
| T15 | [Claude Fable 5.2 official documentation](https://platform.claude.com/docs/en/models/fable-5-2/overview) | Intended build-agent model. Availability and configured model identity must be verified in the actual environment. |
| T16 | [Claude Code skills](https://code.claude.com/docs/en/skills) | Discovering, loading, and scoping agent skills. |
| T17 | [Target repository](https://github.com/umitcancinar/NasaSpaceApps) | Public page showed a minimal README and one commit when inspected. Recheck before modifying; do not replace uninspected history. |
| T18 | [Supplied challenge page](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/) | Team-provided challenge URL; fetch failed during this research pass. Do not invent additional challenge requirements. |

Version numbers above are dated observations, not permission to skip package compatibility testing. “Latest” means the newest mutually compatible stable releases verified during setup, not prereleases or unconditional upgrades. Record exact installed versions, engine constraints, lockfile, and relevant advisories in `docs/DEPENDENCIES.md`.

## Skill sources and installation research

Do not assume local Codex skills are automatically available in Claude Code. Install or enable the relevant portable packages in the implementation environment, inspect their instructions, and record their revision. No skill installation occurs merely because this document names it.

### K01 — UI UX Pro Max: required

Source: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill

Verified upstream Claude Code marketplace commands:

```text
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

Upstream CLI alternative uses package `ui-ux-pro-max-cli`, then `uipro init --ai claude`. Older `uipro-cli` naming is identified upstream as stale. Prefer the marketplace or a project-scoped installation route where supported; avoid unnecessary global changes.

Use for design-system reasoning, chart/readability review, localization layout, and accessibility. Do not apply its default palette or glass treatment mechanically. Our local search returned operations-monitoring guidance but also landing-page and glassmorphism suggestions; only the relevant monitoring, status, accessibility, and hierarchy guidance was retained. The build specification's restrained instrument design is a deliberate project decision.

### K02 — Anthropic skills: required for applicable deliverables

Source: https://github.com/anthropics/skills

```text
/plugin marketplace add anthropics/skills
/plugin install document-skills@anthropic-agent-skills
/plugin install example-skills@anthropic-agent-skills
```

Discover the current frontend-design, webapp-testing, PPTX, and PDF capabilities rather than assuming their invocation paths. Use document skills to create, render, inspect, and repair the actual deck and PDF. Inspect the installed license before redistributing skill assets.

### K03 — Impeccable: required design-review pass

Source: https://github.com/pbakaus/impeccable

Current upstream installation: `npx impeccable install`; reload the agent and initialize with `/impeccable init` in Claude Code. Verify before running. Use for critique, consistency, typography, and finishing. Establish one project design-system source of truth so this skill does not compete with UI UX Pro Max by creating a second theme.

### K04 — Remotion skills: required for video

Source: https://www.remotion.dev/docs/ai/skills

Current upstream options: `npx remotion skills add` inside an existing Remotion project, or `npx skills add remotion-dev/skills` otherwise. Read the applicable create, media, captions, audio, and render instructions before authoring. The requested final deliverable explicitly includes rendered MP4 files, not only a Studio preview.

### K05 — Vercel agent skills: recommended performance review

Source: https://github.com/vercel-labs/agent-skills

Inspect the current repository installer and select React best practices and web design guidelines. Apply React client-rendering and accessibility advice relevant to this Vite app; do not migrate to Next.js just because some guidance discusses it.

### K06 — Planning, debugging, and verification workflow: use when available

Source: https://github.com/obra/superpowers

Inspect its current installation guidance before use. Relevant capabilities include implementation planning, systematic debugging, and verification before completion. Avoid installing duplicate workflows merely to increase the skill count. Respect the user's selected architecture and approved scope.

### Required skill-installation record

Create `docs/SKILL_MANIFEST.md` containing source, installed version/commit, scope, discovered skill name, when used, and any unavailable capability with its replacement. Loading a skill is not evidence that its checks passed; attach the resulting design, test, slide-render, or video-render artifact.

## Reproduction and public claims

Maintain a claim ledger linking every quantitative statement in README, slides, and video to a report, scenario set, comparator, seed set, code commit, and data origin. Keep research citations separate from software verification and method-validation evidence. NASA material is attribution, not endorsement. Check asset-specific reuse rules before incorporating logos, photographs, or recordings.

## User-requested visual component resources

### U01 — React Bits

Sources: https://reactbits.dev/ and https://github.com/DavidHDev/react-bits

The official site presents animated components as installable/copyable source, with JavaScript/TypeScript and CSS/Tailwind choices. Inspect individual implementations and dependencies before adoption. The implementation agent must review candidates for intro motion, navigation, and subtle interaction; operational charts must remain faithful and distraction-free. Record selected sources and licenses, bundle required assets locally, and implement reduced motion.

### U02 — 21st.dev and current MCP integration

Sources: https://21st.dev/, https://21st.dev/ai, https://21st.dev/mcp, and https://github.com/21st-dev/magic-mcp

The site provides component/design discovery and generation workflows. The former Magic URL redirected to the current AI page, and the legacy Magic MCP repository states that the integration is now 21st MCP. Verify current setup rather than using an old API-key command from a blog. Generation may require an account or paid access; neither is assumed. Public browsing and eligible source adaptation remain useful without making generation a project dependency.

Both resources were explicitly requested by the user. Review them and document component decisions; importing an unsuitable visual effect merely to mention the library is not required.
