import { useState } from 'react'

export type PlanArea = { id: string; name: string; description: string; image: string; path: string; labelX: number; labelY: number }

export function FloorPlan({ areas, viewBox = '0 0 600 460' }: { areas: PlanArea[]; viewBox?: string }) {
  const [selectedId, setSelectedId] = useState(areas[0]?.id)
  const active = areas.find(area => area.id === selectedId) ?? areas[0]
  if (!active) return <p className="rooms-empty">Chưa có mặt bằng để hiển thị.</p>
  return <div className="rooms-plan">
    <figure><img src={active.image} alt={active.name} loading="lazy" /><figcaption><strong>{active.name}</strong><span>{active.description}</span></figcaption></figure>
    <div><svg viewBox={viewBox} role="group" aria-label="Sơ đồ minh họa — chọn khu vực để xem">
      {areas.map(area => <g key={area.id}><path d={area.path} role="button" tabIndex={0} aria-label={area.name} aria-pressed={active.id === area.id} className={active.id === area.id ? 'is-active' : ''} onPointerEnter={event => { if (event.pointerType === 'mouse' && !event.currentTarget.closest('.rooms-plan')?.querySelector(':focus-visible')) setSelectedId(area.id) }} onFocus={() => setSelectedId(area.id)} onClick={() => setSelectedId(area.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedId(area.id) } }} /><text x={area.labelX} y={area.labelY} aria-hidden="true">{area.name}</text></g>)}
    </svg><p className="rooms-plan-note">Sơ đồ minh họa · Chọn một khu vực để khám phá</p></div>
  </div>
}
