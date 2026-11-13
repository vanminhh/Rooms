import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { execFile } from 'node:child_process'

const root = path.dirname(fileURLToPath(import.meta.url))
// Only the tool's public files are served; repository sources and dotfiles are never exposed.
const allowed = new Set(['index.html', 'editor.css', 'catalog.js', 'color-core.js', 'editor.js', 'snapshot.js', ...(await readdir(path.join(root, 'assets'))).map(file => `assets/${file}`)])
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.webp': 'image/webp' }
const server = createServer(async (req, res) => {
  const file = new URL(req.url, 'http://127.0.0.1').pathname.slice(1) || 'index.html'
  if (req.method !== 'GET' || !allowed.has(file)) { res.writeHead(404); res.end('Not found'); return }
  try {
    const bytes = await readFile(path.join(root, file))
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    res.end(bytes)
  } catch { res.writeHead(404); res.end('Not found') }
})
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'Port 4783 is in use. If this tool is already running, open http://127.0.0.1:4783 in your browser.' : error.message)
  process.exitCode = 1
})
server.listen(4783, '127.0.0.1', () => {
  console.log('Rooms color tool: http://127.0.0.1:4783 — Ctrl+C to stop.')
  // This flag is only used by the owner's double-click launcher.
  if (process.argv.includes('--open') && process.platform === 'win32') execFile('cmd.exe', ['/c', 'start', '', 'http://127.0.0.1:4783'], { windowsHide: true }, error => {
    if (error) console.error('Open http://127.0.0.1:4783 in your browser.')
  })
})
