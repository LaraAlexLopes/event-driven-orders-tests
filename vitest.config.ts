import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['src/setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: 'reports/junit.xml' },
  },
});
