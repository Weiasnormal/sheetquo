import ExcelJS from 'exceljs'
import type { TemplateDefinition } from '../../../domain/template/types'

const THIN: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } }
const BOX: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN }
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } }
const MONEY = '"₱"#,##0.00'
/** A 1x1 PNG, stretched by its anchors to stand in for a logo. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function styleTableRow(sheet: ExcelJS.Worksheet, row: number, firstColumn: number, lastColumn: number) {
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    sheet.getRow(row).getCell(column).border = BOX
  }
}

function bytes(buffer: ExcelJS.Buffer): Uint8Array {
  return new Uint8Array(buffer as unknown as ArrayBuffer)
}

/** Parts-style layout: landscape A4, merged heading, six table columns, spare item rows. */
export async function buildPartsTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Quotation')
  sheet.columns = [
    { width: 44 },
    { width: 18 },
    { width: 8 },
    { width: 10 },
    { width: 15 },
    { width: 17 },
  ]

  sheet.mergeCells('A1:F1')
  sheet.getCell('A1').value = 'SAMPLE BUSINESS NAME'
  sheet.getCell('A1').font = { name: 'Calibri', size: 18, bold: true }
  sheet.getCell('A1').alignment = { horizontal: 'center' }
  sheet.getRow(1).height = 26
  sheet.mergeCells('A2:F2')
  sheet.getCell('A2').alignment = { horizontal: 'center' }
  sheet.mergeCells('A3:F3')
  sheet.getCell('A3').alignment = { horizontal: 'center' }
  sheet.mergeCells('A4:F4')
  sheet.getCell('A4').value = 'PARTS QUOTATION'
  sheet.getCell('A4').font = { name: 'Calibri', size: 13, bold: true }
  sheet.getCell('A4').alignment = { horizontal: 'center' }

  sheet.getCell('A6').value = 'Customer:'
  sheet.getCell('A7').value = 'Vehicle:'
  sheet.getCell('D6').value = 'Date:'
  sheet.getCell('D7').value = 'Quote No:'
  sheet.getCell('A6').font = { bold: true }
  sheet.getCell('A7').font = { bold: true }
  sheet.getCell('D6').font = { bold: true }
  sheet.getCell('D7').font = { bold: true }
  sheet.mergeCells('B6:C6')
  sheet.mergeCells('B7:C7')
  sheet.mergeCells('E6:F6')
  sheet.mergeCells('E7:F7')
  sheet.getCell('E6').alignment = { horizontal: 'left' }
  sheet.getCell('E6').numFmt = 'mmmm d, yyyy'

  const headings = ['Parts Name', 'Parts Number', 'QTY', 'Unit', 'Price (Each)', 'Total Amount']
  headings.forEach((heading, index) => {
    const cell = sheet.getRow(9).getCell(index + 1)
    cell.value = heading
    cell.font = { bold: true }
    cell.fill = HEADER_FILL
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = BOX
  })
  sheet.getRow(9).height = 22

  for (const row of [10, 11, 12]) {
    styleTableRow(sheet, row, 1, 6)
    sheet.getCell(`A${row}`).alignment = { vertical: 'top', wrapText: true }
    sheet.getCell(`B${row}`).alignment = { vertical: 'top' }
    sheet.getCell(`C${row}`).alignment = { horizontal: 'center', vertical: 'top' }
    sheet.getCell(`D${row}`).alignment = { horizontal: 'center', vertical: 'top' }
    sheet.getCell(`E${row}`).alignment = { vertical: 'top' }
    sheet.getCell(`F${row}`).alignment = { vertical: 'top' }
    sheet.getCell(`E${row}`).numFmt = MONEY
    sheet.getCell(`F${row}`).numFmt = MONEY
  }

  sheet.getCell('E13').value = 'Subtotal'
  sheet.getCell('E14').value = 'Less Discount'
  sheet.getCell('E15').value = 'GRAND TOTAL'
  sheet.getCell('E15').font = { bold: true }
  for (const row of [13, 14, 15]) {
    sheet.getCell(`F${row}`).numFmt = MONEY
    sheet.getCell(`E${row}`).border = BOX
    sheet.getCell(`F${row}`).border = BOX
  }
  sheet.getCell('F15').font = { bold: true }

  sheet.mergeCells('A13:C15')
  sheet.getCell('A13').alignment = { vertical: 'top', wrapText: true }

  sheet.getCell('A17').value = 'Prepared by:'
  sheet.getCell('B17').value = 'Checked by:'
  sheet.getCell('E17').value = 'Received by:'
  sheet.mergeCells('B18:D18')
  sheet.mergeCells('E18:F18')
  for (const address of ['A18', 'B18', 'E18']) {
    sheet.getCell(address).border = { bottom: THIN }
  }

  const logo = workbook.addImage({ base64: PNG_BASE64, extension: 'png' })
  sheet.addImage(logo, { tl: { col: 0.2, row: 0.2 }, ext: { width: 40, height: 40 } })
  const stamp = workbook.addImage({ base64: PNG_BASE64, extension: 'png' })
  sheet.addImage(stamp, { tl: { col: 5.1, row: 15.2 }, ext: { width: 30, height: 30 } })

  return bytes(await workbook.xlsx.writeBuffer())
}

export const PARTS_TEMPLATE: TemplateDefinition = {
  worksheetName: 'Quotation',
  cellMappings: [
    { semanticKey: 'business.name', worksheet: 'Quotation', address: 'A1', source: 'business', required: true, overwrite: 'replace' },
    { semanticKey: 'business.address', worksheet: 'Quotation', address: 'A2', source: 'business', required: false, overwrite: 'replace' },
    { semanticKey: 'business.phone', worksheet: 'Quotation', address: 'A3', source: 'business', required: false, overwrite: 'replace' },
    { semanticKey: 'customer.name', worksheet: 'Quotation', address: 'B6', source: 'quotation', required: true, overwrite: 'replace' },
    { semanticKey: 'vehicle.description', worksheet: 'Quotation', address: 'B7', source: 'quotation', required: false, overwrite: 'replace' },
    { semanticKey: 'quote.date', worksheet: 'Quotation', address: 'E6', source: 'quotation', required: true, overwrite: 'replace' },
    { semanticKey: 'quote.number', worksheet: 'Quotation', address: 'E7', source: 'quotation', required: false, overwrite: 'replace' },
    { semanticKey: 'totals.subtotal', worksheet: 'Quotation', address: 'F13', source: 'calculated', required: true, overwrite: 'replace' },
    { semanticKey: 'totals.discount', worksheet: 'Quotation', address: 'F14', source: 'calculated', required: false, overwrite: 'replace' },
    { semanticKey: 'totals.grandTotal', worksheet: 'Quotation', address: 'F15', source: 'calculated', required: true, overwrite: 'replace' },
    { semanticKey: 'quote.notes', worksheet: 'Quotation', address: 'A13', source: 'quotation', required: false, overwrite: 'replace' },
    { semanticKey: 'signatures.preparedBy', worksheet: 'Quotation', address: 'A18', source: 'quotation', required: false, overwrite: 'replace' },
    { semanticKey: 'signatures.checkedBy', worksheet: 'Quotation', address: 'B18', source: 'quotation', required: false, overwrite: 'replace' },
    { semanticKey: 'signatures.receivedBy', worksheet: 'Quotation', address: 'E18', source: 'quotation', required: false, overwrite: 'replace' },
  ],
  itemRegion: {
    worksheet: 'Quotation',
    headerRow: 9,
    firstDataRow: 10,
    prototypeRow: 10,
    footerAnchorRow: 13,
    minDisplayRows: 3,
    columns: {
      description: 'A',
      partNumber: 'B',
      quantity: 'C',
      unit: 'D',
      unitPrice: 'E',
      lineAmount: 'F',
    },
  },
  printProfile: {
    paper: 'A4',
    orientation: 'landscape',
    marginsInches: { top: 0.5, bottom: 0.5, left: 0.4, right: 0.4 },
    fitToWidthPages: 1,
    repeatHeaderRow: 9,
    columns: { first: 'A', last: 'F' },
  },
}

/** Deliberately different: portrait Letter, numbered rows, merged description, the template's own total formulas. */
export async function buildServiceTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Estimate')
  sheet.columns = [
    { width: 5 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 13 },
    { width: 7 },
    { width: 7 },
    { width: 13 },
    { width: 14 },
  ]

  sheet.getCell('F1').value = 'ESTIMATE'
  sheet.getCell('F1').font = { name: 'Arial', size: 20, bold: true, color: { argb: 'FF1F3864' } }
  sheet.getCell('A1').font = { name: 'Arial', size: 12, bold: true }
  sheet.mergeCells('A2:E2')
  sheet.mergeCells('A3:E3')

  sheet.getCell('F3').value = 'Estimate #'
  sheet.getCell('F4').value = 'Date'
  sheet.mergeCells('H3:I3')
  sheet.mergeCells('H4:I4')
  sheet.getCell('H3').alignment = { horizontal: 'right' }
  sheet.getCell('H4').alignment = { horizontal: 'right' }

  sheet.getCell('A6').value = 'BILL TO'
  sheet.getCell('A6').font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getCell('A6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }
  sheet.mergeCells('A6:E6')
  sheet.mergeCells('A7:E7')
  sheet.mergeCells('A8:E9')
  sheet.getCell('A8').alignment = { vertical: 'top', wrapText: true }

  sheet.getCell('F6').value = 'UNIT DETAILS'
  sheet.getCell('F6').font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getCell('F6').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }
  sheet.mergeCells('F6:I6')
  sheet.mergeCells('F7:I7')
  sheet.getCell('F8').value = 'Plate'
  sheet.mergeCells('G8:I8')

  const header: [string, string][] = [['A', '#'], ['B', 'Description'], ['E', 'Part No.'], ['F', 'Unit'], ['G', 'Qty'], ['H', 'Rate'], ['I', 'Amount']]
  sheet.mergeCells('B11:D11')
  for (const [column, heading] of header) {
    const cell = sheet.getCell(`${column}11`)
    cell.value = heading
    cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } }
    cell.alignment = { horizontal: 'center' }
  }

  sheet.mergeCells('B12:D12')
  styleTableRow(sheet, 12, 1, 9)
  for (const column of ['A', 'E', 'F', 'G', 'H', 'I']) {
    sheet.getCell(`${column}12`).alignment = { vertical: 'top' }
  }
  sheet.getCell('B12').font = { name: 'Arial', size: 10 }
  sheet.getCell('B12').alignment = { vertical: 'top', wrapText: true }
  sheet.getCell('H12').numFmt = '#,##0.00'
  sheet.getCell('I12').numFmt = '#,##0.00'

  sheet.getCell('H13').value = 'Subtotal'
  sheet.getCell('I13').value = { formula: 'SUM(I12:I12)' }
  sheet.getCell('H14').value = 'Discount'
  sheet.getCell('H15').value = 'Total Due'
  sheet.getCell('I15').value = { formula: 'I13-I14' }
  sheet.getCell('I13').numFmt = '#,##0.00'
  sheet.getCell('I14').numFmt = '#,##0.00'
  sheet.getCell('I15').numFmt = '"PHP" #,##0.00'
  sheet.getCell('H15').font = { name: 'Arial', bold: true }
  sheet.getCell('I15').font = { name: 'Arial', bold: true }
  sheet.getCell('I15').border = { top: THIN, bottom: { style: 'double', color: { argb: 'FF000000' } } }

  sheet.getCell('A17').value = 'Terms'
  sheet.getCell('A17').font = { name: 'Arial', bold: true }
  sheet.mergeCells('A18:I19')
  sheet.getCell('A18').alignment = { vertical: 'top', wrapText: true }

  sheet.getCell('A21').value = 'Authorized by'
  sheet.mergeCells('A21:C21')
  sheet.mergeCells('A22:C22')
  sheet.getCell('A22').border = { bottom: THIN }

  return bytes(await workbook.xlsx.writeBuffer())
}

export const SERVICE_TEMPLATE: TemplateDefinition = {
  worksheetName: 'Estimate',
  cellMappings: [
    { semanticKey: 'business.name', worksheet: 'Estimate', address: 'A1', source: 'business', required: true, overwrite: 'replace' },
    { semanticKey: 'business.address', worksheet: 'Estimate', address: 'A2', source: 'business', required: false, overwrite: 'replace' },
    { semanticKey: 'business.phone', worksheet: 'Estimate', address: 'A3', source: 'business', required: false, overwrite: 'replace' },
    { semanticKey: 'quote.number', worksheet: 'Estimate', address: 'H3', source: 'quotation', required: false, overwrite: 'replace' },
    { semanticKey: 'quote.date', worksheet: 'Estimate', address: 'H4', source: 'quotation', required: true, overwrite: 'replace' },
    { semanticKey: 'customer.name', worksheet: 'Estimate', address: 'A7', source: 'quotation', required: true, overwrite: 'replace' },
    { semanticKey: 'customer.address', worksheet: 'Estimate', address: 'A8', source: 'quotation', required: false, overwrite: 'replace' },
    { semanticKey: 'vehicle.description', worksheet: 'Estimate', address: 'F7', source: 'quotation', required: false, overwrite: 'replace' },
    { semanticKey: 'vehicle.plate', worksheet: 'Estimate', address: 'G8', source: 'quotation', required: false, overwrite: 'replace' },
    { semanticKey: 'totals.subtotal', worksheet: 'Estimate', address: 'I13', source: 'calculated', required: true, overwrite: 'preserve' },
    { semanticKey: 'totals.discount', worksheet: 'Estimate', address: 'I14', source: 'calculated', required: false, overwrite: 'replace' },
    { semanticKey: 'totals.grandTotal', worksheet: 'Estimate', address: 'I15', source: 'calculated', required: true, overwrite: 'preserve' },
    { semanticKey: 'quote.notes', worksheet: 'Estimate', address: 'A18', source: 'quotation', required: false, overwrite: 'replace' },
    { semanticKey: 'signatures.preparedBy', worksheet: 'Estimate', address: 'A22', source: 'quotation', required: false, overwrite: 'replace' },
  ],
  itemRegion: {
    worksheet: 'Estimate',
    headerRow: 11,
    firstDataRow: 12,
    prototypeRow: 12,
    footerAnchorRow: 13,
    columns: {
      itemNumber: 'A',
      description: 'B',
      partNumber: 'E',
      unit: 'F',
      quantity: 'G',
      unitPrice: 'H',
      lineAmount: 'I',
    },
  },
  printProfile: {
    paper: 'Letter',
    orientation: 'portrait',
    marginsInches: { top: 0.6, bottom: 0.6, left: 0.5, right: 0.5 },
    fitToWidthPages: 1,
    repeatHeaderRow: 11,
    columns: { first: 'A', last: 'I' },
  },
}
