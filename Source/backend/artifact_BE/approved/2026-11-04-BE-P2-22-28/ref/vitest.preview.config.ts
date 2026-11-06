import { existsSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';

const configDir = dirname(fileURLToPath(import.meta.url));
const draftRoot = resolve(configDir, '..');
const backendRoot = resolve(draftRoot, '..', '..');
const draftSrc = resolve(draftRoot, 'src');
const mainSrc = resolve(backendRoot, 'src');
const generatedClient = resolve(configDir, 'generated');

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

// `.js` import specifiers map to the `.ts` source, as in the NodeNext build.
function sourceCandidates(filePath: string): string[] {
  const base = extname(filePath) === '.js' ? filePath.slice(0, -3) : filePath;
  return [filePath, `${base}.ts`, `${base}.tsx`, `${base}.js`, resolve(filePath, 'index.ts')];
}

// Relative imports resolve to the draft mirror of the target when it exists; otherwise a draft file
// falls back to main and a main file keeps its default resolution.
function draftFirstResolver(): Plugin {
  return {
    name: 'backend-draft-first-resolver',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!importer || !id.startsWith('.')) return null;
      const importerPath = importer.split('?')[0];
      if (!isAbsolute(importerPath)) return null;
      const fromDraft = isInside(importerPath, draftSrc);
      if (!fromDraft && !isInside(importerPath, mainSrc)) return null;

      const target = resolve(dirname(importerPath), id);
      const srcRelative = relative(fromDraft ? draftSrc : mainSrc, target);
      if (srcRelative.startsWith('..') || isAbsolute(srcRelative)) return null;

      const overlay = sourceCandidates(resolve(draftSrc, srcRelative)).find(existsSync);
      if (overlay) return overlay;
      if (fromDraft) return sourceCandidates(resolve(mainSrc, srcRelative)).find(existsSync) ?? null;
      return null;
    },
  };
}

export default defineConfig({
  root: backendRoot,
  cacheDir: resolve(configDir, 'vite-cache'),
  plugins: [draftFirstResolver()],
  resolve: {
    tsconfigPaths: true,
    // The draft schema's client, so draft code sees the new PricingIdempotencyKey model.
    alias: { '@prisma/client': resolve(generatedClient, 'index.js') },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [resolve(configDir, 'vitest.preview.setup.ts')],
    include: [`${relative(backendRoot, draftSrc).replaceAll('\\', '/')}/**/*.spec.ts`],
  },
});
