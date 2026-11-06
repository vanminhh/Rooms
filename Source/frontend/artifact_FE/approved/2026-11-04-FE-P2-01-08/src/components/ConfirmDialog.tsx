import { useEffect, useId, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { RoomsButton } from './Button'
import { Spinner } from './FormFields'

export type ConfirmDialogProps = {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  pending?: boolean
  onConfirm(): void
  onClose(): void
}

// Modal: Tab stays inside the dialog, Escape closes it, focus returns to the opener.
// Confirm uses aria-disabled (not disabled) so it keeps focus while pending; extra clicks are ignored.
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = 'Hủy', pending = false, onConfirm, onClose }: ConfirmDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => { if (opener instanceof HTMLElement) opener.focus() }
  }, [open])

  if (!open) return null

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button')
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return <div className="rooms-dialog-backdrop">
    <div ref={dialogRef} className="rooms-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={onKeyDown}>
      <h2 id={titleId} className="rooms-dialog-title">{title}</h2>
      <div id={descriptionId} className="rooms-dialog-description">{description}</div>
      <div className="rooms-dialog-actions">
        <RoomsButton variant="outline" onClick={() => onClose()}>{cancelLabel}</RoomsButton>
        <RoomsButton aria-disabled={pending || undefined} onClick={() => { if (!pending) onConfirm() }}>
          {pending && <Spinner label="Đang xử lý" />}{confirmLabel}
        </RoomsButton>
      </div>
    </div>
  </div>
}
