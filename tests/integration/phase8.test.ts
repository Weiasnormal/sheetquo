import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { computeTotals } from '../../src/domain/calculations/money'
import { ExcelJsAdapter } from '../../src/infrastructure/excel/ExcelJsAdapter'
import { SAMPLE_BUSINESS_A, sampleQuotation } from '../../src/test/fixtures/synthetic/quotations'
import { buildPartsTemplate, buildServiceTemplate, PARTS_TEMPLATE, SERVICE_TEMPLATE } from '../../src/test/fixtures/synthetic/templates'

const adapter = new ExcelJsAdapter()
const bytesOf = async (wb: ExcelJS.Workbook) => new Uint8Array(await wb.xlsx.writeBuffer() as unknown as ArrayBuffer)
async function open(bytes: Uint8Array) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes as unknown as ExcelJS.Buffer); return wb }
type Rules = { conditionalFormattings: ExcelJS.ConditionalFormattingOptions[]; dataValidations: { model: Record<string, ExcelJS.DataValidation> } }

async function fixture(service = false) {
  const template = structuredClone(service ? SERVICE_TEMPLATE : PARTS_TEMPLATE)
  const wb = await open(await (service ? buildServiceTemplate() : buildPartsTemplate()))
  const sheet = wb.getWorksheet(template.worksheetName)!
  const { firstDataRow: first, footerAnchorRow: footer, columns } = template.itemRegion
  sheet.getCell(`${columns.unit}${first}`).dataValidation = { type: 'list', allowBlank: true, formulae: ['"PC,SET,ASSY"'] }
  sheet.getCell(`${columns.quantity}${first}`).dataValidation = { type: 'custom', formulae: [`AND(${columns.quantity}${first}>0,$${columns.unitPrice}$${footer}>=0)`] }
  sheet.addConditionalFormatting({ ref: `${columns.lineAmount}${first}`, rules: [{ type: 'expression', priority: 1, formulae: [`${columns.lineAmount}${first}>$${columns.lineAmount}$${footer}`], style: { font: { bold: true } } }] })
  sheet.getCell(`${columns.lineAmount}${footer}`).dataValidation = { type: 'decimal', operator: 'greaterThanOrEqual', formulae: [0] }
  sheet.addConditionalFormatting({ ref: `${columns.lineAmount}${footer}`, rules: [{ type: 'expression', priority: 2, formulae: [`${columns.lineAmount}${footer}<0`], style: { font: { bold: true } } }] })
  return { template, bytes: await bytesOf(wb) }
}

describe('Phase 8 rules and printing', () => {
  for (const service of [false, true]) for (const size of [3, 15, 30]) {
    it(`moves rules and footer on the ${service ? 'service' : 'parts'} template with ${size} items`, async () => {
      const { template, bytes } = await fixture(service)
      const result = await adapter.generate({ templateBytes: bytes, template, business: SAMPLE_BUSINESS_A, quotation: sampleQuotation(size) })
      if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
      const sheet = (await open(result.workbook.bytes)).getWorksheet(template.worksheetName)!
      const { columns, firstDataRow, footerAnchorRow } = template.itemRegion
      for (let row = firstDataRow; row <= result.workbook.layout.lastItemRow; row++) {
        expect(sheet.getCell(`${columns.unit}${row}`).dataValidation.formulae).toEqual(['"PC,SET,ASSY"'])
        // Relative item references slide; the absolute reference follows the footer structurally.
        expect(sheet.getCell(`${columns.quantity}${row}`).dataValidation.formulae[0]).toBe(`AND(${columns.quantity}${row}>0,$${columns.unitPrice}$${footerAnchorRow + result.workbook.layout.rowDelta}>=0)`)
      }
      const movedFooter = footerAnchorRow + result.workbook.layout.rowDelta
      expect(sheet.getCell(`${columns.lineAmount}${movedFooter}`).dataValidation.type).toBe('decimal')
      const rules = (sheet as unknown as Rules).conditionalFormattings
      expect(rules.some(({ ref, rules }) => ref.startsWith(`${columns.lineAmount}${movedFooter}`) && (rules[0] as ExcelJS.ExpressionRuleType).formulae?.[0] === `${columns.lineAmount}${movedFooter}<0`)).toBe(true)
      expect(sheet.pageSetup.fitToHeight).toBe(0)
      expect(result.workbook.diagnostics.map(({ code }) => code)).not.toContain('DATA_VALIDATION_NOT_MOVED')
    })
  }

  it('retains rules through area extraction, translates formulas and removes external list references', async () => {
    const wb = new ExcelJS.Workbook()
    const sheet = wb.addWorksheet('Archive')
    sheet.getCell('B21').value = 'Header'
    sheet.getCell('B22').value = 'Demo'
    sheet.getCell('B22').dataValidation = { type: 'list', formulae: ['"PC,SET"'] }
    sheet.getCell('C22').dataValidation = { type: 'custom', formulae: ['C22>$C$23'] }
    sheet.getCell('D22').dataValidation = { type: 'list', formulae: ["'Lookup'!$A$1:$A$3"] }
    sheet.addConditionalFormatting({ ref: 'B22:C22', rules: [{ type: 'expression', priority: 1, formulae: ['C22>0'], style: { font: { bold: true } } }] })
    const result = await adapter.extractRegion(await bytesOf(wb), sheet.name, { firstRow: 21, lastRow: 24, lastColumn: 4 })
    if (!result.ok) throw new Error('extract failed')
    const clean = (await open(result.bytes)).getWorksheet('Quotation')!
    expect(clean.getCell('B2').dataValidation.formulae).toEqual(['"PC,SET"'])
    expect(clean.getCell('C2').dataValidation.formulae).toEqual(['C2>$C$3'])
    expect(clean.getCell('D2').dataValidation).toBeUndefined()
    expect((clean as unknown as Rules).conditionalFormattings[0].ref).toBe('B2:C2')
    expect(result.diagnostics.map(({ code }) => code)).toContain('RULES_NOT_SUPPORTED')
  })

  it('clears unused minimum item rows and mapped optional fields instead of repeating historical values', async () => {
    const { template, bytes } = await fixture()
    const wb = await open(bytes)
    wb.getWorksheet(template.worksheetName)!.getCell('A10').value = 'Old item'
    wb.getWorksheet(template.worksheetName)!.getCell('B7').value = 'Old vehicle'
    template.itemRegion.minDisplayRows = 6
    const result = await adapter.generate({ templateBytes: await bytesOf(wb), template, business: SAMPLE_BUSINESS_A, quotation: { ...sampleQuotation(3), vehicle: undefined } })
    if (!result.ok) throw new Error('generation failed')
    const sheet = (await open(result.workbook.bytes)).getWorksheet(template.worksheetName)!
    expect(sheet.getCell('A15').value).toBeNull()
    expect(sheet.getCell('B7').value).toBeNull()
  })

  it('moves a range rule relative to each copied row, even when its original range starts above the prototype', async () => {
    const { template, bytes } = await fixture()
    const wb = await open(bytes)
    const source = wb.getWorksheet(template.worksheetName)!
    source.addConditionalFormatting({ ref: 'E9:E13', rules: [{ type: 'expression', priority: 5, formulae: ['E9>0'], style: { font: { italic: true } } }] })
    const result = await adapter.generate({ templateBytes: await bytesOf(wb), template, business: SAMPLE_BUSINESS_A, quotation: sampleQuotation(15) })
    if (!result.ok) throw new Error('generation failed')
    const sheet = (await open(result.workbook.bytes)).getWorksheet(template.worksheetName)!
    const rules = (sheet as unknown as Rules).conditionalFormattings
    expect(rules.find(({ ref, rules }) => ref === 'E20:E20' && rules[0].style?.font?.italic)?.rules[0]).toMatchObject({ formulae: ['E20>0'] })
    expect(rules.find(({ ref, rules }) => ref === 'E25:E25' && rules[0].style?.font?.italic)?.rules[0]).toMatchObject({ formulae: ['E25>0'] })
  })

  it('blocks descriptions that cannot fit Excel’s maximum row height', async () => {
    const quotation = sampleQuotation(3)
    quotation.items[0].description = 'Very long description '.repeat(500)
    const result = await adapter.generate({ templateBytes: await buildPartsTemplate(), template: PARTS_TEMPLATE, business: SAMPLE_BUSINESS_A, quotation })
    expect(result.ok ? [] : result.diagnostics.map(({ code }) => code)).toContain('DESCRIPTION_TOO_TALL')
  })

  it('blocks notes that exceed the height of their merged area instead of clipping them', async () => {
    const quotation = sampleQuotation(3)
    quotation.notes = 'A long note that must be visible. '.repeat(1500)
    const result = await adapter.generate({ templateBytes: await buildPartsTemplate(), template: PARTS_TEMPLATE, business: SAMPLE_BUSINESS_A, quotation })
    expect(result.ok ? [] : result.diagnostics.map(({ code }) => code)).toContain('MAPPED_TEXT_TOO_TALL')
  })

  it('warns before dropping a complex visual rule or external dropdown reference', async () => {
    const { template, bytes } = await fixture()
    const wb = await open(bytes)
    const sheet = wb.getWorksheet(template.worksheetName)!
    sheet.getCell('C10').dataValidation = { type: 'list', formulae: ["'Other sheet'!A1:A5"] }
    sheet.addConditionalFormatting({ ref: 'F10:F12', rules: [{ type: 'top10', priority: 4, rank: 2, percent: false, bottom: false }] })
    const result = await adapter.generate({ templateBytes: await bytesOf(wb), template, business: SAMPLE_BUSINESS_A, quotation: sampleQuotation(3) })
    if (!result.ok) throw new Error('generation failed')
    expect(result.workbook.diagnostics.map(({ code }) => code)).toContain('RULES_NOT_SUPPORTED')
    expect((await open(result.workbook.bytes)).getWorksheet(template.worksheetName)!.getCell('C10').dataValidation).toBeUndefined()
  })

  it('exports both paper sizes, margins, centering, repeated headers, and footer page breaks for Excel verification', async () => {
    const output = join(process.cwd(), 'output', 'phase8')
    await mkdir(output, { recursive: true })
    const manifest: Record<string, unknown>[] = []
    for (const scenario of [
      ...[false, true].flatMap((service) => [3, 15, 30].map((size) => ({ service, size, tallFooter: false }))),
      { service: false, size: 15, tallFooter: true },
    ]) {
      const { service, size, tallFooter } = scenario
      const { template, bytes } = await fixture(service)
      const source = await open(bytes)
      if (tallFooter) {
        const sheet = source.getWorksheet(template.worksheetName)!
        for (let row = 13; row <= 18; row++) sheet.getRow(row).height = 45
      }
      template.printProfile.horizontalCentered = true
      template.printProfile.headerMarginInches = 0.2
      template.printProfile.footerMarginInches = 0.2
      template.printProfile.keepFooterTogether = true
      const quotation = sampleQuotation(size)
      const result = await adapter.generate({ templateBytes: await bytesOf(source), template, business: SAMPLE_BUSINESS_A, quotation })
      if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
      const sheet = (await open(result.workbook.bytes)).getWorksheet(template.worksheetName)!
      expect(sheet.pageSetup.margins?.header).toBe(0.2)
      expect(sheet.pageSetup.horizontalCentered).toBe(true)
      const footer = result.workbook.layout.lastItemRow + 1
      expect(sheet.model.rowBreaks.every(({ id }) => id < footer || id >= Number(result.workbook.layout.printArea.match(/\d+$/)![0]))).toBe(true)
      const filename = `${service ? 'service' : 'parts'}-${size}${tallFooter ? '-tall-footer' : ''}.xlsx`
      await writeFile(join(output, filename), result.workbook.bytes)
      const edited = structuredClone(quotation)
      edited.items[0].quantity = String(Number(edited.items[0].quantity) + 1)
      manifest.push({ file: filename, sheet: template.worksheetName, grandTotalCell: result.workbook.layout.addresses['totals.grandTotal'], expectedGrandTotal: result.workbook.totals.grandTotalMinor / 100,
        editQuantityCell: `${template.itemRegion.columns.quantity}${template.itemRegion.firstDataRow}`, expectedAfterEdit: computeTotals(edited).grandTotalMinor / 100,
        printArea: result.workbook.layout.printArea, footerStartRow: footer, repeatHeaderRow: template.printProfile.repeatHeaderRow,
        validationCell: `${template.itemRegion.columns.unit}${result.workbook.layout.lastItemRow}`,
        conditionalCell: `${template.itemRegion.columns.lineAmount}${result.workbook.layout.lastItemRow}` })
    }
    await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2))
  })

  it('rejects invalid margins, page widths, and print columns with diagnostics', async () => {
    const bytes = await buildPartsTemplate()
    for (const printProfile of [
      { ...PARTS_TEMPLATE.printProfile, fitToWidthPages: 1.5 },
      { ...PARTS_TEMPLATE.printProfile, marginsInches: { top: -1, bottom: 1, left: 1, right: 1 } },
      { ...PARTS_TEMPLATE.printProfile, columns: { first: 'Z', last: 'A' } },
    ]) {
      const result = await adapter.generate({ templateBytes: bytes, template: { ...PARTS_TEMPLATE, printProfile }, business: SAMPLE_BUSINESS_A, quotation: sampleQuotation(3) })
      expect(result.ok ? [] : result.diagnostics.map(({ code }) => code)).toContain('PRINT_SETTINGS_INVALID')
    }
  })
})
