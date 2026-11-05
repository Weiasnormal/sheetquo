import { describe, expect, it } from 'vitest'
import type { Adjustment, QuoteItem } from '../quotation/types'
import { computeTotals, formatMoneyInput, lineAmountMinor, majorToMinor, parseDecimal, parseMoneyInput } from './money'

function item(overrides: Partial<QuoteItem>): QuoteItem {
  return {
    id: crypto.randomUUID(),
    description: 'Sample part',
    quantity: '1',
    unitPriceMinor: 0,
    type: 'part',
    included: true,
    ...overrides,
  }
}

function adjustment(overrides: Partial<Adjustment>): Adjustment {
  return {
    id: crypto.randomUUID(),
    label: 'Less discount',
    kind: 'discount',
    mode: 'fixed',
    value: '0',
    base: 'allBillable',
    enabled: true,
    order: 1,
    ...overrides,
  }
}

describe('line amounts', () => {
  it('C-01: 3 x 99.99 is 299.97', () => {
    expect(lineAmountMinor({ quantity: '3', unitPriceMinor: 9999 })).toBe(29997)
  })

  it('C-02: a free item is zero', () => {
    expect(lineAmountMinor({ quantity: '4', unitPriceMinor: 9999, isFree: true })).toBe(0)
  })

  it('handles decimal quantities without float drift', () => {
    expect(lineAmountMinor({ quantity: '1.1', unitPriceMinor: 1100 })).toBe(1210)
    expect(lineAmountMinor({ quantity: '0.1', unitPriceMinor: 30 })).toBe(3)
  })

  it('rounds half up at the centavo', () => {
    expect(lineAmountMinor({ quantity: '1.5', unitPriceMinor: 33 })).toBe(50)
  })

  it('rejects negative, blank, and scientific quantities', () => {
    expect(() => parseDecimal('-1')).toThrow(RangeError)
    expect(() => parseDecimal('')).toThrow(RangeError)
    expect(() => parseDecimal('1e3')).toThrow(RangeError)
  })
})

describe('money input', () => {
  it('reads amounts the way people type them', () => {
    expect(parseMoneyInput('1,200.50')).toBe(120050)
    expect(parseMoneyInput('₱ 1200')).toBe(120000)
    expect(parseMoneyInput('PHP350')).toBe(35000)
    expect(parseMoneyInput('0.5')).toBe(50)
  })

  it('refuses anything that is not a plain amount', () => {
    for (const text of ['', 'abc', '-5', '1.234', '1e3', '12.3.4']) expect(parseMoneyInput(text)).toBeUndefined()
  })

  it('formats for an input box without the currency sign', () => {
    expect(formatMoneyInput(120050)).toBe('1,200.50')
    expect(formatMoneyInput(0)).toBe('0.00')
  })
})

describe('majorToMinor', () => {
  it('converts decimal strings exactly', () => {
    expect(majorToMinor('1200.50')).toBe(120050)
    expect(majorToMinor('0.07')).toBe(7)
  })
})

describe('computeTotals', () => {
  it('C-03: labor plus parts less a fixed discount, applied once', () => {
    const totals = computeTotals({
      items: [
        item({ quantity: '2', unitPriceMinor: 120000 }),
        item({ quantity: '1', unitPriceMinor: 35000 }),
        item({ type: 'labor', unitPriceMinor: 50000 }),
      ],
      adjustments: [adjustment({ value: '100' })],
    })
    expect(totals.subtotalMinor).toBe(325000)
    expect(totals.grandTotalMinor).toBe(315000)
  })

  it('C-04: a parts-only percentage leaves labor alone', () => {
    const totals = computeTotals({
      items: [item({ unitPriceMinor: 100000 }), item({ type: 'labor', unitPriceMinor: 50000 })],
      adjustments: [adjustment({ mode: 'percentage', value: '10', base: 'parts' })],
    })
    expect(totals.adjustments[0].amountMinor).toBe(10000)
    expect(totals.grandTotalMinor).toBe(140000)
  })

  it('C-05: optional deductions apply only when enabled', () => {
    const items = [item({ unitPriceMinor: 100000 })]
    const deduction = adjustment({ kind: 'deduction', label: 'Less 3%', mode: 'percentage', value: '3' })
    expect(computeTotals({ items, adjustments: [{ ...deduction, enabled: false }] }).grandTotalMinor).toBe(100000)
    expect(computeTotals({ items, adjustments: [deduction] }).grandTotalMinor).toBe(97000)
  })

  it('C-07: 30 decimal items total exactly, with no float drift', () => {
    const items = Array.from({ length: 30 }, (_, index) =>
      item({ quantity: index % 2 === 0 ? '1.5' : '3', unitPriceMinor: 9999 + index * 37 }),
    )
    // The same sum in exact integer arithmetic: each line rounded half up, then added.
    const expected = items.reduce((sum, { quantity, unitPriceMinor }) => {
      const tenths = BigInt(Math.round(Number(quantity) * 10)) * BigInt(unitPriceMinor!)
      return sum + Number((tenths + 5n) / 10n)
    }, 0)
    expect(computeTotals({ items, adjustments: [] }).subtotalMinor).toBe(expected)
  })

  it('takes a percentage from parts, labor, everything, or a typed base', () => {
    const items = [item({ unitPriceMinor: 100000 }), item({ type: 'labor', unitPriceMinor: 40000 })]
    const percent = (overrides: Partial<Adjustment>) =>
      computeTotals({ items, adjustments: [adjustment({ mode: 'percentage', value: '10', ...overrides })] }).adjustments[0]
    expect(percent({ base: 'parts' })).toMatchObject({ baseMinor: 100000, amountMinor: 10000 })
    expect(percent({ base: 'labor' })).toMatchObject({ baseMinor: 40000, amountMinor: 4000 })
    expect(percent({ base: 'allBillable' })).toMatchObject({ baseMinor: 140000, amountMinor: 14000 })
    expect(percent({ base: 'manual', manualBaseMinor: 50000 })).toMatchObject({ baseMinor: 50000, amountMinor: 5000 })
  })

  it('counts an invalid adjustment as zero instead of throwing', () => {
    const totals = computeTotals({ items: [item({ unitPriceMinor: 100000 })], adjustments: [adjustment({ value: 'ten' })] })
    expect(totals.grandTotalMinor).toBe(100000)
  })

  it('leaves out items that are not included', () => {
    const totals = computeTotals({
      items: [item({ unitPriceMinor: 100000 }), item({ unitPriceMinor: 70000, included: false })],
      adjustments: [],
    })
    expect(totals.subtotalMinor).toBe(100000)
  })
})
