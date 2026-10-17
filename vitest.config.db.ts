import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    include: ['test/database/**/*.db-spec.ts'],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
