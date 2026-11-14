import { useLocation } from 'react-router'
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useWiwo } from './context'
import { chapterById } from './catalog'
import { WiwoArrow } from './WiwoArrow'

/** Layouts mark where the cursor belongs with `<WiwoSlot />`; without one it floats in the corner. */
export function WiwoSlot({ className }: { className?: string }) {
  return <div data-wiwo-slot className={className} />
}

function useSlot() {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const find = () => setSlot(document.querySelector<HTMLElement>('[data-wiwo-slot]'))
    const frame = requestAnimationFrame(find)
    const observer = new MutationObserver(find)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => { cancelAnimationFrame(frame); observer.disconnect() }
  }, [])
  return slot
}

export function WiwoToggle() {
  const wiwo = useWiwo()
  const { pathname } = useLocation()
  const slot = useSlot()
  const idleLabel = pathname === '/' ? 'Wiwo — show me the workspace' : 'Wiwo — guide me on this screen'
  const [sleeping, setSleeping] = useState(false)
  const [hidden, setHidden] = useState(false)
  const active = Boolean(wiwo?.run)
  useEffect(() => {
    const timer = setTimeout(() => setSleeping(!active), active ? 0 : 8000)
    return () => clearTimeout(timer)
  }, [active])
  useEffect(() => {
    const changed = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', changed)
    return () => document.removeEventListener('visibilitychange', changed)
  }, [])
  if (!wiwo) return null
  const launcher = <div data-wiwo-ui className="wiwo-launcher" data-floating={slot ? undefined : true} data-hidden={hidden || undefined}>
    <button type="button" data-wiwo="wiwo-toggle" data-sleeping={!active && sleeping || undefined}
      data-animate={wiwo.progress.animation || undefined} aria-label={active ? 'Cancel Wiwo tutorial' : idleLabel}
      aria-pressed={active} aria-expanded={active} aria-controls={active ? 'wiwo-card' : undefined}
      title={active ? 'Cancel Wiwo tutorial' : idleLabel} onClick={wiwo.toggle} className="wiwo-toggle">
      <span className="wiwo-toggle-icon">
        <WiwoArrow size={16} className="wiwo-cursor-icon" />
        {!active && sleeping && <svg className="wiwo-sleep-mark" aria-hidden="true" width="9" height="9" viewBox="0 0 12 12"><path d="M2 3h6L2 9h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
      <span className="wiwo-button-name">Wiwo</span>
    </button>
    {wiwo.offer && !active && <aside className="wiwo-offer" aria-label="Wiwo introduction">
      <button type="button" className="wiwo-close" onClick={wiwo.dismissOffer} aria-label="Dismiss Wiwo introduction"><X size={16} aria-hidden="true" /></button>
      <p className="pr-6 text-sm font-semibold">A little guidance?</p>
      <p className="mt-1 text-[13px] text-muted">Wiwo can walk you through {chapterById(wiwo.offer).title.toLowerCase()}.</p>
      <button type="button" className="wiwo-text-button" onClick={() => wiwo.start(wiwo.offer!)}>Show me</button>
    </aside>}
  </div>
  return slot ? createPortal(launcher, slot) : launcher
}
