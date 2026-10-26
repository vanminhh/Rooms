import { useState } from 'react'
import { motion, useMotionValue, useSpring } from 'motion/react'
import { useReducedMotion } from './useReducedMotion'

export type RoomFeature = { id: string; title: string; description: string; image: string }

export function FeatureList({ items }: { items: RoomFeature[] }) {
  const [selectedId, setSelectedId] = useState(items[0]?.id)
  const active = items.find(item => item.id === selectedId) ?? items[0]
  const reduce = useReducedMotion()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const followX = useSpring(x, { stiffness: 90, damping: 22 })
  const followY = useSpring(y, { stiffness: 90, damping: 22 })
  if (!active) return <p className="rooms-empty">Chưa có tiện ích để hiển thị.</p>
  return <div className="rooms-features" onPointerMove={event => {
    if (reduce || event.pointerType !== 'mouse' || event.currentTarget.querySelector(':focus-visible')) return
    const rect = event.currentTarget.getBoundingClientRect()
    x.set((event.clientX - rect.left - rect.width / 2) * 0.045)
    y.set((event.clientY - rect.top - rect.height / 2) * 0.06)
  }} onPointerLeave={() => { x.set(0); y.set(0) }} onFocusCapture={() => { x.set(0); y.set(0) }}>
    <ol>{items.map((item, index) => <li key={item.id}><button type="button" className={active.id === item.id ? 'is-active' : ''} aria-pressed={active.id === item.id} onPointerEnter={event => { if (event.pointerType === 'mouse' && !event.currentTarget.closest('.rooms-features')?.querySelector(':focus-visible')) setSelectedId(item.id) }} onFocus={() => setSelectedId(item.id)} onClick={() => setSelectedId(item.id)}><span className="rooms-feature-number">{String(index + 1).padStart(2, '0')}</span><span><strong>{item.title}</strong><small>{item.description}</small></span><span aria-hidden="true">↗</span></button></li>)}</ol>
    <motion.figure style={{ x: reduce ? 0 : followX, y: reduce ? 0 : followY }}><img src={active.image} alt={active.title} loading="lazy" /><figcaption>{active.title}</figcaption></motion.figure>
  </div>
}
