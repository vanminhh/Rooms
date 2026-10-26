import type { ButtonHTMLAttributes } from 'react'

export type RoomsButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'sand' | 'outline'
  magnetic?: boolean
}

export function RoomsButton({ variant = 'primary', magnetic = true, className = '', onPointerMove, onPointerLeave, onFocus, children, ...props }: RoomsButtonProps) {
  const resetTransform = (element: HTMLButtonElement) => { element.style.transform = props.style?.transform ?? '' }
  return <button {...props} type={props.type ?? 'button'} className={`rooms-button rooms-button--${variant} ${className}`}
    onPointerMove={event => {
      if (magnetic && !props.disabled && !props.style?.transform && event.pointerType === 'mouse' && event.buttons === 0 && matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches && !event.currentTarget.matches(':focus-visible')) {
        const rect = event.currentTarget.getBoundingClientRect()
        event.currentTarget.style.transform = `translate3d(${(event.clientX - rect.left - rect.width / 2) * 0.06}px, ${(event.clientY - rect.top - rect.height / 2) * 0.1}px, 0)`
      } else resetTransform(event.currentTarget)
      onPointerMove?.(event)
    }} onPointerLeave={event => {
      resetTransform(event.currentTarget)
      onPointerLeave?.(event)
    }} onFocus={event => {
      resetTransform(event.currentTarget)
      onFocus?.(event)
    }}>{children}</button>
}
