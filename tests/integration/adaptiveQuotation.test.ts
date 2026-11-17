import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ExcelJS from 'exceljs'
import { expect, it } from 'vitest'
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
    expect(out.getCell('A'+(header+count+1)).text).toBe('Subtotal')
    expect(out.getCell('A'+(header+count+2)).text).toBe('Discount')
    expect(out.getCell('F'+(header+count+3)).result).toBe(computeTotals(q).grandTotalMinor/100)
    if(count===3) expect(out.getCell('F'+(header+6)).result).toBe(3150)
    expect(output.rows.flat().map(cell=>cell.text).join(' ')).not.toMatch(/LESS [13]% FOR 2307/)
    expect(out.rowCount).toBe(header+count+3)
    await mkdir('private/adaptive-review',{recursive:true})
    await writeFile('private/adaptive-review/WCCE-review-'+count+'-items.xlsx',output.bytes)
  }
})


it('draws table lines and centers the letterhead when no design is used', async () => {
  const q: QuotationRecord = { id: 'lines', templateId: 'sheetquo:business-layout', templateVersionId: 'sheetquo:business-layout', businessId: 'b',
    customerName: 'Ventura Motors', quoteDateISO: '2026-11-06', items: [item, { ...item, id: 'j', description: 'Oil Filter' }],
    adjustments: [{ ...discount, mode: 'fixed', value: '100' }], createdAt: '', updatedAt: '',
    letterhead: { name: 'WCCE Auto Parts Supply', address: 'Sample Street', contact: '12345', tax: 'Non-VAT', currency: 'PHP' } }
  const output = await buildAdaptiveQuotation(q)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(toBuffer(output.bytes))
  const sheet = wb.worksheets[0]
  for (let row = 1; row <= 5; row++) expect(sheet.getCell('A' + row).alignment?.horizontal).toBe('center')
  const header = Number(sheet.pageSetup.printTitlesRow!.split(':')[0])
  for (let row = header; row <= header + 2; row++) {
    for (const column of 'ABCDEF') {
      const border = sheet.getCell(column + row).border
      expect([border?.top?.style, border?.left?.style, border?.bottom?.style, border?.right?.style]).toEqual(['thin', 'thin', 'thin', 'thin'])
    }
  }
  expect(sheet.getCell('F' + sheet.rowCount).border?.bottom?.style).toBe('double')
  expect(output.rows[header - 1].every(cell => cell.box)).toBe(true)
  expect(output.rows.at(-1)!.at(-1)!.double).toBe(true)
})
