import type { Adjustment, Quotation, QuoteItem } from '../quotation/types'
import type { ParseResult } from './parseQuotationText'

/**
 * Items the parser is sure of go in. Incomplete ones go in too, so their missing quantity or price
 * blocks generation until filled. Anything flagged for review stays out until the owner confirms it.
 */
export function itemsFromParse(result: ParseResult): QuoteItem[] {
  const items: QuoteItem[] = []
  for (const line of result.lines) {
    if (line.kind !== 'item' || !line.item) continue
    const { item, status, number } = line
    const base = {
      partNumber: item.partNumber,
      quantity: item.quantity ?? '',
      unit: item.unit,
      type: item.type,
      isFree: item.isFree || undefined,
      notes: line.notes.length > 0 ? line.notes.map(({ message }) => message).join(' ') : undefined,
    }

    if (item.priceOptions) {
      // Each price becomes its own choice in one group. Neither is counted until one is picked.
      item.priceOptions.forEach((option, index) => {
        items.push({
          ...base,
          id: `line-${number}-${index + 1}`,
          description: `${item.description} (${option.label})`,
          unitPriceMinor: option.priceMinor,
          included: false,
          alternativeGroupId: `line-${number}`,
        })
      })
      continue
    }

    items.push({
      ...base,
      id: `line-${number}`,
      description: item.description,
      unitPriceMinor: item.unitPriceMinor ?? null,
      included: status === 'recognized' || status === 'incomplete',
    })
  }
  return items
}

export function adjustmentsFromParse(result: ParseResult): Adjustment[] {
  return result.lines
    .filter((line) => line.kind === 'adjustment' && line.adjustment)
    .map((line, index) => ({
      id: `line-${line.number}`,
      label: line.adjustment!.label,
      kind: line.adjustment!.kind,
      mode: line.adjustment!.mode,
      value: line.adjustment!.value,
      base: 'allBillable' as const,
      enabled: line.adjustment!.enabled,
      order: index + 1,
    }))
}

type QuotationBase = Pick<Quotation, 'id' | 'businessId' | 'templateVersionId' | 'quoteDateISO'> & Partial<Quotation>

export function quotationFromParse(result: ParseResult, rawInput: string, base: QuotationBase): Quotation {
  const { fields } = result
  return {
    ...base,
    quoteDateISO: fields.quoteDate ?? base.quoteDateISO,
    quoteNumber: fields.quoteNumber ?? base.quoteNumber,
    customerName: fields.customerName ?? base.customerName ?? '',
    customerAddress: fields.customerAddress ?? base.customerAddress,
    customerTIN: fields.customerTIN ?? base.customerTIN,
    vehicle: fields.vehicle ?? base.vehicle,
    engine: fields.engine ?? base.engine,
    plate: fields.plate ?? base.plate,
    chassis: fields.chassis ?? base.chassis,
    notes: fields.notes ?? base.notes,
    items: itemsFromParse(result),
    adjustments: adjustmentsFromParse(result),
    rawInput,
  }
}
