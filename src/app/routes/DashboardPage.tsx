import { ArrowRight, FilePlus2 } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '../../components/layout/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Panel, PanelTitle } from '../../components/ui/Panel'
import { formatDate } from '../../domain/formatDate'
import { RecentQuotations } from '../../features/quotations/RecentQuotations'
import { WorkflowExample } from '../../features/quotations/WorkflowExample'
import { useWorkspace } from '../useWorkspace'

type Step = { key: string; title: string; detail: string; to: string; done: boolean }

export function DashboardPage() {
  const { status, business, activeTemplates, lastBackupAt } = useWorkspace()
  const [template] = activeTemplates
  const ready = activeTemplates.find(({ active }) => active)

  const steps: Step[] = [
    business
      ? { key: 'business', title: business.displayName, detail: 'Business details saved', to: `/businesses/${business.id}`, done: true }
      : { key: 'business', title: 'Add your business', detail: 'The name and contact details on your quotations', to: '/businesses/new', done: false },
    template
      ? { key: 'upload', title: template.template.name, detail: 'Template uploaded', to: `/templates/${template.template.id}/map`, done: true }
      : { key: 'upload', title: 'Upload your template', detail: 'Your own .xlsx quotation layout', to: '/templates/import', done: false },
    ready
      ? {
          key: 'map',
          title: 'Template ready',
          detail: `${ready.template.name}, version ${ready.active?.version}, is active`,
          to: `/templates/${ready.template.id}/map`,
          done: true,
        }
      : {
          key: 'map',
          title: 'Map and test your template',
          detail: 'Tell Sheetquo where the customer, items, and totals go',
          to: template ? `/templates/${template.template.id}/map` : '/templates',
          done: false,
        },
  ]
  const doneCount = steps.filter(({ done }) => done).length
  const description = !business
    ? 'Add a business and a template to start quoting.'
    : !template
      ? 'Upload a template to start quoting.'
      : !ready
        ? 'Map and test your template to start quoting.'
        : 'Your template is ready. Paste a customer’s message to start a quotation.'

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={description}
        actions={
          <Button asChild>
            <Link to="/quotation/new">
              <FilePlus2 strokeWidth={1.75} aria-hidden="true" />
              New quotation
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel data-wiwo="setup" aria-labelledby="setup-title" className="p-5">
          <div className="flex items-center justify-between gap-3">
            <PanelTitle id="setup-title">Set up Sheetquo</PanelTitle>
            {status === 'ready' && (
              <span className="tabular text-muted">
                {doneCount} of {steps.length} done
              </span>
            )}
          </div>
          <ul className="mt-2 divide-y divide-rule">
            {steps.map(({ key, title, detail, to, done }) => (
              <li key={key}>
                <Link to={to} className="flex items-center justify-between gap-3 rounded-chip py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{title}</span>
                    <span className="block text-muted">{detail}</span>
                  </span>
                  <span className="flex flex-none items-center gap-2">
                    {status === 'ready' && <Badge tone={done ? 'positive' : 'neutral'}>{done ? 'Done' : 'Not started'}</Badge>}
                    <ArrowRight className="size-4 text-muted" strokeWidth={1.75} aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <RecentQuotations businessId={business?.id} currency={business?.currency ?? 'PHP'} />
      </div>

      {business && (
        <Panel aria-labelledby="backup-title" className="mt-4 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div>
            <PanelTitle id="backup-title">Backup</PanelTitle>
            <p className="text-muted">
              {lastBackupAt
                ? `Last exported ${formatDate(lastBackupAt)}.`
                : 'Not backed up yet. Your businesses and templates live only in this browser.'}
            </p>
          </div>
          <Button asChild variant="secondary">
            <Link to="/settings">Back up</Link>
          </Button>
        </Panel>
      )}

      <div className="mt-4">
        <WorkflowExample />
      </div>
    </>
  )
}
