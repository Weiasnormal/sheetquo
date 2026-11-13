import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useWorkspace } from '../../app/useWorkspace'
import { CHAPTERS, chapterById, matchesRoute } from './catalog'
import type { ChapterId } from './catalog'
import { chapterProgress, emptyProgress, readProgress, writeProgress } from './progress'
import type { Progress } from './progress'
import { WiwoContext } from './context'
import type { WiwoRun } from './context'
import type { LessonStep } from './lessons'
import { inViewport, isReady, openDialog, targetFor } from './dom'
import { WiwoToggle } from './WiwoToggle'
import './wiwo.css'

const WiwoCoach = lazy(() => import('./WiwoCoach').catch(() => ({ default: () => <div className="wiwo-loading" role="alert">Wiwo could not load. Close it with the cursor; save your work before reloading the app.</div> })))
const recordOn = (path: string) => path.match(/^\/(?:quotation|templates)\/(?!new(?:$|\/)|import(?:$|\/))([^/]+)/)?.[0]

const boundRecord = (id: ChapterId, path: string) => ['map', 'test', 'review', 'generate', 'import', 'start'].includes(chapterById(id).route) ? recordOn(path) : undefined
const versionOnPage = (record?: string) => [...document.querySelectorAll('[data-wiwo-version]')].find((node) => !record || node.getAttribute('data-wiwo-record') === record)?.getAttribute('data-wiwo-version') ?? undefined

export function WiwoProvider({ children }: { children: ReactNode }) {
  const workspace = useWorkspace()
  const location = useLocation(), navigate = useNavigate()
  const [initial] = useState(readProgress)
  const [progress, setProgress] = useState(initial.progress)
  const progressRef = useRef(initial.progress)
  const [persistent, setPersistent] = useState(initial.persistent)
  const [run, setRun] = useState<WiwoRun>()
  const [lessons, setLessons] = useState<Record<ChapterId, LessonStep[]>>()
  const [loadError, setLoadError] = useState<string>()
  const [pageVersion, setPageVersion] = useState<string>()
  const [offer, setOffer] = useState<ChapterId>()
  const request = useRef(0), lastInput = useRef(0), contextTarget = useRef<HTMLElement | null>(null)
  const candidates = CHAPTERS.filter((chapter) => matchesRoute(chapter, location.pathname, location.search))
  const current = candidates.find(({ id }) => !progress.chapters[id] && id !== 'recovery')?.id ?? candidates[0]?.id ?? 'recovery'

  const update = useCallback((change: (value: Progress) => Progress) => {
    const next = change(progressRef.current)
    progressRef.current = next
    setProgress(next)
    setPersistent(writeProgress(next))
  }, [])
  const mark = useCallback((id: ChapterId, status: 'introduced' | 'dismissed') => {
    update((value) => ({ ...value, chapters: { ...value.chapters, [id]: { ...chapterProgress(value, id), status } } }))
  }, [update])

  const cancel = useCallback(() => {
    request.current += 1
    lastInput.current = Date.now() + 28_200
    if (run && !run.finished) mark(run.chapter, 'dismissed')
    setRun(undefined); setLoadError(undefined); setOffer(undefined)
    requestAnimationFrame(() => {
      if (!openDialog()) targetFor(['wiwo-toggle'])?.focus({ preventScroll: true })
    })
  }, [run, mark])

  function destination(id: ChapterId): string {
    const chapter = chapterById(id)
    const template = workspace.activeTemplates.find(({ template }) => location.pathname.startsWith(`/templates/${template.id}/`)) ?? workspace.activeTemplates[0]
    const quotePath = /^\/quotation\/(?!new$)[^/]+$/.test(location.pathname) ? location.pathname : undefined
    switch (chapter.route) {
      case 'home': return '/dashboard'
      case 'business': return '/businesses'
      case 'import': return workspace.business ? '/templates/import' : '/businesses'
      case 'map': return template ? `/templates/${template.template.id}/map` : '/templates'
      case 'test': return template ? `/templates/${template.template.id}/test` : '/templates'
      case 'templates': return '/templates'
      case 'start': return '/quotation/new'
      case 'review': return quotePath ? `${quotePath}?step=review` : '/quotations'
      case 'generate': return quotePath ? `${quotePath}?step=generate` : '/quotations'
      case 'history': return '/quotations'
      case 'settings': return '/settings'
      default: return location.pathname + location.search
    }
  }

  function start(id: ChapterId, replay = false, go = false) {
    const token = ++request.current
    const previous = progressRef.current.chapters[id]
    const index = replay || previous?.status === 'completed' ? 0 : previous?.resume ?? 0
    setOffer(undefined); setLoadError(undefined); setPageVersion(versionOnPage())
    setRun({ chapter: id, index, owner: workspace.business?.id, record: matchesRoute(chapterById(id), location.pathname, location.search) ? boundRecord(id, location.pathname) : undefined, version: boundRecord(id, location.pathname) ? workspace.templates.find(({ template }) => location.pathname.startsWith(`/templates/${template.id}/`))?.version.id ?? versionOnPage(boundRecord(id, location.pathname)) : undefined, observed: [], finished: false })
    mark(id, 'introduced')
    void import('./lessons').then(({ LESSONS }) => {
      if (request.current !== token) return
      setLessons(LESSONS)
      setRun((active) => active ? { ...active, index: Math.min(active.index, LESSONS[id].length - 1) } : undefined)
    }).catch(() => { if (request.current === token) setLoadError('Wiwo could not load. Close it and retry when the app assets are available.') })
    if (go && !matchesRoute(chapterById(id), location.pathname, location.search)) navigate(destination(id))
  }

  const advance = useCallback((active: WiwoRun, skip: boolean) => {
    const steps = lessons?.[active.chapter], step = steps?.[active.index]
    if (!step || !steps) return
    const finished = active.index + 1 >= steps.length
    update((value) => {
      const previous = chapterProgress(value, active.chapter)
      const completed = skip ? previous.completed : [...new Set([...previous.completed, step.id])]
      const skipped = skip ? [...new Set([...previous.skipped, step.id])] : previous.skipped.filter((id) => id !== step.id)
      const status = finished && steps.every(({ id }) => completed.includes(id)) ? 'completed' : 'introduced'
      return { ...value, chapters: { ...value.chapters, [active.chapter]: { ...previous, status, completed, skipped, resume: finished ? 0 : active.index + 1 } } }
    })
    setRun({ ...active, index: finished ? active.index : active.index + 1, finished })
  }, [lessons, update])

  const paused = Boolean(run && !run.finished && (
    (run.owner && run.owner !== workspace.business?.id) || (run.record && run.record !== recordOn(location.pathname)) || (run.version && pageVersion && run.version !== pageVersion) || !matchesRoute(chapterById(run.chapter), location.pathname, location.search)
  ))

  function next(skip = false) {
    if (!run || run.finished || paused || openDialog() || (run.version && versionOnPage(run.record) && run.version !== versionOnPage(run.record))) return
    const step = lessons?.[run.chapter][run.index]
    if (!step) return
    if (!skip && (step.event || step.ready) && !run.observed.includes(step.event ?? '') && !isReady(step.ready)) return
    advance(run, skip)
  }
  function back() {
    if (run && !run.finished) setRun({ ...run, index: Math.max(0, run.index - 1) })
  }

  useEffect(() => {
    if (!run || run.finished) return
    const sync = () => {
      const record = boundRecord(run.chapter, location.pathname)
      const version = versionOnPage(record)
      setPageVersion(version)
      if (record && matchesRoute(chapterById(run.chapter), location.pathname, location.search)) {
        setRun((active) => active && (!active.record || (active.record === record && !active.version && version)) ? { ...active, record, version } : active)
      }
    }
    const frame = requestAnimationFrame(sync)
    const observer = new MutationObserver(sync)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-wiwo-version'] })
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
  }, [run, location.pathname, location.search])

  useEffect(() => {
    const success = (event: Event) => {
      if (!run || run.finished || paused) return
      const name = (event as CustomEvent<string>).detail
      const active = { ...run, observed: [...new Set([...run.observed, name])] }
      if (lessons?.[run.chapter][run.index]?.event === name) advance(active, false)
      else setRun(active)
    }
    window.addEventListener('sheetquo:wiwo-success', success)
    return () => window.removeEventListener('sheetquo:wiwo-success', success)
  }, [run, paused, lessons, advance])

  useEffect(() => {
    const activity = (event: Event) => {
      if ((event.target as Element)?.closest?.('[data-wiwo-ui]')) return
      lastInput.current = Date.now()
      if (event.target instanceof HTMLElement) contextTarget.current = event.target
    }
    for (const event of ['input', 'pointerdown', 'keydown', 'focusin']) document.addEventListener(event, activity, true)
    return () => { for (const event of ['input', 'pointerdown', 'keydown', 'focusin']) document.removeEventListener(event, activity, true) }
  }, [])

  useEffect(() => {
    if (!run) return
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel() }
    }
    document.addEventListener('keydown', escape, true)
    return () => document.removeEventListener('keydown', escape, true)
  }, [run, cancel])

  useEffect(() => {
    if (run || offer || workspace.status !== 'ready' || location.pathname === '/') return
    const timer = window.setInterval(() => {
      if (document.hidden || !document.hasFocus() || Date.now() - lastInput.current < 1800 || openDialog() || document.querySelector('[data-wiwo-busy="true"]')) return
      if (document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')) return
      const chapter = CHAPTERS.find((candidate) => matchesRoute(candidate, location.pathname, location.search) && !progressRef.current.chapters[candidate.id] && candidate.anchors.some((anchor) => inViewport(targetFor([anchor]))))
      if (chapter) { mark(chapter.id, 'introduced'); setOffer(chapter.id) }
    }, 2200)
    return () => window.clearInterval(timer)
  }, [run, offer, workspace.status, location.pathname, location.search, mark])

  useEffect(() => {
    const timer = setTimeout(() => setOffer(undefined), 0)
    return () => clearTimeout(timer)
  }, [location.pathname, location.search, workspace.business?.id])

  function toggle() {
    if (!run && location.pathname === '/') { start('welcome', true, true); return }
    if (run) { cancel(); return }
    const relevant = candidates.find((chapter) => chapter.anchors.some((key) => {
      const anchor = targetFor([key]); return anchor && contextTarget.current && anchor.contains(contextTarget.current)
    }))
    start(offer ?? relevant?.id ?? current)
  }
  function dismissOffer() { lastInput.current = Date.now() + 28_200; if (offer) mark(offer, 'dismissed'); setOffer(undefined) }
  function reset() { request.current += 1; setRun(undefined); setOffer(undefined); update(() => emptyProgress()) }

  return <WiwoContext.Provider value={{ progress, persistent, run, lessons, loadError, offer, start, toggle, cancel, next, back,
    dismissOffer, reset, setAnimation: (animation) => update((value) => ({ ...value, animation })), paused, current }}>
    {children}
    <WiwoToggle />
    {run && <Suspense fallback={<div className="wiwo-loading" role="status">Loading Wiwo… Click the cursor to cancel.</div>}><WiwoCoach /></Suspense>}
  </WiwoContext.Provider>
}
