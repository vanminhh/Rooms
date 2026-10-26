import { useState } from 'react'

export function QuoteCarousel({ quotes }: { quotes: { quote: string; author: string }[] }) {
  const [index, setIndex] = useState(0)
  const [pointerChange, setPointerChange] = useState(false)
  if (!quotes.length) return <p className="rooms-empty">Chưa có nội dung để hiển thị.</p>
  const current = index % quotes.length
  const move = (step: number, detail: number) => {
    setPointerChange(detail > 0)
    setIndex(previous => (previous + step + quotes.length) % quotes.length)
  }
  return <div className="rooms-quotes" data-motion={pointerChange ? 'pointer' : 'instant'} aria-roledescription="trình chiếu" aria-label="Chia sẻ về không gian sống">
    <span className="rooms-quote-mark" aria-hidden="true">“</span>
    <div className="rooms-quote-slot" aria-live="polite"><blockquote key={`${current}-${quotes[current].quote}`}><p>{quotes[current].quote}</p><footer>{quotes[current].author}</footer></blockquote></div>
    {quotes.length > 1 && <div className="rooms-quote-controls"><button type="button" aria-label="Chia sẻ trước" onClick={event => move(-1, event.detail)}>←</button><div>{quotes.map((quote, i) => <button type="button" key={`${quote.author}-${i}`} aria-label={`Chia sẻ ${i + 1}`} aria-current={i === current ? 'true' : undefined} onClick={event => { setPointerChange(event.detail > 0); setIndex(i) }} />)}</div><button type="button" aria-label="Chia sẻ tiếp theo" onClick={event => move(1, event.detail)}>→</button></div>}
  </div>
}
