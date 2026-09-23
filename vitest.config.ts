import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@bao/config': path.resolve(__dirname, 'packages/config/src/index.ts'),
      '@bao/contracts': path.resolve(__dirname, 'packages/contracts/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    env: {
      ENCRYPTION_KEY: 'test-encryption-key-at-least-32-chars!!',
    },
    server: {
      deps: {
        inline: ['postgres'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/*.config.*'],
    },
  },
});
