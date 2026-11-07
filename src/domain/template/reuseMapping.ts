import type { WorkbookGridData } from './grid'
import type { MappingDraft } from './mappingDraft'
import { emptyDraft, shapeFromGrid } from './mappingDraft'
import type { Diagnostic } from './diagnostics'

/** Reuse only cells whose displayed content, neighboring labels, merge and visual signature are unchanged. */
export function reuseMapping(previous: MappingDraft | undefined, before: WorkbookGridData, after: WorkbookGridData) {
  const mapping = emptyDraft({ lastColumn: after.columns.at(-1)?.letter ?? 'A' })
  const diagnostics: Diagnostic[] = []
  if (!previous) return { mapping, diagnostics }
  const shape = shapeFromGrid(after)
  const signature = (grid: WorkbookGridData, address: string) => {
    const match = /^([A-Z]+)(\d+)$/.exec(address)
    if (!match) return undefined
    const column = grid.columns.findIndex(({ letter }) => letter === match[1])
    const row = grid.rows.findIndex(({ number }) => number === Number(match[2]))
    if (column < 0 || row < 0) return undefined
    return JSON.stringify([grid.rows[row].cells[column], grid.rows[row].cells[column - 1], grid.rows[row - 1]?.cells[column], grid.columns[column].width, grid.rows[row].height])
  }
  const same = (address: string) => signature(before, address) !== undefined && signature(before, address) === signature(after, address)
  for (const [key, address] of Object.entries(previous.fields)) {
    if (same(address)) Object.assign(mapping.fields, { [key]: address })
    else diagnostics.push({ severity: 'warning', code: 'MAPPING_CHANGED', cell: address, message: `${key}: ${address} changed or moved. Map it again.` })
  }
  const rows = [previous.table.headerRow, previous.table.firstDataRow, previous.table.prototypeRow ?? previous.table.firstDataRow, previous.table.footerAnchorRow]
  const tableSame = rows.every((row) => row && after.columns.every(({ letter }) => same(`${letter}${row}`))) && before.columns.length === after.columns.length
  if (tableSame) mapping.table = structuredClone(previous.table)
  else diagnostics.push({ severity: 'warning', code: 'ITEM_TABLE_CHANGED', message: 'The item-table signature changed. Choose its rows and columns again.' })
  mapping.keepTemplateFormula = Object.fromEntries(Object.entries(previous.keepTemplateFormula).filter(([key]) => key in mapping.fields))
  mapping.clearCells = previous.clearCells.filter(same)
  mapping.output = previous.output && { ...previous.output }
  mapping.print = { ...previous.print, columns: { ...previous.print.columns, last: shape.columnLetters.includes(previous.print.columns.last) ? previous.print.columns.last : after.columns.at(-1)!.letter } }
  mapping.adjustmentRows = previous.adjustmentRows?.filter((slot) => Object.values(slot).filter(Boolean).every(same))
  if (mapping.adjustmentRows?.length !== previous.adjustmentRows?.length) diagnostics.push({ severity: 'warning', code: 'ADJUSTMENTS_CHANGED', message: 'Some adjustment cells changed. Review the remaining slots and map missing rows again.' })
  diagnostics.push({ severity: 'info', code: 'MAPPING_REUSE_REVIEW', message: `${Object.keys(mapping.fields).length} field mappings kept from matching cell signatures. Review all mappings and test this new version before activation.` })
  return { mapping, diagnostics }
}
