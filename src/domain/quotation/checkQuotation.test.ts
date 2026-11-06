import { describe, expect, it } from 'vitest'
import { computeTotals } from '../calculations/money'
import { checkQuotation } from './checkQuotation'
import type { Adjustment, QuoteItem } from './types'

function item(overrides: Partial<QuoteItem> = {}): QuoteItem {
  return { id: crypto.randomUUID(), description: 'Sample part', quantity: '1', unitPriceMinor: 10_000, type: 'part', included: true, ...overrides }
}

function adjustment(overrides: Partial<Adjustment> = {}): Adjustment {
  return { id: crypto.randomUUID(), label: 'Discount', kind: 'discount', mode: 'fixed', value: '10', base: 'allBillable', enabled: true, order: 1, ...overrides }
}

const codes = (items: QuoteItem[], adjustments: Adjustment[] = []) => checkQuotation({ items, adjustments }).map(({ code }) => code)

describe('checkQuotation', () => {
  it('passes a complete quotation', () => {
    expect(codes([item()], [adjustment()])).toEqual([])
  })

  it('needs at least one counted item', () => {
    expect(codes([])).toEqual(['NO_ITEMS'])
    expect(codes([item({ included: false })])).toEqual(['NO_ITEMS'])
  })

  it('C-08: blocks a missing price, but not on a free item or one left out', () => {
    const unpriced = item({ unitPriceMinor: null })
    const issues = checkQuotation({ items: [unpriced], adjustments: [] })
    expect(issues).toEqual([expect.objectContaining({ code: 'ITEM_PRICE_MISSING', itemId: unpriced.id, severity: 'error' })])
    expect(codes([item({ unitPriceMinor: null, isFree: true })])).toEqual([])
    expect(codes([item(), item({ unitPriceMinor: null, included: false })])).toEqual([])
  })

  it('counts an unpriced item as nothing in the totals and names it', () => {
    const unpriced = item({ unitPriceMinor: null })
    const totals = computeTotals({ items: [item(), unpriced], adjustments: [] })
    expect(totals.subtotalMinor).toBe(10_000)
    expect(totals.unpricedItemIds).toEqual([unpriced.id])
  })

  it.each([
    ['', 'ITEM_QUANTITY_MISSING'],
    ['0', 'ITEM_QUANTITY_INVALID'],
    ['two', 'ITEM_QUANTITY_INVALID'],
    ['-1', 'ITEM_QUANTITY_INVALID'],
    ['2000000', 'ITEM_QUANTITY_INVALID'],
  ])('rejects quantity %j', (quantity, code) => {
    expect(codes([item({ quantity })])).toEqual([code])
  })

  it('rejects a blank description and a negative price', () => {
    expect(codes([item({ description: '  ' })])).toEqual(['ITEM_DESCRIPTION_MISSING'])
    expect(codes([item({ unitPriceMinor: -500 })])).toContain('ITEM_PRICE_NEGATIVE')
  })

  it('allows one alternative from a group, not two', () => {
    const genuine = item({ alternativeGroupId: 'g1' })
    const replacement = item({ alternativeGroupId: 'g1' })
    expect(codes([genuine, { ...replacement, included: false }])).toEqual([])
    expect(codes([genuine, replacement])).toEqual(['ALTERNATIVES_BOTH_INCLUDED'])
  })

  it('checks enabled adjustments only', () => {
    expect(codes([item()], [adjustment({ value: 'ten' })])).toEqual(['ADJUSTMENT_VALUE_INVALID'])
    expect(codes([item()], [adjustment({ value: 'ten', enabled: false })])).toEqual([])
    expect(codes([item()], [adjustment({ mode: 'percentage', value: '120' })])).toEqual(['ADJUSTMENT_VALUE_INVALID'])
    expect(codes([item()], [adjustment({ mode: 'percentage', value: '5', base: 'manual' })])).toEqual(['ADJUSTMENT_BASE_MISSING'])
  })

  it('warns, without blocking, when more than one discount is on', () => {
    const issues = checkQuotation({ items: [item()], adjustments: [adjustment(), adjustment({ value: '5' })] })
    expect(issues).toEqual([expect.objectContaining({ code: 'SEVERAL_DISCOUNTS', severity: 'warning' })])
  })

  it('needs a customer and a real date when they are given', () => {
    const check = (customerName: string, quoteDateISO: string) =>
      checkQuotation({ items: [item()], adjustments: [], customerName, quoteDateISO }).map(({ code }) => code)
    expect(check('Ventura Motors', '2026-11-03')).toEqual([])
    expect(check('  ', '2026-11-03')).toEqual(['CUSTOMER_MISSING'])
    expect(check('Ventura Motors', '')).toEqual(['DATE_INVALID'])
    expect(check('Ventura Motors', '2026-02-30')).toEqual(['DATE_INVALID'])
  })

  it('blocks adjustments larger than the items', () => {
    expect(codes([item()], [adjustment({ value: '500' })])).toEqual(['NEGATIVE_TOTAL'])
  })
})
