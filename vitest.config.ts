import { defineConfig } from 'vitest/config';
import { aliases } from './aliases';
export default defineConfig({
  resolve: { alias: aliases },
  test: { include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'tests/unit/**/*.test.ts'], testTimeout: 60000 },
});
