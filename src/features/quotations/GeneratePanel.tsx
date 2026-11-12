import { wiwoSuccess } from '../wiwo/events'
import { Download, FileSpreadsheet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '../../components/ui/Button'
import { Panel, PanelTitle } from '../../components/ui/Panel'
import { formatMoney } from '../../domain/calculations/money'
import type { BusinessRecord } from '../../domain/business/businessForm'
import { quotationFilename } from '../../domain/quotation/filename'
import type { QuotationRecord } from '../../domain/quotation/records'
import type { TemplateVersionRecord } from '../../domain/template/records'
import { recordGenerated } from '../../infrastructure/storage/quotationRepository'
import { generateQuotation } from './generateQuotation'
import { IssueList } from './QuoteSummary'
import type { WorkspaceIssue } from './workspaceIssues'

type GeneratePanelProps = {
  record: QuotationRecord
  business: BusinessRecord
  version: TemplateVersionRecord | undefined
  templateLabel: string
  grandTotalMinor: number
  issues: WorkspaceIssue[]
  reviewHref: string
  flush: () => Promise<boolean>
  onGenerated: (patch: Pick<QuotationRecord, 'generatedAt' | 'generatedFilename' | 'updatedAt'>) => void
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  )
}

export function GeneratePanel(props: GeneratePanelProps) {
  const { record, business, version, templateLabel, grandTotalMinor, issues, reviewHref, flush, onGenerated } = props
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<WorkspaceIssue[]>([])
  const blocked = issues.some(({ severity }) => severity === 'error')
  const changedSince = record.generatedAt !== undefined && record.updatedAt > record.generatedAt

  async function generate() {
    if (!version) return
    setRunning(true)
    try {
      // The file is made from what is saved, so the draft and the download never differ.
      if (!(await flush())) {
        toast.error('Could not save the draft, so nothing was generated')
        return
      }
      const outcome = await generateQuotation(record, business, version)
      setResult(outcome.diagnostics.flatMap(({ severity, code, message }) => (severity === 'info' ? [] : [{ severity, code, message }])))
      if (!outcome.ok) {
        toast.error('The Excel file was not made')
        return
      }
      const saved = await recordGenerated(record.id, outcome.filename)
      if (saved.ok) onGenerated({ generatedAt: saved.value, generatedFilename: outcome.filename, updatedAt: saved.value })
      wiwoSuccess('quote-generated')
      toast.success('Download started', { description: outcome.filename })
    } catch {
      toast.error('Could not make the Excel file')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <Panel data-wiwo="generate" data-wiwo-busy={running} aria-labelledby="generate-title" className="flex flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 size-5 flex-none text-muted" strokeWidth={1.5} aria-hidden="true" />
          <div>
            <PanelTitle id="generate-title">Make the Excel file</PanelTitle>
            <p className="mt-1 text-muted">
              Sheetquo fills a new copy of your template. The template itself never changes, and the file is yours to
              edit, print, or save as PDF in Excel.
            </p>
          </div>
        </div>

        <dl className="grid gap-3 rounded-button bg-ground p-4 sm:grid-cols-2">
          <Fact label="Business" value={business.displayName} />
          <Fact label="Template" value={templateLabel} />
          <Fact label="File name" value={quotationFilename(business, record)} />
          <Fact label="Grand total" value={formatMoney(grandTotalMinor, business.currency)} />
        </dl>

        <IssueList issues={blocked ? issues : [...issues, ...result]} />

        <div className="flex flex-wrap items-center gap-2">
          {blocked ? (
            <Button asChild variant="secondary">
              <Link to={reviewHref}>Back to review</Link>
            </Button>
          ) : (
            <Button data-wiwo="generate-button" onClick={() => void generate()} disabled={running}>
              <Download strokeWidth={1.75} aria-hidden="true" />
              {running ? 'Making the file…' : record.generatedAt ? 'Generate again' : 'Generate Excel'}
            </Button>
          )}
          <p role="status" className="text-muted">
            {record.generatedFilename && record.generatedAt
              ? `Last downloaded ${new Date(record.generatedAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}${changedSince ? ', changed since' : ''}.`
              : ''}
          </p>
        </div>
      </Panel>

      <p className="px-1 text-xs text-muted">
        Open the file in Excel Desktop or Excel Online to check it before sending. Excel recalculates the totals when it
        opens, so editing a quantity there updates them.
      </p>
      <Panel className="p-5" aria-labelledby="print-help-title">
        <PanelTitle id="print-help-title">Print or save as PDF</PanelTitle>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
          <li>Open the downloaded file in Excel Desktop, or upload it to Excel Online.</li>
          <li>Open Print Preview and check the descriptions, totals, signatures, and repeated table heading.</li>
          <li>Print, or choose Excel’s PDF export. Paper size and margins come from this template version.</li>
        </ol>
      </Panel>
    </div>
  )
}
