import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildAdaptiveQuotation } from '../../src/infrastructure/excel/adaptiveQuotation'
import { toBuffer } from '../../src/infrastructure/excel/exceljsHelpers'
import { blankDraft } from '../../src/features/quotations/draftSetup'
import { createBusiness, updateBusiness } from '../../src/infrastructure/storage/businessRepository'
import { createQuotation, readQuotation } from '../../src/infrastructure/storage/quotationRepository'
import { createBackup, readBackup } from '../../src/infrastructure/storage/backup'
import { restoreBackup } from '../../src/infrastructure/storage/restoreBackup'
import type { QuoteItem } from '../../src/domain/quotation/types'
import type { QuotationRecord } from '../../src/domain/quotation/records'
import { computeTotals } from '../../src/domain/calculations/money'
import { db } from '../../src/infrastructure/storage/db'

const logo = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jaisAAAAASUVORK5CYII='
const owner = {displayName:'Sample Parts',addressLines:['Sample Street'],phones:['12345'],currency:'PHP'}
const item: QuoteItem = {id:'i',description:'Brake Pad',quantity:'2',unitPriceMinor:120000,included:true,type:'part'}
const discount = {id:'d',label:'Discount',kind:'discount',base:'parts',mode:'percentage',value:'10',enabled:true,order:0} as const

it('quotes without templates, retains historical branding and restores a portable copy',async()=>{
  await Promise.all(db.tables.map(t=>t.clear()))
  const business = await createBusiness(owner,{kind:'replace',logo:{bytes:Uint8Array.from(Buffer.from(logo,'base64')),type:'image/png',name:'sample.png'}})
  if(!business.ok) throw Error('business setup')
  const draft = blankDraft(business.value)
  const saved = await createQuotation({...draft,customerName:'Test customer',items:[item],adjustments:[discount]})
  if(!saved.ok) throw Error(saved.error.message)
  await updateBusiness(business.value.id,{...owner,displayName:'Changed business'}, {kind:'remove'})
  const record = (await readQuotation(saved.value.id))!
  const output = await buildAdaptiveQuotation(record)
  expect(output.logo).toContain(logo)
  expect(output.rows.flat().map(c=>c.text)).toContain(owner.displayName)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(toBuffer(output.bytes))
  const sheet=wb.worksheets[0]
  expect(sheet.getImages()).toHaveLength(1)
  expect(sheet.getCell('F'+sheet.rowCount).result).toBe(2160)
  const backup=await createBackup(undefined,{includeDrafts:true})
  expect((await readBackup(backup.bytes)).ok).toBe(true)
  expect((await restoreBackup(backup.bytes,'copy')).ok).toBe(true)
  const restored=(await db.quotations.toArray()).find(q=>q.id!==record.id)!
  expect(restored.letterhead).toEqual(record.letterhead)
  expect(restored.businessId).not.toBe(record.businessId)
  expect((await buildAdaptiveQuotation(restored)).rows).toEqual(output.rows)
})

const examples = process.env.SHEETQUO_WCCE_EXAMPLES
it.skipIf(!examples)('rebuilds the real WCCE example from its Excel design at 3, 5 and 30 items', async()=>{
  const sample=await readFile(path.join(examples!,'Sample-Template-v1-test-15-items.xlsx'))
  const existing=await readFile(path.join(examples!,'WCCE-AUTO-PARTS-SUPPLY-Q-2026-66e03757.xlsx'))
  const original = new ExcelJS.Workbook()
  await original.xlsx.load(toBuffer(existing))
  const sheet=original.worksheets[0]
  expect(sheet.getCell('G30').value).toBe(-1157.01)
  const actual = [12,13,14].map((n):QuoteItem=>({...item,id:String(n),description:sheet.getCell('A'+n).text,quantity:sheet.getCell('D'+n).text,unit:sheet.getCell('E'+n).text,unitPriceMinor:Number(sheet.getCell('F'+n).value)*100,type:n===14?'labor':'part'}))
  for (const count of [3,5,30]) {
    const items=Array.from({length:count},(_,i)=>({...actual[i%3],id:String(i)}))
    const q:QuotationRecord={id:'local-review',templateId:'design',templateVersionId:'v1',businessId:'wcce',customerName:sheet.getCell('A9').text,
      quoteDateISO:'2026-11-05',items,adjustments:[{...discount,mode:'fixed',value:'100'}],createdAt:'',updatedAt:'',
      letterhead:{name:sheet.getCell('C1').text,address:sheet.getCell('C2').text,contact:sheet.getCell('C4').text,tax:sheet.getCell('C3').text,currency:'PHP'}}
    const output=await buildAdaptiveQuotation(q,sample)
    const wb=new ExcelJS.Workbook()
    await wb.xlsx.load(toBuffer(output.bytes))
    const out=wb.worksheets[0]
    const header=Number(out.pageSetup.printTitlesRow!.split(':')[0].replace(/\D/g,''))
    expect(out.getCell('A'+header).text.trim()).toBe('PARTS NAME')
    expect(out.getCell('D'+(header+count+2)).text).toBe('Subtotal')
    expect(out.getCell('D'+(header+count+4)).text).toBe('Discount')
    expect(out.getCell('F'+(header+count+6)).result).toBe(computeTotals(q).grandTotalMinor/100)
    if(count===3) expect(out.getCell('F'+(header+9)).result).toBe(3150)
    expect(output.rows.flat().map(cell=>cell.text).join(' ')).not.toMatch(/LESS [13]% FOR 2307/)
    expect(out.rowCount).toBe(header+count+6)
    await mkdir('private/adaptive-review',{recursive:true})
    await writeFile('private/adaptive-review/WCCE-review-'+count+'-items.xlsx',output.bytes)
  }
})


describe('the letterhead layout without a design', () => {
  const q: QuotationRecord = { id: 'lines', templateId: 'sheetquo:business-layout', templateVersionId: 'sheetquo:business-layout', businessId: 'b',
    customerName: 'Ventura Motors', vehicle: 'Foton Tornado 4.4', quoteDateISO: '2026-11-06', quoteNumber: 'Q-7',
    items: [{ ...item, partNumber: 'BP-1', unit: 'PC' }, { ...item, id: 'j', description: 'Oil Filter' }],
    adjustments: [{ ...discount, mode: 'fixed', value: '100' }], preparedBy: 'Sir Winmar Crusit', receivedBy: 'Mam Beth', createdAt: '', updatedAt: '',
    letterhead: { name: 'WCCE Auto Parts Supply', address: 'Sample Street', contact: '12345', tax: 'Non-VAT', currency: 'PHP' } }

  async function build() {
    const output = await buildAdaptiveQuotation(q)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(toBuffer(output.bytes))
    const sheet = wb.worksheets[0]
    const header = Number(sheet.pageSetup.printTitlesRow!.split(':')[0])
    const rowOf = (text: string) => { let found = 0; sheet.eachRow((row, n) => { row.eachCell(cell => { if (!found && cell.text === text) found = n }) }); return found }
    return { output, sheet, header, rowOf }
  }

  it('centers every header line, then leaves a gap before the bordered customer details', async () => {
    const { sheet, header } = await build()
    expect(sheet.getCell('A5').text).toBe('QUOTATION No. Q-7')
    for (let row = 1; row <= 5; row++) expect(sheet.getCell('A' + row).alignment?.horizontal).toBe('center')
    expect(sheet.model.merges).toContain('A1:F1')
    expect(sheet.getCell('A6').text).toBe('')
    expect(sheet.getCell('A7').text).toBe('Date: November 6, 2026')
    expect(sheet.getCell('D7').text).toBe('Vehicle: Foton Tornado 4.4')
    expect(sheet.getCell('A8').text).toBe('Name: Ventura Motors')
    for (const cell of ['A7', 'D7', 'A8']) expect(sheet.getCell(cell).alignment?.horizontal).toBe('left')
    expect(sheet.getCell('A7').border?.top?.style).toBe('thin')
    expect(header).toBe(9)
  })

  it('boxes the item table, centers headings, part number, quantity and unit, and keeps money on the right', async () => {
    const { sheet, header } = await build()
    expect(sheet.getCell('A' + header).fill).not.toMatchObject({ pattern: 'solid' })
    for (const column of 'ABCDEF') expect(sheet.getCell(column + header).alignment?.horizontal).toBe('center')
    const aligned = [...'ABCDEF'].map(column => sheet.getCell(column + (header + 1)).alignment?.horizontal)
    expect(aligned).toEqual(['left', 'center', 'center', 'center', 'right', 'right'])
    for (let row = header; row <= header + 2; row++) for (const column of 'ABCDEF') {
      const border = sheet.getCell(column + row).border
      expect([border?.top?.style, border?.left?.style, border?.bottom?.style, border?.right?.style]).toEqual(['thin', 'thin', 'thin', 'thin'])
    }
    expect(sheet.getCell('E' + (header + 1)).numFmt).toBe('"PHP" #,##0.00;[Red]-"PHP" #,##0.00')
  })

  it('puts left-aligned totals on the right with gaps between them, and signatures beside them', async () => {
    const { output, sheet, rowOf } = await build()
    const subtotal = rowOf('Subtotal'), discountRow = rowOf('Discount'), grand = rowOf('Grand total')
    expect(sheet.getCell('D' + subtotal).alignment?.horizontal).toBe('left')
    expect([discountRow - subtotal, grand - discountRow]).toEqual([2, 2])
    expect(sheet.getCell('A' + subtotal).text).toBe('Prepared by: Sir Winmar Crusit')
    expect(sheet.getCell('A' + discountRow).text).toBe('Received by: Mam Beth')
    expect(sheet.getCell('F' + discountRow).value).toBe(-100)
    expect(sheet.getCell('F' + discountRow).border?.left?.color?.argb).toBe('FFDC2626')
    expect([sheet.getCell('D' + discountRow).font?.color?.argb, sheet.getCell('F' + discountRow).font?.color?.argb]).toEqual(['FFDC2626', 'FFDC2626'])
    expect(sheet.getCell('D' + subtotal).font?.color?.argb).toBeUndefined()
    expect(sheet.getCell('F' + grand).alignment?.horizontal).toBe('right')
    expect(sheet.getCell('F' + grand).fill).toMatchObject({ fgColor: { argb: 'FFFFFF00' } })
    expect(sheet.getCell('F' + grand).result).toBe(computeTotals(q).grandTotalMinor / 100)
    const texts = output.rows.flat().map(cell => cell.text)
    expect(texts).toContain('-PHP 100.00')
    expect(output.rows.flat().find(cell => cell.text === '-PHP 100.00')?.color).toBe('#dc2626')
  })
})
