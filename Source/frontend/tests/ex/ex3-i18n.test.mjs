import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test, { after } from 'node:test'
import { draftFirst, loadModule } from '../draft-root.mjs'
import { dispatch, find, mount, until, fakeDocument } from '../p2/public-dom.mjs'

after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 200).unref() })

const React = createRequire(import.meta.url)('react')
const core = () => loadModule(draftFirst('src/shared/i18n/index.ts'))
const storage = (initial = {}) => {
  const entries = new Map(Object.entries(initial))
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, String(value)) },
    removeItem: key => { entries.delete(key) },
  }
}

test('LOC-01, FE-EX-08: dictionary resolves Vietnamese and English without a provider', () => {
  const { t } = core()
  assert.equal(t('common.retry', undefined, 'vi'), 'Thử lại')
  assert.equal(t('common.retry', undefined, 'en'), 'Try again')
})

test('LOC-04, FE-EX-08: an empty English translation falls back to Vietnamese', () => {
  const { t } = core()
  const { en } = loadModule(draftFirst('src/shared/i18n/en.ts'))
  const old = en['common.retry']
  try {
    en['common.retry'] = ''
    assert.equal(t('common.retry', undefined, 'en'), 'Thử lại')
  } finally {
    en['common.retry'] = old
  }
})

test('LOC-04, FE-EX-08: an unknown key never appears as raw UI text', () => {
  const { t } = core()
  const old = console.error
  const errors = []
  try {
    console.error = (...args) => errors.push(args)
    assert.equal(t('missing.key', undefined, 'en'), '')
  } finally {
    console.error = old
  }
  assert.equal(errors.length, 1)
})

test('UI-12, FE-EX-08: named parameters interpolate without formatting or HTML evaluation', () => {
  const { t } = core()
  assert.equal(t('rooms.list.count', { count: 2 }, 'vi'), '2 phòng phù hợp')
  assert.equal(t('rooms.list.count', { count: '<2>' }, 'en'), '<2> matching rooms')
})

test('UI-12, FE-EX-08: a missing parameter stays visible as a placeholder and is logged', () => {
  const { t } = core()
  const old = console.error
  const errors = []
  try {
    console.error = (...args) => errors.push(args)
    assert.equal(t('rooms.list.count', {}, 'en'), '{count} matching rooms')
  } finally {
    console.error = old
  }
  assert.equal(errors.length, 1)
})

test('LOC-04, FE-EX-08: room count chooses English singular and plural, and Vietnamese stays constant', () => {
  const { t } = core()
  for (const [count, english] of [[0, '0 matching rooms'], [1, '1 matching room'], [2, '2 matching rooms']]) {
    assert.equal(t('rooms.list.count', { count }, 'en'), english)
    assert.equal(t('rooms.list.count', { count }, 'vi'), `${count} phòng phù hợp`)
  }
  assert.equal(t('rooms.list.count', { count: 1234 }, 'en'), '1234 matching rooms')
})

test('LOC-04, FE-EX-08: English dictionary has every Vietnamese key and no empty translation', () => {
  const { vi } = loadModule(draftFirst('src/shared/i18n/vi.ts'))
  const { en } = loadModule(draftFirst('src/shared/i18n/en.ts'))
  const missing = Object.keys(vi).filter(key => !(key in en) || en[key] === '')
  const extra = Object.keys(en).filter(key => !(key in vi))
  const ALLOWED_MISSING_EN = []
  assert.deepEqual(missing, ALLOWED_MISSING_EN, `Missing English keys: ${missing.join(', ')}`)
  assert.deepEqual(extra, [], `Extra English keys: ${extra.join(', ')}`)
})

test('LOC-03, FE-EX-08: storage absence, invalid values and storage errors fall back safely', () => {
  const { currentLang, setStoredLang } = core()
  const previous = globalThis.localStorage
  try {
    delete globalThis.localStorage
    setStoredLang('vi')
    assert.equal(currentLang(), 'vi')
    for (const bad of ['fr', '', '{"a":1}']) {
      globalThis.localStorage = storage({ 'rooms.lang': bad })
      assert.equal(currentLang(), 'vi')
    }
    globalThis.localStorage = { getItem() { throw Error('private mode') }, setItem() { throw Error('private mode') } }
    assert.doesNotThrow(() => setStoredLang('en'))
    assert.equal(currentLang(), 'en')
  } finally {
    setStoredLang('vi')
    if (previous === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previous
  }
})

test('LOC-03, FE-EX-08: provider switches text and html language without remounting', async () => {
  const { I18nProvider, useI18n, setStoredLang } = core()
  const previous = globalThis.localStorage
  globalThis.localStorage = storage()
  setStoredLang('vi')
  let mounts = 0
  function Child() {
    const { lang, t, setLang } = useI18n()
    React.useEffect(() => { mounts += 1 }, [])
    return React.createElement('button', { type: 'button', onClick: () => setLang('en') }, `${lang}: ${t('common.retry')}`)
  }
  const app = await mount(React.createElement(I18nProvider, null, React.createElement(Child)))
  try {
    assert.equal(find(app.container, n => n.tagName === 'BUTTON')[0].textContent, 'vi: Thử lại')
    const button = find(app.container, n => n.tagName === 'BUTTON')[0]
    dispatch(app.container, button, 'click')
    await until(() => button.textContent === 'en: Try again', 'English text')
    assert.equal(globalThis.localStorage.getItem('rooms.lang'), 'en')
    assert.equal(fakeDocument.documentElement.lang, 'en')
    assert.equal(mounts, 1)
  } finally {
    await app.stop()
    setStoredLang('vi')
    if (previous === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previous
  }
})

test('LOC-01, FE-EX-08: a fixed Vietnamese provider ignores an English browser choice', async () => {
  const { I18nProvider, useI18n, setStoredLang } = core()
  const previous = globalThis.localStorage
  globalThis.localStorage = storage()
  setStoredLang('en')
  function Child() {
    const { lang, t, setLang } = useI18n()
    return React.createElement('button', { type: 'button', onClick: () => setLang('en') }, `${lang}: ${t('common.retry')}`)
  }
  const app = await mount(React.createElement(I18nProvider, { locale: 'vi' }, React.createElement(Child)))
  try {
    const button = find(app.container, n => n.tagName === 'BUTTON')[0]
    assert.equal(button.textContent, 'vi: Thử lại')
    dispatch(app.container, button, 'click')
    assert.equal(button.textContent, 'vi: Thử lại')
    assert.equal(globalThis.localStorage.getItem('rooms.lang'), 'en')
  } finally {
    await app.stop()
    setStoredLang('vi')
    if (previous === undefined) delete globalThis.localStorage
    else globalThis.localStorage = previous
  }
})

test('LOC-05, FE-EX-08: money and dates keep Vietnamese formats in either language', () => {
  const { t } = core()
  const { formatMoney, formatDate } = loadModule(draftFirst('src/shared/formatters.ts'))
  for (const lang of ['vi', 'en']) {
    assert.equal(t('common.retry', undefined, lang).length > 0, true)
    assert.equal(formatMoney(2984000), '2.984.000 đ')
    assert.equal(formatDate('2026-02-28'), '28/02/2026')
  }
})

test('UI-12, FE-EX-10, FE-EX-11: public and auth pages and features keep display copy in the dictionaries', () => {
  const files = [
    'pages/public/PublicHomePage.tsx', 'pages/public/PublicRoomsPage.tsx',
    'pages/public/PublicRoomPage.tsx', 'pages/public/RoomDetailView.tsx',
    'pages/public/PublicBuildingPage.tsx', 'pages/public/NotFoundPage.tsx',
    'features/public/attributes.ts', 'features/public/BookingJumpBar.tsx',
    'features/public/ContactCard.tsx', 'features/public/EstimatePanel.tsx',
    'features/public/ListState.tsx', 'features/public/RateTable.tsx',
    'features/public/room-filters.ts', 'features/public/RoomCard.tsx',
    'features/public/RoomFilters.tsx', 'layouts/PublicLayout.tsx',
    'components/Navigation.tsx', 'components/RoomSearch.tsx', 'components/CostBreakdown.tsx',
    'features/auth/ContactInfo.tsx',
    'pages/public/LoginPage.tsx', 'pages/public/RegisterPage.tsx',
    'pages/public/VerifyEmailPage.tsx', 'pages/public/ForgotPasswordPage.tsx',
    'pages/public/ChangePasswordPage.tsx', 'pages/guest/GuestHomePage.tsx',
    'pages/guest/GuestAccountPage.tsx', 'pages/tenant/TenantHomePage.tsx',
    'pages/tenant/TenantAccountPage.tsx', 'features/auth/AuthFrame.tsx',
    'features/auth/ChangePasswordForm.tsx', 'features/auth/ProfileForm.tsx',
    'features/auth/schemas.ts', 'features/auth/pendingVerification.ts',
    'components/FormFields.tsx', 'app/RequireAuth.tsx',
    'shared/api.ts', 'shared/form-errors.ts',
    'pages/tenant/TenantContractsPage.tsx', 'pages/tenant/TenantContractDetailPage.tsx', 'pages/tenant/TenantContractPrintPage.tsx',
    'features/contracts/TenantContractView.tsx', 'features/contracts/ContractInformation.tsx', 'features/contracts/ContractSummaryCard.tsx',
    'features/contracts/DepositCard.tsx', 'features/contracts/ContractDocuments.tsx', 'features/contracts/ContractPrintView.tsx', 'features/contracts/OccupantForm.tsx',
    // EX-7 removes the old booking form exception; all public/guest viewing text is translated.
    'features/public/ViewingForm.tsx', 'features/public/viewing-schema.ts', 'features/public/ViewingCalendar.tsx', 'features/viewings/ViewingContacts.tsx', 'pages/guest/GuestViewingPage.tsx',
  ]
  const exceptions = new Set()
  const violations = []
  for (const file of files) {
    if (exceptions.has(file)) continue
    const source = readFileSync(resolve('src', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\r\n]/g, ''))
    source.split(/\r?\n/).forEach((line, index) => {
      if (/^\s*\/\//.test(line) || /\/\/ i18n-allow:/.test(line)) return
      if (file === 'pages/public/PublicHomePage.tsx' && /^\s*'(Đống Đa|Ba Đình|Cầu Giấy)': '\/images\//.test(line)) return // API district keys for image lookup, A-12.
      if (/(?=[À-ỹĐđ])\p{L}/u.test(line)) violations.push(`${file}:${index + 1}: ${line.trim()}`)
    })
  }
  assert.deepEqual(violations, [], `Display text outside dictionaries:\n${violations.join('\n')}`)
})

test('KIT-04, LOC-01, FE-EX-10: translated layouts supply every header label and staff stays Vietnamese', () => {
  const source = file => readFileSync(resolve('src', file), 'utf8')
  for (const layout of ['PublicLayout', 'GuestLayout', 'TenantLayout']) {
    const text = source(`layouts/${layout}.tsx`)
    for (const label of ['homeLabel', 'closeLabel', 'menuLabel', 'mainNavLabel', 'exploreLabel']) {
      assert.match(text, new RegExp(`${label}=\\{t\\('nav\\.`), `${layout} needs ${label}`)
    }
  }
  const footer = source('layouts/PublicLayout.tsx')
  for (const label of ['findTitle', 'findDescription', 'areaTitle', 'areaDescription', 'contactTitle', 'contactEmpty', 'bottomLocation']) {
    assert.match(footer, new RegExp(`${label}=\\{t\\('footer\\.`), `PublicLayout needs ${label}`)
  }
  const staff = source('layouts/StaffLayout.tsx')
  assert.doesNotMatch(staff, /LanguageSwitch|useI18n/)
  assert.match(staff, /I18nProvider locale="vi"/)
})
