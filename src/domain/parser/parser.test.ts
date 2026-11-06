import { describe, expect, it } from 'vitest'
import { computeTotals } from '../calculations/money'
import { checkQuotation } from '../quotation/checkQuotation'
import { parseDate } from './dates'
import { parseQuotationText } from './parseQuotationText'
import type { ParsedLine } from './parseQuotationText'
import { quotationFromParse } from './toQuotation'

const base = { id: 'q1', businessId: 'b1', templateVersionId: 'v1', quoteDateISO: '2026-11-03', customerName: 'Ventura Motors' }

function only(text: string): ParsedLine {
  const { lines } = parseQuotationText(text)
  expect(lines).toHaveLength(1)
  return lines[0]
}

const codes = (line: ParsedLine) => line.notes.map(({ code }) => code)

describe('spec FR-Q03 fixtures', () => {
  it('fixture 1: fields, two parts, labor, and one discount, totalling ₱3,150.00', () => {
    const text = [
      'Customer: Ventura Motors',
      'Vehicle: Foton Tornado 4.4',
      'Date: 2026-11-02',
      '2 pcs Brake Pad - ₱1,200 each',
      '1 pc Oil Filter @ 350',
      'Labor: 500',
      'Discount: 100',
    ].join('\n')
    const result = parseQuotationText(text)
    expect(result.fields).toEqual({ customerName: 'Ventura Motors', vehicle: 'Foton Tornado 4.4', quoteDate: '2026-11-02' })

    const items = result.lines.filter(({ kind }) => kind === 'item').map(({ item, status }) => ({ ...item, status }))
    expect(items).toEqual([
      expect.objectContaining({ description: 'Brake Pad', quantity: '2', unit: 'PC', unitPriceMinor: 120_000, status: 'recognized' }),
      expect.objectContaining({ description: 'Oil Filter', quantity: '1', unit: 'PC', unitPriceMinor: 35_000, status: 'recognized' }),
      expect.objectContaining({ description: 'Labor', quantity: '1', unitPriceMinor: 50_000, type: 'labor', status: 'recognized' }),
    ])

    const quotation = quotationFromParse(result, text, base)
    const totals = computeTotals(quotation)
    expect(totals.partsMinor).toBe(275_000)
    expect(totals.laborMinor).toBe(50_000)
    expect(totals.adjustments).toEqual([expect.objectContaining({ kind: 'discount', amountMinor: 10_000 })])
    expect(totals.grandTotalMinor).toBe(315_000)
    expect(checkQuotation(quotation)).toEqual([])
  })

  it('fixture 2: two table rows, the second free, and remarks kept as notes', () => {
    const text = [
      'Customer: Sample City Office',
      'Air Filter | PART-AF01 | 2 | PCS | 850',
      'Wiper Blade | PART-WB22 | 1 | SET | FREE',
      'Remarks: subject to verification of fitment',
    ].join('\n')
    const result = parseQuotationText(text)
    const items = result.lines.filter(({ kind }) => kind === 'item').map(({ item }) => item)
    expect(items).toEqual([
      expect.objectContaining({ description: 'Air Filter', partNumber: 'PART-AF01', quantity: '2', unit: 'PC', unitPriceMinor: 85_000, isFree: false }),
      expect.objectContaining({ description: 'Wiper Blade', partNumber: 'PART-WB22', quantity: '1', unit: 'SET', unitPriceMinor: 0, isFree: true }),
    ])
    expect(result.fields.notes).toBe('subject to verification of fitment')

    const totals = computeTotals(quotationFromParse(result, text, base))
    expect(totals.subtotalMinor).toBe(170_000)
  })

  it('fixture 3: an amount that could be each or total is flagged, never assumed', () => {
    const line = only('3 clutch bearings 1800')
    expect(line.status).toBe('needs-review')
    expect(line.item).toMatchObject({ description: 'clutch bearings', quantity: '3', statedAmountMinor: 180_000 })
    expect(line.item?.unitPriceMinor).toBeUndefined()
    expect(line.notes[0].message).toBe('Is ₱1,800.00 the price for each one, or for all 3?')
  })

  it('fixture 4: alternative prices become choices, and neither is counted', () => {
    const line = only('Part A - genuine 1200 / replacement 700')
    expect(line.status).toBe('needs-review')
    expect(line.item?.priceOptions).toEqual([
      { label: 'genuine', priceMinor: 120_000 },
      { label: 'replacement', priceMinor: 70_000 },
    ])
    const quotation = quotationFromParse(parseQuotationText('Part A - genuine 1200 / replacement 700'), '', base)
    expect(quotation.items.map(({ description, included }) => [description, included])).toEqual([
      ['Part A (genuine)', false],
      ['Part A (replacement)', false],
    ])
    expect(computeTotals(quotation).subtotalMinor).toBe(0)
  })
})

describe('spec 17.1 parsing matrix', () => {
  it('P-01: "2 pcs Brake Pad - 1200 each"', () => {
    expect(only('2 pcs Brake Pad - 1200 each').item).toMatchObject({ quantity: '2', unitPriceMinor: 120_000 })
  })

  it('P-02: comma, peso sign, and centavos', () => {
    expect(only('Brake Pad 2pcs @ ₱1,200.50').item).toMatchObject({ description: 'Brake Pad', quantity: '2', unitPriceMinor: 120_050 })
    expect(only('1 set Gasket PHP 2,345.75').item).toMatchObject({ unitPriceMinor: 234_575 })
  })

  it('P-03: unclear unit or total price needs review', () => {
    expect(only('4 pcs Spark Plug 1,000').status).toBe('needs-review')
  })

  it('P-04: labor 500 and discount 100 give the right totals', () => {
    const result = parseQuotationText('1 pc Oil Filter @ 350\nLabor: 500\nDiscount: 100')
    expect(computeTotals(quotationFromParse(result, '', base)).grandTotalMinor).toBe(75_000)
  })

  it('P-05: a free item keeps its description and counts as zero', () => {
    const line = only('1 set Floor Mat FOC')
    expect(line.item).toMatchObject({ description: 'Floor Mat', isFree: true, unitPriceMinor: 0 })
    expect(line.status).toBe('recognized')
  })

  it('P-06: greetings, Taglish, and blank lines never become priced items', () => {
    const result = parseQuotationText('Good morning po!\n\nPa-quote po kami, salamat\nCall 0917 123 4567 for delivery')
    expect(result.lines.map(({ kind }) => kind)).toEqual(['unread', 'unread', 'unread'])
    expect(result.lines[2].notes[0].code).toBe('PHONE_NUMBER')
  })

  it('P-07: alternatives are not double counted, even if both are ticked by mistake', () => {
    const quotation = quotationFromParse(parseQuotationText('Part A - genuine 1200 / replacement 700'), '', base)
    const bothOn = { ...quotation, items: quotation.items.map((item) => ({ ...item, quantity: '1', included: true })) }
    expect(checkQuotation(bothOn).map(({ code }) => code)).toContain('ALTERNATIVES_BOTH_INCLUDED')
  })

  it('P-08: names with punctuation and accents are kept exactly', () => {
    expect(parseQuotationText('Customer: Ñiño & Sons, Inc. — Brgy. Peñafrancia').fields.customerName).toBe('Ñiño & Sons, Inc. — Brgy. Peñafrancia')
  })

  it('P-09: a number with commas is one amount, not several items', () => {
    const result = parseQuotationText('Shock Absorber 2 sets 12,500 each')
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].item).toMatchObject({ quantity: '2', unit: 'SET', unitPriceMinor: 1_250_000 })
  })

  it('P-10: text that looks like a formula stays literal text', () => {
    expect(only('1 pc =HYPERLINK("http://example.test") @ 100').item?.description).toBe('=HYPERLINK("http://example.test")')
  })
})

describe('more ways people write items', () => {
  it.each([
    ['2 x 350 Spark Plug', { description: 'Spark Plug', quantity: '2', unitPriceMinor: 35_000 }],
    ['Brake Pad 2pcs @ 1200', { description: 'Brake Pad', quantity: '2', unit: 'PC', unitPriceMinor: 120_000 }],
    ['1.5 ltrs Engine Oil @ 450', { description: 'Engine Oil', quantity: '1.5', unit: 'LTR', unitPriceMinor: 45_000 }],
    ["2 ass'y Clutch Disc 3,800 each", { description: 'Clutch Disc', quantity: '2', unit: 'ASSY', unitPriceMinor: 380_000 }],
    ['Bearing 6205 qty 4 @ 180', { description: 'Bearing 6205', quantity: '4', unitPriceMinor: 18_000 }],
    ['Brake Pad Quantity: 2 @ 100', { description: 'Brake Pad', quantity: '2', unitPriceMinor: 10_000 }],
    ['Hose 2 liters 300 each', { description: 'Hose', quantity: '2', unit: 'LTR', unitPriceMinor: 30_000 }],
    ['Radiator Hose Part #: RH-220 1 pc 650', { description: 'Radiator Hose', partNumber: 'RH-220', quantity: '1', unitPriceMinor: 65_000 }],
  ])('%s', (text, expected) => {
    const line = only(text)
    expect(line.item).toMatchObject(expected)
    expect(line.status).toBe('recognized')
  })

  it('divides a stated total by the quantity when it divides evenly', () => {
    expect(only('3 pcs Shock Absorber 1,500 total').item).toMatchObject({ unitPriceMinor: 50_000, priceBasis: 'total' })
  })

  it('flags a total that does not divide to the centavo', () => {
    const line = only('3 pcs Wiper 1,000 total')
    expect(line.status).toBe('needs-review')
    expect(codes(line)).toContain('TOTAL_DOES_NOT_DIVIDE')
  })

  it('reports a missing quantity or price as incomplete, without inventing either', () => {
    const noQuantity = only('Oil Filter 350')
    expect(noQuantity.status).toBe('incomplete')
    expect(noQuantity.item?.quantity).toBeUndefined()
    expect(codes(noQuantity)).toContain('QUANTITY_MISSING')

    const noPrice = only('2 pcs Brake Pad')
    expect(noPrice.status).toBe('incomplete')
    expect(codes(noPrice)).toEqual(['PRICE_MISSING'])
  })

  it('reads a model number in the description as text, and the last amount as the price', () => {
    expect(only('Foton 4.4 Brake Pad 2pcs 1,200 each').item).toMatchObject({ description: 'Foton 4.4 Brake Pad', unitPriceMinor: 120_000 })
  })

  it('reads rows pasted from a spreadsheet, which arrive with tabs', () => {
    expect(only('Air Filter\tPART-AF01\t2\tPCS\t850').item).toMatchObject({ description: 'Air Filter', quantity: '2', unitPriceMinor: 85_000 })
  })

  it('reads installation as labor', () => {
    expect(only('Installation 2 x 300').item).toMatchObject({ type: 'labor', quantity: '2', unitPriceMinor: 30_000 })
  })
})

describe('adjustments', () => {
  it('reads a percentage discount, taken from all billable items by default', () => {
    const line = only('Discount 5%')
    expect(line.adjustment).toEqual({ kind: 'discount', mode: 'percentage', value: '5', label: 'Discount 5%', enabled: true })
    expect(codes(line)).toEqual(['DISCOUNT_BASE'])
  })

  it('reads a 2307 deduction but leaves it off until the owner turns it on', () => {
    const line = only('Less 3% for 2307')
    expect(line.adjustment).toMatchObject({ kind: 'deduction', mode: 'percentage', value: '3', enabled: false })
    expect(line.status).toBe('needs-review')
  })
})

describe('fields and dates', () => {
  it('reads common date formats, month first when slashed', () => {
    expect(parseDate('2026-11-02')).toEqual({ iso: '2026-11-02', ambiguous: false })
    expect(parseDate('Nov 2, 2026')).toEqual({ iso: '2026-11-02', ambiguous: false })
    expect(parseDate('2 November 2026')).toEqual({ iso: '2026-11-02', ambiguous: false })
    expect(parseDate('11/2/2026')).toEqual({ iso: '2026-11-02', ambiguous: true })
    expect(parseDate('25/11/2026')).toEqual({ iso: '2026-11-25', ambiguous: false })
    expect(parseDate('31/31/2026')).toBeUndefined()
  })

  it('flags a slashed date that could be read either way', () => {
    const line = only('Date: 11/2/2026')
    expect(line.status).toBe('needs-review')
    expect(line.notes[0].message).toBe('Read as November 2, 2026, month first. Check it.')
  })

  it('keeps the first of two different customers and flags the second', () => {
    const result = parseQuotationText('Customer: Ventura Motors\nCustomer: Other Name')
    expect(result.fields.customerName).toBe('Ventura Motors')
    expect(result.lines[1].status).toBe('needs-review')
  })

  it('reads the label variants the spec lists', () => {
    const fields = (text: string) => parseQuotationText(text).fields
    expect(fields('Client: A').customerName).toBe('A')
    expect(fields('Prepared for: A').customerName).toBe('A')
    expect(fields('Quotation Date: 2026-11-02').quoteDate).toBe('2026-11-02')
    expect(fields('Model: Foton').vehicle).toBe('Foton')
    expect(fields('VIN: X1').chassis).toBe('X1')
    expect(only('Service Fee: 300').item).toMatchObject({ type: 'labor', unitPriceMinor: 30_000 })
  })

  it('reads vehicle details, quote number, and TIN', () => {
    const result = parseQuotationText('Quote No: Q-0142\nPlate: ABC 1234\nEngine: 4JB1\nChassis: XYZ123\nTIN: 000-111-222-000')
    expect(result.fields).toEqual({ quoteNumber: 'Q-0142', plate: 'ABC 1234', engine: '4JB1', chassis: 'XYZ123', customerTIN: '000-111-222-000' })
  })
})

describe('behaviour', () => {
  it('gives the same result every time for the same text', () => {
    const text = 'Customer: Ventura Motors\n2 pcs Brake Pad - ₱1,200 each\n3 clutch bearings 1800\nDiscount: 100'
    expect(parseQuotationText(text)).toEqual(parseQuotationText(text))
  })

  it('keeps each line’s number and original text for the review screen', () => {
    const result = parseQuotationText('Hello\n\n2 pcs Brake Pad @ 1200')
    expect(result.lines.map(({ number, text }) => [number, text])).toEqual([
      [1, 'Hello'],
      [3, '2 pcs Brake Pad @ 1200'],
    ])
  })

  it('keeps flagged lines out of the quotation, and incomplete ones in so they block generation', () => {
    const text = '3 clutch bearings 1800\nOil Filter 350\n2 pcs Brake Pad @ 1200'
    const quotation = quotationFromParse(parseQuotationText(text), text, base)
    expect(quotation.items.map(({ description, included }) => [description, included])).toEqual([
      ['clutch bearings', false],
      ['Oil Filter', true],
      ['Brake Pad', true],
    ])
    // Without a quantity, ₱350 could be each or all, so the price stays empty too.
    expect(checkQuotation(quotation).map(({ code }) => code)).toEqual(['ITEM_QUANTITY_MISSING', 'ITEM_PRICE_MISSING'])
    expect(quotation.rawInput).toBe(text)
  })
})
