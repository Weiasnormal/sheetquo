import { computeTotals, isDecimal, parseDecimal } from '../calculations/money'
import type { Quotation } from './types'

export type QuotationIssue = {
  severity: 'error' | 'warning'
  code: string
  message: string
  itemId?: string
  adjustmentId?: string
}

const MAX_QUANTITY = 1_000_000

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function isRealDate(iso: string): boolean {
  const match = ISO_DATE.exec(iso)
  if (!match) return false
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.toISOString().slice(0, 10) === iso
}

type Checked = Pick<Quotation, 'items' | 'adjustments'> & Partial<Pick<Quotation, 'customerName' | 'quoteDateISO'>>

/** Everything that would make a quotation wrong if generated. Errors block generation; warnings are shown. */
export function checkQuotation(quotation: Checked): QuotationIssue[] {
  const issues: QuotationIssue[] = []

  // Checked only when given, so totals-only callers need not pass them.
  if (quotation.customerName !== undefined && !quotation.customerName.trim()) {
    issues.push({ severity: 'error', code: 'CUSTOMER_MISSING', message: 'Enter the customer’s name.' })
  }
  if (quotation.quoteDateISO !== undefined && !isRealDate(quotation.quoteDateISO)) {
    issues.push({ severity: 'error', code: 'DATE_INVALID', message: 'Enter the quotation date.' })
  }

  const included = quotation.items.filter((item) => item.included)

  if (included.length === 0) {
    issues.push({ severity: 'error', code: 'NO_ITEMS', message: 'Add at least one item.' })
  }

  included.forEach((item, index) => {
    const name = item.description.trim() || `Item ${index + 1}`
    const at = { itemId: item.id }
    if (!item.description.trim()) {
      issues.push({ severity: 'error', code: 'ITEM_DESCRIPTION_MISSING', message: `Item ${index + 1} needs a description.`, ...at })
    }
    if (item.quantity.trim() === '') {
      issues.push({ severity: 'error', code: 'ITEM_QUANTITY_MISSING', message: `${name} needs a quantity.`, ...at })
    } else if (!isDecimal(item.quantity) || parseDecimal(item.quantity).scaled === 0n) {
      issues.push({ severity: 'error', code: 'ITEM_QUANTITY_INVALID', message: `${name}: the quantity must be a number above zero.`, ...at })
    } else if (Number(item.quantity) > MAX_QUANTITY) {
      issues.push({ severity: 'error', code: 'ITEM_QUANTITY_INVALID', message: `${name}: the quantity looks too large.`, ...at })
    }
    if (item.unitPriceMinor === null && !item.isFree) {
      issues.push({ severity: 'error', code: 'ITEM_PRICE_MISSING', message: `${name} needs a price, or mark it free.`, ...at })
    } else if (item.unitPriceMinor !== null && item.unitPriceMinor < 0) {
      issues.push({ severity: 'error', code: 'ITEM_PRICE_NEGATIVE', message: `${name}: a price cannot be negative. Use a discount instead.`, ...at })
    }
  })

  const groups = new Map<string, number>()
  for (const item of included) {
    if (item.alternativeGroupId) groups.set(item.alternativeGroupId, (groups.get(item.alternativeGroupId) ?? 0) + 1)
  }
  for (const [groupId, count] of groups) {
    if (count > 1) {
      issues.push({
        severity: 'error',
        code: 'ALTERNATIVES_BOTH_INCLUDED',
        message: 'Two alternatives for the same part are both counted. Keep one.',
        itemId: included.find((item) => item.alternativeGroupId === groupId)?.id,
      })
    }
  }

  const enabled = quotation.adjustments.filter((adjustment) => adjustment.enabled)
  for (const adjustment of enabled) {
    const at = { adjustmentId: adjustment.id }
    const label = adjustment.label.trim() || 'An adjustment'
    if (!isDecimal(adjustment.value)) {
      issues.push({ severity: 'error', code: 'ADJUSTMENT_VALUE_INVALID', message: `${label} needs an amount.`, ...at })
    } else if (adjustment.mode === 'percentage' && Number(adjustment.value) > 100) {
      issues.push({ severity: 'error', code: 'ADJUSTMENT_VALUE_INVALID', message: `${label}: a percentage cannot be over 100.`, ...at })
    }
    if (adjustment.base === 'manual' && adjustment.mode === 'percentage' && adjustment.manualBaseMinor === undefined) {
      issues.push({ severity: 'error', code: 'ADJUSTMENT_BASE_MISSING', message: `${label} needs the amount it is taken from.`, ...at })
    }
  }
  if (enabled.filter(({ kind }) => kind === 'discount').length > 1) {
    issues.push({ severity: 'warning', code: 'SEVERAL_DISCOUNTS', message: 'More than one discount is on. Check they are not the same discount twice.' })
  }

  // A bad adjustment already has its own message; a negative total from it would only repeat it.
  const adjustmentsValid = !issues.some(({ adjustmentId }) => adjustmentId !== undefined)
  if (adjustmentsValid && computeTotals(quotation).grandTotalMinor < 0) {
    issues.push({ severity: 'error', code: 'NEGATIVE_TOTAL', message: 'The adjustments are larger than the items, so the total is below zero.' })
  }
  return issues
}
