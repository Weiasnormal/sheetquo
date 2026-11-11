import { cn } from '../../components/ui/cn'
import type { WorkbookGridData } from '../../infrastructure/excel/WorkbookAdapter'

const PIXELS_PER_CHARACTER = 7
const POINTS_TO_PIXELS = 1.33
const ROW_HEADER_WIDTH = 44

export type CellMark = 'mapped' | 'cleared' | 'target'
export type RowMark = 'header' | 'items' | 'footer'

type WorkbookGridProps = {
  grid: WorkbookGridData
  caption: string
  /** Makes cells clickable. Keyboard users set the same addresses in the mapping fields. */
  onCellClick?: (address: string) => void
  cellMarks?: Record<string, { mark: CellMark; label?: string }>
  rowMarks?: Record<number, RowMark>
}

const columnWidth = (width: number) => Math.max(32, Math.round(width * PIXELS_PER_CHARACTER))

const ROW_MARK_LABEL: Record<RowMark, string> = { header: 'Header row', items: 'Item row', footer: 'First row after the items' }

/** An approximate view of cells, for choosing an area and mapping it. Excel's own rendering is the real one. */
export function WorkbookGrid({ grid, caption, onCellClick, cellMarks = {}, rowMarks = {} }: WorkbookGridProps) {
  // A fixed table width keeps real column widths, so a phone scrolls the grid instead of squeezing it.
  const tableWidth = grid.columns.reduce((total, { width }) => total + columnWidth(width), ROW_HEADER_WIDTH)

  return (
    <div>
      <div className="max-h-[560px] overflow-auto rounded-button border border-line bg-surface">
        <table className="table-fixed border-separate border-spacing-0 text-xs leading-4" style={{ width: tableWidth }}>
          <caption className="sr-only">{caption}</caption>
          <colgroup>
            <col style={{ width: ROW_HEADER_WIDTH }} />
            {grid.columns.map(({ letter, width }) => (
              <col key={letter} style={{ width: columnWidth(width) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="sticky top-0 left-0 z-20 border-r border-b border-line bg-ground">
                <span className="sr-only">Row</span>
              </th>
              {grid.columns.map(({ letter }) => (
                <th key={letter} scope="col" className="sticky top-0 z-10 border-r border-b border-line bg-ground px-1 py-1 font-normal text-muted">
                  {letter}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => {
              const rowMark = rowMarks[row.number]
              return (
                <tr key={row.number} style={row.height ? { height: Math.min(row.height * POINTS_TO_PIXELS, 120) } : undefined}>
                  <th
                    scope="row"
                    title={rowMark ? ROW_MARK_LABEL[rowMark] : undefined}
                    className={cn(
                      'tabular sticky left-0 z-10 border-r border-b border-line px-1.5 text-right font-normal',
                      rowMark ? 'bg-lime-tint text-ink' : 'bg-ground text-muted',
                      rowMark === 'header' && 'font-semibold',
                    )}
                  >
                    {rowMark === 'footer' && <span aria-hidden="true">→ </span>}
                    {row.number}
                    {rowMark && <span className="sr-only">, {ROW_MARK_LABEL[rowMark]}</span>}
                  </th>
                  {row.cells.map((cell, index) => {
                    if (cell.covered) return null
                    const address = `${grid.columns[index].letter}${row.number}`
                    const mark = cellMarks[address]
                    return (
                      <td
                        key={index}
                        colSpan={cell.colSpan}
                        rowSpan={cell.rowSpan}
                        title={[address, mark?.label, cell.text].filter(Boolean).join(' · ')}
                        onClick={onCellClick ? () => onCellClick(address) : undefined}
                        style={{ backgroundColor: cell.fill, color: cell.color }}
                        className={cn(
                          'max-w-0 truncate border-r border-b px-1.5 py-1 align-top',
                          cell.bordered ? 'border-control' : 'border-rule',
                          cell.bold && 'font-semibold',
                          cell.formula && 'text-muted',
                          (cell.align === 'right' || (cell.numeric && !cell.align)) && 'tabular text-right',
                          cell.align === 'center' && 'text-center',
                          onCellClick && 'cursor-crosshair hover:outline-2 hover:-outline-offset-2 hover:outline-control',
                          mark?.mark === 'mapped' && 'outline-2 -outline-offset-2 outline-lime-deep',
                          mark?.mark === 'target' && 'outline-2 -outline-offset-2 outline-ink',
                          mark?.mark === 'cleared' && 'text-muted line-through',
                        )}
                      >
                        {cell.text}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {(grid.truncatedRows || grid.truncatedColumns) && (
        <p className="mt-2 text-xs text-muted">
          The preview shows the first {grid.rows.length} rows and {grid.columns.length} columns. The whole area is kept.
        </p>
      )}
    </div>
  )
}
