export type CellAddress = { column: string; row: number }

export function parseAddress(address: string): CellAddress {
  const match = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(address)
  if (!match) throw new RangeError(`"${address}" is not an A1 cell address`)
  return { column: match[1], row: Number(match[2]) }
}

export function formatAddress({ column, row }: CellAddress): string {
  return `${column}${row}`
}

export function columnToNumber(column: string): number {
  let result = 0
  for (const char of column) result = result * 26 + char.charCodeAt(0) - 64
  return result
}

export function numberToColumn(value: number): string {
  let result = ''
  for (let rest = value; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    result = String.fromCharCode(65 + ((rest - 1) % 26)) + result
  }
  return result
}

export type CellRange = { left: number; top: number; right: number; bottom: number }

export function parseRange(range: string): CellRange {
  const [start, end = start] = range.split(':')
  const first = parseAddress(start)
  const last = parseAddress(end)
  return {
    left: columnToNumber(first.column),
    top: first.row,
    right: columnToNumber(last.column),
    bottom: last.row,
  }
}

export function formatRange({ left, top, right, bottom }: CellRange): string {
  return `${numberToColumn(left)}${top}:${numberToColumn(right)}${bottom}`
}

export type RefPosition = 'single' | 'start' | 'end'

const REFERENCE =
  /"(?:[^"]|"")*"|(?:'(?:[^']|'')+'|[A-Za-z0-9_.]+)!\$?[A-Z]{1,3}\$?\d+(?::\$?[A-Z]{1,3}\$?\d+)?|(?<![A-Za-z0-9_.$])(\$?)([A-Z]{1,3})(\$?)(\d+)(?::(\$?)([A-Z]{1,3})(\$?)(\d+))?(?![A-Za-z0-9_(.])/g

/** Rewrites the row of every same-sheet A1 reference, leaving strings and other sheets alone. */
export function mapFormulaRows(formula: string, mapRow: (row: number, position: RefPosition) => number): string {
  return formula.replace(
    REFERENCE,
    (match, startColAbs, startCol, startRowAbs, startRow, endColAbs, endCol, endRowAbs, endRow) => {
      if (startCol === undefined) return match
      if (endCol === undefined) {
        return `${startColAbs}${startCol}${startRowAbs}${mapRow(Number(startRow), 'single')}`
      }
      const start = `${startColAbs}${startCol}${startRowAbs}${mapRow(Number(startRow), 'start')}`
      const end = `${endColAbs}${endCol}${endRowAbs}${mapRow(Number(endRow), 'end')}`
      return `${start}:${end}`
    },
  )
}

/** Moves relative rows by an offset, as Excel does when a formula is copied down. */
export function slideFormula(formula: string, offset: number): string {
  return formula.replace(
    REFERENCE,
    (match, startColAbs, startCol, startRowAbs, startRow, endColAbs, endCol, endRowAbs, endRow) => {
      if (startCol === undefined) return match
      const start = `${startColAbs}${startCol}${startRowAbs}${startRowAbs ? startRow : Number(startRow) + offset}`
      if (endCol === undefined) return start
      return `${start}:${endColAbs}${endCol}${endRowAbs}${endRowAbs ? endRow : Number(endRow) + offset}`
    },
  )
}

/** Copy a rule down the item table while all references to the footer follow its inserted rows. */
export function copyRuleFormula(formula: string, offset: number, footerRow: number, footerDelta: number): string {
  return formula.replace(REFERENCE, (match, ca, col, ra, row, eca, ecol, era, erow) => {
    if (col === undefined) return match
    const move = (n: string, absolute: string) => Number(n) >= footerRow ? Number(n) + footerDelta : absolute ? Number(n) : Number(n) + offset
    const first = `${ca}${col}${ra}${move(row, ra)}`
    return ecol === undefined ? first : `${first}:${eca}${ecol}${era}${move(erow, era)}`
  })
}

/** Every same-sheet cell a formula reads, counting both ends of a range. */
export function formulaReferences(formula: string): CellAddress[] {
  const found: CellAddress[] = []
  formula.replace(
    REFERENCE,
    (match, _startColAbs, startCol, _startRowAbs, startRow, _endColAbs, endCol, _endRowAbs, endRow) => {
      if (startCol !== undefined) {
        found.push({ column: startCol, row: Number(startRow) })
        if (endCol !== undefined) found.push({ column: endCol, row: Number(endRow) })
      }
      return match
    },
  )
  return found
}

export function referencesOtherSheet(formula: string): boolean {
  const withoutStrings = formula.replace(/"(?:[^"]|"")*"/g, '""')
  return withoutStrings.includes('!')
}

export function usesUnsupportedReference(formula: string): boolean {
  const withoutStrings = formula.replace(/"(?:[^"]|"")*"/g, '""')
  return /(?<![A-Z$\d])\$?\d+:\$?\d+(?![A-Z\d])|#REF!/.test(withoutStrings)
}
