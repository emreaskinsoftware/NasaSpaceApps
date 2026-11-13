import { fileURLToPath } from 'node:url';
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export const aliases = {
  '@aster/contracts': r('./packages/contracts/src/index.ts'),
  '@aster/engine': r('./packages/engine/src/index.ts'),
  '@aster/simulator': r('./packages/simulator/src/index.ts'),
  '@aster/evaluation': r('./packages/evaluation/src/index.ts'),
  '@aster/comms': r('./packages/comms/src/index.ts'),
  '@aster/runtime': r('./packages/runtime/src/index.ts'),
  '@aster/adapters': r('./packages/adapters/src/index.ts'),
  '@': r('./apps/web/src'),
};
