/** The clean copy's only worksheet. Mappings point at it. */
export const CLEAN_SHEET_NAME = 'Quotation'

/** A quotation area. It always starts at column A, so mapped addresses stay where they were. */
export type Region = { firstRow: number; lastRow: number; lastColumn: number }

export const MAX_TEMPLATE_BYTES = 15 * 1024 * 1024
export const MAX_REGION_CELLS = 10_000
export const MANY_WORKSHEETS = 20

const OTHER_FORMATS: Record<string, string> = {
  '.xls': 'This is an older .xls workbook. Open it in Excel and save it as .xlsx.',
  '.xlsm': 'Workbooks with macros are not accepted. Save a copy as .xlsx without macros.',
  '.xlsb': 'Binary workbooks are not accepted. Save a copy as .xlsx.',
  '.csv': 'A CSV file has no layout to keep. Use the .xlsx quotation you print from.',
}

export type FileCheck = { ok: true } | { ok: false; message: string }

/** The first gate, before any bytes are read. The package itself is checked afterwards. */
export function checkTemplateFile(name: string, size: number): FileCheck {
  const lower = name.toLowerCase()
  const other = Object.keys(OTHER_FORMATS).find((extension) => lower.endsWith(extension))
  if (other) return { ok: false, message: OTHER_FORMATS[other] }
  if (!lower.endsWith('.xlsx')) return { ok: false, message: 'Choose an .xlsx workbook.' }
  if (size === 0) return { ok: false, message: 'This file is empty.' }
  if (size > MAX_TEMPLATE_BYTES) return { ok: false, message: 'Choose a workbook of 15 MB or less.' }
  return { ok: true }
}

const HEADING = /^(PARTS |SALES |PRICE )?(QUOTATION|QUOTE|ESTIMATE|PRO ?FORMA( INVOICE)?)$/

/** Matches a quotation title, not a label such as "Quote No:" or a sentence that mentions one. */
export function isQuotationHeading(text: string): boolean {
  return HEADING.test(text.trim().replace(/\s+/g, ' ').toUpperCase())
}

/**
 * Splits a sheet that holds several quotations into one area each. The lines above the first
 * title (usually the business heading) are assumed to sit above every title.
 *
 * @param filledRows row number to the last filled column in that row
 * @param headingRows rows holding a quotation title, in any order
 */
export function suggestBlocks(filledRows: ReadonlyMap<number, number>, headingRows: number[]): Region[] {
  const rows = [...filledRows.keys()].sort((a, b) => a - b)
  if (rows.length === 0) return []

  const regionOf = (inBlock: number[]): Region => ({
    firstRow: inBlock[0],
    lastRow: inBlock[inBlock.length - 1],
    lastColumn: Math.max(...inBlock.map((row) => filledRows.get(row) ?? 1)),
  })

  const headings = [...new Set(headingRows)].sort((a, b) => a - b)
  if (headings.length < 2) return [regionOf(rows)]

  const lead = Math.max(0, headings[0] - rows[0])
  const starts = headings.map((row) => Math.max(rows[0], row - lead))

  return starts
    .map((start, index) => {
      const limit = index + 1 < starts.length ? starts[index + 1] - 1 : Infinity
      return rows.filter((row) => row >= start && row <= limit)
    })
    .filter((inBlock) => inBlock.length > 0)
    .map(regionOf)
}

export type RegionCheck = { ok: true } | { ok: false; message: string }

export function checkRegion(region: Region, sheetRowCount: number): RegionCheck {
  const { firstRow, lastRow, lastColumn } = region
  if (![firstRow, lastRow, lastColumn].every(Number.isInteger)) return { ok: false, message: 'Use whole numbers for rows.' }
  if (firstRow < 1) return { ok: false, message: 'The first row must be 1 or more.' }
  if (lastRow < firstRow) return { ok: false, message: 'The last row must come after the first row.' }
  if (lastColumn < 1 || lastColumn > 16_384) return { ok: false, message: 'Enter a column letter from A to XFD.' }
  if (sheetRowCount > 0 && firstRow > sheetRowCount) {
    return { ok: false, message: `This worksheet has ${sheetRowCount} rows.` }
  }
  return { ok: true }
}

export function describeRegion({ firstRow, lastRow }: Region): string {
  return firstRow === lastRow ? `Row ${firstRow}` : `Rows ${firstRow}–${lastRow}`
}
