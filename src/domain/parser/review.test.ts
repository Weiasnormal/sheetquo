import { describe, expect, it } from 'vitest'
import { computeTotals } from '../calculations/money'
import { checkQuotation } from '../quotation/checkQuotation'
import { parseQuotationText } from './parseQuotationText'
import { applyLineChoice, isWaiting, reviewLine } from './review'
import { quotationFromParse } from './toQuotation'

const base = { id: 'q1', businessId: 'b1', templateVersionId: 'v1', quoteDateISO: '2026-11-03', customerName: 'Ventura Motors' }

function draftFrom(text: string) {
  const parse = parseQuotationText(text)
  return { parse, draft: quotationFromParse(parse, text, base) }
}

describe('reviewing parsed lines', () => {
  it('asks whether an unclear amount is for each one or for all, and applies the answer', () => {
    const { parse, draft } = draftFrom('3 clutch bearings 1800')
    const [line] = parse.lines
    const review = reviewLine(draft, line)
    expect(review.outcome).toBe('left-out')
    expect(review.choices.map(({ id }) => id)).toEqual(['each', 'total', 'add'])

    const each = applyLineChoice(draft, line, 'each')
    expect(computeTotals(each).subtotalMinor).toBe(540_000)
    const total = applyLineChoice(draft, line, 'total')
    expect(computeTotals(total).subtotalMinor).toBe(180_000)
    expect(reviewLine(total, line).outcome).toBe('added')
  })

  it('offers only "each" when the total does not divide to the centavo', () => {
    const { parse, draft } = draftFrom('3 pcs Wiper 1,000')
    expect(reviewLine(draft, parse.lines[0]).choices.map(({ id }) => id)).toEqual(['each', 'add'])
  })

  it('adds an unclear line with its price still empty, so generation stays blocked', () => {
    const { parse, draft } = draftFrom('3 clutch bearings 1800')
    const added = applyLineChoice(draft, parse.lines[0], 'add')
    expect(checkQuotation(added).map(({ code }) => code)).toEqual(['ITEM_PRICE_MISSING'])
  })

  it('picks one alternative and switches to the other', () => {
    const { parse, draft } = draftFrom('1 pc Part A - genuine 1200 / replacement 700')
    const [line] = parse.lines
    expect(reviewLine(draft, line).choices.map(({ label }) => label)).toEqual(['Use genuine, ₱1,200.00', 'Use replacement, ₱700.00'])

    const genuine = applyLineChoice(draft, line, reviewLine(draft, line).choices[0].id)
    expect(computeTotals(genuine).subtotalMinor).toBe(120_000)
    const replacement = applyLineChoice(genuine, line, reviewLine(genuine, line).choices[0].id)
    expect(computeTotals(replacement).subtotalMinor).toBe(70_000)
    expect(checkQuotation(replacement).map(({ code }) => code)).not.toContain('ALTERNATIVES_BOTH_INCLUDED')
  })

  it('leaves out, removes, and brings back an item line', () => {
    const { parse, draft } = draftFrom('2 pcs Brake Pad @ 1200')
    const [line] = parse.lines
    expect(reviewLine(draft, line)).toMatchObject({ outcome: 'added', summary: 'Brake Pad · 2 PC · ₱1,200.00 each' })
    expect(reviewLine(applyLineChoice(draft, line, 'leave-out'), line).outcome).toBe('left-out')

    const removed = { ...draft, items: [] }
    expect(reviewLine(removed, line).outcome).toBe('removed')
    expect(applyLineChoice(removed, line, 'restore').items).toEqual(draft.items)
  })

  it('counts a flagged item as waiting until the owner answers it, and never a deduction', () => {
    const { parse, draft } = draftFrom('3 clutch bearings 1800\nLess 3% for 2307')
    const [item, deduction] = parse.lines
    expect(isWaiting(reviewLine(draft, item))).toBe(true)
    expect(isWaiting(reviewLine(draft, deduction))).toBe(false)
    // Leaving it out on purpose is an answer too.
    expect(isWaiting(reviewLine(applyLineChoice(draft, item, 'leave-out'), item), [item.number])).toBe(false)
  })

  it('turns a 2307 deduction on only when asked', () => {
    const { parse, draft } = draftFrom('1 pc Oil Filter @ 1000\nLess 3% for 2307')
    const line = parse.lines[1]
    expect(reviewLine(draft, line).outcome).toBe('left-out')
    const on = applyLineChoice(draft, line, 'turn-on')
    expect(computeTotals(on).grandTotalMinor).toBe(97_000)
  })

  it('shows a repeated field as unused, and swaps it in when chosen', () => {
    const { parse, draft } = draftFrom('Customer: Ventura Motors\nCustomer: Other Name')
    expect(reviewLine(draft, parse.lines[0]).outcome).toBe('used')
    expect(reviewLine(draft, parse.lines[1])).toMatchObject({ outcome: 'not-used', summary: 'Customer: Other Name' })
    expect(applyLineChoice(draft, parse.lines[1], 'use').customerName).toBe('Other Name')
  })

  it('turns an unread line into an item the owner completes, and takes it back out', () => {
    const { parse, draft } = draftFrom('Pa-check din po ng aircon')
    const [line] = parse.lines
    expect(reviewLine(draft, line).outcome).toBe('ignored')
    const added = applyLineChoice(draft, line, 'add-as-item')
    expect(added.items).toEqual([expect.objectContaining({ description: 'Pa-check din po ng aircon', quantity: '', unitPriceMinor: null })])
    expect(reviewLine(added, line).outcome).toBe('added')
    expect(applyLineChoice(added, line, 'remove').items).toEqual([])
  })
})
