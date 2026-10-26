// Copies an approved draft to the main files in one step and moves it into approved/ (root CLAUDE.md, step 3).
// Usage: node .claude/scripts/apply-draft.mjs <draft folder>   e.g. Source/backend/artifact_BE/2026-10-27-BE-LOGIN-01
// staging-guard.mjs asks the owner once before this runs; the script refuses drafts not marked ĐÃ DUYỆT.
// shortcut: files marked "Xóa" in REVIEW.md are not deleted here; delete them by hand with the owner.
import { execFileSync } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

// Staging area → the folder its draft paths mirror.
const AREAS = { 'Artifacts': '', 'Source/frontend/artifact_FE': 'Source/frontend', 'Source/backend/artifact_BE': 'Source/backend' }
// Draft-only files: review notes, plan, reference images, preview shims.
const SKIP = /^(REVIEW\.md|PLAN\.md|ref\/.*)$|(^|\/)preview\.html$/
const posix = (path) => path.split(sep).join('/')

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
if (!existsSync(review) || !/^Trạng thái:\s*ĐÃ DUYỆT/m.test(readFileSync(review, 'utf8').normalize('NFC'))) {
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
