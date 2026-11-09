import type ExcelJS from 'exceljs'
import type { Diagnostic } from '../../domain/template/diagnostics'
import type { TemplateDefinition } from '../../domain/template/types'
import { columnToNumber } from './a1'

const PAPER = { A4: [595.28, 841.89], Letter: [612, 792] } as const

/** Conservative page estimates in points. Excel/printer rendering remains the final check. */
export function paginate(sheet: ExcelJS.Worksheet, template: TemplateDefinition, lastRow: number, footerRow: number): Diagnostic[] {
  const profile = template.printProfile
  const dimensions = PAPER[profile.paper]
  const [width, height] = profile.orientation === 'landscape' ? [dimensions[1], dimensions[0]] : dimensions
  const margins = profile.marginsInches
  const availableWidth = width - 72 * (margins.left + margins.right)
  const availableHeight = height - 72 * (margins.top + margins.bottom)
  let contentWidth = 0
  for (let col = columnToNumber(profile.columns.first); col <= columnToNumber(profile.columns.last); col++) {
    if (!sheet.getColumn(col).hidden) contentWidth += ((sheet.getColumn(col).width ?? sheet.properties.defaultColWidth ?? 9) * 7 + 5) * 0.75
  }
  const scale = Math.min(1, availableWidth * profile.fitToWidthPages / Math.max(1, contentWidth))
  // Leave room for Excel's differences in text and printer metrics.
  const pageCapacity = availableHeight / scale * 0.94
  const rowHeight = (row: number) => sheet.getRow(row).hidden ? 0 : sheet.getRow(row).height ?? sheet.properties.defaultRowHeight ?? 15
  const repeatRow = profile.repeatHeaderRow
  const repeatedHeight = repeatRow ? rowHeight(repeatRow) : 0
  const breaks: number[] = []
  let used = 0
  let tooTall = false
  const footerHeight = Array.from({ length: Math.max(0, lastRow - footerRow + 1) }, (_, i) => rowHeight(footerRow + i)).reduce((a, b) => a + b, 0)
  const keepFooter = profile.keepFooterTogether !== false
  for (let row = 1; row <= lastRow; row++) {
    const heightOfRow = rowHeight(row)
    // Keep the last item with the footer too, avoiding a page containing only signatures and totals.
    const grouped = keepFooter && row === footerRow - 1 && footerHeight + heightOfRow <= pageCapacity - repeatedHeight
      ? footerHeight + heightOfRow
      : keepFooter && row === footerRow ? footerHeight : heightOfRow
    if (used + grouped > pageCapacity && row > 1 && used > repeatedHeight) {
      breaks.push(row - 1)
      used = repeatedHeight
    }
    used += heightOfRow
    if (heightOfRow > pageCapacity - repeatedHeight || (keepFooter && row === footerRow && footerHeight > pageCapacity - repeatedHeight)) tooTall = true
  }
  // Never use stale manual breaks from the source workbook.
  sheet.model.rowBreaks.splice(0)
  for (const row of breaks) sheet.getRow(row).addPageBreak()
  const diagnostics: Diagnostic[] = []
  if (scale < 0.65) diagnostics.push({ severity: 'warning', code: 'PRINT_TEXT_SMALL', message: 'This layout needs substantial width scaling. Use landscape, narrower columns, or more pages wide to keep the print readable.' })
  if (tooTall) diagnostics.push({ severity: 'warning', code: 'PRINT_BLOCK_TOO_TALL', message: 'A row or the footer is taller than one printable page. Shorten its text or adjust the template, and check Excel Print Preview.' })
  return diagnostics
}

export function printProfileErrors(template: TemplateDefinition): Diagnostic[] {
  const p = template.printProfile
  const fail = (message: string): Diagnostic[] => [{ severity: 'error', code: 'PRINT_SETTINGS_INVALID', message }]
  if (!PAPER[p.paper] || !['portrait', 'landscape'].includes(p.orientation)) return fail('Choose A4 or Letter and a page orientation.')
  if (!Number.isInteger(p.fitToWidthPages) || p.fitToWidthPages < 1 || p.fitToWidthPages > 10) return fail('Pages wide must be a whole number from 1 to 10.')
  const entries = [...Object.values(p.marginsInches), p.headerMarginInches ?? 0.3, p.footerMarginInches ?? 0.3]
  if (entries.some((n) => !Number.isFinite(n) || n < 0 || n > 3)) return fail('Margins must be between 0 and 3 inches.')
  const [w, h] = p.orientation === 'landscape' ? [PAPER[p.paper][1], PAPER[p.paper][0]] : PAPER[p.paper]
  if (72 * (p.marginsInches.left + p.marginsInches.right) >= w - 72 || 72 * (p.marginsInches.top + p.marginsInches.bottom) >= h - 72) return fail('The margins leave too little space to print the quotation.')
  if (!/^[A-Z]{1,3}$/.test(p.columns.first) || !/^[A-Z]{1,3}$/.test(p.columns.last) || columnToNumber(p.columns.first) > columnToNumber(p.columns.last)) return fail('Choose a valid first and last print column.')
  if (p.repeatHeaderRow !== undefined && (!Number.isInteger(p.repeatHeaderRow) || p.repeatHeaderRow < 1 || p.repeatHeaderRow >= template.itemRegion.firstDataRow)) return fail('Repeat a header row above the first item.')
  return []
}
