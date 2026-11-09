import type ExcelJS from 'exceljs'
import type { Diagnostic } from '../../domain/template/diagnostics'
import type { RepeatRegion } from '../../domain/template/types'
import { copyRuleFormula, formatRange, formulaReferences, mapFormulaRows, parseRange, referencesOtherSheet, slideFormula, usesUnsupportedReference } from './a1'
import type { CellRange } from './a1'

// These two collections are public at runtime but missing from ExcelJS's Worksheet type.
type RuleSheet = ExcelJS.Worksheet & {
  conditionalFormattings: ExcelJS.ConditionalFormattingOptions[]
  dataValidations: { model: Record<string, ExcelJS.DataValidation> }
}
type Piece = { source: CellRange; target: CellRange; item?: boolean }
type Projection = (range: CellRange) => Piece[]

/** Copies only supported rules. It never follows links or leaves a rule referring to a removed sheet. */
function copyRules(source: ExcelJS.Worksheet, target: ExcelJS.Worksheet, project: Projection,
  translate: (formula: string, piece: Piece) => string | undefined, warnIfEmpty = false): Diagnostic[] {
  const from = source as RuleSheet
  const to = target as RuleSheet
  const conditional = structuredClone(from.conditionalFormattings)
  const validation = structuredClone(from.dataValidations.model)
  to.conditionalFormattings = []
  to.dataValidations.model = {}
  const diagnostics: Diagnostic[] = []
  let skipped = 0
  const formulas = (values: unknown[] | undefined, piece: Piece): unknown[] | undefined => {
    if (!values) return values
    const moved: unknown[] = []
    for (const value of values) {
      if (typeof value !== 'string') { moved.push(value); continue }
      // Quoted list literals (e.g. "PC,SET") are intentionally unchanged.
      if (/^"(?:[^"]|"")*"$/.test(value)) { moved.push(value); continue }
      if (referencesOtherSheet(value) || usesUnsupportedReference(value) || /\[|\]|INDIRECT\s*\(|OFFSET\s*\(/i.test(value)) return undefined
      const result = translate(value, piece)
      // A bare name might refer to a named range being removed during extraction.
      if (result === undefined || (/^[A-Za-z_][A-Za-z_0-9.]*$/.test(result) && !formulaReferences(result).length && !/^(TRUE|FALSE)$/i.test(result))) return undefined
      moved.push(result)
    }
    return moved
  }
  for (const formatting of conditional) {
    for (const ref of formatting.ref.split(/\s+/).filter(Boolean)) {
      let pieces: Piece[]
      try { pieces = project(parseRange(ref)) } catch { skipped++; continue }
      if (!pieces.length && warnIfEmpty) skipped++
      for (const piece of pieces) {
        const rules = formatting.rules.flatMap((rule) => {
          // Complex visual rules have Excel extension data that cannot safely be cloned.
          if (!['expression', 'cellIs', 'containsText'].includes(rule.type)) { skipped++; return [] }
          const copy = structuredClone(rule)
          if ('formulae' in copy && copy.formulae) {
            const moved = formulas(copy.formulae, piece)
            if (!moved) { skipped++; return [] }
            copy.formulae = moved as typeof copy.formulae
          }
          return [copy]
        })
        if (rules.length) to.addConditionalFormatting({ ref: formatRange(piece.target), rules })
      }
    }
  }
  for (const [ref, rule] of Object.entries(validation)) {
    let pieces: Piece[]
    try { pieces = project(parseRange(ref.replace(/^range:/, ''))) } catch { skipped++; continue }
    if (!pieces.length && warnIfEmpty) skipped++
    for (const piece of pieces) {
      const moved = formulas(rule.formulae, piece)
      if (rule.formulae && !moved) { skipped++; continue }
      to.dataValidations.model[formatRange(piece.target)] = { ...structuredClone(rule), formulae: moved ?? [] }
    }
  }
  if (skipped) diagnostics.push({ severity: 'warning', code: 'RULES_NOT_SUPPORTED', worksheet: source.name,
    message: `${skipped} formatting or dropdown rule(s) could not be translated safely and were left out. Use simple rules within the prototype row or footer; avoid other sheets, removed cells, and complex references.` })
  return diagnostics
}

/** Copies the prototype's rules to every generated item, and shifts footer rules with their cells. */
export function moveLayoutRules(sheet: ExcelJS.Worksheet, region: RepeatRegion, needed: number,
  moveFormula: (formula: string) => string): Diagnostic[] {
  const delta = region.firstDataRow + needed - region.footerAnchorRow
  const project: Projection = (box) => {
    const pieces: Piece[] = []
    if (box.top < region.firstDataRow) {
      const before = { ...box, bottom: Math.min(box.bottom, region.firstDataRow - 1) }
      pieces.push({ source: box, target: before })
    }
    if (box.top <= region.prototypeRow && box.bottom >= region.prototypeRow) {
      const prototype = { ...box, top: region.prototypeRow, bottom: region.prototypeRow }
      for (let i = 0; i < needed; i++) pieces.push({ source: box, item: true, target: { ...prototype, top: region.firstDataRow + i, bottom: region.firstDataRow + i } })
    }
    if (box.bottom >= region.footerAnchorRow) {
      const footer = { ...box, top: Math.max(box.top, region.footerAnchorRow) }
      pieces.push({ source: box, target: { ...footer, top: footer.top + delta, bottom: footer.bottom + delta } })
    }
    return pieces
  }
  return copyRules(sheet, sheet, project, (formula, piece) => {
    if (piece.item) {
      return copyRuleFormula(formula, piece.target.top - piece.source.top, region.footerAnchorRow, delta)
    }
    const oldTop = piece.target.top >= region.firstDataRow + needed ? piece.target.top - delta : piece.target.top
    return moveFormula(slideFormula(formula, oldTop - piece.source.top))
  }, true)
}

/** Retains rules entirely inside the selected quotation. Other areas and their validation lists never leak in. */
export function extractLayoutRules(source: ExcelJS.Worksheet, target: ExcelJS.Worksheet, area: CellRange): Diagnostic[] {
  const inside = (box: CellRange) => box.top >= area.top && box.bottom <= area.bottom && box.left >= area.left && box.right <= area.right
  let cut = 0
  const diagnostics = copyRules(source, target, (box) => {
    if (inside(box)) return [{ source: box, target: { ...box, top: box.top - area.top + 1, bottom: box.bottom - area.top + 1 } }]
    if (box.bottom >= area.top && box.top <= area.bottom && box.right >= area.left && box.left <= area.right) cut++
    return []
  }, (formula) => {
    const refs = formulaReferences(formula)
    if (refs.some(({ row, column }) => !inside(parseRange(`${column}${row}`)))) return undefined
    return mapFormulaRows(formula, (row) => row - area.top + 1)
  })
  if (cut) diagnostics.push({ severity: 'warning', code: 'RULE_CROSSES_AREA', message: `${cut} formatting or dropdown rule(s) cross the selected area's edge and were left out. Define those rules within one quotation area in Excel.` })
  return diagnostics
}
