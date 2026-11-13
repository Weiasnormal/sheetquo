import { MousePointer2, X, ChevronLeft, Check } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { CHAPTERS, chapterById } from './catalog'
import type { ChapterId } from './catalog'
import { useWiwo } from './context'
import { useTarget } from './useTarget'
import { targetFor } from './dom'

export default function WiwoCoach() {
  const wiwo = useWiwo()!
  const run = wiwo.run!
  const steps = wiwo.lessons?.[run.chapter], step = steps?.[run.index]
  const position = useTarget(run.finished ? undefined : step, wiwo.paused)
  const heading = useRef<HTMLHeadingElement>(null)
  const card = useRef<HTMLElement>(null)
  const [compactStep, setCompactStep] = useState<string>()
  const stepKey = `${run.chapter}:${run.index}`
  const compact = compactStep === stepKey && !run.finished && !wiwo.paused
  useEffect(() => {
    document.body.classList.add('wiwo-guiding')
    const timer = requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }))
    return () => { document.body.classList.remove('wiwo-guiding'); cancelAnimationFrame(timer) }
  }, [])
  if (position.dialog) return createPortal(<div data-wiwo-ui className="wiwo-modal-note">
    <p className="text-sm">Wiwo is paused while this dialog is open. Finish or cancel it to continue.</p>
    <button type="button" className="wiwo-text-button" onClick={wiwo.cancel}>Cancel Wiwo tutorial</button>
  </div>, position.dialog)

  const confirmed = Boolean(step && (position.ready || run.observed.includes(step.event ?? '')))
  const action = Boolean(step?.event || step?.ready)
  const rect = position.box
  const cardWidth = Math.min(352, position.width - 24)
  const beside = position.width >= 1024 && rect && rect.left + rect.width + 16 + cardWidth < position.width
  const leftSide = position.width >= 1024 && rect && rect.left > cardWidth + 28
  const cardStyle = position.width >= 768 ? {
    width: cardWidth,
    left: beside && rect ? rect.left + rect.width + 16 : leftSide && rect ? rect.left - cardWidth - 16 : position.width - cardWidth - 16,
    ...(beside || leftSide ? { top: Math.min(Math.max(76, rect?.top ?? 76), Math.max(76, position.height - 420)) } : { bottom: 16 }),
  } : { width: cardWidth, left: 12, bottom: Math.max(12, (window.innerHeight - (window.visualViewport?.height ?? window.innerHeight)) / (Number(getComputedStyle(document.documentElement).zoom) || 1) + 12) }

  return createPortal(<div data-wiwo-ui>
    {rect && !wiwo.paused && !run.finished && !position.busy && <>
      <div className="wiwo-highlight" aria-hidden="true" style={rect} />
      <MousePointer2 className="wiwo-pointer" size={25} strokeWidth={1.8} aria-hidden="true"
        style={{ left: Math.min(position.width - 30, Math.max(8, rect.left - 12)), top: Math.max(60, rect.top - 18) }} />
    </>}
    <section ref={card} id="wiwo-card" className="wiwo-card" style={{ ...cardStyle, maxHeight: position.width < 768 ? position.height * 0.52 : Math.min(620, position.height - 88) }} aria-label="Wiwo tutorial">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 font-semibold"><MousePointer2 size={18} aria-hidden="true" />Wiwo</span>
        <button type="button" className="wiwo-close" onClick={wiwo.cancel} aria-label="Close Wiwo tutorial"><X size={18} aria-hidden="true" /></button>
      </div>
      {compact ? <div className="mt-2"><p className="text-sm font-medium">{step?.title}</p><button type="button" className="wiwo-text-button" onClick={() => setCompactStep(undefined)}>Show full step</button></div> : <>
      <label className="mt-3 block text-xs text-muted" htmlFor="wiwo-chapter">Chapter</label>
      <select id="wiwo-chapter" className="wiwo-chapter" value={run.chapter} onChange={(event) => wiwo.start(event.target.value as ChapterId, false, true)}>
        {CHAPTERS.map(({ id, title }) => <option key={id} value={id}>{title}</option>)}
      </select>
      {!wiwo.persistent && <p className="mt-2 text-xs text-notice">Progress lasts for this visit because browser storage is unavailable.</p>}
      <div aria-live="polite" aria-atomic="true" className="mt-4">
        <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold outline-none">
          {run.finished ? wiwo.progress.chapters[run.chapter]?.status === 'completed' ? 'Chapter complete' : 'Chapter explored' : wiwo.paused ? 'This chapter is paused' : wiwo.loadError ? 'Wiwo could not load' : step?.title ?? 'Loading guidance…'}
        </h2>
        <p className="mt-2 text-sm leading-relaxed">
          {run.finished ? `You’ve reached the end of ${chapterById(run.chapter).title.toLowerCase()}. Skipped steps remain available to replay. Your business data has not been changed by Wiwo.`
            : wiwo.paused ? 'This chapter needs its own screen and business. Open that screen or choose guidance for where you are now. For quotation chapters, open a saved quotation from History first.'
              : wiwo.loadError ?? step?.body ?? 'You can cancel at any time with the cursor button or Escape.'}
        </p>
      </div>
      {run.finished ? <div className="wiwo-actions mt-4">
        <button type="button" className="wiwo-secondary" onClick={() => wiwo.start(run.chapter, true)}>Replay chapter</button>
        <button type="button" className="wiwo-primary" onClick={wiwo.cancel}>Done</button>
      </div> : wiwo.paused ? <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="wiwo-secondary" onClick={() => wiwo.start(run.chapter, false, true)}>Open chapter screen</button>
        <button type="button" className="wiwo-primary" onClick={() => wiwo.start(wiwo.current)}>Guide this screen</button>
      </div> : wiwo.loadError ? <button type="button" className="wiwo-primary mt-4" onClick={() => wiwo.start(run.chapter)}>Retry loading Wiwo</button> : step && <>
        {position.missing && !confirmed && <p className="mt-3 text-sm text-notice">{step.missing}</p>}
        {position.busy ? <p role="status" className="mt-3 text-sm text-muted">Wait for the current operation to finish.</p>
          : action && <p className="mt-3 flex items-start gap-1.5 text-sm text-muted">{confirmed && <Check size={17} className="shrink-0" aria-hidden="true" />}{confirmed ? 'Sheetquo confirms this step is ready.' : 'Complete the action on the page, or skip it to keep learning.'}</p>}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">Step {run.index + 1} of {steps?.length}</span>
          {rect && <button type="button" className="wiwo-text-button" onClick={() => {
            setCompactStep(stepKey)
            const target = targetFor(step.target)
            target?.scrollIntoView({ block: 'start', behavior: 'instant' })
            const control = target?.matches('button,input,select,textarea,a') ? target : target?.querySelector<HTMLElement>('input:not([type="hidden"]),select,textarea,button,a')
            control?.focus({ preventScroll: true })
          }}>Go to control</button>}
        </div>
        <div className="wiwo-actions mt-3">
          <button type="button" className="wiwo-secondary" disabled={run.index === 0} onClick={wiwo.back}><ChevronLeft size={15} aria-hidden="true" />Back</button>
          <button type="button" className="wiwo-secondary" disabled={position.busy} onClick={() => wiwo.next(true)}>Skip</button>
          <button type="button" className="wiwo-primary" disabled={position.busy || (action && !confirmed)} onClick={() => wiwo.next()}>{step.acknowledge ?? (run.index === (steps?.length ?? 0) - 1 ? 'Finish' : 'Next')}</button>
        </div>
      </>}
      </>}
      <Link className="mt-4 block text-xs underline underline-offset-2" to="/help" onClick={wiwo.cancel}>All Wiwo chapters in Help</Link>
    </section>
  </div>, document.body)
}
