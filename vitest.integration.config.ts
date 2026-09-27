import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['packages/db/tests/**/integration.test.ts'],
    environment: 'node',
    globals: true,
    fileParallelism: false,
    cacheDir: '.vitest-integration-cache',
  },
  resolve: {
    alias: {
      '@': './src',
      'next/server': resolve(__dirname, 'apps/web/node_modules/next/server.js'),
    },
  },
});
