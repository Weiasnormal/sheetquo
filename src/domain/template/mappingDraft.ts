import { ALL_FIELDS, fieldSpec, ITEM_COLUMNS } from './fields'
import type { ItemColumnKey } from './fields'
import type { WorkbookGridData } from './grid'
import { CLEAN_SHEET_NAME } from './region'
import type { AdjustmentRow, CellMapping, OutputProfile, PrintProfile, SemanticKey, TemplateDefinition } from './types'

/** The editable form of a mapping. It may be incomplete; `toDefinition` turns a complete one into what the engine uses. */
export type MappingDraft = {
  fields: Partial<Record<SemanticKey, string>>
  /** Totals whose template formula should stay instead of Sheetquo's. */
  keepTemplateFormula: Partial<Record<SemanticKey, boolean>>
  table: {
    headerRow?: number
    firstDataRow?: number
    prototypeRow?: number
    footerAnchorRow?: number
    minDisplayRows?: number
    maxItems?: number
    columns: Partial<Record<ItemColumnKey, string>>
  }
  print: PrintProfile
  clearCells: string[]
  adjustmentRows?: AdjustmentRow[]
  output?: OutputProfile
}

export function emptyDraft(defaults: { lastColumn: string; paper?: PrintProfile['paper']; orientation?: PrintProfile['orientation'] }): MappingDraft {
  return {
    fields: {},
    keepTemplateFormula: {},
    table: { columns: {} },
    print: {
      paper: defaults.paper ?? 'A4',
      orientation: defaults.orientation ?? 'portrait',
      marginsInches: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      fitToWidthPages: 1,
      columns: { first: 'A', last: defaults.lastColumn },
    },
    clearCells: [],
  }
}

const ADDRESS = /^([A-Z]{1,3})([1-9]\d{0,6})$/
const COLUMN = /^[A-Z]{1,3}$/

export function normalizeAddress(text: string): string {
  return text.trim().toUpperCase().replace(/\$/g, '')
}

/** What the mapping checks need from the clean copy: its size and which cells sit under merges. */
export type SheetShape = {
  rowCount: number
  columnLetters: string[]
  /** Covered cell address to the merge anchor that shows it. */
  coveredBy: Map<string, string>
}

export function shapeFromGrid(grid: WorkbookGridData): SheetShape {
  const coveredBy = new Map<string, string>()
  const letters = grid.columns.map(({ letter }) => letter)
  grid.rows.forEach((row, rowIndex) => {
    row.cells.forEach((cell, columnIndex) => {
      if (!cell.rowSpan && !cell.colSpan) return
      const anchor = `${letters[columnIndex]}${row.number}`
      for (let r = 0; r < (cell.rowSpan ?? 1); r += 1) {
        for (let c = 0; c < (cell.colSpan ?? 1); c += 1) {
          if (r === 0 && c === 0) continue
          const covered = grid.rows[rowIndex + r]
          if (covered && letters[columnIndex + c]) coveredBy.set(`${letters[columnIndex + c]}${covered.number}`, anchor)
        }
      }
    })
  })
  return { rowCount: grid.rows.at(-1)?.number ?? 0, columnLetters: letters, coveredBy }
}

export type MappingIssue = { severity: 'error' | 'warning'; message: string; target?: string }

function rowOf(address: string): number {
  return Number(ADDRESS.exec(address)?.[2] ?? 0)
}

/** Checks a draft against the clean copy. The test step's generation is the final word. */
export function checkDraft(draft: MappingDraft, shape: SheetShape): MappingIssue[] {
  const issues: MappingIssue[] = []
  const error = (message: string, target?: string) => issues.push({ severity: 'error', message, target })
  const { headerRow, firstDataRow, footerAnchorRow, columns } = draft.table

  for (const key of ['headerRow', 'firstDataRow', 'prototypeRow', 'footerAnchorRow', 'minDisplayRows', 'maxItems'] as const) {
    const value = draft.table[key]
    if (value !== undefined && (!Number.isInteger(value) || value < (key === 'minDisplayRows' ? 0 : 1) || value > 1_048_576)) error('Rows and item counts must be whole numbers within Excel’s row limit.', `table.${key}`)
  }

  for (const spec of ALL_FIELDS) {
    const address = draft.fields[spec.key]
    if (!address) {
      if (spec.required) error(`Map ${spec.label.toLowerCase()}. Every quotation needs it.`, spec.key)
      continue
    }
    const match = ADDRESS.exec(address)
    if (!match || !shape.columnLetters.includes(match[1]) || rowOf(address) > shape.rowCount) {
      error(`${spec.label}: ${address} is not a cell in this template.`, spec.key)
      continue
    }
    const anchor = shape.coveredBy.get(address)
    if (anchor) error(`${spec.label}: ${address} is inside merged cells. Use ${anchor}, the cell that shows them.`, spec.key)
    const row = rowOf(address)
    if (firstDataRow && footerAnchorRow && row >= firstDataRow && row < footerAnchorRow) {
      error(`${spec.label}: ${address} is inside the item rows, which are rewritten for every quotation.`, spec.key)
    }
  }

  const used = new Map<string, SemanticKey>()
  for (const [key, address] of Object.entries(draft.fields) as [SemanticKey, string][]) {
    if (!address) continue
    const other = used.get(address)
    if (other) error(`${fieldSpec(other).label} and ${fieldSpec(key).label} both use ${address}.`, key)
    used.set(address, key)
  }

  if (!headerRow) error('Choose the item table’s header row.', 'table.headerRow')
  if (!firstDataRow) error('Choose the first item row.', 'table.firstDataRow')
  if (!footerAnchorRow) error('Choose the first row after the items.', 'table.footerAnchorRow')
  if (headerRow && firstDataRow && firstDataRow <= headerRow) error('The first item row must come after the header row.', 'table.firstDataRow')
  if (firstDataRow && footerAnchorRow && footerAnchorRow <= firstDataRow) {
    error('The first row after the items must come after the first item row.', 'table.footerAnchorRow')
  }
  if (footerAnchorRow && footerAnchorRow > shape.rowCount + 1) error(`This template has ${shape.rowCount} rows.`, 'table.footerAnchorRow')
  const prototype = draft.table.prototypeRow ?? firstDataRow
  if (prototype && firstDataRow && footerAnchorRow && (prototype < firstDataRow || prototype >= footerAnchorRow)) error('The prototype row must be inside the item rows.', 'table.prototypeRow')
  const occupied = new Set(Object.values(draft.fields))
  for (const [index, slot] of (draft.adjustmentRows ?? []).entries()) {
    for (const [key, address] of Object.entries(slot)) {
      if (!address && key !== 'label' && key !== 'amount') continue
      const match = ADDRESS.exec(address)
      if (!match || !shape.columnLetters.includes(match[1]) || rowOf(address) > shape.rowCount || rowOf(address) < (footerAnchorRow ?? 1) || shape.coveredBy.has(address)) {
        error(`Adjustment ${index + 1}: choose an anchor cell in the footer for ${key}.`, 'adjustments')
      }
      if (occupied.has(address)) error(`Adjustment ${index + 1}: ${address} is already mapped.`, 'adjustments')
      occupied.add(address)
    }
  }
  const min = draft.output?.minRowHeight ?? 15, max = draft.output?.maxRowHeight ?? 409
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max > 409 || max < min) error('Row heights must be between 1 and 409 points, with maximum at least minimum.', 'output')

  const columnsUsed = new Map<string, ItemColumnKey>()
  for (const spec of ITEM_COLUMNS) {
    const letter = columns[spec.key]
    if (!letter) {
      if (spec.required) error(`Choose the ${spec.label.toLowerCase()} column.`, `table.columns.${spec.key}`)
      continue
    }
    if (!COLUMN.test(letter) || !shape.columnLetters.includes(letter)) {
      error(`${spec.label}: ${letter} is not a column in this template.`, `table.columns.${spec.key}`)
      continue
    }
    const other = columnsUsed.get(letter)
    if (other) error(`Two item columns use column ${letter}.`, `table.columns.${spec.key}`)
    columnsUsed.set(letter, spec.key)
  }

  if (!Number.isInteger(draft.print.fitToWidthPages) || draft.print.fitToWidthPages < 1 || draft.print.fitToWidthPages > 10) error('Pages wide must be a whole number from 1 to 10.', 'print.fitToWidthPages')
  const margins = [...Object.values(draft.print.marginsInches), draft.print.headerMarginInches ?? 0.3, draft.print.footerMarginInches ?? 0.3]
  if (margins.some((margin) => !Number.isFinite(margin) || margin < 0 || margin > 3)) error('Margins must be between 0 and 3 inches.', 'print.margins')
  return issues
}

export function toDefinition(draft: MappingDraft): TemplateDefinition | undefined {
  const { headerRow, firstDataRow, footerAnchorRow, columns } = draft.table
  if (!headerRow || !firstDataRow || !footerAnchorRow) return undefined
  if (!columns.description || !columns.quantity || !columns.unitPrice || !columns.lineAmount) return undefined

  const cellMappings: CellMapping[] = (Object.entries(draft.fields) as [SemanticKey, string][])
    .filter(([, address]) => Boolean(address))
    .map(([key, address]) => {
      const spec = fieldSpec(key)
      return {
        semanticKey: key,
        worksheet: CLEAN_SHEET_NAME,
        address,
        source: spec.source,
        required: Boolean(spec.required),
        overwrite: spec.source === 'calculated' && draft.keepTemplateFormula[key] ? 'preserve' : 'replace',
      }
    })

  return {
    worksheetName: CLEAN_SHEET_NAME,
    cellMappings,
    itemRegion: {
      worksheet: CLEAN_SHEET_NAME,
      headerRow,
      firstDataRow,
      prototypeRow: draft.table.prototypeRow ?? firstDataRow,
      footerAnchorRow,
      minDisplayRows: draft.table.minDisplayRows,
      maxItems: draft.table.maxItems,
      columns: {
        description: columns.description,
        quantity: columns.quantity,
        unitPrice: columns.unitPrice,
        lineAmount: columns.lineAmount,
        ...(columns.partNumber && { partNumber: columns.partNumber }),
        ...(columns.unit && { unit: columns.unit }),
        ...(columns.itemNumber && { itemNumber: columns.itemNumber }),
      },
    },
    printProfile: { ...draft.print, repeatHeaderRow: draft.print.repeatHeaderRow ? headerRow : undefined },
    clearCells: draft.clearCells.filter((address) => !Object.values(draft.fields).includes(address)),
    adjustmentRows: draft.adjustmentRows,
    output: draft.output,
  }
}
