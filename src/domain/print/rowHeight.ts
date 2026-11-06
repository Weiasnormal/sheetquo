const POINTS_PER_LINE_FACTOR = 1.3
const AVERAGE_CHAR_WIDTH_FACTOR = 1.05

type RowHeightInput = {
  text: string
  /** Column width in Excel character units, summed across merged columns. */
  columnWidth: number
  fontSize: number
  minHeight: number
  maxHeight?: number
}

/** Browsers cannot measure Excel's fonts, so this errs on the side of a taller row. */
export function estimateRowHeight({ text, columnWidth, fontSize, minHeight, maxHeight = 200 }: RowHeightInput): number {
  const charsPerLine = Math.max(1, Math.floor((columnWidth * 11) / (fontSize * AVERAGE_CHAR_WIDTH_FACTOR)))
  const lines = text
    .split(/\r?\n/)
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
  const height = Math.ceil(lines * fontSize * POINTS_PER_LINE_FACTOR + 3)
  return Math.min(maxHeight, Math.max(minHeight, height))
}
