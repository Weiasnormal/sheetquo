import type { BusinessRecord } from '../../domain/business/businessForm'
import type { QuotationRecord } from '../../domain/quotation/records'
import type { Diagnostic } from '../../domain/template/diagnostics'
import { toDefinition } from '../../domain/template/mappingDraft'
import type { TemplateVersionRecord } from '../../domain/template/records'
import { downloadXlsx } from '../../infrastructure/downloads/downloadBytes'
import { readWorkbookBytes } from '../../infrastructure/storage/templateRepository'
import { loadAdapter } from '../templates/loadAdapter'

export type GenerateOutcome =
  | { ok: true; filename: string; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] }

const fail = (code: string, message: string): GenerateOutcome => ({ ok: false, diagnostics: [{ severity: 'error', code, message }] })

/** Fills the draft's own template version and downloads the file. The stored template never changes. */
export async function generateQuotation(
  record: QuotationRecord,
  business: BusinessRecord,
  version: TemplateVersionRecord,
): Promise<GenerateOutcome> {
  if (version.state === 'draft') return fail('VERSION_NOT_TESTED', 'This template version has not passed its test yet.')
  const definition = version.mapping ? toDefinition(version.mapping) : undefined
  if (!definition) return fail('VERSION_NOT_MAPPED', 'This template version is not fully mapped.')
  const templateBytes = await readWorkbookBytes(version.sourceBlobId)
  if (!templateBytes) return fail('TEMPLATE_MISSING', 'The template file is no longer saved in this browser.')

  const adapter = await loadAdapter()
  const result = await adapter.generate({ templateBytes, template: definition, business, quotation: record })
  if (!result.ok) return { ok: false, diagnostics: result.diagnostics }
  downloadXlsx(result.workbook.bytes, result.workbook.filename)
  return { ok: true, filename: result.workbook.filename, diagnostics: result.workbook.diagnostics }
}
