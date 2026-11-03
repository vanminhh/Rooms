import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const backendRoot = resolve(import.meta.dirname, '../../..');
export default defineConfig({
  plugins: [{
    name: 'p2-3-draft-common-import',
    enforce: 'pre',
    resolveId(source) {
      if (source === '../../common/errors/error-code.js') {
        return resolve(backendRoot, 'src/common/errors/error-code.ts');
      }
      return null;
    },
  }],
  resolve: { tsconfigPaths: true },
  test: {
    root: backendRoot,
    include: ['artifact_BE/2026-11-03-BE-P2-3-e2e-fix/ref/*.preview.spec.ts'],
  },
});
