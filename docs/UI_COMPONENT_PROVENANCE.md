# UI component provenance

Review of the two component sources named in the build specification, and where every visual element of ASTER comes from. Reviewed on 13 November 2026 by reading the public repository and pages; no account was created and nothing was purchased.

## React Bits — https://reactbits.dev · https://github.com/DavidHDev/react-bits

- **Author:** David Haz. **Licence:** MIT + Commons Clause Condition v1.0 (`LICENSE.md` in the repository). Use inside an application is allowed, including commercially; selling, sublicensing or redistributing the components themselves (alone, bundled or ported) is not. ASTER uses one component as part of the application and keeps the licence text next to it.
- **Form:** copy-in source, four variants per component (JS/TS × CSS/Tailwind). The TypeScript + CSS variant (`src/ts-default`) was read.

| # | Candidate | Dependencies (from source) | Decision | Reasoning |
|---|---|---|---|---|
| 1 | **SpotlightCard** (Components) | React only | **Adopted, adapted** → `apps/web/src/components/reactbits/SpotlightCard.tsx` | Pointer- and focus-following light on a card. No dependency, pauses when off-screen, already reads `prefers-reduced-motion`, responds to keyboard focus as well as pointer. Used for the three module cards on the entry screen only |
| 2 | DecryptedText (Text animations) | `motion/react` | Rejected | Scrambles letters before revealing text. On a product whose message is "nothing is invented", scrambled characters in the headline send the wrong signal; it also delays the first readable paint |
| 3 | CountUp (Text animations) | `motion/react` | Rejected | Rolls numbers up to their value. The specification forbids tweening measured values through intermediate numbers that were never observed |
| 4 | Threads (Backgrounds) | React, WebGL2 | Rejected | Attractive thin-line field, but a continuous full-screen WebGL loop behind text costs battery, and the specification rules out looping backgrounds. Replaced by a static CSS grid plus one purposeful live illustration |
| 5 | SplitText / FadeContent (Text, Animations) | `gsap`, `gsap/ScrollTrigger`, `gsap/SplitText` | Rejected | Would add GSAP as a second animation system next to Motion; the specification asks for one. Scroll-triggered reveals on every section are also the generic default this product avoids |
| 6 | StarBorder (Animations) | React only | Rejected | A light that orbits a button border continuously. It would compete with status colours and is a permanent loop on a primary action |
| 7 | ClickSpark / cursor effects (Animations) | React, canvas | Rejected | Cursor-following decoration is explicitly excluded from operational views by the specification |

### Changes made to SpotlightCard

Colours come from ASTER's design tokens, so the card follows the light/dark theme instead of taking a `theme` prop; the app's own "Reduce motion" setting is honoured in addition to the OS preference; the grain layer (an inline noise image) and the `'use client'` directive were removed; padding and radius follow the app's card metrics. RTL needs no change (the effect is positional, not directional). Accessibility: the decorative layers stay `aria-hidden`; content is unchanged for assistive technology.

## 21st.dev — https://21st.dev · https://21st.dev/mcp

- **Form:** a component marketplace with a CLI/MCP (`npm i -g @21st-dev/cli`, `21st login`, `21st add <author>/<component>`), search over a large library and paid generation features.
- **Finding:** component source is behind sign-in. The registry endpoint answers `403 Authentication required` without a token, and the CLI flow starts with `21st login`. Each component carries its author's own terms, so licences would have to be checked one by one.

| # | Candidate | Decision | Reasoning |
|---|---|---|---|
| 8 | 21st MCP / CLI as a build dependency | Rejected | Needs an account and token; the specification says no account or paid generator may be assumed and nothing from these sources may become a build or runtime dependency |
| 9 | shadcn `button` and similar primitives via the registry | Rejected | Source not retrievable without authentication (403). ASTER's primitives are small original components checked with axe |
| 10 | Command-palette and theme-switch pieces (browsed by name only) | Rejected | Not inspectable without sign-in; ASTER's palette and theme selector already meet the keyboard and focus requirements |

No 21st.dev code, asset or generated output is used anywhere in the project.

## What the UI is made of

| Element | Origin | Notes |
|---|---|---|
| Module cards on the entry screen | **React Bits SpotlightCard, adapted** | See above; licence in `apps/web/src/components/reactbits/LICENSE.react-bits.md` |
| Motion layer (`components/motion.tsx`) | Original, built on **Motion for React** (MIT) | Route cross-fade, sliding navigation indicator, events that emerge when raised, sliding calibration-lifecycle marker, one orchestrated entrance on the entry screen |
| Entry-screen live illustration (`features/landing/LiveTrace.tsx`) | Original SVG animation | Shows the product's central behaviour: contact slips, the mechanical interpretation is withheld, the breathing channel continues. Labelled as an illustration with invented shapes; pauses off-screen and when the tab is hidden; a static frame under reduced motion |
| Layout, tokens, primitives | Original | Semantic tokens from the specification |
| Charts (`components/Chart.tsx`) | Original SVG | Gaps are never interpolated; linked cursor; keyboard cursor; table alternative; time axis stays left-to-right in RTL; a live-edge marker shows that the run is advancing (a position cue, not a value) |
| State-change cues | Original CSS | A one-shot ring when a measurement state changes; packets travel along the ground-link line only while frames are really in flight |
| Icons, sensor map | Original inline SVG | No icon library |
| Fonts | Inter (variable) and IBM Plex Mono via `@fontsource`, SIL OFL 1.1 | Self-hosted; Arabic and Japanese fall back to system fonts |

## Motion rules applied

Motion explains a change the person caused or an event that was raised. Measured values are never tweened. Durations are 120–320 ms with transform and opacity only. With "Reduce motion" (setting or OS preference): no route cross-fade, no entrance sequence travel, the live illustration becomes a still frame, and the spotlight follows instantly. No remote font, CDN asset, iframe or paid generator is used at build time or at run time.
