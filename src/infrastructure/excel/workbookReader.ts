import ExcelJS from 'exceljs'
import { hasErrors } from '../../domain/template/diagnostics'
import type { Diagnostic } from '../../domain/template/diagnostics'
import { isQuotationHeading, MANY_WORKSHEETS, suggestBlocks } from '../../domain/template/region'
import type { Region } from '../../domain/template/region'
import { numberToColumn, parseRange } from './a1'
import { formattingOf, isFilled, loadWorkbook, mergesOf, UNREADABLE } from './exceljsHelpers'
import { scanPackage } from './packageScan'
import type { GridCell, OpenResult, WorkbookGridData, WorkbookInspection, WorksheetSummary } from './WorkbookAdapter'

const GRID_ROW_LIMIT = 120
const GRID_COLUMN_LIMIT = 30
const DEFAULT_COLUMN_WIDTH = 9

function summarize(sheet: ExcelJS.Worksheet): WorksheetSummary {
  const filledRows = new Map<number, number>()
  const headingRows: number[] = []
  const formulaAddresses: string[] = []
  let filledCellCount = 0
  let hiddenRowCount = 0

  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (row.hidden) hiddenRowCount += 1
    row.eachCell((cell, column) => {
      if (cell.type === ExcelJS.ValueType.Formula) formulaAddresses.push(cell.address)
      if (!isFilled(cell)) return
      filledCellCount += 1
      filledRows.set(rowNumber, Math.max(filledRows.get(rowNumber) ?? 0, column))
      if (cell.type === ExcelJS.ValueType.String && isQuotationHeading(String(cell.text))) headingRows.push(rowNumber)
    })
  })

  const { conditionalFormattings, dataValidations } = formattingOf(sheet)
  return {
    name: sheet.name,
    state: sheet.state,
    // The last row with content. ExcelJS's actualRowCount counts filled rows, which is smaller when rows are blank.
    rowCount: filledRows.size > 0 ? Math.max(...filledRows.keys()) : 0,
    columnCount: sheet.actualColumnCount,
    filledCellCount,
    merges: mergesOf(sheet),
    formulaAddresses,
    imageCount: sheet.getImages().length,
    hiddenRowCount,
    hiddenColumnCount: (sheet.columns ?? []).filter((column) => column.hidden).length,
    conditionalFormatCount: conditionalFormattings.length,
    validationCount: Object.keys(dataValidations).length,
    quoteBlocks: suggestBlocks(filledRows, headingRows),
    printArea: sheet.pageSetup.printArea,
    orientation: sheet.pageSetup.orientation,
    paperSize: sheet.pageSetup.paperSize,
  }
}

function workbookDiagnostics(worksheets: WorksheetSummary[], definedNames: string[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const hidden = worksheets.filter(({ state }) => state !== 'visible')
  if (worksheets.length > MANY_WORKSHEETS) {
    diagnostics.push({
      severity: 'info',
      code: 'MANY_WORKSHEETS',
      message: `This workbook has ${worksheets.length} worksheets. Only the one you choose becomes the template, and the rest stay in your original file.`,
    })
  } else if (worksheets.length > 1) {
    diagnostics.push({
      severity: 'info',
      code: 'MULTIPLE_WORKSHEETS',
      message: `This workbook has ${worksheets.length} worksheets. Only the one you choose becomes the template.`,
    })
  }
  if (hidden.length > 0) {
    diagnostics.push({
      severity: 'info',
      code: 'HIDDEN_WORKSHEETS',
      message: `Hidden worksheets: ${hidden.map(({ name }) => name).join(', ')}.`,
    })
  }
  const names = definedNames.filter((name) => !name.startsWith('_xlnm'))
  if (names.length > 0) {
    diagnostics.push({
      severity: 'info',
      code: 'NAMED_RANGES_NOT_KEPT',
      message: `Named ranges are left out of the template: ${names.join(', ')}.`,
    })
  }
  return diagnostics
}

function cellInfo(shown: ExcelJS.Cell): GridCell {
  // When an area starts partway down a merge, the visible cell is a merge slave. Reading its text
  // throws in ExcelJS if the anchor is empty, so everything is read from the anchor instead.
  const cell = shown.type === ExcelJS.ValueType.Merge ? shown.master : shown
  const value = cell.value
  const isFormulaValue = typeof value === 'object' && value !== null && ('formula' in value || 'sharedFormula' in value)
  const result = isFormulaValue ? (value as ExcelJS.CellFormulaValue).result : value
  // A formula with no saved result would look like an empty cell, so its formula shows instead.
  const unsavedFormula = cell.type === ExcelJS.ValueType.Formula && (result === undefined || result === null || result === '')
  const text = unsavedFormula
    ? `=${cell.formula}`
    : result instanceof Date
      ? result.toISOString().slice(0, 10)
      : String(cell.text ?? '')
  const fill = cell.fill?.type === 'pattern' && cell.fill.pattern === 'solid' ? cell.fill.fgColor?.argb : undefined
  const horizontal = cell.alignment?.horizontal
  const border = cell.border
  const color = cell.font?.color?.argb
  return {
    text,
    bold: cell.font?.bold || undefined,
    fill: fill && fill.length === 8 && fill !== 'FFFFFFFF' ? `#${fill.slice(2)}` : undefined,
    // Kept so white text on a dark header stays readable in the preview.
    color: color && color.length === 8 && color !== 'FF000000' ? `#${color.slice(2)}` : undefined,
    align: horizontal === 'center' || horizontal === 'right' || horizontal === 'left' ? horizontal : undefined,
    numeric: typeof result === 'number' || undefined,
    formula: unsavedFormula || undefined,
    bordered: Boolean(border && (border.top || border.bottom || border.left || border.right)) || undefined,
  }
}

export function readGrid(sheet: ExcelJS.Worksheet, region: Region): WorkbookGridData {
  const firstRow = region.firstRow
  const lastRow = Math.min(region.lastRow, firstRow + GRID_ROW_LIMIT - 1)
  const lastColumn = Math.min(region.lastColumn, GRID_COLUMN_LIMIT)

  const spans = new Map<string, { rowSpan: number; colSpan: number }>()
  const covered = new Set<string>()
  for (const merge of mergesOf(sheet).map(parseRange)) {
    if (merge.bottom < firstRow || merge.top > lastRow || merge.left > lastColumn) continue
    const top = Math.max(merge.top, firstRow)
    const left = merge.left
    const bottom = Math.min(merge.bottom, lastRow)
    const right = Math.min(merge.right, lastColumn)
    spans.set(`${top}:${left}`, { rowSpan: bottom - top + 1, colSpan: right - left + 1 })
    for (let row = top; row <= bottom; row += 1) {
      for (let column = left; column <= right; column += 1) {
        if (row !== top || column !== left) covered.add(`${row}:${column}`)
      }
    }
  }

  const columns = []
  for (let column = 1; column <= lastColumn; column += 1) {
    columns.push({
      letter: numberToColumn(column),
      width: sheet.getColumn(column).width ?? sheet.properties.defaultColWidth ?? DEFAULT_COLUMN_WIDTH,
    })
  }

  const rows = []
  for (let rowNumber = firstRow; rowNumber <= lastRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber)
    const cells: GridCell[] = []
    for (let column = 1; column <= lastColumn; column += 1) {
      const key = `${rowNumber}:${column}`
      if (covered.has(key)) {
        cells.push({ text: '', covered: true })
        continue
      }
      const span = spans.get(key)
      const info = cellInfo(row.getCell(column))
      cells.push(span && (span.rowSpan > 1 || span.colSpan > 1) ? { ...info, ...span } : info)
    }
    rows.push({ number: rowNumber, height: row.height, cells })
  }

  return {
    columns,
    rows,
    truncatedRows: region.lastRow > lastRow,
    truncatedColumns: region.lastColumn > lastColumn,
  }
}

/** Parses once and keeps the workbook in memory, so changing the area redraws without reloading. */
export async function openWorkbook(bytes: Uint8Array): Promise<OpenResult> {
  const packageDiagnostics = await scanPackage(bytes)
  if (hasErrors(packageDiagnostics)) return { ok: false, diagnostics: packageDiagnostics }

  const workbook = await loadWorkbook(bytes)
  if (!workbook) return { ok: false, diagnostics: [UNREADABLE] }

  const worksheets = workbook.worksheets.map(summarize)
  const definedNames = workbook.definedNames.model.map(({ name }) => name)
  const inspection: WorkbookInspection = {
    worksheets,
    definedNames,
    diagnostics: [...packageDiagnostics, ...workbookDiagnostics(worksheets, definedNames)],
  }

  return {
    ok: true,
    workbook: {
      inspection,
      readGrid(worksheet, region) {
        const sheet = workbook.getWorksheet(worksheet)
        if (!sheet) throw new RangeError(`Worksheet "${worksheet}" is not in this workbook`)
        return readGrid(sheet, region)
      },
    },
  }
}
