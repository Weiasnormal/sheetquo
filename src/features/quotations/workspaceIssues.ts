import { checkQuotation } from '../../domain/quotation/checkQuotation'
import type { QuotationIssue } from '../../domain/quotation/checkQuotation'
import type { ParseResult } from '../../domain/parser/parseQuotationText'
import { isWaiting, reviewLine } from '../../domain/parser/review'
import type { Quotation } from '../../domain/quotation/types'
import { adjustmentDiagnostics } from '../../domain/template/adjustmentSupport'
import { toDefinition } from '../../domain/template/mappingDraft'
import type { TemplateVersionRecord } from '../../domain/template/records'
import { itemFieldId } from './draftSetup'

export type WorkspaceIssue = QuotationIssue & {
  /** A CSS selector for the control that fixes it. */
  target?: string
}

const ITEM_FIELD: Record<string, 'description' | 'quantity' | 'price'> = {
  ITEM_DESCRIPTION_MISSING: 'description',
  ITEM_QUANTITY_MISSING: 'quantity',
  ITEM_QUANTITY_INVALID: 'quantity',
  ITEM_PRICE_MISSING: 'price',
  ITEM_PRICE_NEGATIVE: 'price',
}

function targetOf({ code, itemId }: QuotationIssue): string | undefined {
  if (code === 'CUSTOMER_MISSING') return '[name="customerName"]'
  if (code === 'DATE_INVALID') return '[name="quoteDateISO"]'
  if (itemId && ITEM_FIELD[code]) return `#${CSS.escape(itemFieldId(itemId, ITEM_FIELD[code]))}`
  return undefined
}

/** The quotation's own checks, plus what the chosen template version can and cannot print. */
export function workspaceIssues(quotation: Quotation & { parse?: ParseResult; answeredLines?: number[] }, version: TemplateVersionRecord | undefined): WorkspaceIssue[] {
  const issues: WorkspaceIssue[] = checkQuotation(quotation).map((issue) => ({ ...issue, target: targetOf(issue) }))

  // Flagged lines never block, since they stay out of the quotation, but the owner should not miss them.
  const waiting = (quotation.parse?.lines ?? []).filter((line) => isWaiting(reviewLine(quotation, line), quotation.answeredLines)).length
  if (waiting > 0) {
    const lines = waiting === 1 ? '1 line from the message is' : `${waiting} lines from the message are`
    issues.push({ severity: 'warning', code: 'LINES_WAITING', message: `${lines} waiting for your choice.`, target: '#source-lines' })
  }
  const definition = version?.mapping ? toDefinition(version.mapping) : undefined
  if (!version) {
    issues.push({ severity: 'error', code: 'TEMPLATE_MISSING', message: 'The template for this quotation is no longer saved. Choose another.' })
  } else if (version.state === 'draft' || !definition) {
    issues.push({ severity: 'error', code: 'VERSION_NOT_TESTED', message: 'This template version has not passed its test yet.' })
  } else {
    // Layout limits, such as a fixed number of rows, are reported by the engine when generating.
    for (const { code, message } of adjustmentDiagnostics(quotation, definition)) issues.push({ severity: 'error', code, message })
  }
  return issues
}
