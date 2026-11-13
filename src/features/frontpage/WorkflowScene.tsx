import { useEffect, useRef, useState } from 'react'
import { ArrowDown, Check, FileSpreadsheet, MessageSquare, RotateCcw } from 'lucide-react'
import { QuotationPreview } from './QuotationPreview'
import { SAMPLE, STAGES } from './sample'
import type { createQuotationScene } from './QuotationScene'

export function WorkflowScene() {
  const [stage, setStage] = useState(1), [ready, setReady] = useState(false), [motion, setMotion] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  const host = useRef<HTMLDivElement>(null)
  const scene = useRef<ReturnType<typeof createQuotationScene>>(undefined)
  const latestStage = useRef(stage)
  useEffect(() => { latestStage.current = stage; scene.current?.setStage(stage) }, [stage])
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const media = matchMedia('(prefers-reduced-motion: reduce)')
    let cancelled = false, generation = 0, cleanup: (() => void) | undefined
    const stop = () => { generation += 1; cleanup?.(); cleanup = undefined; scene.current = undefined; setReady(false) }
    const start = async () => {
      if (!motion || media.matches) return
      const token = ++generation
      try {
        const { createQuotationScene: create } = await import('./QuotationScene')
        await document.fonts.ready
        if (cancelled || token !== generation || !host.current || media.matches) return
        const instance = create(host.current, latestStage.current, () => { stop(); setUnavailable(true) })
        scene.current = instance; cleanup = instance.dispose; setReady(true)
      } catch { if (!cancelled) { stop(); setUnavailable(true) } }
    }
    const preference = () => { setReduced(media.matches); stop(); if (!media.matches) void start() }
    media.addEventListener('change', preference); void start()
    return () => { cancelled = true; media.removeEventListener('change', preference); cleanup?.(); scene.current = undefined }
  }, [motion])
  return <div className="front-workflow" aria-label="Interactive workflow example">
    <div className="front-scene-stage">
      <div className="front-grid" aria-hidden="true" />
      <div className="front-message"><div><MessageSquare size={17} aria-hidden="true" /><span>A customer’s request</span></div><p>{SAMPLE.message}</p><span className="front-message-note">Illustrative message</span></div>
      <ArrowDown className="front-flow-arrow" aria-hidden="true" />
      <div className="front-webgl" ref={host} data-ready={ready} aria-hidden="true" />
      <div className={ready && motion && !reduced ? 'sr-only' : 'front-static-sheet'}><QuotationPreview blank={stage === 0} /></div>
      <div className="front-file-label"><FileSpreadsheet size={18} aria-hidden="true" /><span>{stage === 0 ? 'Your Excel template' : stage === 1 ? 'Review before you generate' : 'An editable .xlsx file'}</span><Check size={15} aria-hidden="true" /></div>
      <button className="front-motion" type="button" aria-pressed={ready && motion && !reduced} disabled={reduced || unavailable} title={reduced ? 'Reduced motion is on. The example remains interactive.' : unavailable ? '3D is unavailable in this browser. The example remains interactive.' : undefined} onClick={() => { setReady(false); setMotion(!motion) }}><RotateCcw size={14} aria-hidden="true" />{reduced || unavailable ? 'Static preview' : motion ? 'Use static view' : 'Enable 3D view'}</button>
    </div>
    <div className="front-stage-buttons" role="group" aria-label="Explore the quotation workflow">
      {STAGES.map((item, index) => <button type="button" key={item.title} aria-pressed={stage === index} onClick={() => setStage(index)}><span aria-hidden="true">{index + 1}</span>{['Request', 'Review', 'Excel'][index]}</button>)}
    </div>
    <div className="front-stage-copy" aria-live="polite" aria-atomic="true"><strong>{STAGES[stage].title}</strong><p>{STAGES[stage].description}</p></div>
  </div>
}
