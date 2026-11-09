import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { beforeAll, describe, expect, it } from 'vitest'
import { computeTotals } from '../../src/domain/calculations/money'
import type { TemplateDefinition } from '../../src/domain/template/types'
import type { GeneratedWorkbook } from '../../src/infrastructure/excel/WorkbookAdapter'
import { ExcelJsAdapter } from '../../src/infrastructure/excel/ExcelJsAdapter'
import {
  FORMULA_LIKE_DESCRIPTION,
  SAMPLE_BUSINESS_A,
  SAMPLE_BUSINESS_B,
  sampleQuotation,
} from '../../src/test/fixtures/synthetic/quotations'
import {
  PARTS_TEMPLATE,
  SERVICE_TEMPLATE,
  buildPartsTemplate,
  buildServiceTemplate,
} from '../../src/test/fixtures/synthetic/templates'

const OUTPUT = join(process.cwd(), 'output', 'excel-spike')
const FIXTURES = join(process.cwd(), 'src', 'test', 'fixtures', 'synthetic')
const SIZES = [3, 15, 30]

const adapter = new ExcelJsAdapter()

type Case = { id: string; template: TemplateDefinition; bytes: Uint8Array; business: typeof SAMPLE_BUSINESS_A }

async function generate({ template, bytes, business }: Case, size: number, percentDiscount = false): Promise<GeneratedWorkbook> {
  const result = await adapter.generate({
    templateBytes: bytes,
    template,
    business,
    quotation: sampleQuotation(size, { percentDiscount }),
  })
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics, null, 2))
  return result.workbook
}

async function reopen(workbook: GeneratedWorkbook, sheetName: string) {
  const reader = new ExcelJS.Workbook()
  await reader.xlsx.load(workbook.bytes as unknown as ExcelJS.Buffer)
  return { reader, sheet: reader.getWorksheet(sheetName)! }
}

async function sheetXml(workbook: GeneratedWorkbook): Promise<string> {
  const zip = await JSZip.loadAsync(workbook.bytes)
  return zip.file('xl/worksheets/sheet1.xml')!.async('string')
}

async function packageText(workbook: GeneratedWorkbook, path: string): Promise<string> {
  const zip = await JSZip.loadAsync(workbook.bytes)
  return zip.file(path)!.async('string')
}

describe('Excel engine', () => {
  const cases: Case[] = []

  beforeAll(async () => {
    await mkdir(join(OUTPUT, 'templates'), { recursive: true })
    const parts = await buildPartsTemplate()
    const service = await buildServiceTemplate()
    await writeFile(join(OUTPUT, 'templates', 'parts-template.xlsx'), parts)
    await writeFile(join(OUTPUT, 'templates', 'service-template.xlsx'), service)
    cases.push(
      { id: 'parts', template: PARTS_TEMPLATE, bytes: parts, business: SAMPLE_BUSINESS_A },
      { id: 'service', template: SERVICE_TEMPLATE, bytes: service, business: SAMPLE_BUSINESS_B },
    )
  })

  it('reads worksheets, merges, formulas, and print settings', async () => {
    const inspection = await adapter.inspect(cases[1].bytes)
    const [sheet] = inspection.worksheets
    expect(sheet.name).toBe('Estimate')
    expect(sheet.merges).toContain('B12:D12')
    expect(sheet.formulaAddresses).toEqual(['I13', 'I15'])
    expect(inspection.diagnostics).toEqual([])
  })

  describe.each(SIZES)('%i items', (size) => {
    it.each([0, 1])('case %i places every row, footer, formula, and print range', async (caseIndex) => {
      const testCase = cases[caseIndex]
      const { template } = testCase
      const workbook = await generate(testCase, size)
      const { sheet } = await reopen(workbook, template.worksheetName)
      const { itemRegion: region } = template
      const { layout, totals } = workbook

      const firstItem = region.firstDataRow
      const lastItem = firstItem + size - 1
      expect(layout.lastItemRow).toBe(lastItem)

      const { columns } = region
      for (let row = firstItem; row <= lastItem; row += 1) {
        const amount = sheet.getCell(`${columns.lineAmount}${row}`).value as ExcelJS.CellFormulaValue
        expect(amount.formula).toBe(`ROUND(${columns.quantity}${row}*${columns.unitPrice}${row},2)`)
        expect(sheet.getCell(`${columns.description}${row}`).border).toBeDefined()
      }

      const subtotal = sheet.getCell(layout.addresses['totals.subtotal']).value as ExcelJS.CellFormulaValue
      expect(subtotal.formula).toBe(`SUM(${columns.lineAmount}${firstItem}:${columns.lineAmount}${lastItem})`)
      expect(subtotal.result).toBe(totals.subtotalMinor / 100)

      const grand = sheet.getCell(layout.addresses['totals.grandTotal']).value as ExcelJS.CellFormulaValue
      expect(grand.result).toBe(totals.grandTotalMinor / 100)
      expect(Number(layout.addresses['totals.grandTotal'].replace(/\D/g, ''))).toBeGreaterThan(lastItem)

      expect(sheet.pageSetup.printArea).toBe(layout.printArea)
      expect(sheet.pageSetup.orientation).toBe(template.printProfile.orientation)

      const xml = await sheetXml(workbook)
      expect(xml).not.toContain('#REF!')
      expect(xml).toContain('fitToPage="1"')
      expect(xml).toContain('fitToHeight="0"')
      expect(await packageText(workbook, 'xl/workbook.xml')).toContain('fullCalcOnLoad="1"')
    })
  })

  it('repeats the prototype merge on every item row and moves footer merges', async () => {
    const workbook = await generate(cases[1], 15)
    const { sheet } = await reopen(workbook, 'Estimate')
    const merges = sheet.model.merges
    for (let row = 12; row <= 26; row += 1) expect(merges).toContain(`B${row}:D${row}`)
    expect(merges).toContain(`A${18 + 14}:I${19 + 14}`)
    expect(merges).toContain('A2:E2')
  })

  it("expands the template's own SUM and keeps its formula style", async () => {
    const workbook = await generate(cases[1], 15)
    const { sheet } = await reopen(workbook, 'Estimate')
    const subtotal = sheet.getCell('I27').value as ExcelJS.CellFormulaValue
    const grand = sheet.getCell('I29').value as ExcelJS.CellFormulaValue
    expect(subtotal.formula).toBe('SUM(I12:I26)')
    expect(grand.formula).toBe('I27-I28')
    expect(sheet.getCell('I29').numFmt).toBe('"PHP" #,##0.00')
  })

  it('removes spare rows when the quotation is shorter than the template', async () => {
    const result = await adapter.generate({
      templateBytes: cases[0].bytes,
      template: { ...PARTS_TEMPLATE, itemRegion: { ...PARTS_TEMPLATE.itemRegion, minDisplayRows: 1 } },
      business: SAMPLE_BUSINESS_A,
      quotation: sampleQuotation(1),
    })
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
    expect(result.workbook.layout.rowDelta).toBe(-2)
    expect(result.workbook.layout.addresses['totals.subtotal']).toBe('F11')
  })

  it('moves a footer picture with the footer and leaves the header picture alone', async () => {
    const workbook = await generate(cases[0], 15)
    const { sheet } = await reopen(workbook, 'Quotation')
    const rows = sheet.getImages().map(({ range }) => range.tl.nativeRow).sort((a, b) => a - b)
    expect(rows).toEqual([0, 15 + 12])
  })

  it('keeps formula-looking text as literal text', async () => {
    const workbook = await generate(cases[0], 15)
    const { sheet } = await reopen(workbook, 'Quotation')
    const cell = sheet.getCell('A13')
    expect(cell.value).toBe(FORMULA_LIKE_DESCRIPTION)
    expect(cell.type).toBe(ExcelJS.ValueType.String)
  })

  it('shows FREE on a numeric zero price', async () => {
    const workbook = await generate(cases[0], 3)
    const { sheet } = await reopen(workbook, 'Quotation')
    expect(sheet.getCell('E11').value).toBe(0)
    expect(sheet.getCell('E11').numFmt).toContain('"FREE"')
  })

  it('writes a percentage discount as a live formula', async () => {
    const workbook = await generate(cases[0], 3, true)
    const { sheet } = await reopen(workbook, 'Quotation')
    const discount = sheet.getCell(workbook.layout.addresses['totals.discount']).value as ExcelJS.CellFormulaValue
    expect(discount.formula).toBe(`ROUND(${workbook.layout.addresses['totals.subtotal']}*5/100,2)`)
  })

  describe('other worksheets', () => {
    const withExtraSheet = async (edit?: (sheet: ExcelJS.Worksheet) => void) => {
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(cases[0].bytes as unknown as ExcelJS.Buffer)
      workbook.addWorksheet('Old quotes').getCell('A1').value = 'HISTORICAL CUSTOMER'
      edit?.(workbook.getWorksheet('Quotation')!)
      return new Uint8Array((await workbook.xlsx.writeBuffer()) as unknown as ArrayBuffer)
    }

    it('keeps historical worksheets out of the generated file', async () => {
      const templateBytes = await withExtraSheet()
      const result = await adapter.generate({ templateBytes, template: PARTS_TEMPLATE, business: SAMPLE_BUSINESS_A, quotation: sampleQuotation(3) })
      if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
      const { reader } = await reopen(result.workbook, 'Quotation')
      expect(reader.worksheets.map(({ name }) => name)).toEqual(['Quotation'])
      expect(await packageText(result.workbook, 'xl/sharedStrings.xml')).not.toContain('HISTORICAL CUSTOMER')
    })

    it('blocks a formula that reads a worksheet being removed', async () => {
      const templateBytes = await withExtraSheet((sheet) => {
        sheet.getCell('C16').value = { formula: "'Old quotes'!A1" }
      })
      const result = await adapter.generate({ templateBytes, template: PARTS_TEMPLATE, business: SAMPLE_BUSINESS_A, quotation: sampleQuotation(3) })
      expect(result.ok ? [] : result.diagnostics.map(({ code }) => code)).toContain('CROSS_SHEET_FORMULA')
    })
  })

  it('widens a narrow amount column so totals never print as ####', async () => {
    const narrow = new ExcelJS.Workbook()
    await narrow.xlsx.load(cases[0].bytes as unknown as ExcelJS.Buffer)
    const narrowSheet = narrow.getWorksheet('Quotation')!
    narrowSheet.getColumn('F').width = 6
    narrowSheet.getCell('F15').font = { bold: true, size: 14 }
    const templateBytes = new Uint8Array((await narrow.xlsx.writeBuffer()) as unknown as ArrayBuffer)

    const result = await adapter.generate({ templateBytes, template: PARTS_TEMPLATE, business: SAMPLE_BUSINESS_A, quotation: sampleQuotation(30) })
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
    expect(result.workbook.diagnostics.map(({ code }) => code)).toContain('COLUMN_WIDENED')

    const { sheet } = await reopen(result.workbook, 'Quotation')
    expect(sheet.getColumn('F').width).toBeGreaterThanOrEqual(13)
  })

  it('leaves a column alone when its amounts already fit', async () => {
    const workbook = await generate(cases[0], 3)
    expect(workbook.diagnostics.map(({ code }) => code)).not.toContain('COLUMN_WIDENED')
  })

  it('puts labor in its own cell when the template has one', async () => {
    const cellMappings = PARTS_TEMPLATE.cellMappings.map((mapping) =>
      mapping.semanticKey === 'totals.subtotal' ? { ...mapping, semanticKey: 'totals.labor' as const } : mapping,
    )
    const result = await adapter.generate({
      templateBytes: cases[0].bytes,
      template: { ...PARTS_TEMPLATE, cellMappings },
      business: SAMPLE_BUSINESS_A,
      quotation: sampleQuotation(15, { percentDiscount: true }),
    })
    if (!result.ok) throw new Error(JSON.stringify(result.diagnostics))
    const { sheet } = await reopen(result.workbook, 'Quotation')
    const { addresses, lastItemRow } = result.workbook.layout

    expect(lastItemRow).toBe(10 + 14 - 1)
    expect(sheet.getCell(addresses['totals.labor']).value).toBe(500)
    const items = `SUM(F10:F${lastItemRow})+${addresses['totals.labor']}`
    const discount = sheet.getCell(addresses['totals.discount']).value as ExcelJS.CellFormulaValue
    expect(discount.formula).toBe(`ROUND((${items})*5/100,2)`)
    const grand = sheet.getCell(addresses['totals.grandTotal']).value as ExcelJS.CellFormulaValue
    expect(grand.formula).toBe(`ROUND((${items})-${addresses['totals.discount']},2)`)
  })

  it('never changes the stored template bytes', async () => {
    const before = cases[0].bytes.slice()
    await generate(cases[0], 30)
    expect(cases[0].bytes).toEqual(before)
  })

  describe('blocked generation', () => {
    const generateWith = (template: TemplateDefinition) =>
      adapter.generate({
        templateBytes: cases[0].bytes,
        template,
        business: SAMPLE_BUSINESS_A,
        quotation: sampleQuotation(3),
      })

    const codes = async (template: TemplateDefinition) => {
      const result = await generateWith(template)
      return result.ok ? [] : result.diagnostics.map(({ code }) => code)
    }

    it('T-05: rejects a mapping to a merged non-anchor cell', async () => {
      const cellMappings = PARTS_TEMPLATE.cellMappings.map((mapping) =>
        mapping.semanticKey === 'customer.name' ? { ...mapping, address: 'C6' } : mapping,
      )
      expect(await codes({ ...PARTS_TEMPLATE, cellMappings })).toContain('MAPPING_NOT_MERGE_ANCHOR')
    })

    it('T-15: rejects colliding and missing mappings', async () => {
      const colliding = PARTS_TEMPLATE.cellMappings.map((mapping) =>
        mapping.semanticKey === 'quote.number' ? { ...mapping, address: 'E6' } : mapping,
      )
      expect(await codes({ ...PARTS_TEMPLATE, cellMappings: colliding })).toContain('MAPPING_CONFLICT')

      const missing = PARTS_TEMPLATE.cellMappings.filter((mapping) => mapping.semanticKey !== 'totals.grandTotal')
      expect(await codes({ ...PARTS_TEMPLATE, cellMappings: missing })).toContain('REQUIRED_MAPPING_MISSING')
    })

    it('rejects a footer merge that crosses the item rows', async () => {
      const itemRegion = { ...PARTS_TEMPLATE.itemRegion, footerAnchorRow: 14 }
      expect(await codes({ ...PARTS_TEMPLATE, itemRegion })).toContain('MERGE_CROSSES_ITEM_REGION')
    })

    it('C-08: blocks an item with no price, and allows it once the owner leaves it out', async () => {
      const quotation = sampleQuotation(3)
      const unpriced = { ...quotation, items: quotation.items.map((item, index) => (index === 2 ? { ...item, unitPriceMinor: null } : item)) }
      const blocked = await adapter.generate({ templateBytes: cases[0].bytes, template: PARTS_TEMPLATE, business: SAMPLE_BUSINESS_A, quotation: unpriced })
      expect(blocked.ok ? [] : blocked.diagnostics.map(({ code }) => code)).toContain('ITEM_PRICE_MISSING')

      const excluded = { ...unpriced, items: unpriced.items.map((item, index) => (index === 2 ? { ...item, included: false } : item)) }
      const allowed = await adapter.generate({ templateBytes: cases[0].bytes, template: PARTS_TEMPLATE, business: SAMPLE_BUSINESS_A, quotation: excluded })
      expect(allowed.ok).toBe(true)
    })

    it('rejects a quotation over the fixed capacity', async () => {
      const itemRegion = { ...PARTS_TEMPLATE.itemRegion, maxItems: 2 }
      expect(await codes({ ...PARTS_TEMPLATE, itemRegion })).toContain('TOO_MANY_ITEMS')
    })

    it('T-02: rejects a corrupt file and keeps working', async () => {
      const inspection = await adapter.inspect(new TextEncoder().encode('this is not a workbook'))
      expect(inspection.diagnostics.map(({ code }) => code)).toEqual(['NOT_XLSX'])
      const encrypted = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
      expect((await adapter.inspect(encrypted)).diagnostics[0].code).toBe('ENCRYPTED_OR_LEGACY')
      expect((await generateWith(PARTS_TEMPLATE)).ok).toBe(true)
    })
  })

  it('writes samples and a manifest for checking in real Excel', async () => {
    const manifest: Record<string, unknown>[] = []
    const record = async (testCase: Case, size: number, percentDiscount: boolean) => {
      const workbook = await generate(testCase, size, percentDiscount)
      const name = `${testCase.id}-${size}-items${percentDiscount ? '-percent' : ''}.xlsx`
      await writeFile(join(OUTPUT, name), workbook.bytes)

      // The Excel check adds 1 to the first quantity, so work out what the total should become.
      const quotation = sampleQuotation(size, { percentDiscount })
      const [first, ...rest] = quotation.items
      const edited = { ...first, quantity: String(Number(first.quantity) + 1) }
      const after = computeTotals({ ...quotation, items: [edited, ...rest] })

      const { columns, firstDataRow } = testCase.template.itemRegion
      manifest.push({
        file: name,
        sheet: testCase.template.worksheetName,
        grandTotalCell: workbook.layout.addresses['totals.grandTotal'],
        expectedGrandTotal: workbook.totals.grandTotalMinor / 100,
        editQuantityCell: `${columns.quantity}${firstDataRow}`,
        expectedAfterEdit: after.grandTotalMinor / 100,
        printArea: workbook.layout.printArea,
      })
    }

    const authored = await authoredCases()
    for (const testCase of [...cases, ...authored]) {
      for (const size of SIZES) await record(testCase, size, false)
    }
    await record(cases[0], 30, true)

    await writeFile(join(OUTPUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
    expect(JSON.parse(await readFile(join(OUTPUT, 'manifest.json'), 'utf8'))).toHaveLength(13)
  })
})

async function authoredCases(): Promise<Case[]> {
  const parts = await readFile(join(FIXTURES, 'parts-template.excel-authored.xlsx'))
  const service = await readFile(join(FIXTURES, 'service-template.features.excel-authored.xlsx'))
  return [
    { id: 'excel-parts', template: PARTS_TEMPLATE, bytes: new Uint8Array(parts), business: SAMPLE_BUSINESS_A },
    { id: 'excel-service', template: SERVICE_TEMPLATE, bytes: new Uint8Array(service), business: SAMPLE_BUSINESS_B },
  ]
}

describe('templates saved by Excel', () => {
  it('generates from an Excel-saved template without diagnostics', async () => {
    const [parts] = await authoredCases()
    const workbook = await generate(parts, 15)
    expect(workbook.diagnostics).toEqual([])
    const { sheet } = await reopen(workbook, 'Quotation')
    expect(sheet.model.merges).toContain('A1:F1')
    expect(sheet.getImages()).toHaveLength(2)
  })

  it('warns about every feature it cannot carry', async () => {
    const [, service] = await authoredCases()
    const workbook = await generate(service, 15)
    const warnings = workbook.diagnostics.filter(({ severity }) => severity === 'warning')
    expect(warnings.map(({ code }) => code).sort()).toEqual([
      'SHAPES_DROPPED',
    ])
  })

  it('moves cell notes and named ranges with the footer', async () => {
    const [, service] = await authoredCases()
    const workbook = await generate(service, 15)
    const { reader, sheet } = await reopen(workbook, 'Estimate')
    expect(sheet.getCell('H13').note).toBeUndefined()
    expect(sheet.getCell('H27').note).toBeDefined()
    expect(reader.definedNames.getRanges('GrandTotal').ranges).toEqual(['Estimate!$I$29'])
  })

  it('records which features survive the round trip', async () => {
    const [, service] = await authoredCases()
    const workbook = await generate(service, 15)
    const zip = await JSZip.loadAsync(workbook.bytes)
    const xml = await sheetXml(workbook)
    const paths = Object.keys(zip.files)
    const drawings = paths.filter((path) => /^xl\/drawings\/drawing\d+\.xml$/.test(path))
    const drawingXml = await Promise.all(drawings.map((path) => zip.file(path)!.async('string')))
    const survival = {
      textBox: drawingXml.some((xml) => xml.includes('Demo text box')),
      conditionalFormatting: xml.includes('<conditionalFormatting'),
      dataValidation: xml.includes('<dataValidation'),
      printFooter: xml.includes('Page &amp;P of &amp;N'),
      cellNote: paths.some((path) => path.startsWith('xl/comments')),
      namedRange: (await packageText(workbook, 'xl/workbook.xml')).includes('GrandTotal'),
    }
    await writeFile(join(OUTPUT, 'feature-survival.json'), JSON.stringify(survival, null, 2))
    expect(survival.textBox).toBe(false)
    expect(survival.printFooter).toBe(true)
  })
})
