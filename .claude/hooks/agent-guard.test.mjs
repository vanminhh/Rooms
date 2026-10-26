// Run: node --test .claude/hooks/agent-guard.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./agent-guard.mjs', import.meta.url))
const root = resolve('/repo')

function decision(stdin) {
  const { stdout } = spawnSync(process.execPath, [script], {
    input: typeof stdin === 'string' ? stdin : JSON.stringify({ ...stdin, cwd: root }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  })
  return stdout ? JSON.parse(stdout).hookSpecificOutput.permissionDecision : 'allow'
}
const write = (agent, path) => decision({ agent_type: agent, tool_name: 'Write', tool_input: { file_path: resolve(root, path) } })
const bash = (agent, command) => decision({ agent_type: agent, tool_name: 'Bash', tool_input: { command } })

test('planner writes only PLAN.md', () => {
  assert.equal(write('planner', 'Artifacts/2026-10-27-x/PLAN.md'), 'allow')
  assert.equal(write('planner', 'Artifacts/2026-10-27-x/src/app.ts'), 'deny')
})

test('coder cannot touch tests or the plan', () => {
  assert.equal(write('coder', 'Source/backend/artifact_BE/d/src/modules/auth/auth.service.ts'), 'allow')
  assert.equal(write('coder', 'Source/backend/artifact_BE/d/src/modules/auth/auth.service.spec.ts'), 'deny')
  assert.equal(write('coder', 'Source/frontend/artifact_FE/d/tests/kit.test.mjs'), 'deny')
  assert.equal(write('coder', 'Source/backend/artifact_BE/d/PLAN.md'), 'deny')
  assert.equal(bash('coder', 'npm run lint'), 'allow')
})

test('tester writes only tests', () => {
  assert.equal(write('tester', 'Source/backend/artifact_BE/d/test/auth.e2e-spec.ts'), 'allow')
  assert.equal(write('tester', 'Source/frontend/artifact_FE/d/src/features/auth/LoginForm.test.tsx'), 'allow')
  assert.equal(write('tester', 'Source/backend/artifact_BE/d/src/modules/auth/auth.service.ts'), 'deny')
})

test('reviewer runs only one read-only git command and writes nothing', () => {
  for (const ok of ['git diff', 'git diff --no-index -- a.ts b.ts', 'git log --oneline -5', 'git status --porcelain', 'git show HEAD:CLAUDE.md']) {
    assert.equal(bash('reviewer', ok), 'allow', ok)
  }
  for (const bad of ['git diff > out.txt', 'git diff --output=x', 'git diff && rm -rf x', 'git diff | tee x', 'echo $(git diff)',
    'git checkout .', 'git branch -D main', 'git -c core.pager=sh diff', 'rm x', 'git diff\nrm x']) {
    assert.equal(bash('reviewer', bad), 'deny', bad)
  }
  assert.equal(write('reviewer', 'Artifacts/d/notes.md'), 'deny')
})

test('main session and other agents are not limited', () => {
  assert.equal(write(undefined, 'Source/backend/src/app.spec.ts'), 'allow')
  assert.equal(bash(undefined, 'rm x'), 'allow')
  assert.equal(write('Explore', 'Source/backend/src/app.spec.ts'), 'allow')
})

test('broken input asks instead of allowing', () => {
  assert.equal(decision('not json'), 'ask')
})
