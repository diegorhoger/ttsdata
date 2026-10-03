import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: {
    include: ['packages/db/tests/**/integration.test.ts', 'apps/api/tests/**/*.integration.test.ts'],
    environment: 'node',
    globals: true,
    fileParallelism: false,
    cacheDir: '.vitest-integration-cache',
  },
  resolve: {
    alias: {
      // Order matters: Vite string aliases are prefix matches and the FIRST
      // match wins, so the longer specifier must precede the bare package name.
      '@ttsdata/db/src/schema': resolve(__dirname, 'packages/db/src/schema.ts'),
      '@ttsdata/data-quality': resolve(__dirname, 'packages/data-quality/src/index.ts'),
      '@ttsdata/db': resolve(__dirname, 'packages/db/src/index.ts'),
      '@ttsdata/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      // `@/` only; a bare `@` alias would prefix-match `@ttsdata/...`.
      // Workspace packages are pinned to TypeScript source for tests so that a
      // test importing `packages/db/src/x` and code importing `@ttsdata/db`
      // share one module identity. Production resolves them through
      // package.json `main` (compiled JS).
      '@/': resolve(__dirname, 'src') + '/',
      'next/server': resolve(__dirname, 'apps/web/node_modules/next/server.js'),
    },
  },
});
