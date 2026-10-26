// PreToolUse guard for the pipeline agents (.claude/agents/*.md): keeps each role in its lane.
// Runs from .claude/settings.json for every tool call and reads `agent_type`, so it also works when the
// orchestrator nests the agents. Agent-frontmatter hooks need workspace trust and did not fire in a test.
// shortcut: file rules only see Edit/Write, not files written through Bash; main-files.mjs check covers main files.
import { relative, resolve, sep } from 'node:path'

const LANES = { planner: 'plan-only', coder: 'no-tests', tester: 'tests-only', reviewer: 'read-only' }
const WRITE_TOOLS = ['Edit', 'Write', 'NotebookEdit']
const TEST_FILE = /\.(spec|test|e2e-spec)\.[cm]?[jt]sx?$|(^|\/)(tests?|__tests__|fixtures)\//i
const PLAN_FILE = /(^|\/)PLAN\.md$/i
const READ_GIT = /^git (diff|log|show|status|blame|ls-files|rev-parse|merge-base)( |$)/
// No chaining, pipes, redirects, substitution, or git writing its own output file.
const SHELL_TRICKS = /[;&|<>`$\r\n]|--output(=|\s|$)/

function decide(reason, decision = 'deny') {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason },
  }))
}

try {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  const { tool_name: tool, tool_input: input = {}, agent_type: agent, cwd } = JSON.parse(raw)
  const lane = LANES[agent]
  if (lane === 'read-only') {
    const command = (input.command ?? '').trim()
    if (tool !== 'Bash' || !READ_GIT.test(command) || SHELL_TRICKS.test(command)) {
      decide('Reviewer chỉ đọc: mỗi lần chạy đúng một lệnh git diff/log/show/status/blame/ls-files/rev-parse/merge-base, không nối lệnh, không ghi file. Đọc file thì dùng Read/Grep/Glob.')
    }
  } else if (lane && WRITE_TOOLS.includes(tool)) {
    const root = process.env.CLAUDE_PROJECT_DIR || cwd || process.cwd()
    const file = input.file_path ?? input.notebook_path ?? ''
    const path = relative(root, resolve(cwd || root, file)).split(sep).join('/')
    const isTest = TEST_FILE.test(path)
    const isPlan = PLAN_FILE.test(path)
    if (lane === 'plan-only' && !isPlan) decide(`Planner chỉ được ghi PLAN.md, không ghi "${path}".`)
    if (lane === 'tests-only' && !isTest) decide(`Tester chỉ được ghi file test, không sửa "${path}". Code sai thì báo FAIL để coder sửa.`)
    if (lane === 'no-tests' && (isTest || isPlan)) decide(`Coder không được sửa test hay PLAN.md ("${path}"); test do tester viết.`)
  }
} catch (error) {
  // Cannot tell which agent is calling: ask instead of silently allowing.
  decide(`agent-guard lỗi (${error.message}); hỏi chủ dự án trước khi cho chạy.`, 'ask')
}
