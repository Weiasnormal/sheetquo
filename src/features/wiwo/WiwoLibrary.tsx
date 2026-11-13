import { useState } from 'react'
import { CHAPTERS } from './catalog'
import { useWiwo } from './context'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Button } from '../../components/ui/Button'

export function WiwoLibrary() {
  const wiwo = useWiwo()
  if (!wiwo) return null
  return <section className="mb-6" aria-labelledby="wiwo-library-title">
    <h2 id="wiwo-library-title" className="text-lg font-semibold">Learn with Wiwo</h2>
    <p className="mt-1 max-w-2xl text-muted">Use the cursor at the top for this screen, or choose a chapter. Wiwo points things out; you make the changes. Click the cursor again to cancel.</p>
    <ol className="mt-4 divide-y divide-rule border-y border-line">
      {CHAPTERS.map(({ id, title, description }, index) => <li key={id} className="flex flex-wrap items-center gap-3 py-3">
        <span className="w-6 text-sm tabular-nums text-muted" aria-hidden="true">{index + 1}</span>
        <div className="min-w-0 flex-1 basis-48"><h3 className="font-medium">{title}</h3><p className="text-sm text-muted">{description}</p></div>
        <span className="text-xs text-muted">{wiwo.progress.chapters[id]?.status === 'completed' ? 'Completed' : wiwo.progress.chapters[id]?.status === 'dismissed' ? 'Dismissed · replay anytime' : wiwo.progress.chapters[id] ? 'Started' : 'Not started'}</span>
        <Button variant="secondary" aria-label={`Start Wiwo: ${title}`} onClick={() => wiwo.start(id, true, true)}>Start chapter</Button>
      </li>)}
    </ol>
  </section>
}

export function WiwoSettings() {
  const wiwo = useWiwo()
  const [confirm, setConfirm] = useState(false)
  if (!wiwo) return null
  return <div className="flex flex-col items-start gap-3">
    <p>Wiwo remembers introduced, completed and skipped steps in this browser profile. People sharing it share progress. Your quotations and business backups stay separate.</p>
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={wiwo.progress.animation} onChange={(event) => wiwo.setAnimation(event.target.checked)} />Animate Wiwo while idle</label>
    <p className="text-sm text-muted">Reduced-motion preferences always disable cursor animation.</p>
    {!wiwo.persistent && <p role="status">Tutorial progress cannot be saved in this browser. Guidance still works for this visit.</p>}
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => wiwo.start(wiwo.current, true)}>Replay this screen</Button>
      <Button variant="secondary" onClick={() => setConfirm(true)}>Reset Wiwo progress</Button>
    </div>
    <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Reset Wiwo learning?" description="This only resets tutorial progress and Wiwo preferences in this browser. Businesses, templates and quotations are not changed."
      confirmLabel="Reset tutorial progress" onConfirm={wiwo.reset} />
  </div>
}
