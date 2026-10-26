import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from './useReducedMotion'
import type { DepthImage, createDepthScene } from './depth-scene'
import { getJourneyFrame } from './journey-frame'

export type JourneySlide = DepthImage & { title: string; eyebrow: string; description: string }

export function ImageJourney({ slides }: { slides: JourneySlide[] }) {
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [active, setActive] = useState(0)
  const reducedMotion = useReducedMotion()
  // Updating copy or recreating an equivalent array must not rebuild GPU resources.
  const imageSources = JSON.stringify(slides.map(({ image, depth }) => ({ image, depth })))

  useEffect(() => {
    const images: DepthImage[] = JSON.parse(imageSources)
    if (reducedMotion || !images.length || !root.current || !canvas.current) return
    const element = root.current
    const surface = canvas.current
    surface.classList.remove('is-ready')
    let cancelled = false
    let started = false
    let scrollFrame: number | undefined
    let scene: ReturnType<typeof createDepthScene> | undefined
    const scroll = () => {
      if (cancelled) return
      const rect = element.getBoundingClientRect()
      const progress = images.length === 1 ? 0 : Math.max(0, Math.min(1, -rect.top / Math.max(1, rect.height - surface.clientHeight)))
      const frame = getJourneyFrame(progress, images.length)
      setActive(frame ? Math.round(frame.from + frame.mix) : 0)
      scene?.update(progress)
      scene?.setActive(rect.bottom > 0 && rect.top < window.innerHeight)
    }
    const scheduleScroll = () => {
      scrollFrame ??= requestAnimationFrame(() => { scrollFrame = undefined; scroll() })
    }
    const pointer = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const rect = surface.getBoundingClientRect()
      scene?.setPointer((event.clientX - rect.left) / rect.width - 0.5, 0.5 - (event.clientY - rect.top) / rect.height)
    }
    const leave = () => { scene?.setPointer(0, 0) }
    const fail = () => {
      if (cancelled) return
      surface.classList.remove('is-ready')
      scene?.dispose()
      scene = undefined
    }
    surface.addEventListener('webglcontextlost', fail)
    element.addEventListener('pointermove', pointer)
    element.addEventListener('pointerleave', leave)
    window.addEventListener('scroll', scheduleScroll, { passive: true })
    window.addEventListener('resize', scheduleScroll)
    scroll()
    const start = () => {
      if (started || cancelled) return
      started = true
      void import('./depth-scene').then(async ({ createDepthScene: create }) => {
        if (cancelled) return
        const currentScene = create(surface, images)
        scene = currentScene
        await currentScene.ready
        if (cancelled || scene !== currentScene) return
        scroll()
        surface.classList.add('is-ready')
      }).catch(fail)
    }
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) start()
      scroll()
    }, { rootMargin: '300px' }) : undefined
    if (observer) observer.observe(element)
    else start()
    return () => {
      cancelled = true
      surface.classList.remove('is-ready')
      scene?.dispose()
      observer?.disconnect()
      if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame)
      surface.removeEventListener('webglcontextlost', fail)
      element.removeEventListener('pointermove', pointer)
      element.removeEventListener('pointerleave', leave)
      window.removeEventListener('scroll', scheduleScroll)
      window.removeEventListener('resize', scheduleScroll)
    }
  }, [imageSources, reducedMotion])

  if (!slides.length) return <p className="rooms-empty">Chưa có ảnh không gian.</p>
  if (reducedMotion) return <div className="rooms-journey-static">
    {slides.map((slide) => <figure key={slide.title}>
      <img src={slide.image} alt={slide.title} loading="lazy" />
      <figcaption><span>{slide.eyebrow}</span><h3>{slide.title}</h3><p>{slide.description}</p></figcaption>
    </figure>)}
  </div>
  const current = slides[Math.min(active, slides.length - 1)]
  return <div ref={root} className={`rooms-journey${slides.length === 1 ? ' rooms-journey-single' : ''}`}>
    <div className="rooms-journey-stage">
      <img className="rooms-journey-fallback" src={current.image} alt={current.title} loading="lazy" decoding="async" />
      <canvas ref={canvas} aria-hidden="true" />
      <div className="rooms-journey-copy" key={current.title}>
        <span className="rooms-eyebrow">{current.eyebrow}</span>
        <h3>{current.title}</h3><p>{current.description}</p>
      </div>
      <div className="rooms-journey-progress" aria-label={`Ảnh ${Math.min(active + 1, slides.length)} trên ${slides.length}`}>
        <span>{String(Math.min(active + 1, slides.length)).padStart(2, '0')}</span><i /><span>{String(slides.length).padStart(2, '0')}</span>
      </div>
      {slides.length > 1 && <span className="rooms-journey-hint">Cuộn để khám phá ↓</span>}
    </div>
  </div>
}
