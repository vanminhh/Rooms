import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { createHash } from 'node:crypto'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontend = path.resolve(here, '../../Source/frontend')
const { createServer } = await import(pathToFileURL(path.join(frontend, 'node_modules/vite/dist/node/index.js')))
const virtualId = path.join(frontend, '__color_snapshot__.tsx').replaceAll('\\', '/')
const server = await createServer({
  root: frontend, configFile: false, cacheDir: path.join(here, '.cache'),
  plugins: [{ name: 'rooms-color-snapshot', resolveId: id => id === 'virtual:color-snapshot' ? virtualId : undefined,
    load: id => id === virtualId ? readFile(path.join(here, 'snapshot-entry.tsx'), 'utf8') : undefined }],
  server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom',
})
try {
  const { snapshot } = await server.ssrLoadModule('virtual:color-snapshot')
  let html = snapshot().replace(/<link\b[^>]*rel="preload"[^>]*>/g, '')
  const cssPaths = ['src/components/rooms.css', 'src/components/shared-primitives.css', 'src/components/Navigation.css',
    'src/features/auth/auth.css', 'src/layouts/layouts.css', 'src/features/public/public.css', 'src/features/public/home-lower.css']
  const styles = await Promise.all(cssPaths.map(file => readFile(path.join(frontend, file), 'utf8')))
  const sourcePaths = [...cssPaths, 'src/pages/public/PublicHomePage.tsx', 'src/layouts/PublicLayout.tsx', 'src/features/public/RoomCard.tsx', 'src/components/Navigation.tsx', 'src/components/RoomSearch.tsx', 'src/shared/i18n/vi.ts']
  const sourceHashes = Object.fromEntries(await Promise.all(sourcePaths.map(async file => [file, createHash('sha256').update(await readFile(path.join(frontend, file))).digest('hex')])))
  await mkdir(path.join(here, 'assets'), { recursive: true })
  const images = [...new Set([...html.matchAll(/src="\/images\/([^"/]+)"/g)].map(match => match[1]))]
  for (const image of images) await copyFile(path.join(frontend, 'public/images', image), path.join(here, 'assets', image))
  html = html.replaceAll('src="/images/', 'src="assets/')
  const metadata = { capturedAt: new Date().toISOString(), sourceHashes, fixtures: true }
  const fonts = 'https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600&family=Taviraj:ital,wght@0,200;0,300;0,400;0,500;1,200;1,300;1,500&display=swap'
  const document = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link href="${fonts}" rel="stylesheet"><style>body{margin:0} ${styles.join('\n')}\n[data-color-selected]{outline:2px dashed #277767!important;outline-offset:3px} [data-color-selected] *{cursor:crosshair} @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}</style><style id="color-overrides"></style></head><body>${html}</body></html>`
  await writeFile(path.join(here, 'snapshot.js'), `// Generated from the current Rooms components. Refresh with node refresh-snapshot.mjs.\nglobalThis.ROOMS_SNAPSHOT = ${JSON.stringify({ document, metadata })};\n`)
  console.log(`Snapshot saved: ${images.length} local images, ${cssPaths.length} original stylesheets; no API calls.`)
} finally { await server.close() }
