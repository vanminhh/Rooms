import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Drafts (pending or approved) never run against the dev DB; e2e runs only on applied files.
    exclude: [...configDefaults.exclude, 'artifact_BE/**'],
  },
});
