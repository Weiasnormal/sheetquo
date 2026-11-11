import { describe, expect, it } from 'vitest'
import { findLeftovers } from '../../src/domain/template/leftovers'
import { checkDraft, emptyDraft, shapeFromGrid, toDefinition } from '../../src/domain/template/mappingDraft'
import type { MappingDraft } from '../../src/domain/template/mappingDraft'
import { suggestMapping } from '../../src/domain/template/suggestMapping'
import { ExcelJsAdapter } from '../../src/infrastructure/excel/ExcelJsAdapter'
import { ARCHIVE_BLOCK_TWO, ARCHIVE_SHEET, buildLegacyArchive } from '../../src/test/fixtures/synthetic/legacyArchive'
import { buildPartsTemplate, buildServiceTemplate } from '../../src/test/fixtures/synthetic/templates'

const adapter = new ExcelJsAdapter()

async function gridOf(bytes: Uint8Array, sheet: string, rows: number, lastColumn: number) {
  const opened = await adapter.open(bytes)
  if (!opened.ok) throw new Error('did not open')
  return opened.workbook.readGrid(sheet, { firstRow: 1, lastRow: rows, lastColumn })
}

describe('suggestMapping', () => {
  it('finds the parts template’s table, labels, and heading', async () => {
    const suggestion = suggestMapping(await gridOf(await buildPartsTemplate(), 'Quotation', 18, 6))
    expect(suggestion.table).toEqual({
      headerRow: 9,
      firstDataRow: 10,
      footerAnchorRow: 13,
      minDisplayRows: 3,
      columns: { description: 'A', partNumber: 'B', quantity: 'C', unit: 'D', unitPrice: 'E', lineAmount: 'F' },
    })
    expect(suggestion.fields).toMatchObject({
      'customer.name': 'B6',
      'vehicle.description': 'B7',
      'quote.date': 'E6',
      'quote.number': 'E7',
      'totals.subtotal': 'F13',
      'totals.discount': 'F14',
      'totals.grandTotal': 'F15',
    })
  })

  it('finds a differently shaped table, with numbered rows and a merged description', async () => {
    const suggestion = suggestMapping(await gridOf(await buildServiceTemplate(), 'Estimate', 22, 9))
    expect(suggestion.table).toMatchObject({
      headerRow: 11,
      firstDataRow: 12,
      footerAnchorRow: 13,
      columns: { itemNumber: 'A', description: 'B', partNumber: 'E', unit: 'F', quantity: 'G', unitPrice: 'H', lineAmount: 'I' },
    })
    expect(suggestion.fields).toMatchObject({ 'totals.subtotal': 'I13', 'totals.discount': 'I14', 'totals.grandTotal': 'I15' })
    // An empty narrow column sits between these labels and their merged value cells.
    expect(suggestion.fields).toMatchObject({ 'quote.number': 'H3', 'quote.date': 'H4', 'vehicle.plate': 'G8' })
  })

  it('finds the extracted archive quotation’s layout', async () => {
    const extracted = await adapter.extractRegion(await buildLegacyArchive(), ARCHIVE_SHEET, ARCHIVE_BLOCK_TWO)
    if (!extracted.ok) throw new Error('failed')
    const suggestion = suggestMapping(await gridOf(extracted.bytes, 'Quotation', 12, 6))
    expect(suggestion.table).toMatchObject({ headerRow: 7, firstDataRow: 8, footerAnchorRow: 10 })
    expect(suggestion.fields).toMatchObject({
      'business.name': 'A1',
      'business.address': 'A2',
      'customer.name': 'B5',
      'quote.date': 'F5',
      'totals.grandTotal': 'F10',
    })
  })
})

describe('checking a draft', () => {
  async function partsDraft(): Promise<{ draft: MappingDraft; grid: Awaited<ReturnType<typeof gridOf>> }> {
    const grid = await gridOf(await buildPartsTemplate(), 'Quotation', 18, 6)
    const suggestion = suggestMapping(grid)
    const draft = { ...emptyDraft({ lastColumn: 'F' }), fields: suggestion.fields, table: suggestion.table }
    return { draft, grid }
  }

  it('accepts the suggested parts mapping and turns it into a definition', async () => {
    const { draft, grid } = await partsDraft()
    expect(checkDraft(draft, shapeFromGrid(grid))).toEqual([])
    const definition = toDefinition(draft)
    expect(definition?.itemRegion).toMatchObject({ headerRow: 9, firstDataRow: 10, prototypeRow: 10, footerAnchorRow: 13 })
    expect(definition?.cellMappings.find(({ semanticKey }) => semanticKey === 'totals.grandTotal')).toMatchObject({
      address: 'F15',
      source: 'calculated',
      overwrite: 'replace',
    })
  })

  it('names missing required fields, merged cells, collisions, and cells inside the item rows', async () => {
    const { draft, grid } = await partsDraft()
    const broken: MappingDraft = {
      ...draft,
      fields: { ...draft.fields, 'customer.name': 'C6', 'quote.number': 'E6', 'vehicle.plate': 'A11', 'totals.grandTotal': undefined },
    }
    const messages = checkDraft(broken, shapeFromGrid(grid)).map(({ message }) => message)
    expect(messages).toEqual(
      expect.arrayContaining([
        'Map grand total. Every quotation needs it.',
        'Customer name: C6 is inside merged cells. Use B6, the cell that shows them.',
        'Date and Quotation number both use E6.',
        'Plate: A11 is inside the item rows, which are rewritten for every quotation.',
      ]),
    )
  })

  it('keeps a template formula when asked', async () => {
    const { draft } = await partsDraft()
    const definition = toDefinition({ ...draft, keepTemplateFormula: { 'totals.subtotal': true } })
    expect(definition?.cellMappings.find(({ semanticKey }) => semanticKey === 'totals.subtotal')?.overwrite).toBe('preserve')
  })
})

describe('leftover cells', () => {
  it('lists old values and labels that no field fills, including the first item row', async () => {
    const extracted = await adapter.extractRegion(await buildLegacyArchive(), ARCHIVE_SHEET, ARCHIVE_BLOCK_TWO)
    if (!extracted.ok) throw new Error('failed')
    const grid = await gridOf(extracted.bytes, 'Quotation', 12, 6)
    const suggestion = suggestMapping(grid)
    const draft = { ...emptyDraft({ lastColumn: 'F' }), fields: suggestion.fields, table: suggestion.table }

    const leftovers = findLeftovers(grid, draft)
    const byAddress = Object.fromEntries(leftovers.map((cell) => [cell.address, cell]))
    expect(byAddress.A5).toMatchObject({ text: 'Customer:', kind: 'label' })
    expect(byAddress.A3).toMatchObject({ kind: 'label' })
    expect(byAddress.F11).toMatchObject({ text: '960', kind: 'value' })
    expect(byAddress.B5).toBeUndefined()
    expect(leftovers.some(({ address }) => address === 'A9')).toBe(false)
  })
})
