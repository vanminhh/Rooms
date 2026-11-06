// Run: node --test .claude/hooks/staging-guard.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./staging-guard.mjs', import.meta.url))
const root = resolve('/repo')

function decision(stdin) {
  const { stdout } = spawnSync(process.execPath, [script], {
    input: typeof stdin === 'string' ? stdin : JSON.stringify({ ...stdin, cwd: root }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: root },
    encoding: 'utf8',
  })
  return stdout ? JSON.parse(stdout).hookSpecificOutput.permissionDecision : 'allow'
}
const write = (path) => decision({ tool_name: 'Write', tool_input: { file_path: resolve(root, path) } })
const bash = (command, agent) => decision({ tool_name: 'Bash', tool_input: { command }, agent_type: agent })

test('main files ask, staging areas and feature files do not', () => {
  assert.equal(write('Source/backend/src/app.module.ts'), 'ask')
  assert.equal(write('CLAUDE.md'), 'ask')
  assert.equal(write('Artifacts/2026-10-27-x/CLAUDE.md'), 'allow')
  assert.equal(write('Source/frontend/artifact_FE/2026-10-27-x/src/a.tsx'), 'allow')
  assert.equal(write('Source/backend/src/modules/auth/feature_login.md'), 'allow')
})

test('apply-draft asks the owner once in the main session and is denied to subagents', () => {
  const command = 'node .claude/scripts/apply-draft.mjs Source/backend/artifact_BE/2026-10-27-x'
  assert.equal(bash(command), 'ask')
  assert.equal(bash(command, 'coder'), 'deny')
  assert.equal(bash('npm run test'), 'allow')
})

test('broken input asks instead of allowing', () => {
  assert.equal(decision('not json'), 'ask')
})
