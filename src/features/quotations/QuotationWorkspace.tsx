import { wiwoSuccess } from '../wiwo/events'
import { Building2, Copy, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useBlocker, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { useWorkspace } from '../../app/useWorkspace'
import { Select } from '../../components/forms/Field'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Panel, PanelTitle } from '../../components/ui/Panel'
import type { BusinessRecord } from '../../domain/business/businessForm'
import { computeTotals } from '../../domain/calculations/money'
import { applyLineChoice } from '../../domain/parser/review'
import type { QuotationRecord } from '../../domain/quotation/records'
import { quotationTitle } from '../../domain/quotation/records'
import type { TemplateSummary } from '../../domain/template/records'
import { selectBusiness } from '../../infrastructure/storage/businessRepository'
import { deleteQuotation, duplicateQuotation } from '../../infrastructure/storage/quotationRepository'
import { AdjustmentsEditor } from './AdjustmentsEditor'
import { DetailsSection } from './DetailsForm'
import { draftTemplate, extractInto, mappedFields, readyTemplates } from './draftSetup'
import { GeneratePanel } from './GeneratePanel'
import { ItemsEditor } from './ItemsEditor'
import { PastePanel } from './PastePanel'
import { QuotationSteps } from './QuotationSteps'
import { QuoteSummary } from './QuoteSummary'
import { SourceLines } from './SourceLines'
import { useDraftAutosave } from './useDraftAutosave'
import type { SaveState } from './useDraftAutosave'
import { workspaceIssues } from './workspaceIssues'
import type { WorkspaceIssue } from './workspaceIssues'

const STEPS = ['paste', 'review', 'generate'] as const
type Step = (typeof STEPS)[number]

const SAVE_TEXT: Record<SaveState['state'], string> = {
  idle: 'Draft saved in this browser',
  saving: 'Saving…',
  saved: 'All changes saved',
  failed: 'Not saved',
}

/** Shows a draft only to the business it belongs to, so switching never mixes two businesses' customers. */
export function QuotationWorkspace({ initial }: { initial: QuotationRecord }) {
  const { status, business, activeBusinesses, templates } = useWorkspace()
  if (status !== 'ready') return <PageHeader title={quotationTitle(initial)} />

  if (!business || business.id !== initial.businessId) {
    const owner = activeBusinesses.find(({ id }) => id === initial.businessId)
    return (
      <>
        <PageHeader title={quotationTitle(initial)} />
        <EmptyState
          icon={Building2}
          title={owner ? `This quotation belongs to ${owner.displayName}` : 'This quotation belongs to an archived business'}
          action={
            owner ? (
              <Button variant="secondary" onClick={() => void selectBusiness(owner.id)}>
                Switch to {owner.displayName}
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <Link to="/businesses">Businesses</Link>
              </Button>
            )
          }
        >
          {owner ? 'Switch to that business to open it.' : 'Restore that business to open it.'}
        </EmptyState>
      </>
    )
  }

  return <Editor initial={initial} business={business} templates={templates} />
}

function Editor({ initial, business, templates }: { initial: QuotationRecord; business: BusinessRecord; templates: TemplateSummary[] }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { record, save, change, absorb, flush } = useDraftAutosave(initial)
  const [confirm, setConfirm] = useState<'delete' | 'extract' | null>(null)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => save.state === 'failed' && currentLocation.pathname !== nextLocation.pathname)

  const requested = params.get('step')
  const step: Step = STEPS.includes(requested as Step) ? (requested as Step) : 'review'
  const href = (next: Step) => `?step=${next}`

  const { summary, version, newerActive } = draftTemplate(record, templates)
  const ready = readyTemplates(templates.filter(({ template }) => !template.archivedAt))
  const templateLabel = summary && version ? `${summary.template.name}, version ${version.version}` : 'No template'
  const totals = computeTotals(record)
  const issues = workspaceIssues(record, version)
  const errorCount = issues.filter(({ severity }) => severity === 'error').length
  const mapped = mappedFields(version)
  const patch = (fields: Partial<QuotationRecord>) => change((current) => ({ ...current, ...fields }))

  function focusIssue({ target }: WorkspaceIssue) {
    if (!target) return
    const control = document.querySelector<HTMLElement>(target)
    control?.focus()
    control?.scrollIntoView({ block: 'center' })
  }

  async function extract() {
    change((current) => extractInto(current, current.rawInput ?? ''))
    if (!(await flush())) return toast.error('The extracted details could not be saved. Keep this page open and retry saving.')
    wiwoSuccess('quote-created')
    navigate(href('review'))
  }

  async function duplicate() {
    if (!(await flush())) return toast.error('Save the draft before making a copy')
    const copy = await duplicateQuotation(record.id)
    if (!copy.ok) return toast.error(copy.error.message)
    toast.success('Copy made', { description: 'The quotation number was cleared so the two never share one.' })
    navigate(`/quotation/${copy.value.id}?step=review`)
  }

  async function remove() {
    const removed = await deleteQuotation(record.id)
    if (!removed.ok) return toast.error(removed.error.message)
    toast.success('Quotation deleted', { description: quotationTitle(record) })
    navigate('/dashboard')
  }

  const hasContent = record.items.length > 0 || record.adjustments.length > 0
  const sharedProps = { quotation: record, mapped, issues, onChange: patch }

  return (
    <>
      <PageHeader
        title={quotationTitle(record)}
        description={
          <>
            {business.displayName} ·{' '}
            <span data-wiwo-record={`/quotation/${record.id}`} data-wiwo-version={record.templateVersionId} data-wiwo="quote-save" data-wiwo-busy={save.state === 'saving'} data-wiwo-ready={save.state === 'saved' || save.state === 'idle' ? `quote-saved ${errorCount === 0 ? 'quote-ready' : ''}` : undefined} role="status" className={save.state === 'failed' ? 'text-danger' : undefined}>
              {save.state === 'failed' ? `${SAVE_TEXT.failed}. ${save.message ?? ''}` : SAVE_TEXT[save.state]}
            </span>
          </>
        }
        actions={
          <div data-wiwo="quote-actions" className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void duplicate()}>
              <Copy strokeWidth={1.75} aria-hidden="true" />
              Duplicate
            </Button>
            <Button variant="danger" onClick={() => setConfirm('delete')}>
              <Trash2 strokeWidth={1.75} aria-hidden="true" />
              Delete
            </Button>
          </div>
        }
      />

      <QuotationSteps
        current={STEPS.indexOf(step)}
        links={[
          { to: href('paste'), note: record.rawInput ? 'Message kept' : 'Optional' },
          { to: href('review'), note: errorCount > 0 ? `${errorCount} to fix` : 'Ready' },
          { to: href('generate'), note: record.generatedAt ? 'Downloaded' : 'Not yet' },
        ]}
      />
      {save.state === 'failed' && <div className="mb-4 flex flex-wrap items-center gap-3 rounded-button border border-line p-3">
        <p>Your changes are still on this page. Keep it open while you free up storage.</p>
        <Button data-wiwo="save-failed" variant="secondary" onClick={() => void flush()}>Retry saving</Button>
      </div>}

      {step === 'paste' && (
        <div className="mx-auto w-full max-w-3xl">
          <PastePanel
            value={record.rawInput ?? ''}
            onChange={(text) => patch({ rawInput: text || undefined })}
            actions={
              <>
                <Button disabled={!record.rawInput?.trim()} onClick={() => (hasContent ? setConfirm('extract') : extract())}>
                  Extract details
                </Button>
                <Button asChild variant="secondary">
                  <Link to={href('review')}>Go to review</Link>
                </Button>
              </>
            }
          />
        </div>
      )}

      {step === 'review' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            {(newerActive || ready.length > 1 || !version) && (
              <Panel aria-labelledby="template-title" className="flex flex-col gap-3 p-5">
                <PanelTitle id="template-title">Template</PanelTitle>
                {ready.length > 0 && (
                  <label className="flex flex-col gap-2 text-sm font-medium sm:max-w-sm">
                    Layout for this quotation
                    <Select
                      value={summary?.active ? record.templateId : ''}
                      onChange={(event) => {
                        const chosen = ready.find(({ template }) => template.id === event.target.value)
                        if (chosen?.active) patch({ templateId: chosen.template.id, templateVersionId: chosen.active.id })
                      }}
                    >
                      {!summary?.active && <option value="">Choose a template</option>}
                      {ready.map(({ template, active }) => (
                        <option key={template.id} value={template.id}>
                          {template.name}, version {active?.version}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
                {newerActive && version && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-button bg-notice-tint p-3 text-notice">
                    <p>
                      Version {newerActive.version} is now active. This draft still uses version {version.version}.
                    </p>
                    <Button variant="secondary" onClick={() => patch({ templateVersionId: newerActive.id })}>
                      Use version {newerActive.version}
                    </Button>
                  </div>
                )}
              </Panel>
            )}

            {record.parse && record.parse.lines.length > 0 && (
              <SourceLines
                quotation={record}
                lines={record.parse.lines}
                answered={record.answeredLines}
                onChoose={(line, choice) =>
                  change((current) => ({
                    ...applyLineChoice(current, line, choice),
                    answeredLines: [...new Set([...(current.answeredLines ?? []), line.number])],
                  }))
                }
              />
            )}
            <DetailsSection section="customer" {...sharedProps} />
            <ItemsEditor
              items={record.items}
              issues={issues}
              onChange={(update) => change((current) => ({ ...current, items: update(current.items) }))}
            />
            <AdjustmentsEditor
              currency={business.currency}
              adjustments={record.adjustments}
              totals={totals.adjustments}
              issues={issues}
              onChange={(update) => change((current) => ({ ...current, adjustments: update(current.adjustments) }))}
            />
            <DetailsSection section="vehicle" {...sharedProps} />
            <DetailsSection section="closing" {...sharedProps} />
          </div>

          <div className="xl:sticky xl:top-6">
            <QuoteSummary
              quotation={record}
              totals={totals}
              currency={business.currency}
              templateLabel={templateLabel}
              issues={issues}
              onFocus={focusIssue}
              action={
                <Button asChild>
                  <Link to={href('generate')}>Continue to generate</Link>
                </Button>
              }
            />
          </div>
        </div>
      )}

      {step === 'generate' && (
        <GeneratePanel
          record={record}
          business={business}
          version={version}
          templateLabel={templateLabel}
          grandTotalMinor={totals.grandTotalMinor}
          issues={issues}
          reviewHref={href('review')}
          flush={flush}
          onGenerated={absorb}
        />
      )}

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => { if (!open && blocker.state === 'blocked') blocker.reset() }}
        title="Leave with unsaved changes?"
        description="Saving failed. Leaving this page can lose your latest changes. Stay here and retry saving after freeing up storage."
        confirmLabel="Leave page"
        cancelLabel="Stay here"
        onConfirm={() => { if (blocker.state === 'blocked') blocker.proceed() }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Delete this quotation?"
        description="The draft is removed from this browser. Excel files you already downloaded are not affected."
        confirmLabel="Delete quotation"
        onConfirm={() => void remove()}
      />
      <ConfirmDialog
        open={confirm === 'extract'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Replace the items with this message?"
        description="The items and adjustments are read again from the message, and any field it mentions is replaced. Fields it does not mention stay as they are."
        confirmLabel="Replace items"
        onConfirm={extract}
      />
    </>
  )
}
