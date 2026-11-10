import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// tests/p2 -> root: the draft folder before apply, Source/frontend after apply.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const page = readFileSync(join(root, 'src/pages/public/ChangePasswordPage.tsx'), 'utf8')
const form = readFileSync(join(root, 'src/features/auth/ChangePasswordForm.tsx'), 'utf8')
const css = readFileSync(join(root, 'src/features/auth/change-password.css'), 'utf8')

test('UI-32 · AUTH-05: page uses the auth frame, title and the forced / not forced sentence', () => {
  for (const needle of [
    'className="auth-recovery-page"',
    'className="auth-login-visual"',
    '<IllustrationLabel',
    'aria-labelledby="change-password-title"',
    '<h1 id="change-password-title">Đổi mật khẩu</h1>',
    "user?.mustChangePassword === true",
    'Bạn cần đổi mật khẩu trước khi tiếp tục.',
    'Tạo mật khẩu mới cho tài khoản của bạn.',
    "import '../../features/auth/forgot-password.css'",
    "import '../../features/auth/change-password.css'",
  ]) assert.ok(page.includes(needle), `page is missing ${needle}`)
})

test('UI-32 · AUTH-05/Q7-A: page keeps go-home after success and the outline "Đăng xuất" type=button', () => {
  assert.ok(page.includes('<ChangePasswordForm afterSuccess="go-home" layout="page" />'))
  const signOut = page.split('\n').find(line => line.includes('>Đăng xuất</RoomsButton>')) ?? ''
  for (const needle of ['variant="outline"', 'type="button"', 'disabled={signingOut}', 'onClick={() => void signOut()}'])
    assert.ok(signOut.includes(needle), `"Đăng xuất" button is missing ${needle}`)
})

test('UI-32 · AUTH-03/UI-09: page layout adds placeholders, the 8-character hint and keeps the button contracts', () => {
  for (const needle of [
    "layout = 'plain'",
    "'Nhập mật khẩu hiện tại'",
    "'Nhập mật khẩu mới'",
    "'Nhập lại mật khẩu mới'",
    'aria-describedby={page ? hintId : undefined}',
    '>Tối thiểu 8 ký tự</p>',
    'Đổi mật khẩu{isSubmitting ? <Spinner label="Đang lưu" />',
    'className="auth-recovery-form-message" aria-live="polite"',
    "applyApiError(error, setError, ['currentPassword', 'newPassword'])",
    'const me = await refreshMe()',
  ]) assert.ok(form.includes(needle), `form is missing ${needle}`)
})

test('UI-32/UI-33: account pages use the same password layout but stay on the page after success', () => {
  for (const file of ['src/pages/tenant/TenantAccountPage.tsx', 'src/pages/staff/StaffAccountPage.tsx']) {
    const source = readFileSync(join(root, file), 'utf8')
    assert.ok(source.includes('<ChangePasswordForm afterSuccess="stay" layout="page" />'), `${file} must keep afterSuccess="stay"`)
  }
})

test('UI-32 · KIT-01: page CSS uses no raw colors and adds no horizontal scroll', () => {
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), 'no hex colors')
  assert.ok(!css.includes('overflow-x'))
})
