import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { ExcelJsAdapter, overflowWidth } from '../../src/infrastructure/excel/ExcelJsAdapter'
import { SAMPLE_BUSINESS_A, sampleQuotation } from '../../src/test/fixtures/synthetic/quotations'
import { buildPartsTemplate, PARTS_TEMPLATE } from '../../src/test/fixtures/synthetic/templates'
import type { TemplateDefinition } from '../../src/domain/template/types'

const adapter = new ExcelJsAdapter()
const bytesOf = async (wb: ExcelJS.Workbook) => new Uint8Array(await wb.xlsx.writeBuffer() as unknown as ArrayBuffer)
async function open(bytes: Uint8Array) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(bytes as unknown as ExcelJS.Buffer); return wb }

/** Like a hand-made quotation: the business name sits centered in one narrow column, not in a merged box. */
async function centeredInOneCell() {
  const wb = await open(await buildPartsTemplate())
  const sheet = wb.getWorksheet(PARTS_TEMPLATE.worksheetName)!
  const style = structuredClone(sheet.getCell('A1').style)
  sheet.unMergeCells('A1:F1')
  sheet.getCell('A1').value = null
  sheet.getCell('D1').style = { ...style, alignment: { horizontal: 'center' } }
  sheet.getCell('D1').value = 'Business name'
  const template: TemplateDefinition = {
    ...PARTS_TEMPLATE,
    cellMappings: PARTS_TEMPLATE.cellMappings.map((mapping) => mapping.semanticKey === 'business.name' ? { ...mapping, address: 'D1' } : mapping),
  }
  return { template, bytes: await bytesOf(wb) }
}

async function generateWithName(name: string) {
  const { template, bytes } = await centeredInOneCell()
  const business = { ...SAMPLE_BUSINESS_A, legalName: undefined, displayName: name }
  const result = await adapter.generate({ templateBytes: bytes, template, business, quotation: sampleQuotation(3) })
  if (!result.ok) throw new Error(result.diagnostics.map(({ message }) => message).join('; '))
  return (await open(result.workbook.bytes)).getWorksheet(template.worksheetName)!
}

describe('header text in a single cell', () => {
  it('spills across the empty cells on both sides instead of wrapping when it fits', async () => {
    const sheet = await generateWithName('WCCE Auto Parts Supply')
    expect(sheet.getCell('D1').value).toBe('WCCE Auto Parts Supply')
    expect(sheet.getCell('D1').alignment?.wrapText).toBeFalsy()
    expect(sheet.getCell('D1').alignment?.horizontal).toBe('center')
  })

  it('still wraps text too wide for the empty space around it', async () => {
    const sheet = await generateWithName('WCCE Auto Parts Supply and Heavy Equipment Trading Corporation')
    expect(sheet.getCell('D1').alignment?.wrapText).toBe(true)
  })
})

describe('overflowWidth', () => {
  function sheetWith(widths: number[]) {
    const sheet = new ExcelJS.Workbook().addWorksheet('S')
    widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width })
    sheet.getCell(1, widths.length).value = 'end'
    return sheet
  }

  it('counts the narrower empty side twice for centered text', () => {
    const sheet = sheetWith([10, 10, 5, 20, 1])
    sheet.getCell('C1').value = 'Name'
    sheet.getCell('C1').alignment = { horizontal: 'center' }
    expect(overflowWidth(sheet, sheet.getCell('C1'))).toBe(5 + 2 * 20)
  })

  it('spills rightwards for left-aligned text and stops at a filled cell', () => {
    const sheet = sheetWith([10, 10, 10, 10])
    sheet.getCell('A1').value = 'Name'
    sheet.getCell('C1').value = 'Taken'
    expect(overflowWidth(sheet, sheet.getCell('A1'))).toBe(20)
  })

  it('does not spill for right-aligned text at the left edge', () => {
    const sheet = sheetWith([12, 10])
    sheet.getCell('A1').value = 'Name'
    sheet.getCell('A1').alignment = { horizontal: 'right' }
    expect(overflowWidth(sheet, sheet.getCell('A1'))).toBe(12)
  })
})
