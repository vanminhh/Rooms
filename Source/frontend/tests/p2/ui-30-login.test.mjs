import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const draftRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const page = readFileSync(join(draftRoot, 'src/pages/public/LoginPage.tsx'), 'utf8')
const css = readFileSync(join(draftRoot, 'src/features/auth/auth.css'), 'utf8')

test('UI-30 · AUTH-01..04: form keeps all required login and error/loading hooks', () => {
  for (const needle of [
    'label="Số điện thoại"',
    'label="Mật khẩu"',
    'label="Ghi nhớ đăng nhập"',
    'Quên mật khẩu?',
    'className="auth-login-form-message"',
    '<FormError>{formError}</FormError>',
    "isSubmitting ? 'Đang đăng nhập' : 'Đăng nhập'",
  ]) assert.ok(page.includes(needle), `missing ${needle}`)
})

test('UI-30 · AUTH-10/UI-02: approved image copy and account actions are present', () => {
  for (const needle of [
    '/images/auth-room.webp',
    '<IllustrationLabel',
    'Phòng thuê tại Hà Nội',
    'Một nơi ở <em>vừa vặn</em> giữa phố.',
    'Chào mừng bạn trở lại ROOMS.',
    'Chưa có tài khoản? Tài khoản được cấp khi ký hợp đồng',
    'Liên hệ quản lý',
    'Xem phòng trống',
  ]) assert.ok(page.includes(needle), `missing ${needle}`)
  assert.ok(!page.includes('Liên hệ quản lý <span'), 'management link must not contain a decorative arrow')
  assert.ok(!page.includes('Xem phòng trống <span'), 'rooms link must not contain a decorative arrow')
})

test('UI-30 · UI-08/KIT-05: layout has labels, focusable actions, 360px image removal and reduced motion', () => {
  assert.ok(page.includes('aria-labelledby="login-title"'))
  assert.ok(page.includes('<h1 id="login-title">Đăng nhập</h1>'))
  assert.match(css, /@media \(max-width: 480px\)[\s\S]*\.auth-login-visual\s*\{\s*display: none;/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.ok(!css.includes('overflow-x: auto'))
})

test('UI-30 · UI-05: validation and API-error slots reserve height to prevent layout jumping', () => {
  assert.match(css, /\.auth-login-panel \.rooms-field\s*\{[\s\S]*?min-height:\s*112px;/)
  assert.match(css, /\.auth-login-form-message\s*\{[\s\S]*?min-height:\s*48px;/)
})
