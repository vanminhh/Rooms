import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const draftRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const page = readFileSync(join(draftRoot, 'src/pages/public/ForgotPasswordPage.tsx'), 'utf8')
const css = readFileSync(join(draftRoot, 'src/features/auth/forgot-password.css'), 'utf8')

test('UI-31 · AUTH-07: request form keeps the phone schema, shared response and contact', () => {
  for (const needle of [
    'forgotSchema',
    'label="Số điện thoại"',
    "await forgotPassword(values)",
    'Nếu số điện thoại có email, chúng tôi đã gửi link đặt lại mật khẩu. Nếu không, hãy liên hệ quản lý.',
    'descriptionRole="status"',
    '<ContactInfo',
    'Quay lại đăng nhập',
  ]) assert.ok(page.includes(needle), `missing ${needle}`)
})

test('UI-31 · AUTH-07/UI-05: reset form handles success, field errors and invalid/expired/used links', () => {
  for (const needle of [
    'resetPasswordSchema',
    'label="Mật khẩu mới"',
    'label="Nhập lại mật khẩu mới"',
    'error.fields?.token !== undefined',
    "notice: 'password-reset'",
    'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
    'Liên kết có thể đã hết hạn hoặc đã được sử dụng.',
    'Gửi lại liên kết',
  ]) assert.ok(page.includes(needle), `missing ${needle}`)
  assert.ok(page.includes("if (!token) return <RecoveryFrame><ForgotForm /></RecoveryFrame>"), 'an empty token must keep the existing phone-form behaviour')
})

test('UI-31 · AUTH-07/UI-09: existing button and spinner contracts remain exact', () => {
  for (const needle of [
    "isSubmitting ? 'Đang gửi' : 'Gửi'",
    '<Spinner label="Đang gửi" />',
    "isSubmitting ? 'Đang đặt lại mật khẩu' : 'Đặt lại mật khẩu'",
    '<Spinner label="Đang lưu" />',
  ]) assert.ok(page.includes(needle), `missing ${needle}`)
})

test('UI-31 · UI-08/KIT-05: semantic headings, labels, 360px layout and reduced motion are present', () => {
  assert.ok(page.includes('aria-labelledby="forgot-title"'))
  assert.ok(page.includes('aria-labelledby="reset-title"'))
  assert.ok(page.includes('<IllustrationLabel'))
  assert.match(css, /@media \(max-width: 480px\)/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/)
  assert.ok(!css.includes('overflow-x: auto'))
})

test('UI-31 · UI-05: form reserves stable validation and API-message space', () => {
  assert.match(css, /\.auth-recovery-form \.rooms-field\s*\{[\s\S]*?min-height:\s*112px;/)
  assert.match(css, /\.auth-recovery-form-message\s*\{[\s\S]*?min-height:\s*48px;/)
})

