import type { ItemColumnKey } from './fields'
import type { WorkbookGridData } from './grid'
import { isQuotationHeading } from './region'
import type { SemanticKey } from './types'

export type MappingSuggestion = {
  fields: Partial<Record<SemanticKey, string>>
  table: {
    headerRow?: number
    firstDataRow?: number
    footerAnchorRow?: number
    minDisplayRows?: number
    columns: Partial<Record<ItemColumnKey, string>>
  }
}

type Cell = { row: number; column: number; letter: string; text: string; numeric: boolean; bordered: boolean; span: number }

const clean = (text: string) => text.trim().replace(/\s+/g, ' ').replace(/[:：]\s*$/, '').toUpperCase()

/** Labels whose value sits beside them. Order matters: the first match wins. */
const LABELS: [RegExp, SemanticKey][] = [
  [/^(QUOTE|QUOTATION|ESTIMATE) ?(NO\.?|NUMBER|#)$/, 'quote.number'],
  [/^(DATE|QUOTATION DATE|QUOTE DATE)$/, 'quote.date'],
  [/^(CUSTOMER|CUSTOMER NAME|CLIENT|NAME|SOLD TO|PREPARED FOR)$/, 'customer.name'],
  [/^(CUSTOMER ADDRESS|ADDRESS)$/, 'customer.address'],
  [/^(TIN|CUSTOMER TIN)$/, 'customer.tin'],
  [/^(VEHICLE|MODEL|UNIT MODEL|MAKE)$/, 'vehicle.description'],
  [/^ENGINE( NO\.?)?$/, 'vehicle.engine'],
  [/^PLATE( NO\.?)?$/, 'vehicle.plate'],
  [/^(CHASSIS|VIN)( NO\.?)?$/, 'vehicle.chassis'],
  [/^SUB ?TOTAL$/, 'totals.subtotal'],
  [/^LABOU?R( CHARGE)?$/, 'totals.labor'],
  // "Less 3% for 2307" and similar deductions are not discounts, so only the word itself counts.
  [/^(LESS )?DISCOUNT\b|^LESS$/, 'totals.discount'],
  [/^(GRAND TOTAL|TOTAL DUE|TOTAL AMOUNT DUE|TOTAL)$/, 'totals.grandTotal'],
  [/^PREPARED BY$/, 'signatures.preparedBy'],
  [/^CHECKED BY$/, 'signatures.checkedBy'],
  [/^RECEIVED BY$/, 'signatures.receivedBy'],
]

/** Item table headings. Unit price is checked before unit so "Unit price" never lands on the unit column. */
const HEADINGS: [RegExp, ItemColumnKey][] = [
  [/^(#|NO\.?|ITEM NO\.?)$/, 'itemNumber'],
  // Prefix matches, so "Price / each", "Price (each)", or "Unit price (PHP)" all count.
  [/^(UNIT PRICE|PRICE|RATE|UNIT COST)\b/, 'unitPrice'],
  [/^(PART NO\.?|PART NUMBER|PARTS NUMBER|PART #|SKU|CODE)$/, 'partNumber'],
  [/^(DESCRIPTION|PARTS NAME|PART NAME|ITEM|ITEMS|PARTICULARS|PRODUCT)$/, 'description'],
  [/^(QTY|QTY\.|QUANTITY)$/, 'quantity'],
  [/^(UNIT|UOM|U\/M|SET\/PC\/ASSY|QUANTITY ISSUED)$/, 'unit'],
  [/^(AMOUNT|TOTAL AMOUNT|TOTAL|LINE TOTAL)$/, 'lineAmount'],
]

const TOTAL_KEYS = new Set<SemanticKey>(['totals.subtotal', 'totals.labor', 'totals.discount', 'totals.grandTotal'])

function cellsOf(grid: WorkbookGridData): Cell[] {
  return grid.rows.flatMap((row) =>
    row.cells.map((cell, index) => ({
      row: row.number,
      column: index,
      letter: grid.columns[index].letter,
      text: cell.covered ? '' : cell.text,
      numeric: Boolean(cell.numeric),
      bordered: Boolean(cell.bordered),
      span: cell.colSpan ?? 1,
    })),
  )
}

const VALUE_SEARCH_WIDTH = 3

/**
 * The cell a label describes. Forms often leave a narrow empty gap before a merged or bordered
 * value cell, so a plain empty neighbour is skipped for the first cell that looks like a slot.
 */
function valueCellRightOf(label: Cell, at: (row: number, column: number) => Cell | undefined): Cell | undefined {
  const first = at(label.row, label.column + label.span)
  let column = label.column + label.span
  for (let step = 0; step < VALUE_SEARCH_WIDTH; step += 1) {
    const candidate = at(label.row, column)
    if (!candidate) break
    if (candidate.text || candidate.bordered || candidate.span > 1) return candidate
    column += candidate.span
  }
  return first
}

/**
 * Reads labels and column headings to offer likely cells. Everything it returns is a suggestion
 * for the owner to accept or change, never a mapping on its own.
 */
export function suggestMapping(grid: WorkbookGridData): MappingSuggestion {
  const cells = cellsOf(grid)
  const at = (row: number, column: number) => cells.find((cell) => cell.row === row && cell.column === column)
  const suggestion: MappingSuggestion = { fields: {}, table: { columns: {} } }

  // The header row is the first row naming at least three item columns.
  for (const row of grid.rows) {
    const found = new Map<ItemColumnKey, string>()
    for (const cell of cells.filter((candidate) => candidate.row === row.number && candidate.text)) {
      const key = HEADINGS.find(([pattern]) => pattern.test(clean(cell.text)))?.[1]
      if (key && !found.has(key)) found.set(key, cell.letter)
    }
    if (found.size >= 3) {
      suggestion.table.headerRow = row.number
      suggestion.table.firstDataRow = row.number + 1
      suggestion.table.columns = Object.fromEntries(found)
      break
    }
  }

  const { headerRow, columns } = suggestion.table
  const descriptionColumn = columns.description ? grid.columns.findIndex(({ letter }) => letter === columns.description) : -1

  for (const cell of cells) {
    if (!cell.text || cell.row === headerRow) continue
    const key = LABELS.find(([pattern]) => pattern.test(clean(cell.text)))?.[1]
    if (!key || suggestion.fields[key]) continue

    // Totals go in the amount column when there is one; other values sit just right of their label.
    if (TOTAL_KEYS.has(key) && columns.lineAmount && headerRow && cell.row > headerRow) {
      suggestion.fields[key] = `${columns.lineAmount}${cell.row}`
      continue
    }
    const value = valueCellRightOf(cell, at)
    if (value && !LABELS.some(([pattern]) => pattern.test(clean(value.text)))) suggestion.fields[key] = `${value.letter}${value.row}`
  }

  // Items run until a totals label, or a blank row without borders, ends the table.
  if (headerRow) {
    for (const row of grid.rows.filter(({ number }) => number > headerRow)) {
      const rowCells = cells.filter((cell) => cell.row === row.number)
      const holdsTotal = rowCells.some((cell) => {
        const key = LABELS.find(([pattern]) => pattern.test(clean(cell.text)))?.[1]
        return key !== undefined && TOTAL_KEYS.has(key)
      })
      const description = descriptionColumn >= 0 ? rowCells[descriptionColumn] : undefined
      const blank = description ? !description.text && !description.bordered : rowCells.every((cell) => !cell.text)
      if (holdsTotal || blank) {
        suggestion.table.footerAnchorRow = row.number
        suggestion.table.minDisplayRows = row.number - headerRow - 1
        break
      }
    }
  }

  // The business heading is the text above the quotation title, top down.
  const titleRow = cells.find((cell) => isQuotationHeading(cell.text))?.row ?? headerRow ?? 0
  const headingCells = cells.filter((cell) => cell.text && cell.row < titleRow && !isQuotationHeading(cell.text))
  for (const cell of headingCells) {
    const address = `${cell.letter}${cell.row}`
    if (Object.values(suggestion.fields).includes(address)) continue
    if (!suggestion.fields['business.name']) suggestion.fields['business.name'] = address
    else if (/\b(TIN|VAT|REG(ISTERED|ISTRATION)?)\b/i.test(cell.text)) suggestion.fields['business.taxText'] ??= address
    else if (/\d{3,}.*\d{3,}|\(\d+\)/.test(cell.text)) suggestion.fields['business.phone'] ??= address
    else suggestion.fields['business.address'] ??= address
  }

  return suggestion
}

/**
 * Text a template prints as a label: it ends with a colon, or it is a known field label, column
 * heading, or quotation title. Anything else might be an old quotation's value.
 */
export function isKnownLabel(text: string): boolean {
  const trimmed = text.trim()
  if (/[:：]$/.test(trimmed) || isQuotationHeading(trimmed)) return true
  const cleaned = clean(trimmed)
  return LABELS.some(([pattern]) => pattern.test(cleaned)) || HEADINGS.some(([pattern]) => pattern.test(cleaned))
}
