import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

function mergeClassName(base: string, className?: string) {
  return className ? `${base} ${className}` : base
}

export interface FilterChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed'> {
  selected?: boolean
  count?: number
}

export function FilterChip({ selected = false, count, className, children, type = 'button', ...props }: FilterChipProps) {
  return <button
    {...props}
    type={type}
    aria-pressed={selected}
    className={mergeClassName('rooms-filter-chip', className)}
  >
    <span>{children}</span>
    {count !== undefined && <span className="rooms-filter-chip-count">{count}</span>}
  </button>
}

export interface ElevatedCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function ElevatedCard({ className, children, ...props }: ElevatedCardProps) {
  return <div {...props} className={mergeClassName('rooms-elevated-card', className)}>{children}</div>
}

export interface IllustrationLabelProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode
}

export function IllustrationLabel({ className, children = 'Ảnh minh họa', ...props }: IllustrationLabelProps) {
  return <span {...props} className={mergeClassName('rooms-illustration-label', className)}>{children}</span>
}
