import { existsSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig, type Plugin } from 'vitest/config';

const refDir = dirname(fileURLToPath(import.meta.url));
const draftRoot = resolve(refDir, '..');
const backendRoot = resolve(draftRoot, '..', '..');
const draftSrc = resolve(draftRoot, 'src');
const mainSrc = resolve(backendRoot, 'src');

function candidates(path: string): string[] {
  const base = extname(path) === '.js' ? path.slice(0, -3) : path;
  return [path, `${base}.ts`, `${base}.tsx`, `${base}.js`];
}

function mainFallback(): Plugin {
  return {
    name: 'p2-5-test-main-fallback',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!importer || !id.startsWith('.')) return null;
      const from = importer.split('?')[0];
      if (!isAbsolute(from)) return null;
      const relativeImporter = relative(draftSrc, from);
      if (relativeImporter === '..' || relativeImporter.startsWith('..\\') || relativeImporter.startsWith('../')) return null;
      const relativeTarget = relative(draftSrc, resolve(dirname(from), id));
      if (relativeTarget === '..' || relativeTarget.startsWith('..\\') || relativeTarget.startsWith('../')) return null;
      return candidates(resolve(mainSrc, relativeTarget)).find(existsSync) ?? null;
    },
  };
}

const normalizedDraft = draftRoot.replaceAll('\\', '/');

export default defineConfig({
  root: backendRoot,
  cacheDir: resolve(refDir, 'vite-cache'),
  plugins: [mainFallback()],
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/**/*.spec.ts',
      'prisma/**/*.spec.ts',
      'scripts/**/*.spec.ts',
      `${normalizedDraft}/src/**/*.spec.ts`,
    ],
    exclude: [
      ...configDefaults.exclude,
      'src/modules/buildings/buildings.http.spec.ts',
      'src/common/prisma/prisma.service.spec.ts',
    ],
  },
});
