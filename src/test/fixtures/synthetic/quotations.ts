import type { Adjustment, Business, Quotation, QuoteItem } from '../../../domain/quotation/types'

export const FORMULA_LIKE_DESCRIPTION = '=HYPERLINK("http://example.test","Click me")'
export const LONG_DESCRIPTION =
  'Heavy-duty front brake assembly kit with caliper seals, retaining pins, wear sensors, mounting hardware, and fitment notes for the long-wheelbase variant, subject to verification of fitment before release'

export const SAMPLE_BUSINESS_A: Business = {
  id: 'business-a',
  displayName: 'Sample Parts Supply',
  addressLines: ['123 Sample Street', 'Example City'],
  phones: ['(02) 8000-0000', '0900-000-0000'],
  currency: 'PHP',
}

export const SAMPLE_BUSINESS_B: Business = {
  id: 'business-b',
  displayName: 'Demo Fleet Services',
  addressLines: ['45 Placeholder Avenue', 'Test Town'],
  phones: ['(02) 8111-1111'],
  currency: 'PHP',
}

const PARTS = ['Brake Pad Set', 'Oil Filter', 'Air Filter', 'Wiper Blade', 'Fuel Filter', 'Clutch Bearing', 'Radiator Hose', 'Fan Belt', 'Shock Absorber', 'Tie Rod End']
const UNITS = ['PC', 'SET', 'ASSY']

function buildItems(count: number): QuoteItem[] {
  const items: QuoteItem[] = []
  for (let index = 0; index < count; index += 1) {
    items.push({
      id: `item-${index + 1}`,
      description: `${PARTS[index % PARTS.length]} (Demo ${index + 1})`,
      partNumber: `DEMO-${String(index + 1).padStart(3, '0')}`,
      quantity: index % 5 === 4 ? '1.5' : String((index % 4) + 1),
      unit: UNITS[index % UNITS.length],
      unitPriceMinor: 12_345 + index * 7_919,
      type: 'part',
      included: true,
    })
  }

  // The edge cases sit at fixed positions, so every size exercises them.
  items[0].description = LONG_DESCRIPTION
  if (count >= 2) {
    items[1] = { ...items[1], description: 'Wiper Blade Ñ-Series, complimentary', isFree: true, unitPriceMinor: 0 }
  }
  if (count >= 3) {
    items[count - 1] = { ...items[count - 1], description: 'Labor and installation', partNumber: undefined, unit: 'SVC', quantity: '1', unitPriceMinor: 50_000, type: 'labor' }
  }
  if (count >= 6) {
    items[3] = { ...items[3], description: FORMULA_LIKE_DESCRIPTION }
    items[4] = { ...items[4], description: '+63-917-SAMPLE @note -dash' }
  }
  return items
}

const FIXED_DISCOUNT: Adjustment = {
  id: 'adjustment-1',
  label: 'Less discount',
  kind: 'discount',
  mode: 'fixed',
  value: '100',
  base: 'allBillable',
  enabled: true,
  order: 1,
}

const PERCENT_DISCOUNT: Adjustment = { ...FIXED_DISCOUNT, mode: 'percentage', value: '5' }

export function sampleQuotation(count: number, options: { percentDiscount?: boolean } = {}): Quotation {
  return {
    id: `00000000-demo-${count}`,
    businessId: 'business-a',
    templateVersionId: 'template-version-1',
    quoteNumber: `DEMO-${count}`,
    quoteDateISO: '2026-11-02',
    customerName: 'Demo Customer Ñiño & Sons',
    customerAddress: '1 Fictional Road, Sample City',
    vehicle: 'Demo Truck 4.4 (synthetic)',
    plate: 'ABC 1234',
    items: buildItems(count),
    adjustments: [options.percentDiscount ? PERCENT_DISCOUNT : FIXED_DISCOUNT],
    preparedBy: 'Demo Preparer',
    checkedBy: 'Demo Checker',
    receivedBy: 'Demo Receiver',
    notes: 'Demo data. Prices are synthetic and subject to verification of fitment.',
  }
}
