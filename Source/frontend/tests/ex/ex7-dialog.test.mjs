import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test, { after } from 'node:test'
import { buttonByText, dispatch, find, loadModule, draftFirst, mount, wait } from '../p2/public-dom.mjs'
const React = createRequire(import.meta.url)('react')
const { ConfirmDialog } = loadModule(draftFirst('src/components/ConfirmDialog.tsx'))
after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 100).unref() })

test('VIEW-14/KIT-05: popup keyboard loop includes contact links as well as actions', async () => {
  const app = await mount(React.createElement(ConfirmDialog, {
    open: true, title: 'Đặt lịch thành công', confirmLabel: 'Xem lịch hẹn', cancelLabel: 'Đóng',
    description: React.createElement('a', { href: 'tel:0911111111' }, 'Quản lý: 0911111111'), onConfirm() {}, onClose() {},
  }))
  try {
    const first = find(app.container, n => n.tagName === 'A')[0]
    const last = find(app.container, n => n.tagName === 'BUTTON').at(-1)
    last.focus(); dispatch(app.container, last, 'keydown', { key: 'Tab' })
    assert.ok(document.activeElement === first, 'Tab from the last action must wrap to the contact link')
    first.focus(); dispatch(app.container, first, 'keydown', { key: 'Tab', shiftKey: true })
    assert.ok(document.activeElement === last, 'Shift+Tab from the contact link must wrap to the last action')
  } finally { await app.stop() }
})

test('VIEW-16a/KIT-05: closing a warning restores its form when the disabled opener has lost focus', async () => {
  function Warning() {
    const returnFocusRef = React.useRef(null)
    const [open, setOpen] = React.useState(true)
    return React.createElement(React.Fragment, null,
      React.createElement('form', { ref: returnFocusRef, tabIndex: -1, inert: open }),
      React.createElement(ConfirmDialog, {
        open, returnFocusRef, title: 'Lưu ý lịch xem cùng giờ', description: 'Cân nhắc thời gian di chuyển.',
        confirmLabel: 'Vẫn đặt', cancelLabel: 'Chọn giờ khác', onConfirm() {}, onClose: () => setOpen(false),
      }))
  }
  document.body.focus()
  const app = await mount(React.createElement(Warning))
  try {
    dispatch(app.container, buttonByText(app.container, 'Chọn giờ khác'), 'click'); await wait(30)
    assert.ok(document.activeElement === find(app.container, n => n.tagName === 'FORM')[0], 'Dismiss must focus the form, not body')
  } finally { await app.stop() }
})
