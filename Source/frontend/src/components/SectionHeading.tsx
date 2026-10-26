import type { ReactNode } from 'react'

export function SectionHeading({ eyebrow, children, description }: { eyebrow?: string; children: ReactNode; description?: string }) {
  return <div className="rooms-section-heading">
    {eyebrow && <p className="rooms-eyebrow">{eyebrow}</p>}
    <h2>{children}</h2>
    {description && <p className="rooms-section-description">{description}</p>}
  </div>
}
