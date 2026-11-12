import type { Diagnostic } from '../infrastructure/excel/WorkbookAdapter'
import { downloadXlsx } from '../infrastructure/downloads/downloadBytes'

export type SampleTemplateId = 'parts' | 'service'

export type SampleResult = { ok: true; filename: string } | { ok: false; diagnostics: Diagnostic[] }

/** Loaded on demand, so the Excel engine stays out of the first page load. */
export async function generateSample(templateId: SampleTemplateId, itemCount: number): Promise<SampleResult> {
  const [{ ExcelJsAdapter }, templates, quotations] = await Promise.all([
    import('../infrastructure/excel/ExcelJsAdapter'),
    import('../test/fixtures/synthetic/templates'),
    import('../test/fixtures/synthetic/quotations'),
  ])

  const isParts = templateId === 'parts'
  const result = await new ExcelJsAdapter().generate({
    templateBytes: await (isParts ? templates.buildPartsTemplate() : templates.buildServiceTemplate()),
    template: isParts ? templates.PARTS_TEMPLATE : templates.SERVICE_TEMPLATE,
    business: isParts ? quotations.SAMPLE_BUSINESS_A : quotations.SAMPLE_BUSINESS_B,
    quotation: quotations.sampleQuotation(itemCount),
  })

  if (!result.ok) return { ok: false, diagnostics: result.diagnostics }

  downloadXlsx(result.workbook.bytes, result.workbook.filename)
  return { ok: true, filename: result.workbook.filename }
}
