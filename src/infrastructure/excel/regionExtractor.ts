import ExcelJS from 'exceljs'
import type { Diagnostic } from '../../domain/template/diagnostics'
import { MAX_REGION_CELLS } from '../../domain/template/region'
import type { Region } from '../../domain/template/region'
import {
  columnToNumber,
  formatRange,
  formulaReferences,
  mapFormulaRows,
  numberToColumn,
  parseRange,
  referencesOtherSheet,
} from './a1'
import { isFilled, loadWorkbook, mergesOf, UNREADABLE } from './exceljsHelpers'
import { extractLayoutRules } from './layoutRules'
import { scanPackage } from './packageScan'
import type { ExtractResult } from './WorkbookAdapter'

export { CLEAN_SHEET_NAME } from '../../domain/template/region'
import { CLEAN_SHEET_NAME } from '../../domain/template/region'

type ImageAnchor = { col: number; row: number }
type ImageRange = { tl: ImageAnchor; br?: ImageAnchor; ext?: { width: number; height: number }; editAs?: string }

function inArea(row: number, column: number, region: Region) {
  return row >= region.firstRow && row <= region.lastRow && column <= region.lastColumn
}

/**
 * Copies one area into a new worksheet of the same workbook, so fonts, fills, and the theme
 * carry over, then removes every other worksheet. Rows move up so the area starts at row 1.
 */
export async function extractRegion(bytes: Uint8Array, worksheetName: string, region: Region): Promise<ExtractResult> {
  const packageIssues = await scanPackage(bytes)
  if (packageIssues.some(({ severity }) => severity === 'error')) return { ok: false, diagnostics: packageIssues }
  const workbook = await loadWorkbook(bytes)
  if (!workbook) return { ok: false, diagnostics: [UNREADABLE] }

  const source = workbook.getWorksheet(worksheetName)
  if (!source) {
    return {
      ok: false,
      diagnostics: [{ severity: 'error', code: 'WORKSHEET_MISSING', message: `Worksheet "${worksheetName}" is not in this workbook.` }],
    }
  }

  const area = { left: 1, top: region.firstRow, right: region.lastColumn, bottom: region.lastRow }
  const errors: Diagnostic[] = []
  const merges = mergesOf(source).map((range) => ({ range, box: parseRange(range) }))
  const kept = merges.filter(({ box }) => box.top >= area.top && box.bottom <= area.bottom && box.right <= area.right)
  for (const { range, box } of merges) {
    const overlaps = box.bottom >= area.top && box.top <= area.bottom && box.left <= area.right
    if (overlaps && !kept.some((merge) => merge.range === range)) {
      errors.push({
        severity: 'error',
        code: 'MERGE_CROSSES_AREA',
        message: `Merged cells ${range} cross the edge of this area. Widen the area to include them.`,
        cell: range,
      })
    }
  }

  let filled = 0
  for (let row = area.top; row <= area.bottom; row += 1) {
    for (let column = 1; column <= area.right; column += 1) {
      if (isFilled(source.getRow(row).getCell(column))) filled += 1
    }
  }
  if (filled > MAX_REGION_CELLS) {
    errors.push({
      severity: 'error',
      code: 'AREA_TOO_LARGE',
      message: `This area has ${filled.toLocaleString('en-US')} filled cells. Choose one quotation of ${MAX_REGION_CELLS.toLocaleString('en-US')} cells or fewer.`,
    })
  }
  if (errors.length > 0) return { ok: false, diagnostics: errors }

  const diagnostics: Diagnostic[] = []
  const offset = region.firstRow - 1
  const target = workbook.addWorksheet(`${CLEAN_SHEET_NAME}-${Date.now()}`)

  target.properties.defaultRowHeight = source.properties.defaultRowHeight
  if (source.properties.defaultColWidth) target.properties.defaultColWidth = source.properties.defaultColWidth
  Object.assign(target.pageSetup, source.pageSetup, { printArea: undefined, printTitlesRow: undefined, printTitlesColumn: undefined })
  Object.assign(target.headerFooter, source.headerFooter)

  for (let column = 1; column <= area.right; column += 1) {
    const from = source.getColumn(column)
    const to = target.getColumn(column)
    if (from.width) to.width = from.width
    if (from.hidden) to.hidden = true
  }

  let formulasOutside = 0
  for (let row = area.top; row <= area.bottom; row += 1) {
    const from = source.getRow(row)
    const to = target.getRow(row - offset)
    if (from.height) to.height = from.height
    if (from.hidden) to.hidden = true

    for (let column = 1; column <= area.right; column += 1) {
      const cell = from.getCell(column)
      const copy = to.getCell(column)
      copy.style = structuredClone(cell.style)
      if (cell.note) copy.note = cell.note
      if (cell.type === ExcelJS.ValueType.Merge) continue

      if (cell.type === ExcelJS.ValueType.Formula) {
        const formula = cell.formula
        const references = formulaReferences(formula)
        const outside =
          referencesOtherSheet(formula) ||
          references.some(({ row: refRow, column: refColumn }) => !inArea(refRow, columnToNumber(refColumn), region))
        if (outside) {
          // A reference to cells that are left out would break, so the last calculated value stays instead.
          formulasOutside += 1
          copy.value = (cell.value as ExcelJS.CellFormulaValue).result ?? null
        } else {
          copy.value = { formula: mapFormulaRows(formula, (refRow) => refRow - offset) }
        }
        continue
      }
      copy.value = cell.value
    }
  }

  for (const { box } of kept) {
    target.mergeCells(formatRange({ ...box, top: box.top - offset, bottom: box.bottom - offset }))
  }

  let imagesCut = 0
  for (const image of source.getImages()) {
    const range = image.range as unknown as ImageRange
    const topRow = Math.floor(range.tl.row) + 1
    const bottomRow = range.br ? Math.ceil(range.br.row) : topRow
    const rightColumn = range.br ? Math.ceil(range.br.col) : Math.floor(range.tl.col) + 1
    if (topRow < area.top || bottomRow > area.bottom + 1 || rightColumn > area.right + 1) {
      if (bottomRow >= area.top && topRow <= area.bottom) imagesCut += 1
      continue
    }
    target.addImage(Number(image.imageId), {
      tl: { col: range.tl.col, row: range.tl.row - offset },
      ...(range.br ? { br: { col: range.br.col, row: range.br.row - offset } } : { ext: range.ext! }),
      editAs: range.editAs,
    } as Parameters<ExcelJS.Worksheet['addImage']>[1])
  }

  diagnostics.push(...extractLayoutRules(source, target, area))
  if (formulasOutside > 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'FORMULA_OUTSIDE_AREA',
      message: `${formulasOutside} formula${formulasOutside === 1 ? '' : 's'} read cells outside this area, so ${formulasOutside === 1 ? 'it keeps its' : 'they keep their'} last value instead.`,
      worksheet: worksheetName,
    })
  }
  if (imagesCut > 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'IMAGE_CUT_BY_AREA',
      message: `${imagesCut} picture${imagesCut === 1 ? ' crosses' : 's cross'} the edge of this area and ${imagesCut === 1 ? 'is' : 'are'} left out.`,
      worksheet: worksheetName,
    })
  }
  if (filled > 0) {
    diagnostics.push({
      severity: 'info',
      code: 'OLD_VALUES_KEPT',
      message: 'The area still holds the old quotation’s text and numbers. Mapping replaces the ones you map.',
      worksheet: worksheetName,
    })
  }

  for (const sheet of workbook.worksheets.filter(({ id }) => id !== target.id)) workbook.removeWorksheet(sheet.id)
  target.name = CLEAN_SHEET_NAME
  workbook.definedNames.model = []
  target.pageSetup.printArea = `A1:${numberToColumn(area.right)}${area.bottom - offset}`
  workbook.calcProperties.fullCalcOnLoad = true

  const output = await workbook.xlsx.writeBuffer()
  return { ok: true, bytes: new Uint8Array(output as unknown as ArrayBuffer), diagnostics }
}
