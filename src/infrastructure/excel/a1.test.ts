import { describe, expect, it } from 'vitest'
import {
  columnToNumber,
  mapFormulaRows,
  numberToColumn,
  referencesOtherSheet,
  slideFormula,
  usesUnsupportedReference,
} from './a1'

describe('column conversion', () => {
  it('round-trips', () => {
    for (const [letters, number] of [['A', 1], ['Z', 26], ['AA', 27], ['AZ', 52], ['BA', 53]] as const) {
      expect(columnToNumber(letters)).toBe(number)
      expect(numberToColumn(number)).toBe(letters)
    }
  })
})

describe('mapFormulaRows', () => {
  const addTen = (row: number) => row + 10

  it('moves single references and both ends of a range', () => {
    expect(mapFormulaRows('SUM(G12:G13)-G15', addTen)).toBe('SUM(G22:G23)-G25')
  })

  it('reports the position of each reference', () => {
    const seen: string[] = []
    mapFormulaRows('SUM(A1:B2)+C3', (row, position) => {
      seen.push(`${row}:${position}`)
      return row
    })
    expect(seen).toEqual(['1:start', '2:end', '3:single'])
  })

  it('keeps absolute markers', () => {
    expect(mapFormulaRows('$G$12+G$13+$G14', addTen)).toBe('$G$22+G$23+$G24')
  })

  it('ignores strings, function names, and other sheets', () => {
    expect(mapFormulaRows('IF(A1="B2",LOG10(C3),Rates!D4)', addTen)).toBe('IF(A11="B2",LOG10(C13),Rates!D4)')
    expect(mapFormulaRows("'Old quotes'!A1+B2", addTen)).toBe("'Old quotes'!A1+B12")
  })
})

describe('slideFormula', () => {
  it('moves relative rows only', () => {
    expect(slideFormula('ROUND(C12*E$12,2)+SUM(A$1:A12)', 3)).toBe('ROUND(C15*E$12,2)+SUM(A$1:A15)')
  })
})

describe('formula checks', () => {
  it('finds other-sheet references outside strings', () => {
    expect(referencesOtherSheet('Rates!A1*2')).toBe(true)
    expect(referencesOtherSheet('IF(A1,"wow!",0)')).toBe(false)
  })

  it('flags whole-row references and broken references', () => {
    expect(usesUnsupportedReference('SUM(12:12)')).toBe(true)
    expect(usesUnsupportedReference('A1+#REF!')).toBe(true)
    expect(usesUnsupportedReference('SUM(A1:B2)')).toBe(false)
  })
})
