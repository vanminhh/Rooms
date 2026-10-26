// Lists main files changed since `save`, including shell writes the Edit/Write hooks cannot see.
// Usage: node .claude/scripts/main-files.mjs save    (before each orchestrator call)
//        node .claude/scripts/main-files.mjs check   (after its reply; exit 1 when a main file changed)
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const STAGING = /^(Artifacts|Source\/frontend\/artifact_FE|Source\/backend\/artifact_BE)\/|(^|\/)feature_[^/]+\.md$/i
const git = (args, input) => execFileSync('git', args, { encoding: 'utf8', input })
process.chdir(git(['rev-parse', '--show-toplevel']).trim())
const store = git(['rev-parse', '--git-path', 'main-files-snapshot.json']).trim()

// Content hash of every modified, deleted or untracked (not ignored) main file. Plain `git status`
// would miss a second change to a file that was already dirty; clean tracked files equal HEAD.
function snapshot() {
  const paths = [...new Set(git(['ls-files', '-m', '-d', '-o', '--exclude-standard', '-z']).split('\0'))]
    .filter((path) => path && !STAGING.test(path))
  const present = paths.filter((path) => existsSync(path))
  const hashes = present.length ? git(['hash-object', '--stdin-paths'], present.join('\n')).trim().split('\n') : []
  const result = Object.fromEntries(paths.map((path) => [path, 'deleted']))
  present.forEach((path, i) => { result[path] = hashes[i] })
  return result
}

const mode = process.argv[2]
if (mode === 'save') {
  writeFileSync(store, JSON.stringify(snapshot()))
  console.log('Đã lưu trạng thái file chính.')
} else if (mode === 'check') {
  if (!existsSync(store)) throw new Error('Chưa chạy "save" trước khi "check".')
  const before = JSON.parse(readFileSync(store, 'utf8'))
  const after = snapshot()
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((path) => before[path] !== after[path])
    .sort()
  console.log(changed.length ? `File chính bị đổi trong lúc chạy:\n${changed.join('\n')}` : 'Không có file chính nào bị đổi.')
  process.exitCode = changed.length ? 1 : 0
} else {
  console.error('Dùng: node .claude/scripts/main-files.mjs save | check')
  process.exitCode = 2
}
