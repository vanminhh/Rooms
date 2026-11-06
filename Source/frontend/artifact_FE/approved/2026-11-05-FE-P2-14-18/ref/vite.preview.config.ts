import { existsSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig, normalizePath } from 'vite'
import type { Plugin } from 'vite'

// The draft folder mirrors Source/frontend/. Preview only: the build goes to ref/dist, never to Source/frontend/dist.
const draft = normalizePath(fileURLToPath(new URL('..', import.meta.url))).replace(/\/$/, '')
const frontend = normalizePath(fileURLToPath(new URL('../../../', import.meta.url))).replace(/\/$/, '')
const EXTENSIONS = ['', '.tsx', '.ts', '.jsx', '.js', '.css', '.json']

function findFile(base: string): string | undefined {
  const candidates = [...EXTENSIONS.map(ext => base + ext), ...EXTENSIONS.slice(1).map(ext => `${base}/index${ext}`)]
  const hit = candidates.find(file => existsSync(file) && statSync(file).isFile())
  return hit && normalizePath(hit)
}

// A relative import missing in the draft resolves to the same path under Source/frontend/src; a file in the draft always wins.
const mainFallback: Plugin = {
  name: 'draft-main-fallback',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !source.startsWith('.') || !normalizePath(importer).startsWith(`${draft}/`)) return null
    const target = normalizePath(resolve(dirname(importer), source))
    const local = findFile(target)
    if (local) return local
    if (!target.startsWith(`${draft}/`)) return null
    return findFile(frontend + target.slice(draft.length)) ?? null
  },
}

// Browser page loads (Accept: text/html) get preview.html, so the draft routes work on a direct URL.
function htmlFallback(): Plugin {
  const rewrite = (req: { url?: string; headers: { accept?: string } }, _res: unknown, next: () => void) => {
    if (req.headers.accept?.includes('text/html')) req.url = '/preview.html'
    next()
  }
  return {
    name: 'draft-html-fallback',
    configureServer(server) { server.middlewares.use(rewrite) },
    configurePreviewServer(server) { server.middlewares.use(rewrite) },
  }
}

export default defineConfig({
  root: draft,
  // Keep Vite's dep cache out of the draft folder: apply-draft copies every file in it.
  cacheDir: `${frontend}/node_modules/.vite-p2-preview`,
  publicDir: `${frontend}/public`,
  plugins: [mainFallback, htmlFallback(), react(), babel({ presets: [reactCompilerPreset()] })],
  // Same-origin API as the app, so auth cookies work (FE-LOGIN-03).
  server: {
    fs: { allow: [frontend] },
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    outDir: 'ref/dist',
    rolldownOptions: {
      input: `${draft}/preview.html`,
    },
  },
})
