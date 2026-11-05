import type { Adjustment, Quotation, QuoteItem } from '../quotation/types'

const DECIMAL = /^\d+(\.\d+)?$/

export type Decimal = { scaled: bigint; scale: bigint }

export function parseDecimal(text: string): Decimal {
  const trimmed = text.trim()
  if (!DECIMAL.test(trimmed)) {
    throw new RangeError(`"${text}" is not a positive decimal number`)
  }
  const [whole, fraction = ''] = trimmed.split('.')
  return { scaled: BigInt(whole + fraction), scale: 10n ** BigInt(fraction.length) }
}

export function isDecimal(text: string): boolean {
  return DECIMAL.test(text.trim())
}

/** Rounds a non-negative ratio half up, matching Excel's ROUND on positive values. */
function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n)
}

function toSafeMinor(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Amount is too large')
  }
  return Number(value)
}

/** The line's amount, or null while its quantity or price is missing or unreadable. A free item is always zero. */
export function lineAmountMinor(item: Pick<QuoteItem, 'quantity' | 'unitPriceMinor' | 'isFree'>): number | null {
  if (item.isFree) return 0
  if (item.unitPriceMinor === null || !isDecimal(item.quantity)) return null
  const quantity = parseDecimal(item.quantity)
  return toSafeMinor(divideHalfUp(quantity.scaled * BigInt(item.unitPriceMinor), quantity.scale))
}

export function majorToMinor(text: string): number {
  const amount = parseDecimal(text)
  return toSafeMinor(divideHalfUp(amount.scaled * 100n, amount.scale))
}

export function minorToNumber(minor: number): number {
  return minor / 100
}

export function formatMoney(minor: number, currency = 'PHP'): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(minorToNumber(minor))
}

const MONEY_INPUT = /^\d+(\.\d{1,2})?$/

/** Reads an amount as people type it, such as "1,200.50", "₱1200", or "PHP 350". Undefined when it is not one. */
export function parseMoneyInput(text: string): number | undefined {
  const cleaned = text.replace(/₱|php/gi, '').replace(/[,\s]/g, '')
  if (!MONEY_INPUT.test(cleaned)) return undefined
  try {
    return majorToMinor(cleaned)
  } catch {
    return undefined
  }
}

/** An amount for an input box: grouped, two decimals, and no currency sign. */
export function formatMoneyInput(minor: number): string {
  return new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minorToNumber(minor))
}

export type AdjustmentTotal = {
  id: string
  label: string
  kind: Adjustment['kind']
  /** What a percentage was taken from, shown beside it so the base is never hidden. */
  baseMinor?: number
  amountMinor: number
}

export type Totals = {
  /** Every included item that is not labor: parts, services, and other lines. */
  partsMinor: number
  laborMinor: number
  subtotalMinor: number
  adjustments: AdjustmentTotal[]
  grandTotalMinor: number
  /** Included items left out of the sums because their quantity or price is missing. */
  unpricedItemIds: string[]
}

function adjustmentAmount(adjustment: Adjustment, bases: Record<Adjustment['base'], number>): { amountMinor: number; baseMinor?: number } {
  if (adjustment.mode === 'fixed') {
    return { amountMinor: isDecimal(adjustment.value) ? majorToMinor(adjustment.value) : 0 }
  }
  const baseMinor = adjustment.base === 'manual' ? (adjustment.manualBaseMinor ?? 0) : bases[adjustment.base]
  if (!isDecimal(adjustment.value)) return { amountMinor: 0, baseMinor }
  const rate = parseDecimal(adjustment.value)
  return { amountMinor: toSafeMinor(divideHalfUp(BigInt(baseMinor) * rate.scaled, rate.scale * 100n)), baseMinor }
}

/** Never throws: unreadable values count as zero here, and `checkQuotation` reports them. */
export function computeTotals(quotation: Pick<Quotation, 'items' | 'adjustments'>): Totals {
  let partsMinor = 0
  let laborMinor = 0
  const unpricedItemIds: string[] = []
  for (const item of quotation.items) {
    if (!item.included) continue
    const amount = lineAmountMinor(item)
    if (amount === null) {
      unpricedItemIds.push(item.id)
      continue
    }
    if (item.type === 'labor') laborMinor += amount
    else partsMinor += amount
  }

  const subtotalMinor = partsMinor + laborMinor
  const bases = { parts: partsMinor, labor: laborMinor, allBillable: subtotalMinor, manual: 0 }

  let grandTotalMinor = subtotalMinor
  const adjustments = [...quotation.adjustments]
    .filter((adjustment) => adjustment.enabled)
    .sort((a, b) => a.order - b.order)
    .map((adjustment): AdjustmentTotal => {
      const { amountMinor, baseMinor } = adjustmentAmount(adjustment, bases)
      const subtracts = adjustment.kind === 'discount' || adjustment.kind === 'deduction'
      grandTotalMinor += subtracts ? -amountMinor : amountMinor
      return { id: adjustment.id, label: adjustment.label, kind: adjustment.kind, baseMinor, amountMinor }
    })

  return { partsMinor, laborMinor, subtotalMinor, adjustments, grandTotalMinor, unpricedItemIds }
}
