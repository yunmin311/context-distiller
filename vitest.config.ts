import { defineConfig } from 'vitest/config';

// Only the pure, browser-independent modules under lib/core and lib/platform
// are unit-tested here. Entrypoints rely on WXT auto-imports / the extension
// runtime and are exercised by manual + (future) Playwright E2E tests instead.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
