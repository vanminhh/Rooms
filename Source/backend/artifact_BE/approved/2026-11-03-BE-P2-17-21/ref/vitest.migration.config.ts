import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const configDir = dirname(fileURLToPath(import.meta.url));
const draftRoot = resolve(configDir, '..');
const backendRoot = resolve(draftRoot, '..', '..');

export default defineConfig({
  root: backendRoot,
  cacheDir: resolve(configDir, 'vite-migration-cache'),
  test: {
    globals: true,
    environment: 'node',
    include: [`${configDir.replaceAll('\\', '/')}/rooms.migration.preview.spec.ts`],
  },
});
