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

function sourceCandidates(filePath: string): string[] {
  const extension = extname(filePath);
  const base = extension === '.js' ? filePath.slice(0, -3) : filePath;
  return [filePath, `${base}.ts`, `${base}.tsx`, `${base}.js`, resolve(filePath, 'index.ts')];
}

function draftFallbackResolver(): Plugin {
  return {
    name: 'rooms-draft-main-fallback',
    enforce: 'pre',
    resolveId(id, importer) {
      if (!importer || !id.startsWith('.')) return null;
      const importerPath = importer.split('?')[0];
      if (!isAbsolute(importerPath)) return null;
      const importerInDraft = relative(draftSrc, importerPath);
      const importerInMain = relative(mainSrc, importerPath);
      const sourceRoot = importerInDraft === '..' || importerInDraft.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
        ? importerInMain === '..' || importerInMain.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
          ? null
          : mainSrc
        : draftSrc;
      if (!sourceRoot) return null;

      const sourceTarget = resolve(dirname(importerPath), id);
      const sourceRelative = relative(sourceRoot, sourceTarget);
      if (sourceRelative === '..' || sourceRelative.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) return null;
      const overlayTarget = resolve(draftSrc, sourceRelative);
      const overlayRelative = relative(draftSrc, overlayTarget).replaceAll('\\', '/');
      if (/^modules\/(files|rooms)\//.test(overlayRelative)) {
        const draftMatch = sourceCandidates(overlayTarget).find(existsSync);
        if (draftMatch) return draftMatch;
      }
      if (sourceRoot === draftSrc) {
        const mainTarget = resolve(mainSrc, sourceRelative);
        return sourceCandidates(mainTarget).find(existsSync) ?? null;
      }
      return null;
    },
  };
}

export default defineConfig({
  root: backendRoot,
  cacheDir: resolve(configDir, 'vite-cache'),
  plugins: [draftFallbackResolver()],
  resolve: {
    tsconfigPaths: true,
    alias: { '@prisma/client': resolve(generatedClient, 'index.js') },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: [resolve(configDir, 'vitest.preview.setup.ts')],
    include: [
      `${draftRoot.replaceAll('\\', '/')}/src/modules/rooms/**/*.spec.ts`,
      `${draftRoot.replaceAll('\\', '/')}/src/modules/files/**/*.spec.ts`,
    ],
  },
});
