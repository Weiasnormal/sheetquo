import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '../../components/ui/Badge'
import { Panel, PanelTitle } from '../../components/ui/Panel'
import { computeTotals, formatMoney } from '../../domain/calculations/money'
import { formatDate } from '../../domain/formatDate'
import { quotationTitle } from '../../domain/quotation/records'
import { listQuotations } from '../../infrastructure/storage/quotationRepository'

/** The current business's latest drafts. Another business's quotations never appear here. */
export function RecentQuotations({ businessId, currency }: { businessId?: string; currency: string }) {
  const quotations = useLiveQuery(() => (businessId ? listQuotations(businessId, 5) : Promise.resolve([])), [businessId])

  return (
    <Panel data-wiwo="recent-quotes" aria-labelledby="recent-title" className="flex flex-col p-5">
      <PanelTitle id="recent-title">Recent quotations</PanelTitle>
      {businessId && <Link to="/quotations" className="mt-1 text-sm underline underline-offset-2">View all quotations</Link>}
      {quotations && quotations.length > 0 ? (
        <ul className="mt-2 divide-y divide-rule">
          {quotations.map((quotation) => (
            <li key={quotation.id}>
              <Link to={`/quotation/${quotation.id}`} className="flex items-center justify-between gap-3 rounded-chip py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{quotationTitle(quotation)}</span>
                  <span className="tabular block text-muted">
                    {formatDate(quotation.updatedAt)} · {formatMoney(computeTotals(quotation).grandTotalMinor, currency)}
                  </span>
                </span>
                <span className="flex flex-none items-center gap-2">
                  <Badge tone={quotation.generatedAt ? 'positive' : 'neutral'}>{quotation.generatedAt ? 'Downloaded' : 'Draft'}</Badge>
                  <ArrowRight className="size-4 text-muted" strokeWidth={1.75} aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 flex flex-1 items-center rounded-button border border-dashed border-line p-4 text-muted">
          Quotations you start in this browser appear here. Excel files stay wherever you save them.
        </p>
      )}
    </Panel>
  )
}
