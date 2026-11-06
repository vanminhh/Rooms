// PreToolUse guard: edits outside the staging areas need the owner's approval (root CLAUDE.md).
// Copying a whole approved draft with apply-draft.mjs asks once instead of once per file.
import { isAbsolute, relative, resolve, sep } from 'node:path'

const STAGING = /^(Artifacts|Source\/frontend\/artifact_FE|Source\/backend\/artifact_BE)(\/|$)/i
const TASK_FILE = /(^|\/)feature_[^/]+\.md$/i

function decide(reason, decision = 'ask') {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason },
  }))
}

try {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  const { tool_name: tool, tool_input: input = {}, agent_type: agent, cwd } = JSON.parse(raw)
  const file = input.file_path ?? input.notebook_path
  if (tool === 'Bash') {
    if (/apply-draft\.mjs/.test(input.command ?? '')) {
      if (agent) decide('Chỉ phiên chính được chép bản nháp vào file chính, sau khi chủ dự án duyệt.', 'deny')
      else decide(`Chép cả bản nháp vào file chính: ${input.command}. Chủ dự án đã duyệt bản nháp này trong chat chưa?`)
    }
  } else if (file) {
    const root = process.env.CLAUDE_PROJECT_DIR || cwd || process.cwd()
    const rel = relative(root, resolve(cwd || root, file))
    const path = rel.split(sep).join('/')
    const insideProject = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
    if (insideProject && !STAGING.test(path) && !TASK_FILE.test(path)) {
      decide(`File chính "${path}": cần chủ dự án duyệt. Bản nháp phải nằm trong Artifacts/, artifact_FE/ hoặc artifact_BE/ và đã được duyệt trong chat.`)
    }
  }
} catch (error) {
  // Fail safe: if the guard itself breaks, ask instead of silently allowing.
  decide(`Không kiểm tra được vùng nháp (${error.message}); hỏi chủ dự án trước khi sửa.`)
}
