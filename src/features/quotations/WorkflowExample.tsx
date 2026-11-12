import { FileSpreadsheet } from 'lucide-react'
import { formatMoney } from '../../domain/calculations/money'
import { Badge } from '../../components/ui/Badge'
import { Panel, PanelTitle } from '../../components/ui/Panel'
import { EXAMPLE_FILENAME, EXAMPLE_MESSAGE, EXAMPLE_ROWS, EXAMPLE_TOTALS } from './exampleQuotation'

const STAGE_LABEL = 'mb-3 text-sm font-medium'

export function WorkflowExample() {
  return (
    <Panel aria-labelledby="workflow-title">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <PanelTitle id="workflow-title">From a pasted message to an Excel quotation</PanelTitle>
        <Badge>Example</Badge>
      </div>

      {/* Three columns need the width of a sidebar layout. Tablets get two, with the result below. */}
      <div className="grid md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="border-b border-line p-5 xl:border-b-0">
          <h3 className={STAGE_LABEL}>Paste</h3>
          <p className="rounded-button bg-ground p-3 whitespace-pre-line">{EXAMPLE_MESSAGE}</p>
        </div>

        <div className="min-w-0 border-b border-line p-5 md:border-l xl:border-b-0">
          <h3 className={STAGE_LABEL}>Review</h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-xs text-muted">
                  <th scope="col" className="border border-line px-2 py-1.5 text-left font-normal">
                    Item
                  </th>
                  <th scope="col" className="border border-line px-2 py-1.5 text-right font-normal">
                    Qty
                  </th>
                  <th scope="col" className="border border-line px-2 py-1.5 text-right font-normal">
                    Price
                  </th>
                  <th scope="col" className="border border-line px-2 py-1.5 text-right font-normal">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {EXAMPLE_ROWS.map((row) => (
                  <tr key={row.id}>
                    <th scope="row" className="border border-line px-2 py-1.5 text-left font-normal whitespace-nowrap">
                      {row.description}
                    </th>
                    <td className="tabular border border-line px-2 py-1.5 text-right">{row.quantity}</td>
                    <td className="tabular border border-line px-2 py-1.5 text-right whitespace-nowrap">
                      {formatMoney(row.unitPriceMinor ?? 0)}
                    </td>
                    <td className="tabular border border-line px-2 py-1.5 text-right whitespace-nowrap">
                      {formatMoney(row.amountMinor ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="min-w-0 p-5 md:col-span-2 xl:col-span-1 xl:border-l xl:border-line">
          <h3 className={STAGE_LABEL}>Generate</h3>
          <div className="md:flex md:items-start md:justify-between md:gap-8 xl:block">
          <p className="flex items-center gap-2 break-all">
            <FileSpreadsheet className="size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden="true" />
            {EXAMPLE_FILENAME}
          </p>
          <dl className="mt-4 md:mt-0 md:w-72 md:flex-none xl:mt-4 xl:w-auto">
            <div className="flex justify-between gap-4 py-1">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular">{formatMoney(EXAMPLE_TOTALS.subtotalMinor)}</dd>
            </div>
            <div className="flex justify-between gap-4 py-1">
              <dt className="text-muted">Less discount</dt>
              <dd className="tabular">{formatMoney(EXAMPLE_TOTALS.adjustments[0].amountMinor)}</dd>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-line pt-2">
              <dt className="font-medium">Total</dt>
              <dd className="tabular text-2xl leading-8 font-bold tracking-tight">
                {formatMoney(EXAMPLE_TOTALS.grandTotalMinor)}
              </dd>
            </div>
          </dl>
          </div>
        </div>
      </div>
    </Panel>
  )
}
