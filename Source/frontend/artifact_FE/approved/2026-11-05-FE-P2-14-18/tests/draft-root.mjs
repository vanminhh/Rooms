// Shared root-finding for every test in this draft, old and new. The one lesson from P2-8a: earlier tests
// resolved the draft/main roots with a fixed number of `resolve(here, '..', '..')` hops, which only worked while
// the test file stayed at that exact depth and broke the moment the file moved. This module instead walks up
// from its own `import.meta.url` until it finds a directory with the shape it is looking for, so it resolves the
// same way whether it runs from `artifact_FE/<draft>/tests/...` or — after apply-draft.mjs — from
// `Source/frontend/tests/...` (where draftRoot and mainRoot end up being the very same directory).
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

function findAncestor(startDir, isRoot) {
  let dir = startDir
  for (;;) {
    if (isRoot(dir)) return dir
    const parent = dirname(dir)
    if (parent === dir) throw new Error(`no ancestor of ${startDir} satisfies the predicate`)
    dir = parent
  }
}

const here = dirname(fileURLToPath(import.meta.url))

// draftRoot: nearest ancestor (starting at this file's own directory) that has a `src/` folder.
// In the draft this is the draft folder itself; after apply it is `Source/frontend` (same as mainRoot below).
export const draftRoot = findAncestor(here, dir => existsSync(join(dir, 'src')))

// mainRoot: nearest ancestor that has the real UI kit (`src/components/index.ts`), i.e. `Source/frontend`.
// Drafts never copy the kit in, so while unapplied this walks past the draft folder to find it.
export const mainRoot = findAncestor(here, dir => existsSync(join(dir, 'src', 'components', 'index.ts')))

const draftSrcRoot = join(draftRoot, 'src')
const mainSrcRoot = join(mainRoot, 'src')

// Absolute path to `relPath` (e.g. 'src/pages/public/PublicHomePage.tsx'): the draft's copy if it has one,
// otherwise the main tree's copy.
export function draftFirst(relPath) {
  const draftPath = join(draftRoot, relPath)
  return existsSync(draftPath) ? draftPath : join(mainRoot, relPath)
}

// ---------- tiny TS/TSX -> CommonJS loader, with the same draft-first/main-fallback resolution for relative imports ----------
const nodeRequire = createRequire(import.meta.url)
const moduleCache = new Map()

function resolveFile(candidate) {
  for (const ext of ['.ts', '.tsx']) if (existsSync(candidate + ext)) return candidate + ext
  for (const ext of ['/index.ts', '/index.tsx']) if (existsSync(candidate + ext)) return candidate + ext
  if (existsSync(candidate)) {
    try { if (statSync(candidate).isFile()) return candidate } catch { /* not a plain file */ }
  }
  return null
}

function resolveRelative(fromDir, id) {
  const candidate = resolve(fromDir, id)
  const draftCandidate = candidate.startsWith(mainSrcRoot) ? candidate.replace(mainSrcRoot, draftSrcRoot) : candidate
  const draftFile = resolveFile(draftCandidate)
  if (draftFile) return draftFile
  const mainCandidate = candidate.startsWith(draftSrcRoot) ? candidate.replace(draftSrcRoot, mainSrcRoot) : candidate
  const mainFile = resolveFile(mainCandidate)
  if (mainFile) return mainFile
  throw new Error(`cannot resolve "${id}" from ${fromDir}`)
}

function requireFrom(fromDir, id) {
  if (!id.startsWith('.')) return nodeRequire(id)
  if (id.endsWith('.css')) return {}
  return compile(resolveRelative(fromDir, id))
}

function compile(absPath) {
  if (moduleCache.has(absPath)) return moduleCache.get(absPath)
  const code = ts.transpileModule(readFileSync(absPath, 'utf8'), {
    fileName: absPath,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  const mod = { exports: {} }
  moduleCache.set(absPath, mod.exports) // set before running: a circular import gets the (still-filling) exports object, not a loop
  Function('require', 'exports', 'module', code)(id => requireFrom(dirname(absPath), id), mod.exports, mod)
  return mod.exports
}

// Loads and runs a .ts/.tsx module from an absolute path (e.g. from `draftFirst(...)`), transpiling it on the
// fly and resolving its relative imports draft-first / main-fallback, same as this file's own exports do.
export function loadModule(absPath) {
  const resolved = resolveFile(absPath) ?? absPath
  return compile(resolved)
}
