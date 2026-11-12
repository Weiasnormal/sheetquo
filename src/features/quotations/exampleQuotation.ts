import { computeTotals, lineAmountMinor } from '../../domain/calculations/money'
import { quotationFilename } from '../../domain/quotation/filename'
import type { Adjustment, QuoteItem } from '../../domain/quotation/types'

/** The first synthetic parsing fixture from spec section 6, FR-Q03. */
export const EXAMPLE_MESSAGE = `Customer: Ventura Motors
Vehicle: Foton Tornado 4.4
2 pcs Brake Pad - ₱1,200 each
1 pc Oil Filter @ 350
Labor: 500
Discount: 100`

const items: QuoteItem[] = [
  { id: 'brake-pad', description: 'Brake Pad', quantity: '2', unit: 'PC', unitPriceMinor: 120_000, type: 'part', included: true },
  { id: 'oil-filter', description: 'Oil Filter', quantity: '1', unit: 'PC', unitPriceMinor: 35_000, type: 'part', included: true },
  { id: 'labor', description: 'Labor', quantity: '1', unit: 'SVC', unitPriceMinor: 50_000, type: 'labor', included: true },
]

const adjustments: Adjustment[] = [
  { id: 'discount', label: 'Discount', kind: 'discount', mode: 'fixed', value: '100', base: 'allBillable', enabled: true, order: 1 },
]

export const EXAMPLE_ROWS = items.map((item) => ({ ...item, amountMinor: lineAmountMinor(item) }))
export const EXAMPLE_TOTALS = computeTotals({ items, adjustments })
export const EXAMPLE_FILENAME = quotationFilename(
  { displayName: 'Sample Parts' },
  { id: 'example', quoteNumber: 'DEMO-1', quoteDateISO: '2026-11-02' },
)
