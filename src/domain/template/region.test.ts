import { describe, expect, it } from 'vitest'
import { checkRegion, checkTemplateFile, isQuotationHeading, MAX_TEMPLATE_BYTES, suggestBlocks } from './region'

describe('template file check', () => {
  it('accepts .xlsx in any case', () => {
    expect(checkTemplateFile('Quote.XLSX', 1000)).toEqual({ ok: true })
  })

  it.each([
    ['old.xls', /older .xls/],
    ['macro.xlsm', /macros/],
    ['binary.xlsb', /Binary/],
    ['list.csv', /CSV/],
    ['photo.png', /Choose an .xlsx/],
  ])('turns away %s with a reason', (name, message) => {
    const result = checkTemplateFile(name, 1000)
    expect(result.ok ? '' : result.message).toMatch(message)
  })

  it('rejects empty and oversized files', () => {
    expect(checkTemplateFile('a.xlsx', 0)).toEqual({ ok: false, message: 'This file is empty.' })
    expect(checkTemplateFile('a.xlsx', MAX_TEMPLATE_BYTES + 1)).toEqual({ ok: false, message: 'Choose a workbook of 15 MB or less.' })
  })
})

describe('quotation headings', () => {
  it.each(['PARTS QUOTATION', 'Quotation', 'ESTIMATE', 'Proforma Invoice', ' price  quote '])('matches %s', (text) => {
    expect(isQuotationHeading(text)).toBe(true)
  })

  it.each(['Quote No:', 'Estimate #', 'This quotation is valid for 30 days', 'Quotation date'])('ignores %s', (text) => {
    expect(isQuotationHeading(text)).toBe(false)
  })
})

describe('suggestBlocks', () => {
  const rows = (entries: [number, number][]) => new Map(entries)

  it('returns the used area for a single quotation', () => {
    expect(suggestBlocks(rows([[1, 6], [9, 8], [18, 6]]), [4])).toEqual([{ firstRow: 1, lastRow: 18, lastColumn: 8 }])
  })

  it('splits an archive at each title, keeping the heading lines above it and trimming blank rows', () => {
    // Titles at rows 5 and 104, with the business heading starting four rows above each.
    const filled = rows([
      [1, 4], [5, 4], [12, 8], [26, 4],
      [100, 4], [104, 4], [111, 15], [125, 6],
    ])
    expect(suggestBlocks(filled, [104, 5, 5])).toEqual([
      { firstRow: 1, lastRow: 26, lastColumn: 8 },
      { firstRow: 100, lastRow: 125, lastColumn: 15 },
    ])
  })

  it('returns nothing for an empty sheet', () => {
    expect(suggestBlocks(new Map(), [])).toEqual([])
  })
})

describe('checkRegion', () => {
  it('accepts a normal area', () => {
    expect(checkRegion({ firstRow: 1, lastRow: 26, lastColumn: 8 }, 181)).toEqual({ ok: true })
  })

  it.each([
    [{ firstRow: 0, lastRow: 5, lastColumn: 3 }, /1 or more/],
    [{ firstRow: 9, lastRow: 5, lastColumn: 3 }, /after the first row/],
    [{ firstRow: 1, lastRow: 5, lastColumn: 0 }, /column letter/],
    [{ firstRow: 400, lastRow: 401, lastColumn: 3 }, /181 rows/],
  ])('rejects %o', (region, message) => {
    const result = checkRegion(region, 181)
    expect(result.ok ? '' : result.message).toMatch(message)
  })
})
