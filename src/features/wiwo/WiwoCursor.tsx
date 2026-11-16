import { useEffect, useState } from 'react'
import { WiwoArrow } from './WiwoArrow'
import { useReducedMotion } from './motion'

type Box = { left: number; top: number; width: number; height: number }
type Point = { x: number; y: number }
type WiwoCursorProps = { box?: Box; home?: Point; width: number; height: number; label?: string }

const TYPE_MS = 22

/** Reveals `text` one character at a time; the full text is kept in layout so the bubble never resizes. */
function useTyped(text: string, instant: boolean) {
  const [state, setState] = useState({ text: '', count: 0 })
  useEffect(() => {
    if (instant) return
    const timer = setInterval(() => setState((current) => {
      const count = current.text === text ? current.count : 0
      return count >= text.length ? current : { text, count: count + 1 }
    }), TYPE_MS)
    const stop = setTimeout(() => clearInterval(timer), (text.length + 2) * TYPE_MS)
    return () => { clearInterval(timer); clearTimeout(stop) }
  }, [text, instant])
  return instant ? text.length : state.text === text ? state.count : 0
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max))

export function WiwoCursor({ box, home, width, height, label = '' }: WiwoCursorProps) {
  const reducedMotion = useReducedMotion()
  const [launched, setLaunched] = useState(false)
  // Start at the Wiwo button, then glide out to the first target on the next frame.
  useEffect(() => {
    if (!box || launched) return
    const timer = setTimeout(() => setLaunched(true), 40)
    return () => clearTimeout(timer)
  }, [box, launched])
  const typed = useTyped(label, reducedMotion)
  const target = box && {
    x: clamp(box.left + Math.min(box.width / 2, 44), 8, width - 28),
    y: clamp(box.top + Math.min(box.height / 2, 26), Math.min(60, box.top + 4), height - 28),
  }
  const point = target && (launched || !home) ? target : home
  if (!point) return null
  const left = point.x + 248 > width
  const up = point.y > height * 0.62
  return <div className="wiwo-cursor" aria-hidden="true" data-here={target ? '' : undefined} data-left={left || undefined} data-up={up || undefined}
    style={{ transform: `translate3d(${Math.round(point.x)}px, ${Math.round(point.y)}px, 0)` }}>
    <WiwoArrow size={22} className="wiwo-cursor-arrow" />
    <div className="wiwo-tag" data-talking={label ? '' : undefined}>
      <span className="wiwo-tag-name">Wiwo</span>
      {label && <span className="wiwo-tag-text">{label.slice(0, typed)}<span className="wiwo-tag-rest">{label.slice(typed)}</span></span>}
    </div>
  </div>
}
