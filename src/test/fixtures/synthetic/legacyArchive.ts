import ExcelJS from 'exceljs'
import type { TemplateDefinition } from '../../../domain/template/types'

const THIN: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } }
const BOX: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN }
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/** One old quotation, starting at row `top`. Column H is the shop's internal cost, never meant for customers. */
function writeQuotation(sheet: ExcelJS.Worksheet, top: number, customer: string, withMarkup: boolean) {
  const r = (offset: number) => top + offset

  sheet.mergeCells(`A${r(0)}:F${r(0)}`)
  sheet.getCell(`A${r(0)}`).value = 'SAMPLE TRADING'
  sheet.getCell(`A${r(0)}`).font = { size: 16, bold: true }
  sheet.mergeCells(`A${r(1)}:F${r(1)}`)
  sheet.getCell(`A${r(1)}`).value = '12 Demo Road, Sample City'
  sheet.mergeCells(`A${r(2)}:F${r(2)}`)
  sheet.getCell(`A${r(2)}`).value = 'PARTS QUOTATION'
  sheet.getCell(`A${r(2)}`).font = { bold: true }

  sheet.getCell(`A${r(4)}`).value = 'Customer:'
  sheet.mergeCells(`B${r(4)}:C${r(4)}`)
  sheet.getCell(`B${r(4)}`).value = customer
  sheet.getCell(`E${r(4)}`).value = 'Date:'
  sheet.getCell(`F${r(4)}`).value = new Date(Date.UTC(2025, 5, 1))

  const headings = ['Description', 'Part No.', 'Qty', 'Unit', 'Price', 'Amount']
  headings.forEach((heading, index) => {
    const cell = sheet.getRow(r(6)).getCell(index + 1)
    cell.value = heading
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } }
    cell.border = BOX
  })
  sheet.getCell(`H${r(6)}`).value = 'COST'

  for (const [offset, description, qty, price, cost] of [
    [7, 'Demo Brake Pad', 2, 1200, 800],
    [8, 'Demo Oil Filter', 1, 350, 210],
  ] as const) {
    const row = r(offset)
    sheet.getCell(`A${row}`).value = description
    sheet.getCell(`B${row}`).value = `DEMO-${row}`
    sheet.getCell(`C${row}`).value = qty
    sheet.getCell(`D${row}`).value = 'PC'
    sheet.getCell(`E${row}`).value = price
    sheet.getCell(`F${row}`).value = { formula: `ROUND(C${row}*E${row},2)` }
    sheet.getCell(`H${row}`).value = cost
    for (const column of ['A', 'B', 'C', 'D', 'E', 'F']) sheet.getCell(`${column}${row}`).border = BOX
  }

  sheet.getCell(`E${r(9)}`).value = 'TOTAL'
  sheet.getCell(`F${r(9)}`).value = { formula: `SUM(F${r(7)}:F${r(8)})` }
  if (withMarkup) {
    sheet.getCell(`E${r(10)}`).value = 'Markup'
    sheet.getCell(`F${r(10)}`).value = { formula: `H${r(7)}*1.2`, result: 960 }
  }
  sheet.getCell(`A${r(11)}`).value = 'Prepared by:'
}

/** A synthetic archive shaped like a real one: two old quotations on one sheet, plus a hidden and an empty sheet. */
export async function buildLegacyArchive(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Old quotes 2025')
  sheet.columns = [{ width: 30 }, { width: 14 }, { width: 8 }, { width: 8 }, { width: 12 }, { width: 14 }, { width: 4 }, { width: 10 }]
  writeQuotation(sheet, 1, 'Old Customer One', false)
  writeQuotation(sheet, 21, 'Old Customer Two', true)

  const logo = workbook.addImage({ base64: PNG_BASE64, extension: 'png' })
  sheet.addImage(logo, { tl: { col: 0.1, row: 20.1 }, ext: { width: 30, height: 30 } })
  sheet.addConditionalFormatting({
    ref: 'F8:F9',
    rules: [{ type: 'cellIs', operator: 'greaterThan', formulae: ['1000'], priority: 1, style: { font: { bold: true } } }],
  })

  const lookup = workbook.addWorksheet('Lookup', { state: 'hidden' })
  lookup.getCell('A1').value = 'Internal price list'
  workbook.addWorksheet('Empty')

  return new Uint8Array((await workbook.xlsx.writeBuffer()) as unknown as ArrayBuffer)
}

export const ARCHIVE_SHEET = 'Old quotes 2025'

/** The second old quotation, rows 21–32, with the cost column H left out. */
export const ARCHIVE_BLOCK_TWO = { firstRow: 21, lastRow: 32, lastColumn: 6 }

/** Mapping for the clean copy of either block, which starts at row 1. */
export const EXTRACTED_TEMPLATE: TemplateDefinition = {
  worksheetName: 'Quotation',
  cellMappings: [
    { semanticKey: 'business.name', worksheet: 'Quotation', address: 'A1', source: 'business', required: true, overwrite: 'replace' },
    { semanticKey: 'customer.name', worksheet: 'Quotation', address: 'B5', source: 'quotation', required: true, overwrite: 'replace' },
    { semanticKey: 'quote.date', worksheet: 'Quotation', address: 'F5', source: 'quotation', required: true, overwrite: 'replace' },
    { semanticKey: 'totals.grandTotal', worksheet: 'Quotation', address: 'F10', source: 'calculated', required: true, overwrite: 'replace' },
  ],
  itemRegion: {
    worksheet: 'Quotation',
    headerRow: 7,
    firstDataRow: 8,
    prototypeRow: 8,
    footerAnchorRow: 10,
    columns: { description: 'A', partNumber: 'B', quantity: 'C', unit: 'D', unitPrice: 'E', lineAmount: 'F' },
  },
  printProfile: {
    paper: 'A4',
    orientation: 'portrait',
    marginsInches: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
    fitToWidthPages: 1,
    repeatHeaderRow: 7,
    columns: { first: 'A', last: 'F' },
  },
}
