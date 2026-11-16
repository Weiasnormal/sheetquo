import { Building2, FileSpreadsheet } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '../../components/layout/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Panel } from '../../components/ui/Panel'
import type { TemplateSummary } from '../../domain/template/records'
import { describeRegion } from '../../domain/template/region'
import { versionStateLabel } from '../../features/templates/versionActions'
import { restoreTemplate } from '../../infrastructure/storage/templateRepository'
import { chooseBusinessTemplate } from '../../infrastructure/storage/businessRepository'
import { Select } from '../../components/forms/Field'
import { useWorkspace } from '../useWorkspace'

function TemplateRow({ summary, action }: { summary: TemplateSummary; action?: ReactNode }) {
  const { template, version } = summary
  const warnings = version.capabilityWarnings.filter(({ severity }) => severity === 'warning').length
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
      <div className="min-w-0 flex-1">
        <Link to={`/templates/${template.id}/map`} className="font-medium underline-offset-2 hover:underline">
          {template.name}
        </Link>
        <p className="truncate text-muted">
          {version.originalFileName} · {version.sourceWorksheet} · {describeRegion(version.region)}
        </p>
      </div>
      {warnings > 0 && (
        <span className="tabular text-muted">
          {warnings} warning{warnings === 1 ? '' : 's'}
        </span>
      )}
      {action ?? (
        <Badge tone={summary.active ? 'positive' : 'neutral'}>
          {summary.active ? `Active · version ${summary.active.version}` : versionStateLabel(version)}
        </Badge>
      )}
    </li>
  )
}

export function TemplatesPage() {
  const { status, business, templates, activeTemplates } = useWorkspace()
  const archived = templates.filter(({ template }) => template.archivedAt)

  async function restore(summary: TemplateSummary) {
    const result = await restoreTemplate(summary.template.id)
    if (result.ok) toast.success('Template restored', { description: summary.template.name })
    else toast.error(result.error.message)
  }

  const uploadButton = (
    <Button asChild>
      <Link to="/templates/import">Upload template</Link>
    </Button>
  )

  return (
    <>
      <PageHeader
        title="Templates"
        description={business ? `Optional Excel designs for ${business.displayName}. A saved design can be used immediately in an adaptive quotation.` : 'Your own Excel layouts, ready to fill with each quotation.'}
        actions={business ? uploadButton : undefined}
      />

      {status === 'loading' && <Panel aria-busy="true" className="h-32" />}

      {status === 'ready' && !business && (
        <EmptyState
          icon={Building2}
          title="Add a business first"
          action={
            <Button asChild variant="secondary">
              <Link to="/businesses/new">Add business</Link>
            </Button>
          }
        >
          Each template belongs to one business, so its quotations carry the right details.
        </EmptyState>
      )}

      {business && templates.length === 0 && (
        <EmptyState icon={FileSpreadsheet} title="Upload your first template" action={uploadButton}>
          Your business letterhead is ready for quoting. Upload an .xlsx here to reuse its column styling.
        </EmptyState>
      )}

      {activeTemplates.length > 0 && (
        <Panel data-wiwo="template-list" aria-label="Templates">
          <ul className="divide-y divide-rule">
            {activeTemplates.map((summary) => (
              <TemplateRow key={summary.template.id} summary={summary} />
            ))}
          </ul>
        </Panel>
      )}
      {business && activeTemplates.some(({ active }) => active) && <Panel data-wiwo="template-default" className="mt-4 p-5">
        <label className="flex max-w-md flex-col gap-2 font-medium">Default template for {business.displayName}
          <Select value={activeTemplates.some(({ template, active }) => active && template.id === business.defaultTemplateId) ? business.defaultTemplateId : ''}
            onChange={async (event) => {
              const result = await chooseBusinessTemplate(business.id, event.target.value || undefined, 'default')
              if (result.ok) {
                try { localStorage.removeItem('quotation-layout:' + business.id) } catch { /* optional preference */ }
                toast.success('Default template saved')
              }
              else toast.error(result.error.message)
            }}>
            <option value="">First available template</option>
            {activeTemplates.filter(({ active }) => active).map(({ template }) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </Select>
        </label>
        <p className="mt-2 text-sm text-muted">New quotations remember the last template you choose for this business. Setting a default resets that remembered choice.</p>
      </Panel>}

      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="inline-flex min-h-10 cursor-pointer items-center rounded-button font-medium text-muted hover:text-ink">
            Archived <span className="tabular ml-1">({archived.length})</span>
          </summary>
          <Panel aria-label="Archived templates" className="mt-2">
            <ul className="divide-y divide-rule">
              {archived.map((summary) => (
                <TemplateRow
                  key={summary.template.id}
                  summary={summary}
                  action={
                    <Button variant="secondary" onClick={() => void restore(summary)} aria-label={`Restore ${summary.template.name}`}>
                      Restore
                    </Button>
                  }
                />
              ))}
            </ul>
          </Panel>
        </details>
      )}
    </>
  )
}
