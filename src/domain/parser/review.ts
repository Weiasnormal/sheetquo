import { formatMoney } from '../calculations/money'
import { formatDate } from '../formatDate'
import type { Quotation, QuoteItem } from '../quotation/types'
import type { FieldKey, ParsedLine } from './parseQuotationText'
import { unitPriceFromTotal } from './parseQuotationText'
import { adjustmentsFromParse, itemsFromParse } from './toQuotation'

/** Where each parsed field lands on the quotation. */
export const FIELD_TARGETS: Record<FieldKey, { prop: keyof Quotation; label: string }> = {
  customerName: { prop: 'customerName', label: 'Customer' },
  customerAddress: { prop: 'customerAddress', label: 'Customer address' },
  customerTIN: { prop: 'customerTIN', label: 'Customer TIN' },
  quoteDate: { prop: 'quoteDateISO', label: 'Date' },
  quoteNumber: { prop: 'quoteNumber', label: 'Quotation number' },
  vehicle: { prop: 'vehicle', label: 'Vehicle' },
  engine: { prop: 'engine', label: 'Engine' },
  plate: { prop: 'plate', label: 'Plate' },
  chassis: { prop: 'chassis', label: 'Chassis' },
  notes: { prop: 'notes', label: 'Notes' },
}

export type LineOutcome = 'added' | 'left-out' | 'removed' | 'used' | 'not-used' | 'ignored'
export type LineChoice = { id: string; label: string }

export type LineReview = {
  line: ParsedLine
  outcome: LineOutcome
  /** What the line became, in a few words. */
  summary: string
  choices: LineChoice[]
}

type Draft = Pick<Quotation, 'items' | 'adjustments'> & Partial<Quotation>

const lineId = (number: number) => `line-${number}`
const inGroup = (item: QuoteItem, number: number) => item.id === lineId(number) || item.alternativeGroupId === lineId(number)

function describeItem(item: Pick<QuoteItem, 'description' | 'quantity' | 'unit' | 'unitPriceMinor' | 'isFree'>): string {
  const quantity = item.quantity ? `${item.quantity}${item.unit ? ` ${item.unit}` : ''}` : 'no quantity'
  const price = item.isFree ? 'free' : item.unitPriceMinor === null ? 'no price' : `${formatMoney(item.unitPriceMinor)} each`
  return [item.description || 'No description', quantity, price].join(' · ')
}

function reviewItem(draft: Draft, line: ParsedLine): LineReview {
  const items = draft.items.filter((item) => inGroup(item, line.number))
  if (items.length === 0) {
    return { line, outcome: 'removed', summary: 'Removed from the items', choices: [{ id: 'restore', label: 'Add again' }] }
  }

  const parsed = line.item
  if (parsed?.priceOptions) {
    const chosen = items.find((item) => item.included)
    // Named by the option it came from, even after the owner edits or removes the others.
    const optionName = (item: QuoteItem) =>
      parsed.priceOptions?.find(({ label }) => item.description === `${parsed.description} (${label})`)?.label ?? item.description
    const choices = items
      .filter((item) => !item.included)
      .map((item) => ({
        id: `use:${item.id}`,
        label: `Use ${optionName(item)}${item.unitPriceMinor === null ? '' : `, ${formatMoney(item.unitPriceMinor)}`}`,
      }))
    return chosen
      ? { line, outcome: 'added', summary: describeItem(chosen), choices: [...choices, { id: 'leave-out', label: 'Leave out' }] }
      : { line, outcome: 'left-out', summary: 'Choose one price', choices }
  }

  const [item] = items
  if (item.included) {
    return { line, outcome: 'added', summary: describeItem(item), choices: [{ id: 'leave-out', label: 'Leave out' }] }
  }

  // The amount could be for each one or for all of them, so the owner says which.
  const stated = parsed?.statedAmountMinor
  if (stated !== undefined && item.unitPriceMinor === null && item.quantity) {
    const choices = [{ id: 'each', label: `${formatMoney(stated)} each` }]
    if (unitPriceFromTotal(stated, item.quantity) !== undefined) {
      choices.push({ id: 'total', label: `${formatMoney(stated)} for all ${item.quantity}` })
    }
    return { line, outcome: 'left-out', summary: describeItem(item), choices: [...choices, { id: 'add', label: 'Add, I’ll enter the price' }] }
  }
  return { line, outcome: 'left-out', summary: describeItem(item), choices: [{ id: 'add', label: 'Add' }] }
}

function reviewAdjustment(draft: Draft, line: ParsedLine): LineReview {
  const adjustment = draft.adjustments.find(({ id }) => id === lineId(line.number))
  if (!adjustment) {
    return { line, outcome: 'removed', summary: 'Removed from the adjustments', choices: [{ id: 'restore', label: 'Add again' }] }
  }
  return adjustment.enabled
    ? { line, outcome: 'added', summary: adjustment.label, choices: [{ id: 'turn-off', label: 'Turn off' }] }
    : { line, outcome: 'left-out', summary: `${adjustment.label}, off`, choices: [{ id: 'turn-on', label: 'Turn on' }] }
}

function reviewField(draft: Draft, line: ParsedLine): LineReview {
  const { key, value } = line.field!
  const target = FIELD_TARGETS[key]
  const shown = key === 'quoteDate' ? formatDate(value) : value
  const summary = `${target.label}: ${shown}`
  return draft[target.prop] === value
    ? { line, outcome: 'used', summary, choices: [] }
    : { line, outcome: 'not-used', summary, choices: [{ id: 'use', label: `Use as ${target.label.toLocaleLowerCase()}` }] }
}

export function reviewLine(draft: Draft, line: ParsedLine): LineReview {
  if (line.kind === 'item') return reviewItem(draft, line)
  if (line.kind === 'adjustment') return reviewAdjustment(draft, line)
  if (line.kind === 'field' && line.field) return reviewField(draft, line)

  const added = draft.items.find(({ id }) => id === lineId(line.number))
  return added
    ? { line, outcome: 'added', summary: describeItem(added), choices: [{ id: 'remove', label: 'Remove' }] }
    : { line, outcome: 'ignored', summary: '', choices: [{ id: 'add-as-item', label: 'Add as an item' }] }
}

/** A held-back item the owner has not answered yet. Deductions start off on purpose, so they never wait. */
export function isWaiting(review: LineReview, answered: readonly number[] = []): boolean {
  const { line, outcome } = review
  return line.kind === 'item' && line.status === 'needs-review' && outcome === 'left-out' && !answered.includes(line.number)
}

/** Applies one choice from the review. Returns the draft unchanged when the choice no longer fits. */
export function applyLineChoice<T extends Draft>(draft: T, line: ParsedLine, choiceId: string): T {
  const id = lineId(line.number)
  const setItems = (update: (items: QuoteItem[]) => QuoteItem[]) => ({ ...draft, items: update(draft.items) })
  const patchLine = (patch: Partial<QuoteItem>) => setItems((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)))

  if (choiceId.startsWith('use:')) {
    const chosen = choiceId.slice(4)
    return setItems((items) => items.map((item) => (inGroup(item, line.number) ? { ...item, included: item.id === chosen, notes: undefined } : item)))
  }

  switch (choiceId) {
    case 'add':
      return patchLine({ included: true })
    case 'leave-out':
      return setItems((items) => items.map((item) => (inGroup(item, line.number) ? { ...item, included: false } : item)))
    case 'each':
      return patchLine({ included: true, unitPriceMinor: line.item?.statedAmountMinor ?? null, notes: undefined })
    case 'total': {
      const item = draft.items.find((candidate) => candidate.id === id)
      const stated = line.item?.statedAmountMinor
      const unit = item && stated !== undefined ? unitPriceFromTotal(stated, item.quantity) : undefined
      return unit === undefined ? draft : patchLine({ included: true, unitPriceMinor: unit, notes: undefined })
    }
    case 'restore': {
      const single = { lines: [line], fields: {} }
      if (line.kind === 'adjustment') {
        const [restored] = adjustmentsFromParse(single)
        return { ...draft, adjustments: [...draft.adjustments, { ...restored, order: draft.adjustments.length + 1 }] }
      }
      return setItems((items) => [...items, ...itemsFromParse(single)])
    }
    case 'turn-on':
    case 'turn-off':
      return {
        ...draft,
        adjustments: draft.adjustments.map((adjustment) => (adjustment.id === id ? { ...adjustment, enabled: choiceId === 'turn-on' } : adjustment)),
      }
    case 'use': {
      if (!line.field) return draft
      return { ...draft, [FIELD_TARGETS[line.field.key].prop]: line.field.value }
    }
    case 'add-as-item':
      return setItems((items) => [
        ...items,
        { id, description: line.text, quantity: '', unitPriceMinor: null, type: 'part', included: true },
      ])
    case 'remove':
      return setItems((items) => items.filter((item) => item.id !== id))
    default:
      return draft
  }
}
