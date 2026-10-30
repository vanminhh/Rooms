import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

// Only the outside edges are replaced: the React hooks (useState, useId) and the JSX runtime.
// FormFields.tsx itself is transpiled and run unmodified; nested function components are expanded by `render`.
function load() {
  const code = ts.transpileModule(read('../src/components/FormFields.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const slots = []
  let cursor = 0
  let nextId = 0
  const jsx = (type, props) => ({ type, props })
  const modules = {
    react: {
      useState(initial) {
        const index = cursor++
        if (!(index in slots)) slots[index] = initial
        return [slots[index], value => { slots[index] = value }]
      },
      useId() {
        const index = cursor++
        if (!(index in slots)) slots[index] = `r${nextId++}`
        return slots[index]
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
  }
  const exports = {}
  Function('require', 'exports', code)(id => modules[id], exports)

  function expand(node) {
    if (Array.isArray(node)) return node.map(expand)
    if (!node || typeof node !== 'object') return node
    if (typeof node.type === 'function') return expand(node.type(node.props))
    const { children } = node.props
    return { type: node.type, props: children === undefined ? node.props : { ...node.props, children: expand(children) } }
  }
  const render = node => { cursor = 0; return expand(node) }
  return { ...exports, el: jsx, render }
}

function findAll(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => findAll(child, predicate))
  if (!node || typeof node !== 'object') return []
  return [...(predicate(node) ? [node] : []), ...findAll(node.props?.children, predicate)]
}
const find = (node, predicate) => findAll(node, predicate)[0]
const tag = name => node => node.type === name
const cls = name => node => String(node.props?.className ?? '').split(' ').includes(name)
const textOf = node => Array.isArray(node) ? node.map(textOf).join('') : typeof node === 'object' && node ? textOf(node.props?.children) : node == null || node === false ? '' : String(node)

const PHONE_ERROR = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0'

test('UI-08: TextField label points at the input, no error means no aria-invalid, aria-describedby or error text', () => {
  const { TextField, el, render } = load()
  const tree = render(el(TextField, { label: 'Số điện thoại' }))
  const label = find(tree, tag('label'))
  const input = find(tree, tag('input'))
  assert.equal(textOf(label), 'Số điện thoại')
  assert.ok(input.props.id, 'input has a non-empty id')
  assert.equal(label.props.htmlFor, input.props.id)
  assert.equal('aria-invalid' in input.props && input.props['aria-invalid'] !== undefined, false)
  assert.equal(input.props['aria-describedby'], undefined)
  assert.equal(findAll(tree, cls('rooms-field-error')).length, 0)
  assert.ok(cls('rooms-field-input')(input), 'input carries the kit class')
})

test('UI-08: TextField with error sets aria-invalid, links aria-describedby to the error text, no role=alert', () => {
  const { TextField, el, render } = load()
  const tree = render(el(TextField, { label: 'Số điện thoại', error: PHONE_ERROR }))
  const input = find(tree, tag('input'))
  const id = input.props.id
  assert.equal(input.props['aria-invalid'], true)
  assert.ok(input.props['aria-describedby'].split(' ').includes(`${id}-error`))
  const message = find(tree, node => node.props?.id === `${id}-error`)
  assert.equal(textOf(message), PHONE_ERROR)
  assert.ok(cls('rooms-field-error')(message))
  assert.equal(findAll(tree, node => node.props?.role === 'alert').length, 0, 'field errors must not be live-region alerts')
})

test('UI-08: TextField error "" and undefined behave exactly like no error', () => {
  const { TextField, el, render } = load()
  for (const error of ['', undefined]) {
    const tree = render(el(TextField, { label: 'Số điện thoại', error }))
    const input = find(tree, tag('input'))
    assert.equal(input.props['aria-invalid'], undefined, `error=${JSON.stringify(error)}`)
    assert.equal(input.props['aria-describedby'], undefined, `no empty aria-describedby for error=${JSON.stringify(error)}`)
    assert.equal(findAll(tree, cls('rooms-field-error')).length, 0)
  }
})

test('UI-08: caller id and aria-describedby are respected and merged with the error id', () => {
  const { TextField, el, render } = load()
  let tree = render(el(TextField, { label: 'Số điện thoại', id: 'phone', 'aria-describedby': 'phone-note', error: PHONE_ERROR }))
  let input = find(tree, tag('input'))
  assert.equal(find(tree, tag('label')).props.htmlFor, 'phone')
  assert.equal(input.props.id, 'phone')
  assert.equal(input.props['aria-describedby'], 'phone-note phone-error')
  assert.equal(textOf(find(tree, node => node.props?.id === 'phone-error')), PHONE_ERROR)
  tree = render(el(TextField, { label: 'Số điện thoại', id: 'phone', 'aria-describedby': 'phone-note' }))
  input = find(tree, tag('input'))
  assert.equal(input.props['aria-describedby'], 'phone-note')
  assert.equal(input.props['aria-invalid'], undefined)
})

test('UI-08: computed id, aria-invalid and aria-describedby win over the same props passed by the caller', () => {
  const { TextField, el, render } = load()
  const tree = render(el(TextField, { label: 'Số điện thoại', id: 'phone', 'aria-invalid': true, error: undefined }))
  assert.equal(find(tree, tag('input')).props['aria-invalid'], undefined, 'caller cannot force aria-invalid without an error text')
})

test('UI-08: two TextFields without id in one render get different ids and their own labels', () => {
  const { TextField, el, render } = load()
  const tree = render(el('div', { children: [
    el(TextField, { label: 'Một' }),
    el(TextField, { label: 'Hai', error: 'Lỗi' }),
  ] }))
  const [one, two] = findAll(tree, tag('input'))
  const [labelOne, labelTwo] = findAll(tree, tag('label'))
  assert.notEqual(one.props.id, two.props.id)
  assert.equal(labelOne.props.htmlFor, one.props.id)
  assert.equal(labelTwo.props.htmlFor, two.props.id)
  assert.ok(two.props['aria-describedby'].includes(`${two.props.id}-error`))
  assert.equal(one.props['aria-describedby'], undefined)
})

test('UI-08: generated id is stable across re-renders', () => {
  const { TextField, el, render } = load()
  const first = find(render(el(TextField, { label: 'A' })), tag('input')).props.id
  const second = find(render(el(TextField, { label: 'A', error: 'Lỗi' })), tag('input')).props.id
  assert.equal(second, first)
})

test('UI-05: TextField passes react-hook-form props to the input and keeps the kit class', () => {
  const { TextField, el, render } = load()
  const onChange = () => {}, onBlur = () => {}, ref = () => {}
  const input = find(render(el(TextField, {
    label: 'Số điện thoại', name: 'phone', type: 'tel', inputMode: 'numeric', autoComplete: 'tel',
    required: true, disabled: true, onChange, onBlur, ref, className: 'x',
  })), tag('input'))
  assert.equal(input.props.name, 'phone')
  assert.equal(input.props.type, 'tel')
  assert.equal(input.props.inputMode, 'numeric')
  assert.equal(input.props.autoComplete, 'tel')
  assert.equal(input.props.required, true)
  assert.equal(input.props.disabled, true)
  assert.equal(input.props.onChange, onChange)
  assert.equal(input.props.onBlur, onBlur)
  assert.equal(input.props.ref, ref)
  assert.equal(input.props.className, 'rooms-field-input x')
  assert.equal(input.props.label, undefined, 'label text is not leaked onto the input')
  assert.equal(input.props.error, undefined, 'error text is not leaked onto the input')
})

test('UI-05: TextField without className has exactly the kit class (no trailing space)', () => {
  const { TextField, el, render } = load()
  assert.equal(find(render(el(TextField, { label: 'A' })), tag('input')).props.className, 'rooms-field-input')
})

test('UI-08: PasswordField starts hidden, toggles to text and back, keeps spellCheck off and the value', () => {
  const { PasswordField, el, render } = load()
  const props = { label: 'Mật khẩu', defaultValue: 'matkhau123', name: 'password', autoComplete: 'current-password' }
  const button = tree => find(tree, tag('button'))
  let tree = render(el(PasswordField, props))
  let input = find(tree, tag('input'))
  assert.equal(input.props.type, 'password')
  assert.equal(input.props.spellCheck, false)
  assert.equal(input.props.autoCapitalize, 'none')
  assert.equal(input.props.autoComplete, 'current-password')
  assert.equal(button(tree).props.type, 'button', 'must not submit the form')
  assert.equal(textOf(button(tree)), 'Hiện')
  assert.equal(button(tree).props['aria-label'], 'Hiện mật khẩu')
  assert.equal(button(tree).props['aria-controls'], input.props.id)
  assert.equal(button(tree).props.disabled, undefined)

  button(tree).props.onClick()
  tree = render(el(PasswordField, props))
  input = find(tree, tag('input'))
  assert.equal(input.props.type, 'text')
  assert.equal(input.props.spellCheck, false, 'still no spell check while visible')
  assert.equal(input.props.autoCapitalize, 'none')
  assert.equal(input.props.defaultValue, 'matkhau123', 'toggling does not change the value')
  assert.equal(input.props.name, 'password')
  assert.equal(textOf(button(tree)), 'Ẩn')
  assert.equal(button(tree).props['aria-label'], 'Ẩn mật khẩu')
  assert.equal(button(tree).props['aria-controls'], input.props.id)

  button(tree).props.onClick()
  tree = render(el(PasswordField, props))
  assert.equal(find(tree, tag('input')).props.type, 'password')
  assert.equal(textOf(button(tree)), 'Hiện')
})

test('UI-08: PasswordField toggle button sits in .rooms-field-control after the input', () => {
  const { PasswordField, el, render } = load()
  const control = find(render(el(PasswordField, { label: 'Mật khẩu' })), cls('rooms-field-control'))
  const kids = [].concat(control.props.children).flat().filter(Boolean)
  assert.equal(kids[0].type, 'input')
  assert.equal(kids[1].type, 'button')
  assert.ok(cls('rooms-field-toggle')(kids[1]))
})

test('UI-08: PasswordField with error links label and error like TextField; disabled disables the toggle too', () => {
  const { PasswordField, el, render } = load()
  let tree = render(el(PasswordField, { label: 'Mật khẩu', error: 'Mật khẩu tối thiểu 8 ký tự', 'aria-describedby': 'pw-note' }))
  let input = find(tree, tag('input'))
  assert.equal(find(tree, tag('label')).props.htmlFor, input.props.id)
  assert.equal(input.props['aria-invalid'], true)
  assert.equal(input.props['aria-describedby'], `pw-note ${input.props.id}-error`)
  assert.equal(textOf(find(tree, node => node.props?.id === `${input.props.id}-error`)), 'Mật khẩu tối thiểu 8 ký tự')
  tree = render(el(PasswordField, { label: 'Mật khẩu', disabled: true }))
  input = find(tree, tag('input'))
  assert.equal(input.props.disabled, true)
  assert.equal(find(tree, tag('button')).props.disabled, true)
})

test('UI-08: PasswordField with empty error has no aria-invalid and no error text', () => {
  const { PasswordField, el, render } = load()
  const tree = render(el(PasswordField, { label: 'Mật khẩu', error: '' }))
  const input = find(tree, tag('input'))
  assert.equal(input.props['aria-invalid'], undefined)
  assert.equal(input.props['aria-describedby'], undefined)
  assert.equal(findAll(tree, cls('rooms-field-error')).length, 0)
})

test('UI-08: Checkbox input sits inside its label with the label text and forwards form props', () => {
  const { Checkbox, el, render } = load()
  const onChange = () => {}, ref = () => {}
  const tree = render(el(Checkbox, { label: 'Ghi nhớ đăng nhập', name: 'remember', checked: true, onChange, ref }))
  const label = find(tree, tag('label'))
  const input = find(label, tag('input'))
  assert.ok(input, 'input is a descendant of the label so a click on the text toggles it')
  assert.equal(input.props.type, 'checkbox')
  assert.equal(textOf(label), 'Ghi nhớ đăng nhập')
  assert.equal(input.props.checked, true)
  assert.equal(input.props.name, 'remember')
  assert.equal(input.props.onChange, onChange)
  assert.equal(input.props.ref, ref)
  assert.equal(input.props['aria-invalid'], undefined)
  assert.equal(input.props['aria-describedby'], undefined)
  assert.equal(findAll(tree, cls('rooms-field-error')).length, 0)
  assert.ok(cls('rooms-checkbox')(tree))
})

test('UI-08: Checkbox with error sets aria-invalid and aria-describedby to the error text; caller id and describedby merge', () => {
  const { Checkbox, el, render } = load()
  let tree = render(el(Checkbox, { label: 'Đồng ý', error: 'Cần đồng ý để tiếp tục' }))
  let input = find(tree, tag('input'))
  assert.equal(input.props['aria-invalid'], true)
  assert.equal(input.props['aria-describedby'], `${input.props.id}-error`)
  assert.equal(textOf(find(tree, node => node.props?.id === `${input.props.id}-error`)), 'Cần đồng ý để tiếp tục')
  tree = render(el(Checkbox, { label: 'Đồng ý', id: 'agree', 'aria-describedby': 'agree-note', error: 'Lỗi' }))
  input = find(tree, tag('input'))
  assert.equal(input.props.id, 'agree')
  assert.equal(input.props['aria-describedby'], 'agree-note agree-error')
  tree = render(el(Checkbox, { label: 'Đồng ý', error: '' }))
  assert.equal(find(tree, tag('input')).props['aria-invalid'], undefined)
  assert.equal(findAll(tree, cls('rooms-field-error')).length, 0)
})

test('UI-05: FormError renders nothing for undefined, null, false and empty text', () => {
  const { FormError } = load()
  for (const children of [undefined, null, false, '']) assert.equal(FormError({ children }), null, `children=${JSON.stringify(children)}`)
  assert.equal(FormError({}), null)
})

test('UI-05: FormError shows the AUTH-01 message as role=alert in .rooms-form-error', () => {
  const { FormError } = load()
  const node = FormError({ children: 'Số điện thoại hoặc mật khẩu không đúng' })
  assert.equal(node.props.role, 'alert')
  assert.ok(cls('rooms-form-error')(node))
  assert.equal(textOf(node), 'Số điện thoại hoặc mật khẩu không đúng')
})

test('UI-08: Spinner is a role=status with its label outside the aria-hidden ring', () => {
  const { Spinner, el, render } = load()
  const tree = render(el(Spinner, { label: 'Đang tải' }))
  assert.equal(tree.props.role, 'status')
  assert.ok(cls('rooms-spinner')(tree))
  const hidden = findAll(tree, node => node.props?.['aria-hidden'] === 'true')
  assert.equal(hidden.length, 1)
  assert.equal(textOf(hidden[0]), '', 'the decorative ring carries no text')
  const labelNode = find(tree.props.children, node => textOf(node) === 'Đang tải')
  assert.ok(labelNode, 'label text is rendered in a child of the status element')
  assert.ok(cls('rooms-visually-hidden')(labelNode))
  assert.equal(textOf(tree), 'Đang tải')
  assert.equal(findAll(hidden[0], node => node === labelNode).length, 0, 'label is not inside the aria-hidden branch')
})

test('KIT-07: index.ts exports the five form components and their prop types', () => {
  const index = read('../src/components/index.ts')
  for (const name of ['TextField', 'PasswordField', 'Checkbox', 'FormError', 'Spinner']) {
    assert.match(index, new RegExp(`export \\{[^}]*\\b${name}\\b[^}]*\\} from '\\./FormFields'`), `${name} value export`)
  }
  for (const name of ['TextFieldProps', 'PasswordFieldProps', 'CheckboxProps']) {
    assert.match(index, new RegExp(`export type \\{[^}]*\\b${name}\\b[^}]*\\} from '\\./FormFields'`), `${name} type export`)
  }
  const exported = Object.keys(load()).filter(name => !['el', 'render'].includes(name)).sort()
  assert.deepEqual(exported, ['Checkbox', 'FormError', 'PasswordField', 'Spinner', 'TextField'])
})

test('KIT-07: package.json runs the form test file in test:components', () => {
  const script = JSON.parse(read('../package.json')).scripts['test:components']
  assert.ok(script.startsWith('node --test tests/components.test.mjs'))
  assert.ok(script.split(/\s+/).includes('tests/form-fields.test.mjs'))
})

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const css = read('../src/components/rooms.css')
const token = name => css.match(new RegExp(`--rooms-${name}:\\s*(#[0-9a-fA-F]{6})`))[1]

test('KIT-09: WCAG contrast of the new error color, input border and focus ring', () => {
  const error = token('error'), ink = token('ink'), gold = token('gold')
  const sand = token('sand'), paper = token('paper'), cream = '#efe8d4'
  assert.equal(sand, '#f8f2e6')
  assert.equal(paper, '#fcf8ee')
  assert.equal(error, '#9b2c1f')
  const ratios = {
    'error/sand': contrast(error, sand), 'error/paper': contrast(error, paper), 'error/cream': contrast(error, cream),
    'ink/sand': contrast(ink, sand), 'ink/paper': contrast(ink, paper), 'gold/sand': contrast(gold, sand),
  }
  console.log('contrast', Object.fromEntries(Object.entries(ratios).map(([key, value]) => [key, value.toFixed(2)])))
  assert.ok(ratios['error/sand'] >= 4.5 && ratios['error/paper'] >= 4.5 && ratios['error/cream'] >= 4.5, 'error text >= 4.5')
  assert.ok(ratios['ink/sand'] >= 3 && ratios['ink/paper'] >= 3, 'input border >= 3')
  assert.ok(ratios['gold/sand'] >= 3, 'focus ring >= 3')
})

test('KIT-09: contrast helper reproduces known WCAG values (black/white 21, same color 1)', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(2), '21.00')
  assert.equal(contrast('#777777', '#777777'), 1)
})

test('KIT-01: form styles live under the kit tokens: error token inside .rooms-theme, classes use var(--rooms-*)', () => {
  const theme = css.slice(css.indexOf('.rooms-theme {'), css.indexOf('}', css.indexOf('.rooms-theme {')))
  assert.match(theme, /--rooms-error:\s*#9b2c1f/)
  assert.match(css, /\.rooms-field-input\[aria-invalid='true'\]\s*\{\s*border-color:\s*var\(--rooms-error\)/)
  assert.match(css, /\.rooms-field-error\s*\{[^}]*color:\s*var\(--rooms-error\)/)
  assert.match(css, /\.rooms-form-error\s*\{[^}]*border-left:\s*3px solid var\(--rooms-error\)/)
})

test('UI-08: keyboard focus ring covers inputs (3px gold, offset <= 3px) and the checkbox', () => {
  const shared = css.match(/^\.rooms-theme :is\(([^)]*)\):focus-visible \{([^}]*)\}/m)
  assert.ok(shared, 'shared focus-visible rule exists')
  assert.match(shared[1], /\binput\b/)
  assert.match(shared[2], /outline:\s*3px solid var\(--rooms-gold\)/)
  const offset = css.match(/input\.rooms-field-input:focus-visible \{\s*outline-offset:\s*(\d+)px/)
  assert.ok(offset && Number(offset[1]) <= 3, 'input outline-offset <= 3px')
})

test('UI-07: 360px layout rules, input 50px tall and 16px on phones, toggle and checkbox hit areas >= 44px', () => {
  assert.match(css, /\.rooms-field-input \{[^}]*min-height:\s*50px/)
  const mobile = css.slice(css.indexOf('@media (max-width: 680px)'))
  assert.match(mobile, /\.rooms-theme \.rooms-field-input \{ font-size: 16px; \}/)
  const toggle = css.match(/\.rooms-field-toggle \{([^}]*)\}/)[1]
  assert.match(toggle, /top:\s*1px/)
  assert.match(toggle, /bottom:\s*1px/)
  assert.ok(Number(toggle.match(/min-width:\s*(\d+)px/)[1]) >= 44, 'toggle width >= 44px (height = 50px input - 2px)')
  assert.ok(Number(css.match(/\.rooms-checkbox label \{[^}]*min-height:\s*(\d+)px/)[1]) >= 44, 'checkbox row >= 44px')
  assert.match(css, /\.rooms-field-error \{[^}]*overflow-wrap:\s*anywhere/)
  assert.match(css, /\.rooms-form-error \{[^}]*overflow-wrap:\s*anywhere/)
})

test('KIT-09: checkbox label uses weight 500 (small text rule) and the spinner/visually-hidden classes exist', () => {
  assert.match(css, /\.rooms-checkbox label \{ font-weight: 500; \}/)
  assert.match(css, /@keyframes rooms-spin \{ to \{ transform: rotate\(360deg\)/)
  assert.match(css, /\.rooms-spinner-ring \{[^}]*animation:\s*rooms-spin/)
  assert.match(css, /\.rooms-visually-hidden \{[^}]*position:\s*absolute[^}]*clip-path:\s*inset\(50%\)/)
})
