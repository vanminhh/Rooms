export function getJourneyFrame(progress: number, count: number) {
  if (count < 1) return null
  const normalized = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0))
  if (count === 1) return { from: 0, to: 0, mix: 0, dolly: normalized * 0.85 }
  const position = normalized * (count - 1)
  const from = Math.floor(position)
  const mix = position - from
  return { from, to: Math.min(from + 1, count - 1), mix, dolly: mix * 0.85 }
}
