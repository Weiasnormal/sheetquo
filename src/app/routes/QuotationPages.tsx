import { wiwoSuccess } from '../../features/wiwo/events'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileQuestion, Link2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Select } from '../../components/forms/Field'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import type { BusinessRecord } from '../../domain/business/businessForm'
import type { TemplateSummary } from '../../domain/template/records'
import { blankDraft, draftFromText } from '../../features/quotations/draftSetup'
import { PastePanel } from '../../features/quotations/PastePanel'
import { QuotationSteps } from '../../features/quotations/QuotationSteps'
import { QuotationWorkspace } from '../../features/quotations/QuotationWorkspace'
import { createQuotation, readQuotation } from '../../infrastructure/storage/quotationRepository'
import { BUSINESS_LAYOUT } from '../../domain/quotation/letterhead'
import { useWorkspace } from '../useWorkspace'

export function NewQuotationPage() {
  const { business, activeTemplates } = useWorkspace()
  return (
    <>
      <PageHeader title="New quotation" description="Paste the customer's request, check the details, and download Excel." />
      <QuotationSteps current={0} />
      {business ? (
        <StartQuotation key={business.id} business={business} ready={activeTemplates} />
      ) : (
        <EmptyState
          icon={Link2}
          title="Add your business first"
          action={
            <>
              <Button asChild variant="secondary">
                <Link to="/businesses/new">Add business</Link>
              </Button>
            </>
          }
        >
          Your business supplies the letterhead. You can start quoting as soon as it is saved.
        </EmptyState>
      )}
    </>
  )
}

/** Nothing is saved until the owner extracts or chooses to type the items, so an abandoned paste leaves no draft. */
function StartQuotation({ business, ready }: { business: BusinessRecord; ready: TemplateSummary[] }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const selectedDesign = ready.find(s => s.template.id === params.get('design'))
  const defaultDesign = ready.find(s => s.template.id === business.defaultTemplateId) ?? ready[0]
  const [choice, setChoice] = useState(() => {
    if (selectedDesign) return selectedDesign.template.id
    let remembered = ''
    try { remembered = localStorage.getItem('quotation-layout:' + business.id) ?? '' } catch { /* storage optional */ }
    const valid = remembered === BUSINESS_LAYOUT || ready.some(s => remembered === s.template.id || (s.active && remembered === 'fixed:' + s.template.id))
    return valid ? remembered : defaultDesign?.template.id ?? BUSINESS_LAYOUT
  })
  const [useTemplateLogo, setUseTemplateLogo] = useState(false)
  const adaptive = !choice.startsWith('fixed:')
  const [text, setText] = useState('')
  const [starting, setStarting] = useState(false)
  const summary = ready.find(({ template }) => template.id === choice.replace(/^fixed:/, ''))

  useEffect(() => {
    if (!text.trim()) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [text])

  async function start(fromText: boolean) {
    setStarting(true)
    const draft = fromText ? draftFromText(text, business, summary, adaptive) : blankDraft(business, summary, adaptive)
    if (draft.letterhead) draft.letterhead.useTemplateLogo = Boolean(summary && useTemplateLogo)
    const created = await createQuotation(draft)
    setStarting(false)
    if (!created.ok) return toast.error(created.error.message)
    try { localStorage.setItem('quotation-layout:' + business.id, choice) } catch { /* optional preference */ }
    wiwoSuccess('quote-created')
    navigate(`/quotation/${created.value.id}?step=review`)
  }

  return (
    <div data-wiwo="quote-start" data-wiwo-busy={starting} className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {ready.length > 0 && <label className="flex flex-col gap-2 text-sm font-medium sm:max-w-md">
        Quotation layout
        <Select value={choice} onChange={event => {
          setChoice(event.target.value)
          setUseTemplateLogo(false)
          try { localStorage.setItem('quotation-layout:' + business.id, event.target.value) } catch { /* preference is optional */ }
        }}>
          <option value={BUSINESS_LAYOUT}>Business letterhead · adaptive</option>
          {ready.map(s => <option key={s.template.id} value={s.template.id}>{s.template.name} · adaptive</option>)}
          {ready.filter(s => s.active).map(s => <option key={s.template.id} value={'fixed:' + s.template.id}>{s.template.name} · fixed Excel form</option>)}
        </Select>
      </label>}
      {adaptive && summary && <label><input type="checkbox" checked={useTemplateLogo} onChange={e => setUseTemplateLogo(e.target.checked)} /> Prefer the imported header image if available</label>}
      <PastePanel
        value={text}
        onChange={setText}
        actions={
          <>
            <Button disabled={!text.trim() || starting} onClick={() => void start(true)}>
              Extract details
            </Button>
            <Button variant="secondary" disabled={starting} onClick={() => void start(false)}>
              Type the items instead
            </Button>
          </>
        }
      />
      <p className="px-1 text-xs text-muted">
        {adaptive ? 'Your business letterhead, with rows for the items and adjustments you include.' : 'Uses the mapped cells of your fixed Excel form.'} <Link to="/templates/import" className="underline">Import an optional design</Link>
      </p>
    </div>
  )
}

export function QuotationPage() {
  const { id = '' } = useParams()
  const stored = useLiveQuery(() => readQuotation(id).then((record) => record ?? null).catch(() => null), [id], 'loading' as const)

  if (stored === 'loading') return <PageHeader title="Quotation" />
  if (stored) return <QuotationWorkspace key={stored.id} initial={stored} />

  return (
    <>
      <PageHeader title="Quotation not found" />
      <EmptyState
        icon={FileQuestion}
        title="This quotation is not in this browser"
        action={
          <Button asChild variant="secondary">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        }
      >
        Nothing is saved under “{id}”. Quotations stay on the device and browser that made them.
      </EmptyState>
    </>
  )
}
