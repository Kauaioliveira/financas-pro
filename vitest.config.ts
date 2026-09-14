import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Tests run in local mode; cloud code is tested through its factories with a fake backend.
  define: { __FINANCASPRO_CLOUD__: 'false' },
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.ts'],
  },
});
