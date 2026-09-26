import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'packages/db/tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    cacheDir: '.vitest-cache',
  },
  resolve: {
    alias: {
      '@': './src',
    },
  },
});
