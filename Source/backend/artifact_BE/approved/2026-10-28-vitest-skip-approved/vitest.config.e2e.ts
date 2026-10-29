import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Applied drafts keep their old copies here; the code they tested is already in src/.
    exclude: [...configDefaults.exclude, 'artifact_BE/approved/**'],
  },
});
