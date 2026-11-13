import { useLocation } from 'react-router'
import { MousePointer2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useWiwo } from './context'
import { chapterById } from './catalog'

export function WiwoToggle() {
  const wiwo = useWiwo()
  const { pathname } = useLocation()
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
  return <div data-wiwo-ui className="wiwo-launcher" data-hidden={hidden || undefined}>
    <button type="button" data-wiwo="wiwo-toggle" data-sleeping={!active && sleeping || undefined}
      data-animate={wiwo.progress.animation || undefined} aria-label={active ? 'Cancel Wiwo tutorial' : idleLabel}
      aria-pressed={active} aria-expanded={active} aria-controls={active ? 'wiwo-card' : undefined}
      title={active ? 'Cancel Wiwo tutorial' : idleLabel} onClick={wiwo.toggle} className="wiwo-toggle">
      <MousePointer2 aria-hidden="true" size={23} strokeWidth={1.75} className="wiwo-cursor-icon" />
      {!active && sleeping && <svg className="wiwo-sleep-mark" aria-hidden="true" width="12" height="12" viewBox="0 0 12 12"><path d="M2 3h6L2 9h6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      <span className="wiwo-button-name">Wiwo</span>
    </button>
    {wiwo.offer && !active && <aside className="wiwo-offer" aria-label="Wiwo introduction">
      <button type="button" className="wiwo-close" onClick={wiwo.dismissOffer} aria-label="Dismiss Wiwo introduction"><X size={17} aria-hidden="true" /></button>
      <p className="pr-6 font-semibold">A little guidance?</p>
      <p className="mt-1 text-sm text-muted">Wiwo can walk you through {chapterById(wiwo.offer).title.toLowerCase()}.</p>
      <button type="button" className="wiwo-text-button" onClick={() => wiwo.start(wiwo.offer!)}>Show me</button>
    </aside>}
  </div>
}
