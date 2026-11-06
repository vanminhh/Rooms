import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Drafts (pending or approved) never run against the dev DB; e2e runs only on applied files.
    exclude: [...configDefaults.exclude, 'artifact_BE/**'],
    // The dev DB is remote (~0.8 s per query), so fixtures that create many rows need more than the 5 s / 60 s defaults.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
