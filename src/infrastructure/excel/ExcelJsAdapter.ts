import ExcelJS from 'exceljs'
import { computeTotals, lineAmountMinor, minorToNumber } from '../../domain/calculations/money'
import type { Totals } from '../../domain/calculations/money'
import { estimateRowHeight } from '../../domain/print/rowHeight'
import { checkQuotation } from '../../domain/quotation/checkQuotation'
import { quotationFilename } from '../../domain/quotation/filename'
import type { Adjustment, Business, Quotation, QuoteItem } from '../../domain/quotation/types'
import { adjustmentDiagnostics } from '../../domain/template/adjustmentSupport'
import type { CellMapping, SemanticKey, TemplateDefinition } from '../../domain/template/types'
import {
  columnToNumber,
  formatAddress,
  formatRange,
  mapFormulaRows,
  parseAddress,
  parseRange,
  referencesOtherSheet,
  slideFormula,
  usesUnsupportedReference,
} from './a1'
import type { CellRange } from './a1'
import type { Region } from '../../domain/template/region'
import { mergesOf, toBuffer } from './exceljsHelpers'
import { scanPackage } from './packageScan'
import { extractRegion } from './regionExtractor'
import type {
  Diagnostic,
  ExtractResult,
  GenerateRequest,
  GenerateResult,
  OpenResult,
  WorkbookAdapter,
  WorkbookInspection,
} from './WorkbookAdapter'
import { openWorkbook } from './workbookReader'
import { moveLayoutRules } from './layoutRules'
import { paginate, printProfileErrors } from './printLayout'

const PAPER_SIZE = { A4: 9, Letter: 1 } as const
const DEFAULT_ROW_HEIGHT = 15
const DEFAULT_COLUMN_WIDTH = 9
const DEFAULT_FONT_SIZE = 11
const DEFAULT_CURRENCY_FORMAT = '"₱"#,##0.00'
const DEFAULT_DATE_FORMAT = 'mmmm d, yyyy'
const AMOUNT_BOLD_FACTOR = 1.1
const AMOUNT_WIDTH_PADDING = 2
const REQUIRED_KEYS: SemanticKey[] = ['customer.name', 'quote.date', 'totals.grandTotal']

type CellSnapshot = { column: number; value: ExcelJS.CellValue; style: Partial<ExcelJS.Style>; note?: ExcelJS.Cell['note'] }
type RowSnapshot = { height?: number; hidden: boolean; outlineLevel: number; cells: CellSnapshot[] }

function isFormula(value: ExcelJS.CellValue): value is ExcelJS.CellFormulaValue | ExcelJS.CellSharedFormulaValue {
  return typeof value === 'object' && value !== null && ('formula' in value || 'sharedFormula' in value)
}

function isArrayFormula(value: ExcelJS.CellValue): boolean {
  return isFormula(value) && 'shareType' in value && value.shareType === 'array'
}

function snapshotRow(sheet: ExcelJS.Worksheet, rowNumber: number): RowSnapshot {
  const row = sheet.getRow(rowNumber)
  const cells: CellSnapshot[] = []
  row.eachCell({ includeEmpty: true }, (cell, column) => {
    cells.push({
      column,
      value: cell.type === ExcelJS.ValueType.Merge ? null : cell.value,
      style: structuredClone(cell.style),
      note: cell.note,
    })
  })
  return { height: row.height, hidden: row.hidden, outlineLevel: row.outlineLevel ?? 0, cells }
}

function clearRow(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber)
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.value = null
    cell.style = {}
    // ExcelJS has no public way to remove a note, and its setter always creates one.
    ;(cell as unknown as { _comment?: unknown })._comment = undefined
  })
  row.height = undefined as unknown as number
  row.hidden = false
  row.outlineLevel = 0
}

function writeRow(sheet: ExcelJS.Worksheet, rowNumber: number, snapshot: RowSnapshot, mapFormula: (formula: string) => string) {
  const row = sheet.getRow(rowNumber)
  if (snapshot.height !== undefined) row.height = snapshot.height
  row.hidden = snapshot.hidden
  row.outlineLevel = snapshot.outlineLevel
  for (const { column, value, style, note } of snapshot.cells) {
    const cell = row.getCell(column)
    cell.style = structuredClone(style)
    cell.value = isFormula(value) ? { formula: mapFormula((value as ExcelJS.CellFormulaValue).formula) } : value
    if (note) cell.note = note
  }
}

function withoutNotes(snapshot: RowSnapshot): RowSnapshot {
  return { ...snapshot, cells: snapshot.cells.map((cell) => ({ ...cell, note: undefined })) }
}

/** Moves named ranges with the layout and drops those that pointed at a removed worksheet. */
function moveDefinedNames(workbook: ExcelJS.Workbook, worksheet: string, moveFormula: (formula: string) => string) {
  const isOnSheet = (range: string) => range.slice(0, range.lastIndexOf('!')).replace(/^'|'$/g, '') === worksheet
  const moveRange = (range: string) => {
    const split = range.lastIndexOf('!') + 1
    return range.slice(0, split) + moveFormula(range.slice(split))
  }
  workbook.definedNames.model = workbook.definedNames.model
    .map(({ name, ranges }) => ({ name, ranges: ranges.filter(isOnSheet).map(moveRange) }))
    .filter(({ ranges }) => ranges.length > 0)
}

function rowHasContent(snapshot: RowSnapshot): boolean {
  return snapshot.cells.some(({ value, style }) => value !== null && value !== undefined || style.border !== undefined)
}

function isGeneralFormat(format: string | undefined): boolean {
  return !format || format === 'General'
}

function freeFormat(base: string | undefined, fallback: string): string {
  const format = isGeneralFormat(base) ? fallback : base!
  return format.includes(';') ? '[=0]"FREE";' + fallback : `[=0]"FREE";${format}`
}

function isoToExcelDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`)
}

function mappedText(key: SemanticKey, quotation: Quotation, business: Business): string | Date | undefined {
  switch (key) {
    case 'business.name':
      return business.legalName ?? business.displayName
    case 'business.address':
      return business.addressLines.join(', ')
    case 'business.phone':
      return business.phones.join(' / ')
    case 'business.taxText':
      return business.taxRegistrationText
    case 'quote.number':
      return quotation.quoteNumber
    case 'quote.date':
      return isoToExcelDate(quotation.quoteDateISO)
    case 'quote.notes':
      return quotation.notes
    case 'quote.terms':
      return quotation.terms
    case 'customer.name':
      return quotation.customerName
    case 'customer.address':
      return quotation.customerAddress
    case 'customer.tin':
      return quotation.customerTIN
    case 'vehicle.description':
      return quotation.vehicle
    case 'vehicle.engine':
      return quotation.engine
    case 'vehicle.plate':
      return quotation.plate
    case 'vehicle.chassis':
      return quotation.chassis
    case 'signatures.preparedBy':
      return quotation.preparedBy
    case 'signatures.receivedBy':
      return quotation.receivedBy
    case 'signatures.checkedBy':
      return quotation.checkedBy
    default:
      return undefined
  }
}

function validateDefinition(
  sheet: ExcelJS.Worksheet | undefined,
  template: TemplateDefinition,
  quotation: Quotation,
  business: Business,
  needed: number,
): Diagnostic[] {
  const { itemRegion: region, worksheetName: worksheet } = template
  if (!sheet) {
    return [{ severity: 'error', code: 'WORKSHEET_MISSING', message: `Worksheet "${worksheet}" is not in this workbook.`, worksheet }]
  }

  const errors: Diagnostic[] = []
  const error = (code: string, message: string, cell?: string) =>
    errors.push({ severity: 'error', code, message, worksheet, cell })

  if ([region.headerRow, region.firstDataRow, region.prototypeRow, region.footerAnchorRow].some((row) => !Number.isInteger(row) || row < 1 || row > 1_048_576) || !Number.isInteger(needed) || needed < 1 || needed + sheet.rowCount > 1_048_576) {
    error('INVALID_ITEM_ROWS', 'Choose whole-number item rows and a count within Excel’s row limit.')
  }

  if (region.prototypeRow < region.firstDataRow || region.prototypeRow >= region.footerAnchorRow) {
    error('PROTOTYPE_OUTSIDE_REGION', `Prototype row ${region.prototypeRow} must sit inside the item rows.`)
  }
  if (region.firstDataRow >= region.footerAnchorRow) {
    error('EMPTY_ITEM_REGION', 'The footer anchor must come after the first item row.')
  }
  if (region.maxItems !== undefined && needed > region.maxItems) {
    error('TOO_MANY_ITEMS', `This template holds ${region.maxItems} items and this quotation has ${needed}.`)
  }

  const seen = new Set<string>()
  const merges = mergesOf(sheet).map((range) => ({ range, box: parseRange(range) }))

  for (const key of REQUIRED_KEYS) {
    if (!template.cellMappings.some((mapping) => mapping.semanticKey === key)) {
      error('REQUIRED_MAPPING_MISSING', `The template has no cell mapped for ${key}.`)
    }
  }

  for (const mapping of template.cellMappings) {
    const { address, semanticKey } = mapping
    const { column, row } = parseAddress(address)
    const columnNumber = columnToNumber(column)

    if (seen.has(address)) error('MAPPING_CONFLICT', `${address} is mapped to more than one field.`, address)
    seen.add(address)

    if (row >= region.firstDataRow && row < region.footerAnchorRow) {
      error('MAPPING_IN_ITEM_REGION', `${semanticKey} points at ${address}, which is inside the item rows.`, address)
    }

    const merge = merges.find(({ box }) => row >= box.top && row <= box.bottom && columnNumber >= box.left && columnNumber <= box.right)
    if (merge && (row !== merge.box.top || columnNumber !== merge.box.left)) {
      error('MAPPING_NOT_MERGE_ANCHOR', `${address} is inside merged range ${merge.range}. Map its top-left cell.`, address)
    }

    if (mapping.required && mapping.overwrite === 'replace' && mapping.source !== 'calculated') {
      const value = mappedText(semanticKey, quotation, business)
      if (value === undefined || value === '') {
        error('REQUIRED_VALUE_MISSING', `${semanticKey} is required by this template and is empty.`, address)
      }
    }
  }

  for (const { range, box } of merges) {
    const insideRegion = box.top >= region.firstDataRow && box.bottom < region.footerAnchorRow
    const clearOfRegion = box.bottom < region.firstDataRow || box.top >= region.footerAnchorRow
    if (!insideRegion && !clearOfRegion) {
      error('MERGE_CROSSES_ITEM_REGION', `Merged range ${range} crosses the item rows, so rows cannot be inserted safely.`, range)
    }
    if (insideRegion && box.top !== box.bottom) {
      error('TALL_MERGE_IN_ITEM_REGION', `Merged range ${range} spans several item rows and cannot be repeated.`, range)
    }
  }

  for (const slot of template.adjustmentRows ?? []) for (const address of Object.values(slot)) {
    if (!address) continue
    if (!/^[A-Z]{1,3}[1-9]\d*$/.test(address)) { error('ADJUSTMENT_MAPPING_INVALID', 'Choose valid adjustment cells.'); continue }
    const { row, column } = parseAddress(address)
    const col = columnToNumber(column)
    const merge = merges.find(({ box }) => row >= box.top && row <= box.bottom && col >= box.left && col <= box.right)
    if (seen.has(address) || row < region.footerAnchorRow || row > sheet.rowCount || col > sheet.columnCount || (merge && (row !== merge.box.top || col !== merge.box.left))) error('ADJUSTMENT_MAPPING_INVALID', 'Adjustment cells must be distinct footer anchors inside the template.', address)
    seen.add(address)
  }
  if ((template.adjustmentRows ?? []).some((slot) => !slot.label || !slot.amount)) error('ADJUSTMENT_MAPPING_INVALID', 'Each adjustment row needs a label and amount cell.')
  const minHeight = template.output?.minRowHeight ?? 1, maxHeight = template.output?.maxRowHeight ?? 409
  if (!Number.isFinite(minHeight) || !Number.isFinite(maxHeight) || minHeight < 1 || maxHeight > 409 || maxHeight < minHeight) error('ROW_HEIGHT_INVALID', 'Row height limits must be between 1 and 409 points.')

  return errors
}

function collectFormulaDiagnostics(sheet: ExcelJS.Worksheet, worksheet: string): Diagnostic[] {
  const errors: Diagnostic[] = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell((cell) => {
      if (cell.type !== ExcelJS.ValueType.Formula) return
      const formula = cell.formula
      if (isArrayFormula(cell.value)) {
        errors.push({ severity: 'error', code: 'ARRAY_FORMULA', message: `${cell.address} is an array formula, which is not supported yet.`, worksheet, cell: cell.address })
      } else if (referencesOtherSheet(formula)) {
        errors.push({ severity: 'error', code: 'CROSS_SHEET_FORMULA', message: `${cell.address} reads from another worksheet, and only one worksheet is kept.`, worksheet, cell: cell.address })
      } else if (usesUnsupportedReference(formula)) {
        errors.push({ severity: 'error', code: 'UNSUPPORTED_REFERENCE', message: `${cell.address} has a reference that cannot be moved safely: ${formula}`, worksheet, cell: cell.address })
      }
    })
  })
  return errors
}

function materializeFormulas(sheet: ExcelJS.Worksheet) {
  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell((cell) => {
      if (cell.type !== ExcelJS.ValueType.Formula) return
      const { result } = cell.value as ExcelJS.CellFormulaValue
      cell.value = { formula: cell.formula, result } as ExcelJS.CellFormulaValue
    })
  })
}

function columnWidth(sheet: ExcelJS.Worksheet, column: number): number {
  return sheet.getColumn(column).width ?? sheet.properties.defaultColWidth ?? DEFAULT_COLUMN_WIDTH
}

function sumWidths(sheet: ExcelJS.Worksheet, left: number, right: number): number {
  let width = 0
  for (let column = left; column <= right; column += 1) width += columnWidth(sheet, column)
  return width
}

function widthNeeded(cell: ExcelJS.Cell, minor: number): number {
  const digits = minorToNumber(minor).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const literals = [...(cell.numFmt ?? '').matchAll(/"([^"]*)"/g)].reduce((total, [, text]) => total + text.length, 0)
  const fontScale = (cell.font?.size ?? DEFAULT_FONT_SIZE) / DEFAULT_FONT_SIZE
  const weight = cell.font?.bold ? AMOUNT_BOLD_FACTOR : 1
  return Math.ceil((digits.length + literals) * fontScale * weight + AMOUNT_WIDTH_PADDING)
}

/** Excel prints #### when a number does not fit, so amount columns grow rather than clip. */
function widenAmountColumns(sheet: ExcelJS.Worksheet, amounts: { address: string; minor: number }[], worksheet: string): Diagnostic[] {
  const needed = new Map<number, number>()
  for (const { address, minor } of amounts) {
    const cell = sheet.getCell(address)
    if (cell.isMerged) continue
    const column = Number(cell.col)
    needed.set(column, Math.max(needed.get(column) ?? 0, widthNeeded(cell, minor)))
  }

  const diagnostics: Diagnostic[] = []
  for (const [column, width] of needed) {
    if (width <= columnWidth(sheet, column)) continue
    sheet.getColumn(column).width = width
    diagnostics.push({ severity: 'info', code: 'COLUMN_WIDENED', message: `Column ${sheet.getColumn(column).letter} was widened so its amounts fit.`, worksheet })
  }
  return diagnostics
}

function fitText(sheet: ExcelJS.Worksheet, cell: ExcelJS.Cell, value: string): boolean {
        cell.alignment = { ...cell.alignment, wrapText: true, vertical: cell.alignment?.vertical ?? 'top' }
        const box = mergesOf(sheet).map(parseRange).find((range) => range.top === Number(cell.row) && range.left === Number(cell.col))
        const firstColumn = box?.left ?? Number(cell.col)
        const lastColumn = box?.right ?? Number(cell.col)
        const height = estimateRowHeight({ text: value, columnWidth: sumWidths(sheet, firstColumn, lastColumn), fontSize: cell.font?.size ?? DEFAULT_FONT_SIZE, minHeight: 15, maxHeight: Number.POSITIVE_INFINITY })
        const end = box?.bottom ?? Number(cell.row)
        if (height > 409 * (end - Number(cell.row) + 1)) return false
        let current = 0
        for (let row = Number(cell.row); row <= end; row++) current += sheet.getRow(row).height ?? sheet.properties.defaultRowHeight ?? 15
        let extra = Math.max(0, height - current)
        for (let row = Number(cell.row); row <= end && extra > 0; row++) {
          const existing = sheet.getRow(row).height ?? sheet.properties.defaultRowHeight ?? 15
          const added = Math.min(extra, Math.max(0, 409 - existing))
          sheet.getRow(row).height = existing + added
          extra -= added
        }
  return true
}

function writeMoney(cell: ExcelJS.Cell, minor: number, format = DEFAULT_CURRENCY_FORMAT) {
  cell.value = minorToNumber(minor)
  if (isGeneralFormat(cell.numFmt)) cell.numFmt = format
}

function writeFormula(cell: ExcelJS.Cell, formula: string, resultMinor: number, format = DEFAULT_CURRENCY_FORMAT) {
  cell.value = { formula, result: minorToNumber(resultMinor) }
  if (isGeneralFormat(cell.numFmt)) cell.numFmt = format
}

function writeItem(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  item: QuoteItem,
  index: number,
  { columns }: TemplateDefinition['itemRegion'],
  moneyFormat: string,
  overrideMoney: boolean,
) {
  const cellAt = (column: string) => sheet.getCell(`${column}${rowNumber}`)

  if (columns.itemNumber) cellAt(columns.itemNumber).value = index + 1
  const description = cellAt(columns.description)
  description.value = item.description
  description.alignment = { ...description.alignment, wrapText: true }
  if (columns.partNumber) cellAt(columns.partNumber).value = item.partNumber ?? null
  if (columns.unit) cellAt(columns.unit).value = item.unit ?? null
  cellAt(columns.quantity).value = Number(item.quantity)

  const price = cellAt(columns.unitPrice)
  if (overrideMoney) { price.numFmt = moneyFormat; cellAt(columns.lineAmount).numFmt = moneyFormat }
  // checkQuotation has already refused any included item without a price.
  const unitPriceMinor = item.isFree ? 0 : (item.unitPriceMinor ?? 0)
  writeMoney(price, unitPriceMinor, moneyFormat)
  if (item.isFree) price.numFmt = freeFormat(price.numFmt, moneyFormat)

  const formula = `ROUND(${columns.quantity}${rowNumber}*${columns.unitPrice}${rowNumber},2)`
  writeFormula(cellAt(columns.lineAmount), formula, lineAmountMinor(item) ?? 0, moneyFormat)
}

function writeTotals(
  sheet: ExcelJS.Worksheet,
  template: TemplateDefinition,
  quotation: Quotation,
  totals: Totals,
  addressOf: (mapping: CellMapping) => string,
  firstItemRow: number,
  lastItemRow: number,
  moneyFormat: string,
  moveAddress: (address: string) => string,
) {
  const mappingFor = (key: SemanticKey) => template.cellMappings.find((mapping) => mapping.semanticKey === key)
  const amountColumn = template.itemRegion.columns.lineAmount
  const adjustments = [...quotation.adjustments].filter((adjustment) => adjustment.enabled).sort((a, b) => a.order - b.order)
  const [discount] = adjustments
  const discountMinor = totals.adjustments.filter((adjustment) => adjustment.kind === 'discount').reduce((sum, adjustment) => sum + adjustment.amountMinor, 0)

  const subtotal = mappingFor('totals.subtotal')
  const labor = mappingFor('totals.labor')
  const discountCell = mappingFor('totals.discount')
  const grandTotal = mappingFor('totals.grandTotal')
  const itemsFormula = `SUM(${amountColumn}${firstItemRow}:${amountColumn}${lastItemRow})`
  const subtotalFormula = labor ? `${itemsFormula}+${addressOf(labor)}` : itemsFormula
  const subtotalRef = subtotal ? addressOf(subtotal) : `(${subtotalFormula})`
  const items = quotation.items.filter((item) => item.included && !(labor && item.type === 'labor'))
  const laborCells = items.flatMap((item, index) => item.type === 'labor' ? [`${amountColumn}${firstItemRow + index}`] : [])
  const laborRef = labor ? addressOf(labor) : laborCells.length ? `SUM(${laborCells.join(',')})` : '0'
  const baseFormula = (adjustment: Adjustment) => adjustment.base === 'manual' ? String(minorToNumber(adjustment.manualBaseMinor ?? 0)) : adjustment.base === 'labor' ? laborRef : adjustment.base === 'parts' ? `(${subtotalRef}-${laborRef})` : subtotalRef
  const formulaFor = (adjustment: Adjustment) => adjustment.mode === 'percentage' ? `ROUND(${baseFormula(adjustment)}*${Number(adjustment.value)}/100,2)` : `ROUND(${Number(adjustment.value)},2)`
  const moneyCell = (address: string) => {
    const cell = sheet.getCell(address)
    if (template.output?.moneyFormat === 'business') cell.numFmt = moneyFormat
    return cell
  }

  if (labor?.overwrite === 'replace') {
    writeMoney(moneyCell(addressOf(labor)), totals.laborMinor, moneyFormat)
  }

  if (subtotal?.overwrite === 'replace') {
    writeFormula(moneyCell(addressOf(subtotal)), subtotalFormula, totals.subtotalMinor, moneyFormat)
  }

  const slotRefs: { ref: string; adjustment: Adjustment }[] = []
  const bases = { allBillable: 'all items', parts: 'parts/services', labor: 'labor', manual: 'manual base' }
  for (const [index, slot] of (template.adjustmentRows ?? []).entries()) {
    const adjustment = adjustments[index]
    const label = sheet.getCell(moveAddress(slot.label)), amount = moneyCell(moveAddress(slot.amount))
    label.alignment = { ...label.alignment, wrapText: true }
    if (!adjustment) {
      label.value = null; amount.value = null
      if (slot.base) sheet.getCell(moveAddress(slot.base)).value = null
      if (slot.rate) sheet.getCell(moveAddress(slot.rate)).value = null
      continue
    }
    const calculated = totals.adjustments.find(({ id }) => id === adjustment.id)!
    label.value = `${adjustment.label}${adjustment.mode === 'percentage' ? ` (${adjustment.value}% of ${bases[adjustment.base]})` : ''}`
    writeFormula(amount, formulaFor(adjustment), calculated.amountMinor, moneyFormat)
    if (slot.base) {
      const base = moneyCell(moveAddress(slot.base))
      if (adjustment.mode === 'percentage') writeFormula(base, baseFormula(adjustment), calculated.baseMinor ?? 0, moneyFormat)
      else base.value = null
    }
    if (slot.rate) {
      const rate = sheet.getCell(moveAddress(slot.rate))
      rate.value = adjustment.mode === 'percentage' ? Number(adjustment.value) / 100 : null
      rate.numFmt = '0.####%'
    }
    slotRefs.push({ ref: moveAddress(slot.amount), adjustment })
  }

  if (discountCell?.overwrite === 'replace') {
    const cell = moneyCell(addressOf(discountCell))
    if (template.adjustmentRows?.length) {
      const refs = slotRefs.filter(({ adjustment }) => adjustment.kind === 'discount').map(({ ref }) => ref)
      writeFormula(cell, refs.length ? `SUM(${refs.join(',')})` : '0', discountMinor, moneyFormat)
    } else if (discount?.mode === 'percentage') {
      writeFormula(cell, formulaFor(discount), discountMinor, moneyFormat)
    } else {
      writeMoney(cell, discountMinor, moneyFormat)
    }
  }

  if (grandTotal?.overwrite === 'replace') {
    const adjustmentFormula = slotRefs.map(({ ref, adjustment }) => `${adjustment.kind === 'discount' || adjustment.kind === 'deduction' ? '-' : '+'}${ref}`).join('')
    const formula = template.adjustmentRows?.length ? `ROUND(${subtotalRef}${adjustmentFormula},2)` : discountCell ? `ROUND(${subtotalRef}-${addressOf(discountCell)},2)` : `ROUND(${subtotalRef},2)`
    writeFormula(moneyCell(addressOf(grandTotal)), formula, totals.grandTotalMinor, moneyFormat)
  }

  // A preserved cell keeps the template's formula, so seed its cached value for viewers that do not recalculate.
  const cached: [CellMapping | undefined, number][] = [
    [subtotal, totals.subtotalMinor],
    [discountCell, discountMinor],
    [grandTotal, totals.grandTotalMinor],
  ]
  for (const [mapping, minor] of cached) {
    if (mapping?.overwrite !== 'preserve') continue
    const cell = sheet.getCell(addressOf(mapping))
    if (cell.type === ExcelJS.ValueType.Formula) {
      cell.value = { formula: cell.formula, result: minorToNumber(minor) } as ExcelJS.CellFormulaValue
    } else {
      writeMoney(cell, minor, moneyFormat)
    }
  }
}

function applyPrintSettings(sheet: ExcelJS.Worksheet, template: TemplateDefinition, printArea: string, rowDelta: number) {
  const { printProfile, itemRegion } = template
  const { top, bottom, left, right } = printProfile.marginsInches
  sheet.pageSetup.paperSize = PAPER_SIZE[printProfile.paper] as ExcelJS.PageSetup['paperSize']
  sheet.pageSetup.orientation = printProfile.orientation
  sheet.pageSetup.margins = { top, bottom, left, right, header: printProfile.headerMarginInches ?? 0.3, footer: printProfile.footerMarginInches ?? 0.3 }
  sheet.pageSetup.horizontalCentered = printProfile.horizontalCentered ?? false
  sheet.pageSetup.printTitlesRow = undefined as unknown as string
  sheet.pageSetup.printTitlesColumn = undefined as unknown as string
  sheet.pageSetup.fitToPage = true
  sheet.pageSetup.fitToWidth = printProfile.fitToWidthPages
  sheet.pageSetup.fitToHeight = 0
  sheet.pageSetup.printArea = printArea
  const repeatRow = printProfile.repeatHeaderRow
  if (repeatRow !== undefined) {
    const row = repeatRow >= itemRegion.footerAnchorRow ? repeatRow + rowDelta : repeatRow
    sheet.pageSetup.printTitlesRow = `${row}:${row}`
  }
}

function shiftImages(sheet: ExcelJS.Worksheet, firstDataRow: number, footerAnchorRow: number, rowDelta: number): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const image of sheet.getImages()) {
    const { tl, br } = image.range
    const topRow = tl.nativeRow + 1
    if (topRow >= footerAnchorRow) {
      tl.nativeRow += rowDelta
      if (br) br.nativeRow += rowDelta
    } else if (topRow >= firstDataRow) {
      diagnostics.push({ severity: 'warning', code: 'IMAGE_IN_ITEM_REGION', message: `A picture sits over the item rows near row ${topRow} and does not move with them.` })
    }
  }
  return diagnostics
}

export class ExcelJsAdapter implements WorkbookAdapter {
  open(bytes: Uint8Array): Promise<OpenResult> {
    return openWorkbook(bytes)
  }

  async inspect(bytes: Uint8Array): Promise<WorkbookInspection> {
    const opened = await openWorkbook(bytes)
    return opened.ok ? opened.workbook.inspection : { worksheets: [], definedNames: [], diagnostics: opened.diagnostics }
  }

  extractRegion(bytes: Uint8Array, worksheet: string, region: Region): Promise<ExtractResult> {
    return extractRegion(bytes, worksheet, region)
  }

  async generate({ templateBytes, template, quotation, business }: GenerateRequest): Promise<GenerateResult> {
    const packageDiagnostics = await scanPackage(templateBytes)
    if (packageDiagnostics.some(({ severity }) => severity === 'error')) {
      return { ok: false, diagnostics: packageDiagnostics }
    }

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(toBuffer(templateBytes))
    const sheet = workbook.getWorksheet(template.worksheetName)

    const region = template.itemRegion
    const laborHasOwnCell = template.cellMappings.some((mapping) => mapping.semanticKey === 'totals.labor')
    const items = quotation.items.filter((item) => item.included && !(laborHasOwnCell && item.type === 'labor'))
    const needed = Math.max(items.length, region.minDisplayRows ?? 1)

    const errors = [
      ...printProfileErrors(template),
      ...validateDefinition(sheet, template, quotation, business, needed),
      ...checkQuotation(quotation)
        .filter(({ severity }) => severity === 'error')
        .map(({ code, message }): Diagnostic => ({ severity: 'error', code, message })),
      ...adjustmentDiagnostics(quotation, template),
      ...(sheet ? collectFormulaDiagnostics(sheet, template.worksheetName) : []),
    ]
    if (errors.length > 0 || !sheet) {
      return { ok: false, diagnostics: [...packageDiagnostics, ...errors] }
    }

    for (const other of workbook.worksheets.filter(({ id }) => id !== sheet.id)) {
      workbook.removeWorksheet(other.id)
    }

    const diagnostics = [...packageDiagnostics]
    const currency = /^[A-Z]{3}$/.test(business.currency) ? business.currency : 'PHP'
    const moneyFormat = currency === 'PHP' ? DEFAULT_CURRENCY_FORMAT : `"${currency} "#,##0.00`
    const overrideMoney = template.output?.moneyFormat === 'business'
    if (!overrideMoney && currency !== 'PHP') {
      const priceFormat = sheet.getCell(`${region.columns.unitPrice}${region.prototypeRow}`).numFmt
      if (priceFormat && /₱|PHP/.test(priceFormat)) diagnostics.push({ severity: 'warning', code: 'TEMPLATE_CURRENCY', message: `This template keeps a PHP number format while the business uses ${currency}. Choose business currency formatting in a new template version to change it.` })
    }

    materializeFormulas(sheet)

    // Old values the owner chose to clear go before any row is copied, so the prototype row carries none of them.
    for (const address of template.clearCells ?? []) {
      const cell = sheet.getCell(address)
      if (cell.type !== ExcelJS.ValueType.Merge) cell.value = null
    }

    const { firstDataRow, footerAnchorRow, prototypeRow } = region
    const lastUsedRow = sheet.rowCount
    const firstItemRow = firstDataRow
    const lastItemRow = firstDataRow + needed - 1
    const rowDelta = firstDataRow + needed - footerAnchorRow

    const prototype = snapshotRow(sheet, prototypeRow)
    const footer: { row: number; snapshot: RowSnapshot }[] = []
    for (let row = footerAnchorRow; row <= lastUsedRow; row += 1) {
      footer.push({ row, snapshot: snapshotRow(sheet, row) })
    }

    const merges = mergesOf(sheet).map(parseRange)
    const prototypeMerges = merges.filter((box) => box.top === prototypeRow && box.bottom === prototypeRow)
    const footerMerges = merges.filter((box) => box.top >= footerAnchorRow)
    for (const box of merges.filter((merge) => merge.bottom >= firstDataRow)) {
      sheet.unMergeCells(formatRange(box))
    }

    for (let row = firstDataRow; row <= lastUsedRow; row += 1) clearRow(sheet, row)

    const moveRow = (row: number) => (row >= footerAnchorRow ? row + rowDelta : row)
    const moveReference = (row: number, position: 'single' | 'start' | 'end') => {
      if (row < firstDataRow || row >= footerAnchorRow) return moveRow(row)
      if (position === 'start') return firstItemRow
      if (position === 'end') return lastItemRow
      return row
    }
    const moveFormula = (formula: string) => mapFormulaRows(formula, moveReference)

    diagnostics.push(...moveLayoutRules(sheet, region, needed, moveFormula))

    moveDefinedNames(workbook, template.worksheetName, moveFormula)

    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (row.number >= firstDataRow) return
      row.eachCell((cell) => {
        if (cell.type !== ExcelJS.ValueType.Formula) return
        const moved = moveFormula(cell.formula)
        if (moved !== cell.formula) cell.value = { formula: moved }
      })
    })

    const descriptionColumn = columnToNumber(region.columns.description)
    const descriptionMerge = prototypeMerges.find((box) => descriptionColumn >= box.left && descriptionColumn <= box.right)
    const descriptionWidth = sumWidths(sheet, descriptionMerge?.left ?? descriptionColumn, descriptionMerge?.right ?? descriptionColumn)
    const descriptionFont = prototype.cells.find(({ column }) => column === descriptionColumn)?.style.font?.size ?? DEFAULT_FONT_SIZE
    const minHeight = template.output?.minRowHeight ?? prototype.height ?? DEFAULT_ROW_HEIGHT
    const repeatedPrototype = withoutNotes(prototype)

    for (let index = 0; index < needed; index += 1) {
      const rowNumber = firstDataRow + index
      const offset = rowNumber - prototypeRow
      writeRow(sheet, rowNumber, index === 0 ? prototype : repeatedPrototype, (formula) => slideFormula(formula, offset))
      for (const box of prototypeMerges) {
        sheet.mergeCells(formatRange({ ...box, top: rowNumber, bottom: rowNumber }))
      }

      const item = items[index]
      if (!item) {
        // A minimum display row keeps its styling, never the prototype's old quotation values.
        for (const column of Object.values(region.columns)) if (column) sheet.getCell(`${column}${rowNumber}`).value = null
        continue
      }
      writeItem(sheet, rowNumber, item, index, region, moneyFormat, overrideMoney)
      const height = estimateRowHeight({
        text: item.description,
        columnWidth: descriptionWidth,
        fontSize: descriptionFont,
        minHeight,
        maxHeight: Number.POSITIVE_INFINITY,
      })
      if (height > (template.output?.maxRowHeight ?? 409)) return { ok: false, diagnostics: [{ severity: 'error', code: 'DESCRIPTION_TOO_TALL', cell: `${region.columns.description}${rowNumber}`, message: 'An item description exceeds the template’s maximum row height. Shorten it, split it into separate items, widen its columns, or raise the row-height limit.' }] }
      sheet.getRow(rowNumber).height = height
    }

    for (const { row, snapshot } of footer) {
      writeRow(sheet, moveRow(row), snapshot, moveFormula)
    }
    for (const box of footerMerges) {
      sheet.mergeCells(formatRange({ ...box, top: box.top + rowDelta, bottom: box.bottom + rowDelta }))
    }

    diagnostics.push(...shiftImages(sheet, firstDataRow, footerAnchorRow, rowDelta))

    const addressOf = (mapping: CellMapping) => {
      const { column, row } = parseAddress(mapping.address)
      return formatAddress({ column, row: moveRow(row) })
    }

    const totals = computeTotals(quotation)
    const addresses: Record<string, string> = {}
    for (const mapping of template.cellMappings) {
      const address = addressOf(mapping)
      addresses[mapping.semanticKey] = address
      if (mapping.source === 'calculated' || mapping.overwrite === 'preserve') continue

      const value = mappedText(mapping.semanticKey, quotation, business)
      const cell = sheet.getCell(address)
      cell.value = value ?? null
      if (value instanceof Date) {
        const format = template.output?.dateFormat ?? 'template'
        if (format !== 'template' || isGeneralFormat(cell.numFmt)) cell.numFmt = format === 'iso' ? 'yyyy-mm-dd' : format === 'short' ? 'mm/dd/yyyy' : DEFAULT_DATE_FORMAT
      }
      if (typeof value === 'string') {
        if (!fitText(sheet, cell, value)) return { ok: false, diagnostics: [{ severity: 'error', code: 'MAPPED_TEXT_TOO_TALL', cell: address, message: 'Text in a mapped field is too long for its Excel cells. Shorten it or enlarge its mapped area before generating.' }] }
      }
    }

    writeTotals(sheet, template, quotation, totals, addressOf, firstItemRow, lastItemRow, moneyFormat, (address) => {
      const { column, row } = parseAddress(address)
      return formatAddress({ column, row: moveRow(row) })
    })

    const adjustmentAmounts: { address: string; minor: number }[] = []
    const ordered = quotation.adjustments.filter((adjustment) => adjustment.enabled).sort((a, b) => a.order - b.order)
    for (const [index, slot] of (template.adjustmentRows ?? []).entries()) {
      for (const [key, address] of Object.entries(slot)) {
        if (!address) continue
        const parsed = parseAddress(address)
        addresses[`adjustments.${index}.${key}`] = formatAddress({ column: parsed.column, row: moveRow(parsed.row) })
      }
      const label = sheet.getCell(addresses[`adjustments.${index}.label`])
      if (!fitText(sheet, label, label.text)) return { ok: false, diagnostics: [{ severity: 'error', code: 'MAPPED_TEXT_TOO_TALL', cell: label.address, message: 'An adjustment label is too long for its mapped cells. Shorten it or enlarge the area.' }] }
      const computed = totals.adjustments.find(({ id }) => id === ordered[index]?.id)
      if (computed) {
        adjustmentAmounts.push({ address: addresses[`adjustments.${index}.amount`], minor: computed.amountMinor })
        if (slot.base) adjustmentAmounts.push({ address: addresses[`adjustments.${index}.base`], minor: computed.baseMinor ?? 0 })
      }
    }
    const { unitPrice, lineAmount } = region.columns
    const totalCells: [SemanticKey, number][] = [
      ['totals.subtotal', totals.subtotalMinor],
      ['totals.labor', totals.laborMinor],
      ['totals.discount', totals.adjustments.filter(({ kind }) => kind === 'discount').reduce((sum, adjustment) => sum + adjustment.amountMinor, 0)],
      ['totals.grandTotal', totals.grandTotalMinor],
    ]
    diagnostics.push(
      ...widenAmountColumns(
        sheet,
        [
          ...items.flatMap((item, index) => [
            { address: `${unitPrice}${firstDataRow + index}`, minor: item.unitPriceMinor ?? 0 },
            { address: `${lineAmount}${firstDataRow + index}`, minor: lineAmountMinor(item) ?? 0 },
          ]),
          ...adjustmentAmounts,
          ...totalCells.flatMap(([key, minor]) => (addresses[key] ? [{ address: addresses[key], minor }] : [])),
        ],
        template.worksheetName,
      ),
    )

    const lastContentRow = Math.max(footer.filter(({ snapshot }) => rowHasContent(snapshot)).at(-1)?.row ?? footerAnchorRow, ...template.cellMappings.map(({ address }) => parseAddress(address).row), ...(template.adjustmentRows ?? []).flatMap((slot) => Object.values(slot).filter(Boolean).map((address) => parseAddress(address).row)))
    const { first, last } = template.printProfile.columns
    const printBox: CellRange = {
      left: columnToNumber(first),
      top: 1,
      right: columnToNumber(last),
      bottom: moveRow(lastContentRow),
    }
    const printArea = formatRange(printBox)
    applyPrintSettings(sheet, template, printArea, rowDelta)
    diagnostics.push(...paginate(sheet, template, printBox.bottom, footerAnchorRow + rowDelta))

    workbook.calcProperties.fullCalcOnLoad = true

    const output = await workbook.xlsx.writeBuffer()
    return {
      ok: true,
      workbook: {
        bytes: new Uint8Array(output as unknown as ArrayBuffer),
        filename: quotationFilename(business, quotation),
        layout: { firstItemRow, lastItemRow, rowDelta, printArea, addresses },
        totals,
        diagnostics,
      },
    }
  }
}
