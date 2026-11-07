import type { Quotation } from '../quotation/types'
import type { Diagnostic } from './diagnostics'
import type { TemplateDefinition } from './types'

/**
 * A legacy discount cell supports one discount. Explicit footer slots support every adjustment kind/base.
 */
export function adjustmentDiagnostics(
  quotation: Pick<Quotation, 'adjustments'>,
  template: Pick<TemplateDefinition, 'cellMappings' | 'adjustmentRows'>,
): Diagnostic[] {
  const enabled = quotation.adjustments.filter((adjustment) => adjustment.enabled)
  const hasDiscountCell = template.cellMappings.some((mapping) => mapping.semanticKey === 'totals.discount')
  const errors: Diagnostic[] = []
  if (template.adjustmentRows?.length) {
    if (enabled.length > template.adjustmentRows.length) errors.push({ severity: 'error', code: 'ADJUSTMENT_NOT_SUPPORTED', message: `Map at least ${enabled.length} adjustment rows in a new template version. This version has ${template.adjustmentRows.length}.` })
    if (enabled.length && template.cellMappings.some((mapping) => ['totals.grandTotal', 'totals.discount'].includes(mapping.semanticKey) && mapping.overwrite === 'preserve')) errors.push({ severity: 'error', code: 'ADJUSTMENT_NOT_SUPPORTED', message: 'Let Sheetquo calculate the grand total and discount total for mapped adjustments: uncheck “Keep the template’s own formula” for these totals in a new version.' })
    return errors
  }
  if (enabled.some((adjustment) => adjustment.kind !== 'discount') || enabled.length > 1) {
    errors.push({ severity: 'error', code: 'ADJUSTMENT_NOT_SUPPORTED', message: 'Map an adjustment row for each enabled discount, deduction, fee or tax in a new template version.' })
  }
  const [discount] = enabled
  if (discount && !hasDiscountCell) {
    errors.push({ severity: 'error', code: 'DISCOUNT_NOT_MAPPED', message: 'This quotation has a discount but the template has no discount cell.' })
  }
  return errors
}
