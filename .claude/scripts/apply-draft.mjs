// Copies an approved draft to the main files in one step and moves it into approved/ (root CLAUDE.md, step 3).
// Usage: node .claude/scripts/apply-draft.mjs <draft folder>   e.g. Source/backend/artifact_BE/2026-10-27-BE-LOGIN-01
// staging-guard.mjs asks the owner once before this runs; the script refuses drafts not marked ĐÃ DUYỆT.
// shortcut: files marked "Xóa" in REVIEW.md are not deleted here; delete them by hand with the owner.
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

// Staging area → the folder its draft paths mirror.
const AREAS = { 'Artifacts': '', 'Source/frontend/artifact_FE': 'Source/frontend', 'Source/backend/artifact_BE': 'Source/backend' }
// Draft-only files: review notes, plan, reference images, preview shims.
const SKIP = /^(REVIEW\.md|PLAN\.md|ref\/.*)$|(^|\/)preview\.html$/
const posix = (path) => path.split(sep).join('/')
const git = (...args) => spawnSync('git', args, { encoding: 'utf8' })

function fail(message) {
  console.error(message)
  process.exit(1)
}

process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim())
const draft = posix(relative('.', resolve(process.argv[2] ?? '.')))
const area = dirname(draft)
const name = basename(draft)
if (!(area in AREAS) || name === 'approved') fail(`"${draft}" không phải thư mục nháp trực tiếp trong Artifacts/, artifact_FE/ hoặc artifact_BE/.`)

const review = join(draft, 'REVIEW.md')
const notes = existsSync(review) ? readFileSync(review, 'utf8').normalize('NFC') : ''
if (!/^Trạng thái:\s*ĐÃ DUYỆT/m.test(notes)) {
  fail(`${posix(review)} chưa ghi "Trạng thái: ĐÃ DUYỆT …"; chỉ chép bản nháp chủ dự án đã duyệt trong chat.`)
}
const approved = join(area, 'approved', name)
if (existsSync(approved)) fail(`${posix(approved)} đã tồn tại.`)

const files = readdirSync(draft, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => posix(relative(draft, join(entry.parentPath, entry.name))))
  .filter((path) => !SKIP.test(path))
  .sort()
if (!files.length) fail('Bản nháp không có file nào để chép.')

// A main file the draft replaces must be unchanged since the commit the draft was made from ("Gốc:" in REVIEW.md),
// so applying never silently drops what another draft or a teammate changed in the meantime.
const replaced = files.map((path) => posix(join(AREAS[area], path))).filter((target) => existsSync(target))
if (replaced.length) {
  const base = notes.match(/^Gốc:\s*([0-9a-f]{7,40})\b/m)?.[1]
  if (!base) fail(`${posix(review)} chưa ghi "Gốc: <commit>" (commit lúc tạo bản nháp), mà bản nháp sửa file đang có:\n  ${replaced.join('\n  ')}`)
  if (git('cat-file', '-e', `${base}^{commit}`).status !== 0) fail(`Repo này không có commit Gốc ${base}; kéo nhánh chứa nó về trước.`)
  const changed = replaced.filter((target) =>
    git('rev-parse', '-q', '--verify', `${base}:${target}`).stdout.trim() !== git('hash-object', target).stdout.trim())
  if (changed.length) {
    fail(`File chính đã đổi kể từ commit Gốc ${base}; chép bây giờ sẽ xóa mất thay đổi đó. Không chép file nào.\n` +
      changed.map((target) => `  ${target}   (xem: git diff ${base} -- ${target})`).join('\n') +
      '\nGộp thay đổi đó vào bản nháp, commit file chính, rồi ghi lại "Gốc:" bằng commit mới.')
  }
}

for (const path of files) {
  const target = join(AREAS[area], path)
  const verb = existsSync(target) ? 'Sửa ' : 'Thêm'
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(join(draft, path), target)
  console.log(`${verb}  ${posix(target)}`)
}

mkdirSync(dirname(approved), { recursive: true })
renameSync(draft, approved)
const today = new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())
appendFileSync(join(approved, 'REVIEW.md'), `\nĐã chép vào file chính ${today} bằng apply-draft.mjs: ${files.length} file.\n`)
console.log(`Đã chép ${files.length} file, chuyển bản nháp vào ${posix(approved)}. Chạy lại kiểm tra của app.`)
