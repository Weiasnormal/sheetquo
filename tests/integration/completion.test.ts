import { mkdir, writeFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { expect, it } from 'vitest'
import { ExcelJsAdapter } from '../../src/infrastructure/excel/ExcelJsAdapter'
import { computeTotals } from '../../src/domain/calculations/money'
import type { Adjustment } from '../../src/domain/quotation/types'
import { SAMPLE_BUSINESS_A, sampleQuotation } from '../../src/test/fixtures/synthetic/quotations'
import { buildPartsTemplate, PARTS_TEMPLATE } from '../../src/test/fixtures/synthetic/templates'

const adapter = new ExcelJsAdapter()
const open = async (bytes: Uint8Array) => { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes as unknown as ExcelJS.Buffer); return wb }
const bytesOf = async (wb: ExcelJS.Workbook) => new Uint8Array(await wb.xlsx.writeBuffer() as unknown as ArrayBuffer)
async function fixture() {
  const wb = await open(await buildPartsTemplate()), sheet = wb.getWorksheet('Quotation')!
  const template = structuredClone(PARTS_TEMPLATE)
  template.adjustmentRows = [20, 21, 22, 23, 24].map((row) => ({ label: `A${row}`, base: `D${row}`, rate: `E${row}`, amount: `F${row}` }))
  for (const row of [20, 21, 22, 23, 24]) { sheet.mergeCells(`A${row}:C${row}`); sheet.getCell(`F${row}`).border = { bottom: { style: 'thin' } } }
  sheet.mergeCells('A25:F25')
  template.cellMappings.push({ semanticKey: 'quote.terms', worksheet: 'Quotation', address: 'A25', source: 'quotation', required: false, overwrite: 'replace' })
  template.output = { moneyFormat: 'business', dateFormat: 'iso', minRowHeight: 30, maxRowHeight: 300 }
  template.itemRegion.prototypeRow = 11
  sheet.getCell('A11').font = { italic: true }
  return { template, bytes: await bytesOf(wb) }
}
const adjustments: Adjustment[] = [
  { id: 'discount', label: 'Parts discount', kind: 'discount', base: 'parts', mode: 'percentage', value: '5', enabled: true, order: 1 },
  { id: 'deduction', label: 'Labor concession', kind: 'deduction', base: 'labor', mode: 'percentage', value: '2.5', enabled: true, order: 2 },
  { id: 'fee', label: 'Handling fee', kind: 'fee', base: 'manual', manualBaseMinor: 100000, mode: 'percentage', value: '1.25', enabled: true, order: 3 },
  { id: 'tax', label: 'Optional test tax', kind: 'tax', base: 'allBillable', mode: 'percentage', value: '12', enabled: true, order: 4 },
]

it('exports every adjustment base/kind, terms, currency, date and prototype with formulas Excel can recalculate', async () => {
  const { template, bytes } = await fixture()
  const manifest = []
  for (const size of [3, 15, 30]) {
    const quotation = { ...sampleQuotation(size), adjustments: [...adjustments].reverse(), terms: 'Payment within 30 days. Demo only.' }
    const result = await adapter.generate({ templateBytes: bytes, template, quotation, business: { ...SAMPLE_BUSINESS_A, currency: 'USD' } })
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
    const { layout, totals } = result.workbook
    const sheet = (await open(result.workbook.bytes)).getWorksheet('Quotation')!
    expect(sheet.getCell(layout.addresses['totals.grandTotal']).result).toBe(computeTotals(quotation).grandTotalMinor / 100)
    for (const [index, expected] of totals.adjustments.entries()) {
      expect(sheet.getCell(layout.addresses[`adjustments.${index}.amount`]).result).toBe(expected.amountMinor / 100)
      expect(sheet.getCell(layout.addresses[`adjustments.${index}.base`]).result).toBe(expected.baseMinor! / 100)
    }
    expect(sheet.getCell(layout.addresses['adjustments.4.amount']).value).toBeNull()
    expect(sheet.getCell(layout.addresses['quote.terms']).value).toBe(quotation.terms)
    expect(sheet.getCell('E6').numFmt).toBe('yyyy-mm-dd')
    expect(sheet.getCell('E10').numFmt).toContain('USD')
    expect(sheet.getCell('E11').value).toBe(0)
    expect(sheet.getCell('E11').numFmt).toContain('FREE')
    expect(sheet.getCell('A10').font.italic).toBe(true)
    expect(sheet.getRow(11).height).toBeGreaterThanOrEqual(30)
    const filename = `adjustments-${size}.xlsx`
    await mkdir('output/completion', { recursive: true })
    await writeFile(`output/completion/${filename}`, result.workbook.bytes)
    const edited = structuredClone(quotation); edited.items[0].quantity = String(Number(edited.items[0].quantity) + 1)
    manifest.push({ file: filename, sheet: 'Quotation', grandTotalCell: layout.addresses['totals.grandTotal'], expectedGrandTotal: totals.grandTotalMinor / 100,
      editQuantityCell: 'C10', expectedAfterEdit: computeTotals(edited).grandTotalMinor / 100, printArea: layout.printArea })
  }
  await writeFile('output/completion/manifest.json', JSON.stringify(manifest, null, 2))
})

it.each(['parts', 'labor', 'manual'] as const)('supports a single legacy discount on the %s base', async (base) => {
  const quotation = sampleQuotation(3, { percentDiscount: true })
  quotation.adjustments[0] = { ...quotation.adjustments[0], base, manualBaseMinor: 10000 }
  const result = await adapter.generate({ templateBytes: await buildPartsTemplate(), template: PARTS_TEMPLATE, quotation, business: SAMPLE_BUSINESS_A })
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
  const sheet = (await open(result.workbook.bytes)).getWorksheet('Quotation')!
  expect(sheet.getCell(result.workbook.layout.addresses['totals.discount']).result).toBe(computeTotals(quotation).adjustments[0].amountMinor / 100)
})

it('rejects conflicting slots, insufficient slots, preserved adjustment totals and clipped descriptions', async () => {
  const { template, bytes } = await fixture()
  const quotation = { ...sampleQuotation(3), adjustments }
  const variants = [
    { ...template, adjustmentRows: [{ label: 'A20', amount: 'F15' }] },
    { ...template, adjustmentRows: template.adjustmentRows!.slice(0, 2) },
    { ...template, cellMappings: template.cellMappings.map((m) => m.semanticKey === 'totals.discount' ? { ...m, overwrite: 'preserve' as const } : m) },
    { ...template, output: { ...template.output!, minRowHeight: 1, maxRowHeight: 10 } },
  ]
  for (const variant of variants) expect((await adapter.generate({ templateBytes: bytes, template: variant, quotation, business: SAMPLE_BUSINESS_A })).ok).toBe(false)
})

it('uses business currency for General cells and warns when preserved template currency differs', async () => {
  const wb = await open(await buildPartsTemplate()), sheet = wb.getWorksheet('Quotation')!
  sheet.getCell('E10').numFmt = 'General'
  const request = { templateBytes: await bytesOf(wb), template: PARTS_TEMPLATE, quotation: sampleQuotation(3), business: { ...SAMPLE_BUSINESS_A, currency: 'EUR' } }
  const general = await adapter.generate(request)
  if (!general.ok) throw new Error('generation failed')
  expect((await open(general.workbook.bytes)).getWorksheet('Quotation')!.getCell('E10').numFmt).toContain('EUR')
  const preserved = await adapter.generate({ ...request, templateBytes: await buildPartsTemplate() })
  expect(preserved.ok && preserved.workbook.diagnostics.some(({ code }) => code === 'TEMPLATE_CURRENCY')).toBe(true)
})
