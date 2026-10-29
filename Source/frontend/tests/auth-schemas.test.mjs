import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

function compile(path, modules) {
  const code = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  Function('require', 'exports', code)(id => { if (id in modules) return modules[id]; throw new Error(`unexpected import ${id}`) }, exports)
  return exports
}

const jsx = (type, props) => ({ type, props })
const jsxRuntime = { jsx, jsxs: jsx, Fragment: 'fragment' }
const flatten = node => Array.isArray(node) ? node.flatMap(flatten) : !node || typeof node !== 'object' ? [node] : [node, ...(node.props?.children === undefined ? [] : flatten(node.props.children))]
const elements = root => flatten(root).filter(n => n && typeof n === 'object')
const textOf = node => Array.isArray(node) ? node.map(textOf).join('') : node && typeof node === 'object' ? textOf(node.props?.children) : node == null || node === false ? '' : String(node)

// ContactInfo.tsx runs unmodified; only the stylesheet import and the JSX runtime are faked.
const { ContactInfo } = compile('../src/features/auth/ContactInfo.tsx', { 'react/jsx-runtime': jsxRuntime, './auth.css': {} })
const links = root => elements(root).filter(n => n.type === 'a')

test('AUTH-10: ContactInfo shows phone as plain text and Zalo / Facebook as links that open a new tab safely', () => {
  const root = ContactInfo({ contact: { phone: '0900000001', zaloUrl: 'https://zalo.me/0900000001', facebookUrl: 'https://facebook.com/boss' } })
  const [phone] = elements(root).filter(n => n.type === 'p')
  assert.equal(textOf(phone), 'Điện thoại: 0900000001')
  const [zalo, facebook] = links(root)
  assert.equal(textOf(zalo), 'Zalo')
  assert.equal(zalo.props.href, 'https://zalo.me/0900000001')
  assert.equal(textOf(facebook), 'Facebook')
  assert.equal(facebook.props.href, 'https://facebook.com/boss')
  for (const a of [zalo, facebook]) {
    assert.equal(a.props.target, '_blank')
    assert.equal(a.props.rel, 'noopener noreferrer')
  }
})

test('AUTH-10: ContactInfo hides fields that are null and renders nothing when all are null or contact is null', () => {
  const onlyPhone = ContactInfo({ contact: { phone: '0900000001', zaloUrl: null, facebookUrl: null } })
  assert.equal(textOf(onlyPhone), 'Điện thoại: 0900000001')
  assert.deepEqual(links(onlyPhone), [])
  const onlyFacebook = ContactInfo({ contact: { phone: null, zaloUrl: null, facebookUrl: 'https://facebook.com/boss' } })
  assert.equal(elements(onlyFacebook).some(n => n.type === 'p'), false)
  assert.deepEqual(links(onlyFacebook).map(textOf), ['Facebook'])
  assert.equal(ContactInfo({ contact: { phone: null, zaloUrl: null, facebookUrl: null } }), null)
  assert.equal(ContactInfo({ contact: { phone: '', zaloUrl: '', facebookUrl: '' } }), null)
  assert.equal(ContactInfo({ contact: null }), null)
})

test('A11: ContactInfo drops non-https URLs (javascript:, http:, data:, relative) but keeps the phone', () => {
  for (const bad of ['javascript:alert(1)', 'http://zalo.me/1', 'data:text/html,x', '//zalo.me/1', 'zalo.me/1', ' https://zalo.me/1']) {
    const root = ContactInfo({ contact: { phone: '0900000001', zaloUrl: bad, facebookUrl: bad } })
    assert.deepEqual(links(root), [], `link rendered for ${JSON.stringify(bad)}`)
    assert.equal(textOf(root), 'Điện thoại: 0900000001')
  }
  assert.equal(ContactInfo({ contact: { phone: null, zaloUrl: 'javascript:alert(1)', facebookUrl: null } }), null)
})

// usePublicContact.ts runs unmodified; useQuery (the TanStack edge) is faked to capture its options.
test('AUTH-10: usePublicContact shares one query key, caches 5 minutes and calls GET /public/contact', () => {
  let options
  const getPublicContact = () => 'request'
  const { usePublicContact } = compile('../src/features/auth/usePublicContact.ts', {
    '@tanstack/react-query': { useQuery: o => { options = o; return { data: 'result' } } },
    './api': { getPublicContact },
  })
  assert.deepEqual(usePublicContact(), { data: 'result' })
  assert.deepEqual(options.queryKey, ['public', 'contact'])
  assert.equal(options.staleTime, 5 * 60 * 1000)
  assert.equal(options.queryFn, getPublicContact)
})

test('KIT-02: index.html loads Taviraj and Manrope with the same three font lines as components.html', () => {
  const html = read('../index.html')
  assert.ok(html.includes('<link rel="preconnect" href="https://fonts.googleapis.com" />'))
  assert.ok(html.includes('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />'))
  assert.ok(html.includes('<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@300;400;500;600&family=Taviraj:ital,wght@0,200;0,300;0,400;1,200;1,300&display=swap" rel="stylesheet" />'))
})

test('KIT-01/KIT-07: layouts.css and auth.css add no hex colours, no new fonts, no rgb()', () => {
  for (const file of ['../src/layouts/layouts.css', '../src/features/auth/auth.css']) {
    const css = read(file)
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, `${file}: hex colour`)
    assert.doesNotMatch(css, /font-family|rgba?\(|hsla?\(/, `${file}: font or colour function`)
  }
})

// schemas.ts runs unmodified on the real zod.
const { loginSchema } = compile('../src/features/auth/schemas.ts', { zod: createRequire(import.meta.url)('zod') })
const loginIssues = input => { const r = loginSchema.safeParse(input); return r.success ? [] : r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }
const okLogin = { phone: '0900000004', password: 'a', remember: false }

test('G-04: loginSchema accepts 10 digits starting with 0 and rejects other phone shapes with "Số điện thoại không hợp lệ"', () => {
  assert.deepEqual(loginIssues(okLogin), [])
  for (const bad of ['090000000', '09000000044', '1900000004', '09000a0004', ' 0900000004', '0900000004 ', '']) {
    assert.deepEqual(loginIssues({ ...okLogin, phone: bad }), ['phone: Số điện thoại không hợp lệ'], JSON.stringify(bad))
  }
})

test('AUTH-01: loginSchema requires a password but checks no length', () => {
  assert.deepEqual(loginIssues({ ...okLogin, password: '' }), ['password: Vui lòng nhập mật khẩu'])
  assert.deepEqual(loginIssues({ ...okLogin, password: 'a' }), [])
  assert.deepEqual(loginIssues({ ...okLogin, password: 'x'.repeat(500) }), [])
})

test('AUTH-01: loginSchema keeps remember as a boolean', () => {
  assert.deepEqual(loginIssues({ ...okLogin, remember: true }), [])
  assert.notDeepEqual(loginIssues({ ...okLogin, remember: 'yes' }), [])
})

// ---------- CP-5: forgot / change / reset schemas (real schemas.ts on the real zod) ----------
const { forgotSchema, changePasswordSchema, resetPasswordSchema } = compile('../src/features/auth/schemas.ts', { zod: createRequire(import.meta.url)('zod') })
const issuesOf = (schema, input) => { const r = schema.safeParse(input); return r.success ? [] : r.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }
const okChange = { currentPassword: 'matkhau123', newPassword: '12345678', confirmPassword: '12345678' }

test('AUTH-03: changePasswordSchema newPassword boundary: 7 characters -> "Mật khẩu tối thiểu 8 ký tự", 8 characters valid, long valid (no maximum)', () => {
  assert.deepEqual(issuesOf(changePasswordSchema, { ...okChange, newPassword: '1234567', confirmPassword: '1234567' }), ['newPassword: Mật khẩu tối thiểu 8 ký tự'])
  assert.deepEqual(issuesOf(changePasswordSchema, okChange), [])
  assert.deepEqual(issuesOf(changePasswordSchema, { ...okChange, newPassword: 'x'.repeat(300), confirmPassword: 'x'.repeat(300) }), [])
  assert.deepEqual(issuesOf(changePasswordSchema, { ...okChange, newPassword: '', confirmPassword: '' }), ['newPassword: Mật khẩu tối thiểu 8 ký tự'])
})

test('AUTH-03/A16: changePasswordSchema confirmation that differs puts "Mật khẩu nhập lại không khớp" on confirmPassword (also when it is empty)', () => {
  assert.deepEqual(issuesOf(changePasswordSchema, { ...okChange, confirmPassword: '12345679' }), ['confirmPassword: Mật khẩu nhập lại không khớp'])
  assert.deepEqual(issuesOf(changePasswordSchema, { ...okChange, confirmPassword: '' }), ['confirmPassword: Mật khẩu nhập lại không khớp'])
  assert.deepEqual(issuesOf(changePasswordSchema, { ...okChange, confirmPassword: '12345678 ' }), ['confirmPassword: Mật khẩu nhập lại không khớp'], 'a trailing space is a difference')
})

test('AUTH-03: changePasswordSchema empty currentPassword -> "Vui lòng nhập mật khẩu hiện tại"; any non-empty current is accepted (no length rule)', () => {
  assert.deepEqual(issuesOf(changePasswordSchema, { ...okChange, currentPassword: '' }), ['currentPassword: Vui lòng nhập mật khẩu hiện tại'])
  assert.deepEqual(issuesOf(changePasswordSchema, { ...okChange, currentPassword: 'a' }), [])
})

test('AUTH-03/AUTH-07: resetPasswordSchema has the same 7/8 boundary and the same confirmation rule; it does not ask for a current password', () => {
  const ok = { newPassword: '12345678', confirmPassword: '12345678' }
  assert.deepEqual(issuesOf(resetPasswordSchema, ok), [])
  assert.deepEqual(issuesOf(resetPasswordSchema, { newPassword: '1234567', confirmPassword: '1234567' }), ['newPassword: Mật khẩu tối thiểu 8 ký tự'])
  assert.deepEqual(issuesOf(resetPasswordSchema, { ...ok, confirmPassword: 'khac' }), ['confirmPassword: Mật khẩu nhập lại không khớp'])
})

test('AUTH-07/G-04: forgotSchema uses the same phone boundary as login (10 digits starting with 0)', () => {
  assert.deepEqual(issuesOf(forgotSchema, { phone: '0900000004' }), [])
  for (const bad of ['090000000', '09000000044', '1900000004', '09000a0004', ' 0900000004', '']) {
    assert.deepEqual(issuesOf(forgotSchema, { phone: bad }), ['phone: Số điện thoại không hợp lệ'], JSON.stringify(bad))
  }
})

// ---------- CP-6: profile schemas (real schemas.ts on the real zod) ----------
const { tenantProfileSchema, staffProfileSchema } = compile('../src/features/auth/schemas.ts', { zod: createRequire(import.meta.url)('zod') })
const okStaff = { email: '', contactPhone: '', zaloUrl: '', facebookUrl: '' }

test('AUTH-09: tenantProfileSchema email: empty is valid (sent as null), a@b.vn valid, "abc" -> "Email không hợp lệ", 255 characters valid, 256 refused', () => {
  assert.deepEqual(issuesOf(tenantProfileSchema, { email: '' }), [])
  assert.deepEqual(issuesOf(tenantProfileSchema, { email: 'a@b.vn' }), [])
  for (const bad of ['abc', 'a@', '@b.vn', 'a b@c.vn', 'a@b']) assert.deepEqual(issuesOf(tenantProfileSchema, { email: bad }), ['email: Email không hợp lệ'], JSON.stringify(bad))
  const e255 = `${'a'.repeat(243)}@example.com`
  const e256 = `${'a'.repeat(244)}@example.com`
  assert.equal(e255.length, 255)
  assert.equal(e256.length, 256)
  assert.deepEqual(issuesOf(tenantProfileSchema, { email: e255 }), [])
  assert.deepEqual(issuesOf(tenantProfileSchema, { email: e256 }), ['email: Email không hợp lệ'])
})

test('AUTH-09/trim: the email is trimmed by the schema (spaces around a valid email are fine, spaces only equal empty)', () => {
  assert.equal(tenantProfileSchema.parse({ email: '  a@b.vn  ' }).email, 'a@b.vn')
  assert.equal(tenantProfileSchema.parse({ email: '   ' }).email, '')
})

test('AUTH-09: tenantProfileSchema drops contact keys, so a tenant form can never carry them', () => {
  const parsed = tenantProfileSchema.parse({ email: 'a@b.vn', contactPhone: '0900000002', zaloUrl: 'https://zalo.me/x', facebookUrl: 'x' })
  assert.deepEqual(Object.keys(parsed), ['email'])
})

test('AUTH-09/G-04: staffProfileSchema contactPhone: empty valid, 0900000002 valid, other shapes -> "Số điện thoại không hợp lệ"', () => {
  assert.deepEqual(issuesOf(staffProfileSchema, okStaff), [])
  assert.deepEqual(issuesOf(staffProfileSchema, { ...okStaff, contactPhone: '0900000002' }), [])
  for (const bad of ['090000000', '09000000021', '1900000002', '09000a0002', ' 0900000002', '0900000002 ', '+84900000002']) {
    assert.deepEqual(issuesOf(staffProfileSchema, { ...okStaff, contactPhone: bad }), ['contactPhone: Số điện thoại không hợp lệ'], JSON.stringify(bad))
  }
})

test('AUTH-09: staffProfileSchema zaloUrl / facebookUrl: empty and https:// URLs are valid; http:, no scheme, javascript:, data:, bare "https://" -> "Đường dẫn không hợp lệ"', () => {
  for (const key of ['zaloUrl', 'facebookUrl']) {
    for (const good of ['', 'https://zalo.me/0900000002', 'https://facebook.com/ha.nguyen?ref=a']) assert.deepEqual(issuesOf(staffProfileSchema, { ...okStaff, [key]: good }), [], `${key} ${good}`)
    for (const bad of ['http://zalo.me/x', 'zalo.me/x', 'javascript:alert(1)', 'data:text/html,x', 'ftp://zalo.me/x', '//zalo.me/x', 'https://']) {
      assert.deepEqual(issuesOf(staffProfileSchema, { ...okStaff, [key]: bad }), [`${key}: Đường dẫn không hợp lệ`], `${key} ${bad}`)
    }
  }
})

test('AUTH-09/trim: staffProfileSchema trims URLs; blank-only becomes empty', () => {
  const parsed = staffProfileSchema.parse({ ...okStaff, zaloUrl: '  https://zalo.me/x ', facebookUrl: '   ' })
  assert.equal(parsed.zaloUrl, 'https://zalo.me/x')
  assert.equal(parsed.facebookUrl, '')
})

test('AUTH-09: staffProfileSchema reports every bad field at once, each on its own key', () => {
  assert.deepEqual(
    issuesOf(staffProfileSchema, { email: 'abc', contactPhone: '123', zaloUrl: 'x', facebookUrl: 'http://y' }),
    ['email: Email không hợp lệ', 'contactPhone: Số điện thoại không hợp lệ', 'zaloUrl: Đường dẫn không hợp lệ', 'facebookUrl: Đường dẫn không hợp lệ'],
  )
})

test('AUTH-T1: the draft source never stores the token in localStorage, sessionStorage or document.cookie', () => {
  for (const file of ['../src/shared/api.ts', '../src/app/AuthProvider.tsx', '../src/app/auth-context.ts', '../src/features/auth/api.ts', '../src/features/auth/useSignOut.ts']) {
    assert.doesNotMatch(read(file), /localStorage|sessionStorage|document\.cookie/, file)
  }
})
