import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// Static checks of the UI-33 layout; the behaviour (PATCH bodies, notices, errors) is covered by the CP-6 flow tests
// in tests/auth-login-flow.test.mjs. tests/p2 -> root: the draft folder before apply, Source/frontend after apply.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = path => readFileSync(join(root, path), 'utf8')
const tenant = read('src/pages/tenant/TenantAccountPage.tsx')
const staff = read('src/pages/staff/StaffAccountPage.tsx')
const forms = read('src/features/auth/ProfileForm.tsx')
const css = read('src/features/auth/account.css')

test('UI-33 · AUTH-09: tenant page = email card then password card, no public contact', () => {
  for (const needle of ['<SectionHeading>Tài khoản</SectionHeading>', 'Thông tin tài khoản', 'Cập nhật địa chỉ email để nhận thông báo từ ROOMS.', '<EmailForm />', 'Đổi mật khẩu', 'Cập nhật mật khẩu để bảo vệ tài khoản của bạn.'])
    assert.ok(tenant.includes(needle), `tenant page is missing ${needle}`)
  assert.ok(tenant.indexOf('<EmailForm />') < tenant.indexOf('<ChangePasswordForm'), 'email card first (mockup 06)')
  assert.ok(!tenant.includes('PublicContactForm'))
})

test('UI-33 · AUTH-09: staff page = two columns, email and password left, public contact right', () => {
  for (const needle of ['Quản lý thông tin tài khoản và thông tin liên hệ hiển thị cho khách.', 'className="auth-account-grid"', 'Email dùng để nhận thông báo và khôi phục mật khẩu.', 'Cập nhật mật khẩu đăng nhập để bảo mật tài khoản.', 'Thông tin liên hệ công khai', 'Thông tin này sẽ hiển thị cho khách khi xem phòng.', '<PublicContactForm />'])
    assert.ok(staff.includes(needle), `staff page is missing ${needle}`)
})

test('UI-33 · AUTH-09: the two profile forms send disjoint keys and have their own buttons', () => {
  assert.ok(forms.includes('await updateMe({ email: values.email || null })'))
  assert.ok(forms.includes('await updateMe({ contactPhone: values.contactPhone || null, zaloUrl: values.zaloUrl || null, facebookUrl: values.facebookUrl || null })'))
  for (const needle of ['label="Lưu email"', 'label="Lưu liên hệ"', '<Spinner label="Đang lưu" />', 'Khách sẽ thấy:', 'Chưa có thông tin liên hệ'])
    assert.ok(forms.includes(needle), `forms are missing ${needle}`)
})

test('UI-33 · UI-07/KIT-01: one column under 960 px, tighter cards at 480 px, no raw colors, long links wrap', () => {
  assert.match(css, /@media \(max-width: 960px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/)
  assert.match(css, /@media \(max-width: 480px\)/)
  assert.match(css, /overflow-wrap:\s*anywhere/)
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(css), 'no hex colors')
  assert.ok(!css.includes('overflow-x'))
})
