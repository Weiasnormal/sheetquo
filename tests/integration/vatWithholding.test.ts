import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { businessRecordSchema, EMPTY_BUSINESS_FORM, parseBusinessForm } from '../../src/domain/business/businessForm'
import type { BusinessRecord } from '../../src/domain/business/businessForm'
import { computeTotals } from '../../src/domain/calculations/money'
import { parseQuotationText } from '../../src/domain/parser/parseQuotationText'
import { quotationFromParse } from '../../src/domain/parser/toQuotation'
import type { QuotationRecord } from '../../src/domain/quotation/records'
import type { Adjustment, QuoteItem } from '../../src/domain/quotation/types'
import { blankDraft, governmentWithholding, newAdjustment } from '../../src/features/quotations/draftSetup'
import { buildAdaptiveQuotation } from '../../src/infrastructure/excel/adaptiveQuotation'
import { ExcelJsAdapter } from '../../src/infrastructure/excel/ExcelJsAdapter'
import { SAMPLE_BUSINESS_A, sampleQuotation } from '../../src/test/fixtures/synthetic/quotations'
import { buildPartsTemplate, PARTS_TEMPLATE } from '../../src/test/fixtures/synthetic/templates'

const part = (priceMinor: number): QuoteItem => ({ id: crypto.randomUUID(), description: 'Part', quantity: '1', unitPriceMinor: priceMinor, type: 'part', included: true })
const labor = (priceMinor: number): QuoteItem => ({ ...part(priceMinor), description: 'Labor', type: 'labor' })
const deduction = (value: string, base: Adjustment['base'], order: number): Adjustment => ({
  id: `deduction-${order}`, label: `Less ${value}%`, kind: 'deduction', mode: 'percentage', value, base, enabled: true, order,
})
const fixedDiscount = (value: string): Adjustment => ({ id: 'discount', label: 'Discount', kind: 'discount', mode: 'fixed', value, base: 'allBillable', enabled: true, order: 0 })
const open = async (bytes: Uint8Array) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer)
  return workbook.worksheets[0]
}

describe('withholding net of VAT', () => {
  it('divides VAT-inclusive prices by 1.12 before taking the rate', () => {
    // ₱112,000 including VAT is ₱100,000 net of VAT: 5% is ₱5,000 and 1% is ₱1,000, never ₱5,600 / ₱1,120.
    const totals = computeTotals({ items: [part(10_000_000), labor(1_200_000)], adjustments: [deduction('5', 'netOfVat', 1), deduction('1', 'netOfVat', 2)] })
    expect(totals.adjustments.map(({ baseMinor, amountMinor }) => [baseMinor, amountMinor])).toEqual([[10_000_000, 500_000], [10_000_000, 100_000]])
    expect(totals.grandTotalMinor).toBe(11_200_000 - 600_000)
  })

  it('takes withholding after discounts, and a discount never from another discount', () => {
    const totals = computeTotals({ items: [part(11_200_000)], adjustments: [deduction('5', 'netOfVat', 1), fixedDiscount('1120')] })
    const [withholding] = totals.adjustments.filter(({ kind }) => kind === 'deduction')
    expect(withholding.baseMinor).toBe(9_900_000)
    expect(withholding.amountMinor).toBe(495_000)
  })

  it('rounds once, like ROUND(gross/1.12*rate,2)', () => {
    // ₱1,000.00 ÷ 1.12 = 892.857…, shown as 892.86; 3% of the unrounded base is 26.7857… → 26.79.
    const totals = computeTotals({ items: [part(100_000)], adjustments: [deduction('3', 'netOfVat', 1)] })
    expect(totals.adjustments[0]).toMatchObject({ baseMinor: 89_286, amountMinor: 2_679 })
  })
})

describe('VAT status on the business and in drafts', () => {
  it('saves the toggle and reads older backups without it as non-VAT', () => {
    const parsed = parseBusinessForm({ ...EMPTY_BUSINESS_FORM, displayName: 'Sample', vatRegistered: true })
    expect(parsed.ok && parsed.input.vatRegistered).toBe(true)
    const old = businessRecordSchema.safeParse({ id: 'b', displayName: 'Old', addressLines: [], phones: [], currency: 'PHP', createdAt: '', updatedAt: '' })
    expect(old.success && old.data.vatRegistered).toBeFalsy()
  })

  it('starts new deductions and pasted 2306/2307 lines net of VAT only for VAT-registered businesses', () => {
    expect(newAdjustment('deduction', 1, { vatRegistered: true }).base).toBe('netOfVat')
    expect(newAdjustment('deduction', 1).base).toBe('allBillable')
    expect(newAdjustment('discount', 1, { vatRegistered: true }).base).toBe('allBillable')

    const parse = parseQuotationText('Less 5% for 2306\nLess 1% for 2307\nDiscount: 500')
    expect(parse.lines.map(({ adjustment }) => adjustment?.kind)).toEqual(['deduction', 'deduction', 'discount'])
    const base = { id: 'q', businessId: 'b', templateVersionId: 't', quoteDateISO: '2026-11-25' }
    expect(quotationFromParse(parse, '', base, { vatRegistered: true }).adjustments.map(({ base }) => base)).toEqual(['netOfVat', 'netOfVat', 'allBillable'])
    expect(quotationFromParse(parse, '', base).adjustments.map(({ base }) => base)).toEqual(['allBillable', 'allBillable', 'allBillable'])
  })

  it('adds the government withholding pair for each VAT status', () => {
    expect(governmentWithholding(3, { vatRegistered: true }).map(({ label, value, base, order }) => [label, value, base, order])).toEqual([
      ['Less final VAT (2306)', '5', 'netOfVat', 3],
      ['Less EWT (2307)', '1', 'netOfVat', 4],
    ])
    expect(governmentWithholding(1).map(({ value, base }) => [value, base])).toEqual([['3', 'allBillable'], ['1', 'allBillable']])
  })
})

describe('downloaded workbooks recalculate when the rate is edited', () => {
  const business = { id: 'b', displayName: 'Sample Parts', addressLines: ['Sample Street'], phones: ['12345'], currency: 'PHP', vatRegistered: true, createdAt: '', updatedAt: '' } as BusinessRecord

  it('business layout: each rate sits in its own cell and the amount reads it, net of VAT after discounts', async () => {
    const quotation = {
      ...blankDraft(business), id: 'q', createdAt: '', updatedAt: '', status: 'draft', customerName: 'Government office',
      items: [part(10_000_000), labor(1_200_000)],
      adjustments: [fixedDiscount('1120'), ...governmentWithholding(1, { vatRegistered: true })],
    } as unknown as QuotationRecord
    const totals = computeTotals(quotation)
    const sheet = await open((await buildAdaptiveQuotation(quotation)).bytes)

    const rows: { label: string; rate: ExcelJS.CellValue; amount: ExcelJS.Cell }[] = []
    sheet.eachRow((row) => {
      const label = String(row.getCell(4).value ?? '')
      if (/Discount|2306|2307|Grand total/.test(label)) rows.push({ label, rate: row.getCell(5).value, amount: row.getCell(6) })
    })
    const [discount, finalVat, ewt, grand] = rows
    expect(discount.amount.value).toBe(-1120)
    for (const [row, rate, expected] of [[finalVat, 0.05, totals.adjustments[1]], [ewt, 0.01, totals.adjustments[2]]] as const) {
      expect(row.label).toContain('(net of VAT)')
      expect(row.rate).toBe(rate)
      const formula = (row.amount.value as ExcelJS.CellFormulaValue).formula
      expect(formula).toMatch(new RegExp(`^-ROUND\\(\\(F\\d+\\+F${discount.amount.row}\\)/1\\.12\\*E${row.amount.row},2\\)$`))
      expect(row.amount.result).toBe(-expected.amountMinor / 100)
      expect(sheet.getCell(`E${row.amount.row}`).numFmt).toBe('0%')
    }
    expect(grand.amount.result).toBe(totals.grandTotalMinor / 100)
    expect(totals.adjustments[1].amountMinor).toBe(495_000)
  })

  it('template layout: the amount reads its mapped base and rate cells', async () => {
    const template = structuredClone(PARTS_TEMPLATE)
    template.adjustmentRows = [20, 21, 22].map((row) => ({ label: `A${row}`, base: `D${row}`, rate: `E${row}`, amount: `F${row}` }))
    const quotation = { ...sampleQuotation(3), adjustments: [fixedDiscount('100'), ...governmentWithholding(1, { vatRegistered: true })] }
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load((await buildPartsTemplate()) as unknown as ExcelJS.Buffer)
    for (const row of [20, 21, 22]) workbook.getWorksheet('Quotation')!.getCell(`F${row}`).border = { bottom: { style: 'thin' } }
    const templateBytes = new Uint8Array((await workbook.xlsx.writeBuffer()) as unknown as ArrayBuffer)
    const result = await new ExcelJsAdapter().generate({ templateBytes, template, quotation, business: SAMPLE_BUSINESS_A })
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
    const { layout, totals } = result.workbook
    const sheet = await open(result.workbook.bytes)
    const discountCell = layout.addresses['adjustments.0.amount']
    for (const index of [1, 2]) {
      const [base, rate, amount, label] = ['base', 'rate', 'amount', 'label'].map((key) => sheet.getCell(layout.addresses[`adjustments.${index}.${key}`]))
      expect((amount.value as ExcelJS.CellFormulaValue).formula).toBe(`ROUND(${base.address}*${rate.address},2)`)
      expect((base.value as ExcelJS.CellFormulaValue).formula).toMatch(new RegExp(`-${discountCell}\\)/1\\.12\\)$`))
      expect(amount.result).toBe(totals.adjustments[index].amountMinor / 100)
      expect(label.value).toMatch(/\(of the amount net of VAT\)$/)
    }
    expect(sheet.getCell(layout.addresses['totals.grandTotal']).result).toBe(totals.grandTotalMinor / 100)
  })
})
