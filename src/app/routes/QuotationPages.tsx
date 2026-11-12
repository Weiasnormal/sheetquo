import { wiwoSuccess } from '../../features/wiwo/events'
import { useLiveQuery } from 'dexie-react-hooks'
import { FileQuestion, Link2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Select } from '../../components/forms/Field'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import type { BusinessRecord } from '../../domain/business/businessForm'
import type { TemplateSummary } from '../../domain/template/records'
import { blankDraft, draftFromText, readyTemplates } from '../../features/quotations/draftSetup'
import { PastePanel } from '../../features/quotations/PastePanel'
import { QuotationSteps } from '../../features/quotations/QuotationSteps'
import { QuotationWorkspace } from '../../features/quotations/QuotationWorkspace'
import { createQuotation, readQuotation } from '../../infrastructure/storage/quotationRepository'
import { chooseBusinessTemplate } from '../../infrastructure/storage/businessRepository'
import { useWorkspace } from '../useWorkspace'

export function NewQuotationPage() {
  const { business, activeTemplates } = useWorkspace()
  const [template] = activeTemplates
  const ready = readyTemplates(activeTemplates)
  const templatesLink = (
    <Button asChild variant="secondary">
      <Link to="/templates">Templates</Link>
    </Button>
  )

  return (
    <>
      <PageHeader title="New quotation" description="Paste the customer's request, check the details, and download Excel." />
      <QuotationSteps current={0} />
      {business && ready.length > 0 ? (
        <StartQuotation key={business.id} business={business} ready={ready} />
      ) : business && template ? (
        <EmptyState
          icon={Link2}
          title="Map and test your template first"
          action={
            <Button asChild variant="secondary">
              <Link to={`/templates/${template.template.id}/map`}>Open {template.template.name}</Link>
            </Button>
          }
        >
          {template.template.name} is uploaded. It needs mapping and a test before it can fill quotations.
        </EmptyState>
      ) : business ? (
        <EmptyState icon={Link2} title="Upload a template first" action={templatesLink}>
          {business.displayName} is ready. A quotation also needs a template for its layout.
        </EmptyState>
      ) : (
        <EmptyState
          icon={Link2}
          title="Add a business and a template first"
          action={
            <>
              <Button asChild variant="secondary">
                <Link to="/businesses/new">Add business</Link>
              </Button>
              {templatesLink}
            </>
          }
        >
          A quotation needs a business for its details and a template for its layout.
        </EmptyState>
      )}
    </>
  )
}

/** Nothing is saved until the owner extracts or chooses to type the items, so an abandoned paste leaves no draft. */
function StartQuotation({ business, ready }: { business: BusinessRecord; ready: TemplateSummary[] }) {
  const navigate = useNavigate()
  const preferred = ready.find(({ template }) => template.id === business.lastTemplateId) ?? ready.find(({ template }) => template.id === business.defaultTemplateId) ?? ready[0]
  const [templateId, setTemplateId] = useState(preferred.template.id)
  const [text, setText] = useState('')
  const [starting, setStarting] = useState(false)
  const summary = ready.find(({ template }) => template.id === templateId) ?? preferred

  useEffect(() => {
    if (!text.trim()) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [text])

  async function start(fromText: boolean) {
    setStarting(true)
    const created = await createQuotation(fromText ? draftFromText(text, business, summary) : blankDraft(business, summary))
    setStarting(false)
    if (!created.ok) return toast.error(created.error.message)
    wiwoSuccess('quote-created')
    navigate(`/quotation/${created.value.id}?step=review`)
  }

  return (
    <div data-wiwo="quote-start" data-wiwo-busy={starting} className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      {ready.length > 1 && (
        <label className="flex flex-col gap-2 text-sm font-medium sm:max-w-sm">
          Template
          <Select value={templateId} onChange={async (event) => {
            const id = event.target.value
            setTemplateId(id)
            const saved = await chooseBusinessTemplate(business.id, id, 'last')
            if (!saved.ok) toast.error(saved.error.message)
          }}>
            {ready.map(({ template, active }) => (
              <option key={template.id} value={template.id}>
                {template.name}, version {active?.version}
              </option>
            ))}
          </Select>
        </label>
      )}
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
        Fills {summary.template.name}, version {summary.active?.version}, for {business.displayName}.
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
