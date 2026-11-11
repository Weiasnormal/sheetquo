import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { beforeAll, describe, expect, it } from 'vitest'
import { computeTotals } from '../../src/domain/calculations/money'
import { ExcelJsAdapter } from '../../src/infrastructure/excel/ExcelJsAdapter'
import {
  ARCHIVE_BLOCK_TWO,
  ARCHIVE_SHEET,
  EXTRACTED_TEMPLATE,
  buildLegacyArchive,
} from '../../src/test/fixtures/synthetic/legacyArchive'
import { SAMPLE_BUSINESS_A, sampleQuotation } from '../../src/test/fixtures/synthetic/quotations'
import { buildPartsTemplate } from '../../src/test/fixtures/synthetic/templates'

const OUTPUT = join(process.cwd(), 'output', 'excel-spike', 'import')
const adapter = new ExcelJsAdapter()

let archive: Uint8Array

async function reopen(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  return workbook
}

const codes = (diagnostics: { code: string }[]) => diagnostics.map(({ code }) => code)

beforeAll(async () => {
  archive = await buildLegacyArchive()
})

describe('opening a workbook', () => {
  it('T-01: reads a normal one-sheet template with no warnings', async () => {
    const opened = await adapter.open(await buildPartsTemplate())
    if (!opened.ok) throw new Error('did not open')
    const [sheet] = opened.workbook.inspection.worksheets
    expect(sheet.quoteBlocks).toHaveLength(1)
    expect(opened.workbook.inspection.diagnostics).toEqual([])
  })

  it('T-03: finds each old quotation in an archive sheet, and reports hidden sheets', async () => {
    const opened = await adapter.open(archive)
    if (!opened.ok) throw new Error('did not open')
    const { worksheets, diagnostics } = opened.workbook.inspection
    expect(worksheets.map(({ name, state }) => [name, state])).toEqual([
      ['Old quotes 2025', 'visible'],
      ['Lookup', 'hidden'],
      ['Empty', 'visible'],
    ])
    expect(worksheets[0].quoteBlocks).toEqual([
      { firstRow: 1, lastRow: 12, lastColumn: 8 },
      { firstRow: 21, lastRow: 32, lastColumn: 8 },
    ])
    expect(worksheets[2].quoteBlocks).toEqual([])
    // The last row in use, not the number of filled rows, which is smaller because of the gap between quotations.
    expect(worksheets[0].rowCount).toBe(32)
    expect(codes(diagnostics)).toEqual(['MULTIPLE_WORKSHEETS', 'HIDDEN_WORKSHEETS'])
  })

  it('T-02: refuses a file that is not a workbook', async () => {
    const opened = await adapter.open(new TextEncoder().encode('not a workbook'))
    expect(opened.ok ? [] : codes(opened.diagnostics)).toEqual(['NOT_XLSX'])
  })
})

describe('the preview grid', () => {
  it('shows text, merged spans, fills, and numbers for an area', async () => {
    const opened = await adapter.open(archive)
    if (!opened.ok) throw new Error('did not open')
    const grid = opened.workbook.readGrid(ARCHIVE_SHEET, { firstRow: 1, lastRow: 12, lastColumn: 6 })

    expect(grid.columns.map(({ letter }) => letter)).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
    expect(grid.rows).toHaveLength(12)
    expect(grid.rows[0].cells[0]).toMatchObject({ text: 'SAMPLE TRADING', bold: true, colSpan: 6 })
    expect(grid.rows[0].cells[1]).toEqual({ text: '', covered: true })
    expect(grid.rows[6].cells[0]).toMatchObject({ text: 'Description', fill: '#D9E2F3' })
    expect(grid.rows[7].cells[2]).toMatchObject({ text: '2', numeric: true })
    // No saved result in this file, so the formula itself shows rather than a blank cell.
    expect(grid.rows[7].cells[5]).toMatchObject({ text: '=ROUND(C8*E8,2)', formula: true })
    expect(grid.truncatedColumns).toBe(false)
  })

  it('does not fail when an area starts inside a merge whose top-left cell is empty', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Gaps')
    sheet.mergeCells('A1:C4')
    sheet.getCell('A6').value = 'After the merge'
    const opened = await adapter.open(new Uint8Array((await workbook.xlsx.writeBuffer()) as unknown as ArrayBuffer))
    if (!opened.ok) throw new Error('did not open')
    const grid = opened.workbook.readGrid('Gaps', { firstRow: 3, lastRow: 6, lastColumn: 3 })
    expect(grid.rows[0].cells[0]).toMatchObject({ text: '', rowSpan: 2, colSpan: 3 })
    expect(grid.rows[3].cells[0].text).toBe('After the merge')
  })

  it('crops a merge that starts above the area instead of losing it', async () => {
    const opened = await adapter.open(archive)
    if (!opened.ok) throw new Error('did not open')
    const grid = opened.workbook.readGrid(ARCHIVE_SHEET, { firstRow: 5, lastRow: 6, lastColumn: 3 })
    expect(grid.rows[0].cells[1]).toMatchObject({ text: 'Old Customer One', colSpan: 2 })
  })
})

describe('extracting an area', () => {
  it('makes a one-sheet copy of the second quotation, moved to row 1, with the cost column left out', async () => {
    const before = archive.slice()
    const result = await adapter.extractRegion(archive, ARCHIVE_SHEET, ARCHIVE_BLOCK_TWO)
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))

    expect(archive).toEqual(before)

    const workbook = await reopen(result.bytes)
    expect(workbook.worksheets.map(({ name }) => name)).toEqual(['Quotation'])
    const sheet = workbook.getWorksheet('Quotation')!
    expect(sheet.getCell('A1').value).toBe('SAMPLE TRADING')
    expect(sheet.getCell('B5').value).toBe('Old Customer Two')
    expect(sheet.model.merges).toEqual(expect.arrayContaining(['A1:F1', 'A3:F3', 'B5:C5']))
    expect((sheet.getCell('F8').value as ExcelJS.CellFormulaValue).formula).toBe('ROUND(C8*E8,2)')
    expect((sheet.getCell('F10').value as ExcelJS.CellFormulaValue).formula).toBe('SUM(F8:F9)')
    expect(sheet.getCell('H8').value).toBeNull()
    expect(sheet.getColumn('A').width).toBe(30)
    expect(sheet.pageSetup.printArea).toBe('A1:F12')
    expect(sheet.getImages().map(({ range }) => Math.floor(range.tl.row))).toEqual([0])
    expect(workbook.definedNames.model).toEqual([])
  })

  it('keeps the last value of a formula that reads a column left out, and says so', async () => {
    const result = await adapter.extractRegion(archive, ARCHIVE_SHEET, ARCHIVE_BLOCK_TWO)
    if (!result.ok) throw new Error('failed')
    const sheet = (await reopen(result.bytes)).getWorksheet('Quotation')!
    expect(sheet.getCell('F11').value).toBe(960)
    expect(codes(result.diagnostics)).toEqual(
      expect.arrayContaining(['FORMULA_OUTSIDE_AREA', 'OLD_VALUES_KEPT']),
    )
  })

  it('refuses an area whose edge cuts through merged cells', async () => {
    const result = await adapter.extractRegion(archive, ARCHIVE_SHEET, { firstRow: 1, lastRow: 12, lastColumn: 3 })
    expect(result.ok ? [] : codes(result.diagnostics)).toContain('MERGE_CROSSES_AREA')
  })

  it('refuses an area with more than 10,000 filled cells', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Big')
    for (let row = 1; row <= 101; row += 1) {
      sheet.getRow(row).values = Array.from({ length: 100 }, (_, index) => index + 1)
    }
    const bytes = new Uint8Array((await workbook.xlsx.writeBuffer()) as unknown as ArrayBuffer)
    const result = await adapter.extractRegion(bytes, 'Big', { firstRow: 1, lastRow: 101, lastColumn: 100 })
    expect(result.ok ? [] : codes(result.diagnostics)).toEqual(['AREA_TOO_LARGE'])
  })

  it('empties the cells chosen for clearing and keeps their formatting', async () => {
    const extracted = await adapter.extractRegion(archive, ARCHIVE_SHEET, ARCHIVE_BLOCK_TWO)
    if (!extracted.ok) throw new Error('failed')
    const generated = await adapter.generate({
      templateBytes: extracted.bytes,
      template: { ...EXTRACTED_TEMPLATE, clearCells: ['F11', 'B8'] },
      business: SAMPLE_BUSINESS_A,
      quotation: { ...sampleQuotation(3), adjustments: [] },
    })
    if (!generated.ok) throw new Error(JSON.stringify(generated.diagnostics))
    const sheet = (await reopen(generated.workbook.bytes)).getWorksheet('Quotation')!
    // F11 moved down one row with the footer, because three items need one more row than the template had.
    expect(sheet.getCell('F12').value).toBeNull()
    expect(sheet.getCell('E12').value).toBe('Markup')
    // B8 sat in the prototype row; part numbers now come from the quotation, not the old value.
    expect(sheet.getCell('B8').value).toBe('DEMO-001')
  })

  it('produces a copy the engine can fill, and writes it for the Excel check', async () => {
    const extracted = await adapter.extractRegion(archive, ARCHIVE_SHEET, ARCHIVE_BLOCK_TWO)
    if (!extracted.ok) throw new Error('failed')

    // This layout has no discount cell, and the engine refuses to drop a discount silently.
    const quotation = { ...sampleQuotation(15), adjustments: [] }
    const generated = await adapter.generate({
      templateBytes: extracted.bytes,
      template: EXTRACTED_TEMPLATE,
      business: SAMPLE_BUSINESS_A,
      quotation,
    })
    if (!generated.ok) throw new Error(JSON.stringify(generated.diagnostics))

    const workbook = await reopen(generated.workbook.bytes)
    const sheet = workbook.getWorksheet('Quotation')!
    expect(sheet.getCell('B5').value).toBe('Demo Customer Ñiño & Sons')

    await mkdir(OUTPUT, { recursive: true })
    await writeFile(join(OUTPUT, 'extracted-15-items.xlsx'), generated.workbook.bytes)
    const [first, ...rest] = quotation.items
    const after = computeTotals({ ...quotation, items: [{ ...first, quantity: String(Number(first.quantity) + 1) }, ...rest] })
    await writeFile(
      join(OUTPUT, 'manifest.json'),
      JSON.stringify([
        {
          file: 'extracted-15-items.xlsx',
          sheet: 'Quotation',
          grandTotalCell: generated.workbook.layout.addresses['totals.grandTotal'],
          expectedGrandTotal: generated.workbook.totals.grandTotalMinor / 100,
          editQuantityCell: 'C8',
          expectedAfterEdit: after.grandTotalMinor / 100,
          printArea: generated.workbook.layout.printArea,
        },
      ]),
    )
  })
})
