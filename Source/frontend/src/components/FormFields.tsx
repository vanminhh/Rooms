import { useId, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'

export type TextFieldProps = ComponentProps<'input'> & { label: string; error?: string }
export type PasswordFieldProps = Omit<TextFieldProps, 'type'>
export type CheckboxProps = Omit<ComponentProps<'input'>, 'type'> & { label: string; error?: string }

// Shared by TextField and Checkbox: the input id, the aria attributes that tie the input to its error text, and that text.
function useFieldError(idProp: string | undefined, describedBy: string | undefined, error: string | undefined) {
  const generatedId = useId()
  const id = idProp ?? generatedId
  const errorId = `${id}-error`
  const attrs = {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': [describedBy, error ? errorId : ''].filter(Boolean).join(' ') || undefined,
  }
  return { id, attrs, message: error ? <p className="rooms-field-error" id={errorId}>{error}</p> : null }
}

function Field({ label, error, trailing, className = '', id: idProp, 'aria-describedby': describedBy, ...rest }: TextFieldProps & { trailing?: (id: string) => ReactNode }) {
  const field = useFieldError(idProp, describedBy, error)
  return <div className="rooms-field">
    <label className="rooms-field-label" htmlFor={field.id}>{label}</label>
    <div className="rooms-field-control">
      <input {...rest} {...field.attrs} className={`rooms-field-input ${className}`.trim()} />
      {trailing?.(field.id)}
    </div>
    {field.message}
  </div>
}

export function TextField(props: TextFieldProps) {
  return <Field {...props} />
}

export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  return <Field {...props} type={visible ? 'text' : 'password'} spellCheck={false} autoCapitalize="none"
    trailing={id => <button type="button" className="rooms-field-toggle" aria-controls={id} aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} disabled={props.disabled} onClick={() => setVisible(!visible)}>{visible ? 'Ẩn' : 'Hiện'}</button>} />
}

export function Checkbox({ label, error, id: idProp, 'aria-describedby': describedBy, ...rest }: CheckboxProps) {
  const field = useFieldError(idProp, describedBy, error)
  return <div className="rooms-checkbox">
    <label><input {...rest} type="checkbox" {...field.attrs} /><span>{label}</span></label>
    {field.message}
  </div>
}

export function FormError({ children }: { children?: ReactNode }) {
  return children ? <div className="rooms-form-error" role="alert">{children}</div> : null
}

export function Spinner({ label }: { label: string }) {
  return <span className="rooms-spinner" role="status">
    <span className="rooms-spinner-ring" aria-hidden="true" />
    <span className="rooms-visually-hidden">{label}</span>
  </span>
}
