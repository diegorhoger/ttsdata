import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

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
      'next/server': resolve(__dirname, 'apps/web/node_modules/next/server.js'),
    },
  },
});
