import { useId } from 'react'
import type { ComponentProps } from 'react'

// Select and textarea in the kit's field look (rooms-field classes); the kit has no piece for them.
// Same aria wiring as TextField: the error text is linked to the control.
export function SelectField({ label, error, children, ...rest }: ComponentProps<'select'> & { label: string; error?: string }) {
  const id = useId()
  const errorId = `${id}-error`
  return <div className="rooms-field">
    <label className="rooms-field-label" htmlFor={id}>{label}</label>
    <select {...rest} id={id} className="rooms-field-input" aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}>{children}</select>
    {error && <p className="rooms-field-error" id={errorId}>{error}</p>}
  </div>
}

export function TextAreaField({ label, error, ...rest }: ComponentProps<'textarea'> & { label: string; error?: string }) {
  const id = useId()
  const errorId = `${id}-error`
  return <div className="rooms-field">
    <label className="rooms-field-label" htmlFor={id}>{label}</label>
    <textarea {...rest} id={id} className="rooms-field-input buildings-textarea" aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} />
    {error && <p className="rooms-field-error" id={errorId}>{error}</p>}
  </div>
}
