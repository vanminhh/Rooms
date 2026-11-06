import { existsSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
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

const isFile = (path: string) => existsSync(path) && statSync(path).isFile();

// Path of `path` relative to `root`, or null when it lies outside `root`.
function insideRoot(root: string, path: string): string | null {
  const rel = relative(root, path);
  return rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel) ? null : rel;
}

// Draft-first: a file that exists in the draft overrides main, whoever imports it.
// Main fallback only for imports made by draft files; main imports of files the draft does not have are left to Vite.
function draftFirstFallback(): Plugin {
  return {
    name: 'get-room-test-main-fallback',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!importer || !id.startsWith('.')) return null;
      const from = importer.split('?')[0];
      if (!isAbsolute(from)) return null;
      const target = resolve(dirname(from), id);
      const rel = insideRoot(draftSrc, target) ?? insideRoot(mainSrc, target);
      if (rel === null) return null;
      const draftHit = candidates(resolve(draftSrc, rel)).find(isFile);
      if (draftHit) return draftHit;
      if (insideRoot(draftSrc, from) === null) return null;
      return candidates(resolve(mainSrc, rel)).find(isFile) ?? null;
    },
  };
}

const normalizedDraft = draftRoot.replaceAll('\\', '/');

export default defineConfig({
  root: backendRoot,
  cacheDir: resolve(refDir, 'vite-cache'),
  plugins: [draftFirstFallback()],
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
      'src/common/prisma/prisma.service.spec.ts',
    ],
  },
});
