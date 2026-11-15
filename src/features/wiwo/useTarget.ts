import { useEffect, useState } from 'react'
import { inViewport, isReady, openDialog, targetFor } from './dom'
import type { LessonStep } from './lessons'

type Box = { left: number; top: number; width: number; height: number }
type Point = { x: number; y: number }
type Position = { box?: Box; home?: Point; dialog?: HTMLElement; ready: boolean; busy: boolean; missing: boolean; width: number; height: number }
const INITIAL: Position = { ready: false, busy: false, missing: false, width: 1024, height: 768 }

export function useTarget(step?: LessonStep, paused = false) {
  const [position, setPosition] = useState<Position>(INITIAL)
  useEffect(() => {
    let frame = 0, scrolled: HTMLElement | undefined
    const started = Date.now()
    const measure = () => {
      frame = 0
      const dialog = openDialog()
      const target = !paused && step ? targetFor(step.target) : undefined
      if (target && target !== scrolled && !dialog && !inViewport(target)) {
        scrolled = target
        target.scrollIntoView({ block: 'start', behavior: 'instant' })
      }
      const viewport = window.visualViewport
      const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1
      const width = (viewport?.width ?? window.innerWidth) / zoom, height = (viewport?.height ?? window.innerHeight) / zoom
      const raw = !dialog ? target?.getBoundingClientRect() : undefined
      const rect = raw ? { top: raw.top / zoom, bottom: raw.bottom / zoom, left: raw.left / zoom, right: raw.right / zoom } : undefined
      // The sticky header covers the top 56px, except for the Wiwo button that lives inside it.
      const floor = target?.closest('[data-wiwo-slot]') ? 4 : 60
      const box = rect && rect.bottom > floor - 4 && rect.top < height ? {
        left: Math.max(8, rect.left - 4), top: Math.max(floor, rect.top - 4),
        width: Math.max(0, Math.min(width - 16, rect.right + 4) - Math.max(8, rect.left - 4)),
        height: Math.max(0, Math.min(height - 12, rect.bottom + 4) - Math.max(floor, rect.top - 4)),
      } : undefined
      const toggle = targetFor(['wiwo-toggle'])?.getBoundingClientRect()
      const home = toggle ? { x: Math.round((toggle.left + toggle.width / 2) / zoom), y: Math.round((toggle.top + toggle.height / 2) / zoom) } : undefined
      const next: Position = { box, home, dialog, width, height, ready: isReady(step?.ready), busy: Boolean(document.querySelector('[data-wiwo-busy="true"]')), missing: !target && Date.now() - started > 1500 }
      setPosition((previous) => previous.dialog === next.dialog && previous.ready === next.ready && previous.busy === next.busy && previous.missing === next.missing && previous.width === width && previous.height === height && JSON.stringify(previous.box) === JSON.stringify(box) && previous.home?.x === home?.x && previous.home?.y === home?.y ? previous : next)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    schedule()
    const observer = new MutationObserver((mutations) => {
      if (mutations.some(({ target }) => !(target instanceof Element ? target : target.parentElement)?.closest('[data-wiwo-ui]'))) schedule()
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-wiwo', 'data-wiwo-ready', 'data-wiwo-busy', 'data-state', 'class', 'hidden', 'style'] })
    const timer = setInterval(schedule, 500)
    window.addEventListener('resize', schedule)
    document.addEventListener('scroll', schedule, true)
    window.visualViewport?.addEventListener('resize', schedule)
    return () => {
      observer.disconnect(); clearInterval(timer); cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedule); document.removeEventListener('scroll', schedule, true)
      window.visualViewport?.removeEventListener('resize', schedule)
    }
  }, [step, paused])
  return position
}
