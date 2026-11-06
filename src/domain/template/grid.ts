/** An approximate picture of cells for choosing areas and, later, mapping. Not an Excel renderer. */
export type GridCell = {
  text: string
  bold?: boolean
  fill?: string
  align?: 'left' | 'center' | 'right'
  numeric?: boolean
  color?: string
  /** A formula with no saved result, shown as its formula text. */
  formula?: boolean
  bordered?: boolean
  colSpan?: number
  rowSpan?: number
  /** Hidden under a merged cell's anchor. */
  covered?: boolean
}

export type WorkbookGridData = {
  columns: { letter: string; width: number }[]
  rows: { number: number; height?: number; cells: GridCell[] }[]
  truncatedRows: boolean
  truncatedColumns: boolean
}
