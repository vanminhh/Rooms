// Run: node --test .claude/scripts/main-files.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./main-files.mjs', import.meta.url))

test('check lists main files changed after save, ignoring staging areas and feature files', () => {
  const repo = mkdtempSync(join(tmpdir(), 'main-files-'))
  const write = (path, text) => {
    mkdirSync(join(repo, path, '..'), { recursive: true })
    writeFileSync(join(repo, path), text)
  }
  const run = (mode) => spawnSync(process.execPath, [script, mode], { cwd: repo, encoding: 'utf8' })
  try {
    const git = (...args) => execFileSync('git', args, { cwd: repo })
    git('init', '-q')
    write('clean.ts', 'a')
    write('dirty.ts', 'a')
    write('gone.ts', 'a')
    git('add', '.')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init')
    write('dirty.ts', 'b') // already dirty before the run

    assert.equal(run('save').status, 0)
    assert.equal(run('check').status, 0, 'nothing changed yet')

    write('dirty.ts', 'c') // dirty file changed again: plain git status would miss this
    write('clean.ts', 'b')
    write('new.ts', 'x')
    rmSync(join(repo, 'gone.ts'))
    write('Artifacts/d/a.ts', 'x')
    write('Source/backend/artifact_BE/d/a.spec.ts', 'x')
    write('Source/backend/src/modules/auth/feature_login.md', 'x')

    const { status, stdout } = run('check')
    assert.equal(status, 1)
    assert.deepEqual(stdout.trim().split('\n').slice(1), ['clean.ts', 'dirty.ts', 'gone.ts', 'new.ts'])
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('check without save fails', () => {
  const repo = mkdtempSync(join(tmpdir(), 'main-files-'))
  try {
    execFileSync('git', ['init', '-q'], { cwd: repo })
    assert.notEqual(spawnSync(process.execPath, [script, 'check'], { cwd: repo }).status, 0)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
