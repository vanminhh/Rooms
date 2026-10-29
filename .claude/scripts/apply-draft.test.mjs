// Run: node --test .claude/scripts/apply-draft.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./apply-draft.mjs', import.meta.url))

function setup() {
  const repo = mkdtempSync(join(tmpdir(), 'apply-draft-'))
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo, encoding: 'utf8' }).trim()
  git('init', '-q')
  const write = (path, text) => {
    mkdirSync(join(repo, path, '..'), { recursive: true })
    writeFileSync(join(repo, path), text)
  }
  const read = (path) => readFileSync(join(repo, path), 'utf8')
  const has = (path) => existsSync(join(repo, path))
  const run = (draft) => spawnSync(process.execPath, [script, draft], { cwd: repo, encoding: 'utf8' })
  const commit = () => {
    git('add', '-A')
    git('commit', '-qm', 'x')
    return git('rev-parse', 'HEAD')
  }
  return { repo, write, read, has, run, commit }
}

test('refuses a draft that is not approved and copies nothing', () => {
  const { repo, write, has, run } = setup()
  try {
    write('Artifacts/2026-10-27-x/REVIEW.md', 'Trạng thái: CHỜ DUYỆT\n')
    write('Artifacts/2026-10-27-x/notes.md', 'x')
    assert.notEqual(run('Artifacts/2026-10-27-x').status, 0)
    assert.equal(has('notes.md'), false)
    assert.equal(has('Artifacts/2026-10-27-x/notes.md'), true)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('copies an approved draft to its targets, skips draft-only files, moves it to approved/', () => {
  const { repo, write, read, has, run, commit } = setup()
  try {
    write('CLAUDE.md', 'old')
    const base = commit()
    const draft = 'Source/backend/artifact_BE/2026-10-27-BE-LOGIN-01'
    write(`${draft}/REVIEW.md`, '# x\n\nTrạng thái: ĐÃ DUYỆT 27/10/2026\n')
    write(`${draft}/PLAN.md`, 'plan')
    write(`${draft}/ref/before.png`, 'img')
    write(`${draft}/preview.html`, 'shim')
    write(`${draft}/src/app.module.ts`, 'new code')
    write(`${draft}/src/app.module.spec.ts`, 'new test')

    const { status, stdout, stderr } = run(draft)
    assert.equal(status, 0, stdout + stderr)
    assert.equal(read('Source/backend/src/app.module.ts'), 'new code')
    assert.equal(read('Source/backend/src/app.module.spec.ts'), 'new test')
    for (const skipped of ['PLAN.md', 'REVIEW.md', 'ref/before.png', 'preview.html']) {
      assert.equal(has(`Source/backend/${skipped}`), false, skipped)
    }
    assert.equal(has(draft), false)
    assert.match(read('Source/backend/artifact_BE/approved/2026-10-27-BE-LOGIN-01/REVIEW.md'), /Đã chép vào file chính .* 2 file\./)

    write('Artifacts/2026-10-27-root/REVIEW.md', `Trạng thái: ĐÃ DUYỆT 27/10/2026\nGốc: ${base.slice(0, 7)}\n`)
    write('Artifacts/2026-10-27-root/CLAUDE.md', 'new')
    const root = run('Artifacts/2026-10-27-root')
    assert.equal(root.status, 0, root.stdout + root.stderr)
    assert.equal(read('CLAUDE.md'), 'new')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('refuses to overwrite a main file that changed since the draft\'s base commit, copies nothing', () => {
  const { repo, write, read, has, run, commit } = setup()
  try {
    write('Source/backend/src/a.ts', 'v1')
    const base = commit()
    const draft = 'Source/backend/artifact_BE/2026-10-28-x'
    write(`${draft}/src/a.ts`, 'draft')
    write(`${draft}/src/new.ts`, 'new')

    write(`${draft}/REVIEW.md`, 'Trạng thái: ĐÃ DUYỆT 28/10/2026\n')
    assert.match(run(draft).stderr, /chưa ghi "Gốc/, 'replacing a file needs a base commit')
    write(`${draft}/REVIEW.md`, 'Trạng thái: ĐÃ DUYỆT 28/10/2026\nGốc: 0123456789abcdef\n')
    assert.match(run(draft).stderr, /không có commit Gốc/, 'unknown base commit')

    write(`${draft}/REVIEW.md`, `Trạng thái: ĐÃ DUYỆT 28/10/2026\nGốc: ${base}\n`)
    write('Source/backend/src/a.ts', 'v2 from a teammate')
    write('Source/backend/src/new.ts', 'added by another draft')
    const refused = run(draft)
    assert.notEqual(refused.status, 0)
    assert.match(refused.stderr, /Source\/backend\/src\/a\.ts/)
    assert.match(refused.stderr, /Source\/backend\/src\/new\.ts/, 'a file that appeared at a target since the base also counts')
    assert.equal(read('Source/backend/src/a.ts'), 'v2 from a teammate')
    assert.equal(read('Source/backend/src/new.ts'), 'added by another draft')
    assert.equal(has(`${draft}/src/a.ts`), true)

    // The fix the message asks for: merge into the draft, commit main, record the new base.
    const merged = commit()
    write(`${draft}/REVIEW.md`, `Trạng thái: ĐÃ DUYỆT 28/10/2026\nGốc: ${merged}\n`)
    const applied = run(draft)
    assert.equal(applied.status, 0, applied.stdout + applied.stderr)
    assert.equal(read('Source/backend/src/a.ts'), 'draft')
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('refuses folders that are not a draft directly inside a staging area', () => {
  const { repo, write, run } = setup()
  try {
    write('Artifacts/approved/2026-10-27-x/REVIEW.md', 'Trạng thái: ĐÃ DUYỆT\n')
    write('Source/backend/src/REVIEW.md', 'Trạng thái: ĐÃ DUYỆT\n')
    assert.notEqual(run('Artifacts/approved/2026-10-27-x').status, 0)
    assert.notEqual(run('Artifacts/approved').status, 0)
    assert.notEqual(run('Source/backend/src').status, 0)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
