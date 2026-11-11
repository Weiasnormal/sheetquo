import type { Adjustment, Business } from '../../../domain/quotation/types'
import type { TemplateTestResult, TestRun } from '../../../domain/template/records'
import type { TemplateDefinition } from '../../../domain/template/types'
import { sampleQuotation } from '../../../test/fixtures/synthetic/quotations'
import { loadAdapter } from '../loadAdapter'

export const TEST_SIZES = [3, 15, 30]

export type TestFile = { items: number; filename: string; bytes: Uint8Array }
export type TestOutput = { result: TemplateTestResult; files: TestFile[] }

/**
 * Fills the template with demo quotations: long text, a FREE item, labor, and a discount when the
 * template has a discount cell. The status reflects only what actually ran.
 */
export async function runTemplateTest(input: {
  templateName: string
  versionNumber: number
  sourceBytes: Uint8Array
  definition: TemplateDefinition
  business: Business
}): Promise<TestOutput> {
  const adapter = await loadAdapter()
  const mapsDiscount = input.definition.cellMappings.some(({ semanticKey }) => semanticKey === 'totals.discount')
  const runs: TestRun[] = []
  const files: TestFile[] = []

  for (const items of TEST_SIZES) {
    const sample = sampleQuotation(items)
    const kinds: Adjustment['kind'][] = ['discount', 'deduction', 'fee', 'tax']
    const bases: Adjustment['base'][] = ['parts', 'labor', 'manual', 'allBillable']
    const slotSamples: Adjustment[] = (input.definition.adjustmentRows ?? []).map((_, index) => ({
      id: `test-adjustment-${index}`, label: `Demo ${kinds[index % 4]}`, kind: kinds[index % 4],
      base: bases[index % 4], manualBaseMinor: 10000, mode: 'percentage', value: '1', enabled: true, order: index,
    }))
    const quotation = { ...sample, terms: 'Demo terms: payment within 30 days.', adjustments: slotSamples.length ? slotSamples : mapsDiscount ? sample.adjustments : [] }
    const result = await adapter.generate({
      templateBytes: input.sourceBytes,
      template: input.definition,
      business: input.business,
      quotation,
    })
    if (result.ok) {
      runs.push({
        items,
        ok: true,
        grandTotalMinor: result.workbook.totals.grandTotalMinor,
        printArea: result.workbook.layout.printArea,
        diagnostics: result.workbook.diagnostics,
      })
      files.push({
        items,
        filename: `${input.templateName}-v${input.versionNumber}-test-${items}-items.xlsx`.replace(/[^\w.-]+/g, '-'),
        bytes: result.workbook.bytes,
      })
    } else {
      runs.push({ items, ok: false, diagnostics: result.diagnostics })
    }
  }

  const status = runs.some(({ ok }) => !ok)
    ? 'unsupported'
    : runs.some(({ diagnostics }) => diagnostics.some(({ severity }) => severity === 'warning'))
      ? 'warnings'
      : 'compatible'

  return { result: { testedAt: new Date().toISOString(), status, runs }, files }
}
