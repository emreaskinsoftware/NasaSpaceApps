# Dependencies

Exact versions come from the committed `pnpm-lock.yaml` (pnpm 11.15.1, Node 24.11.0 at build time; `engines.node >= 24`). Licences are as declared by each package; verify before redistribution.

## Runtime

| Package | Version | Licence | Used in |
|---|---|---|---|
| @fastify/websocket | 11.3.7 | MIT | application / servers |
| @fontsource-variable/inter | 5.3.0 | OFL-1.1 (font), MIT (package) | application / servers |
| @fontsource/ibm-plex-mono | 5.3.0 | OFL-1.1 (font), MIT (package) | application / servers |
| dexie | 4.4.7 | Apache-2.0 | application / servers |
| fastify | 5.12.8 | MIT | application / servers |
| i18next | 27.1.1 | MIT | application / servers |
| motion | 14.12.0 | MIT | application / servers |
| react | 19.3.1 | MIT | application / servers |
| react-dom | 19.3.1 | MIT | application / servers |
| react-i18next | 18.0.1 | MIT | application / servers |
| react-router-dom | 7.18.5 | MIT | application / servers |
| ws | 8.22.2 | MIT | application / servers |
| zod | 4.6.7 | MIT | application / servers |
| zustand | 5.1.0 | MIT | application / servers |

## Development and build

| Package | Version | Licence | Used in |
|---|---|---|---|
| @axe-core/playwright | 4.14.0 | MPL-2.0 | build, test or media tooling |
| @playwright/test | 1.65.0 | Apache-2.0 | build, test or media tooling |
| @types/node | 26.6.6 | MIT | build, test or media tooling |
| @types/react | 19.3.0 | MIT | build, test or media tooling |
| @types/react-dom | 19.3.0 | MIT | build, test or media tooling |
| @types/ws | 8.18.2 | MIT | build, test or media tooling |
| @vitejs/plugin-react | 6.3.0 | MIT | build, test or media tooling |
| fake-indexeddb | 6.2.8 | Apache-2.0 | build, test or media tooling |
| pptxgenjs | 4.0.1 | MIT | build, test or media tooling |
| tsx | 4.23.15 | MIT | build, test or media tooling |
| typescript | 7.0.2 | Apache-2.0 | build, test or media tooling |
| vite | 8.3.8 | MIT | build, test or media tooling |
| vite-plugin-pwa | 2.0.0 | MIT | build, test or media tooling |
| vitest | 5.1.0 | MIT | build, test or media tooling |

## Notes

- Node 24 LTS was used instead of Node 26 (the installed runtime); nothing requires 26.
- TypeScript 7.0 is used; `typescript-eslint` does not support it yet, so ESLint was removed in favour of `scripts/lint.ts`.
- `node:sqlite` (built into Node) backs the gateway and ground databases and prints an ExperimentalWarning on Node 24.
- Security overrides in `pnpm-workspace.yaml`: `image-size ^2.0.3`, `glob ^14.0.2`. `pnpm audit`: one low-severity advisory (deepmerge via vite-plugin-pwa → workbox-build, build-time only) has no published fix.
- Bundle (production build): main script ≈ 240 KiB gzip including all seven locales; mission worker ≈ 280 KB raw; Lab and Devices routes are lazy-loaded.
- No runtime dependency is loaded from a CDN; fonts are self-hosted.
