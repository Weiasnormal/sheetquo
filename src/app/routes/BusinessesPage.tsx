import { Building2, Pencil } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '../../components/layout/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { Panel } from '../../components/ui/Panel'
import type { BusinessRecord } from '../../domain/business/businessForm'
import { BusinessLogo } from '../../features/businesses/BusinessLogo'
import { DeleteBusinessButton } from '../../features/businesses/DeleteBusinessButton'
import { restoreBusiness, selectBusiness } from '../../infrastructure/storage/businessRepository'
import { useWorkspace } from '../useWorkspace'

function contactLine(business: BusinessRecord): string {
  return [business.addressLines[0], business.phones[0]].filter(Boolean).join(' · ') || 'No contact details yet'
}

function BusinessRow({ business, action }: { business: BusinessRecord; action: ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <BusinessLogo business={business} size="md" />
      <div className="min-w-0 flex-1">
        <Link to={`/businesses/${business.id}`} className="font-medium underline-offset-2 hover:underline">
          {business.displayName}
        </Link>
        <p className="truncate text-muted">{contactLine(business)}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {action}
        <Button asChild variant="secondary">
          <Link to={`/businesses/${business.id}`} aria-label={`Edit ${business.displayName}`}>
            <Pencil aria-hidden className="size-4" />
          </Link>
        </Button>
        <DeleteBusinessButton business={business} compact />
      </div>
    </li>
  )
}

export function BusinessesPage() {
  const { status, business: current, activeBusinesses, businesses } = useWorkspace()
  const archived = businesses.filter((business) => business.archivedAt)

  async function use(business: BusinessRecord) {
    const result = await selectBusiness(business.id)
    if (result.ok) toast.success(`Now using ${business.displayName}`)
    else toast.error(result.error.message)
  }

  async function restore(business: BusinessRecord) {
    const result = await restoreBusiness(business.id)
    if (result.ok) toast.success('Business restored', { description: business.displayName })
    else toast.error(result.error.message)
  }

  const addButton = (
    <Button asChild>
      <Link to="/businesses/new">Add business</Link>
    </Button>
  )

  return (
    <>
      <div data-wiwo="business-list"><PageHeader
        title="Businesses"
        description="Each business keeps its own details, logo, and quotation defaults."
        actions={status === 'ready' ? addButton : undefined}
      /></div>

      {status === 'loading' && <Panel aria-busy="true" className="h-32" />}

      {status === 'unavailable' && (
        <EmptyState icon={Building2} title="Businesses cannot be saved in this browser">
          Open Sheetquo in a normal browser window to add a business.
        </EmptyState>
      )}

      {status === 'ready' && businesses.length === 0 && (
        <EmptyState icon={Building2} title="Add your first business" action={addButton}>
          Its name, address, and contact details fill your quotations.
        </EmptyState>
      )}

      {activeBusinesses.length > 0 && (
        <Panel aria-label="Active businesses">
          <ul className="divide-y divide-rule">
            {activeBusinesses.map((business) => (
              <BusinessRow
                key={business.id}
                business={business}
                action={
                  business.id === current?.id ? (
                    <Badge tone="positive">In use</Badge>
                  ) : (
                    <Button variant="secondary" onClick={() => void use(business)} aria-label={`Use ${business.displayName}`}>
                      Use
                    </Button>
                  )
                }
              />
            ))}
          </ul>
        </Panel>
      )}

      {archived.length > 0 && (
        <details className="group mt-6">
          <summary className="inline-flex min-h-10 cursor-pointer items-center rounded-button font-medium text-muted hover:text-ink">
            Archived <span className="tabular ml-1">({archived.length})</span>
          </summary>
          <Panel aria-label="Archived businesses" className="mt-2">
            <ul className="divide-y divide-rule">
              {archived.map((business) => (
                <BusinessRow
                  key={business.id}
                  business={business}
                  action={
                    <Button variant="secondary" onClick={() => void restore(business)} aria-label={`Restore ${business.displayName}`}>
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
