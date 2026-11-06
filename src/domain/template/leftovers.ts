import type { WorkbookGridData } from './grid'
import type { MappingDraft } from './mappingDraft'
import { isKnownLabel } from './suggestMapping'

export type LeftoverCell = {
  address: string
  text: string
  /** Labels and headings are template content. Values are probably left from an old quotation. */
  kind: 'label' | 'value'
  /** In the first item row, so it would repeat on every item. */
  repeats: boolean
}

/** Filled cells that no field fills, which would print in every quotation as they are now. */
export function findLeftovers(grid: WorkbookGridData, draft: MappingDraft): LeftoverCell[] {
  const mapped = new Set(Object.values(draft.fields).filter(Boolean))
  const { headerRow, firstDataRow, footerAnchorRow, columns } = draft.table
  const itemColumns = new Set(Object.values(columns).filter(Boolean))
  const leftovers: LeftoverCell[] = []

  for (const row of grid.rows) {
    if (row.number === headerRow) continue
    const inItems = Boolean(firstDataRow && footerAnchorRow && row.number >= firstDataRow && row.number < footerAnchorRow)
    // Item rows are rewritten, except the first one's unmapped columns, which are copied to every new row.
    if (inItems && row.number !== firstDataRow) continue

    row.cells.forEach((cell, index) => {
      if (cell.covered || !cell.text.trim()) return
      const letter = grid.columns[index].letter
      const address = `${letter}${row.number}`
      if (mapped.has(address)) return
      if (inItems && itemColumns.has(letter)) return
      const text = cell.text.trim()
      // Unknown text counts as a value, so the owner decides. Capitalised names would otherwise pass for labels.
      const label = !cell.numeric && !cell.formula && isKnownLabel(text)
      leftovers.push({ address, text, kind: label ? 'label' : 'value', repeats: inItems })
    })
  }

  return leftovers
}
