import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useWorkspace } from '../useWorkspace'
import { PageHeader } from '../../components/layout/PageHeader'
import { Input, Select } from '../../components/forms/Field'
import { Panel } from '../../components/ui/Panel'
import { Button } from '../../components/ui/Button'
import { quotationTitle } from '../../domain/quotation/records'
import { formatDate } from '../../domain/formatDate'
import { computeTotals, formatMoney } from '../../domain/calculations/money'
import { listQuotations } from '../../infrastructure/storage/quotationRepository'

export function QuotationHistoryPage() {
  const { business } = useWorkspace()
  const [search, setSearch] = useState(''), [status, setStatus] = useState('all'), [page, setPage] = useState(0)
  const queried = useLiveQuery(async () => {
    try { return { businessId: business?.id, rows: business ? await listQuotations(business.id) : [], failed: false } }
    catch { return { businessId: business?.id, rows: [], failed: true } }
  }, [business?.id])
  const records = queried?.businessId === business?.id ? queried : undefined
  const filtered = useMemo(() => records?.rows.filter((quote) => {
    const text = [quote.quoteNumber, quote.customerName, quote.vehicle, quote.plate, quote.quoteDateISO].join(' ').toLocaleLowerCase()
    return text.includes(search.trim().toLocaleLowerCase()) && (status === 'all' || (status === 'generated') === Boolean(quote.generatedAt))
  }) ?? [], [records, search, status])
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 25) - 1))
  return <div data-wiwo="history">
    <PageHeader title="Quotation history" description={business ? `All saved quotations for ${business.displayName}.` : 'Choose a business to see its quotations.'} />
    {business && <>
      <Panel data-wiwo="history-search" className="mb-4 flex flex-wrap gap-3 p-4">
        <label className="flex min-w-0 flex-1 flex-col gap-1">Search quotations
          <Input type="search" value={search} placeholder="Customer, number, vehicle, plate or date" onChange={(event) => { setSearch(event.target.value); setPage(0) }} />
        </label>
        <label className="flex flex-col gap-1">Status
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }}>
            <option value="all">All</option><option value="draft">Drafts</option><option value="generated">Excel generated</option>
          </Select>
        </label>
      </Panel>
      {!records ? <p role="status">Loading quotations…</p> : records.failed ? <p role="alert">Could not read quotation history. Reload and check that this browser allows local storage.</p>
        : <Panel className="p-4">
          <p role="status" className="text-sm text-muted">{filtered.length} matching quotations</p>
          {filtered.length === 0 ? <p className="py-5">No quotations match. Try another search or start a new quotation.</p> : <ul className="divide-y divide-rule">
            {filtered.slice(currentPage * 25, currentPage * 25 + 25).map((quote) => <li key={quote.id}>
              <Link to={`/quotation/${quote.id}`} className="flex flex-wrap justify-between gap-2 rounded-button py-4">
                <span className="min-w-0 break-words"><span className="block font-medium">{quotationTitle(quote)}</span><span className="text-sm text-muted">{formatDate(quote.updatedAt)} · {quote.generatedAt ? 'Excel generated' : 'Draft'}</span></span>
                <span className="tabular">{formatMoney(computeTotals(quote).grandTotalMinor, quote.letterhead?.currency ?? business.currency)}</span>
              </Link>
            </li>)}
          </ul>}
          {filtered.length > 25 && <div className="mt-3 flex items-center gap-3">
            <Button variant="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous page</Button>
            <span>Page {currentPage + 1} of {Math.ceil(filtered.length / 25)}</span>
            <Button variant="secondary" disabled={(currentPage + 1) * 25 >= filtered.length} onClick={() => setPage(currentPage + 1)}>Next page</Button>
          </div>}
        </Panel>}
    </>}
  </div>
}
