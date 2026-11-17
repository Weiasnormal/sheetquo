import ExcelJS from 'exceljs'
import { computeTotals, lineAmountMinor } from '../../domain/calculations/money'
import { checkLogo, toDataUrl } from '../../domain/business/logo'
import { checkQuotation } from '../../domain/quotation/checkQuotation'
import type { QuotationRecord } from '../../domain/quotation/records'
import { suggestMapping } from '../../domain/template/suggestMapping'
import { readGrid } from './workbookReader'
import { scanPackage } from './packageScan'
import type { SemanticKey } from '../../domain/template/types'
import { loadWorkbook } from './exceljsHelpers'

const fields = ['description', 'partNumber', 'quantity', 'unit', 'unitPrice', 'lineAmount'] as const
const labels = ['Description', 'Part number', 'Qty', 'Unit', 'Unit price', 'Amount']
const widths = [34, 18, 9, 13, 16, 19]

function pictureSize(data: string) {
  const raw = atob(data.slice(data.indexOf(',') + 1))
  const bytes = Uint8Array.from(raw, c => c.charCodeAt(0))
  const view = new DataView(bytes.buffer)
  let width = 1, height = 1
  if (bytes[0] === 137 && bytes.length >= 24) {
    width = view.getUint32(16); height = view.getUint32(20)
  } else {
    for (let i = 2; i + 9 < bytes.length && bytes[i] === 255;) {
      const marker = bytes[i + 1], length = view.getUint16(i + 2)
      if ([192,193,194,195].includes(marker)) {
        height = view.getUint16(i + 5); width = view.getUint16(i + 7); break
      }
      if (length < 2 || marker === 218) break
      i += 2 + length
    }
  }
  const scale = Math.min(120 / (width || 1), 62 / (height || 1))
  return { width: Math.max(1,width * scale), height: Math.max(1,height * scale) }
}

export type PreviewCell = { text: string; span: number; bold?: boolean; fill?: string; color?: string; align?: 'left' | 'right' | 'center'; border?: boolean; box?: boolean; double?: boolean; size?: number; font?: string }

const THIN: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF9CA3AF' } }
const BOX: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN }
export type AdaptiveOutput = {
  bytes: Uint8Array; widths: number[]; rows: PreviewCell[][]; logo?: string; logoSize?: {width: number; height: number}; warning?: string
}

/** Only presentation is sampled from an imported sheet. All data and formulas start in an empty workbook. */
export async function buildAdaptiveQuotation(q: QuotationRecord, design?: Uint8Array): Promise<AdaptiveOutput> {
  const head = q.letterhead
  if (!head) throw new Error('Missing business letterhead.')
  const issue = checkQuotation(q).find(issue => issue.severity === 'error')
  if (issue) throw new Error(issue.message)
  if (design) {
    const unsupported = (await scanPackage(design)).find(issue => issue.severity === 'error')
    if (unsupported) throw new Error(unsupported.message)
  }
  const sourceBook = design ? await loadWorkbook(design) : undefined
  const source = sourceBook?.worksheets[0]
  if (design && !source) throw new Error('Could not read the saved quotation design.')
  const detected = source ? suggestMapping(readGrid(source, {firstRow: 1, lastRow: Math.min(120, source.rowCount), lastColumn: Math.min(30,source.columnCount)})) : undefined
  const sourceHeader = detected?.table.headerRow
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('Quotation', { views: [{showGridLines:false}] })
  const preview: PreviewCell[][] = []
  let logo = head.logo
  if (source && sourceBook && (!logo || head.useTemplateLogo)) {
    const image = source.getImages().find(image => image.range.tl.row < (sourceHeader ?? 6) - 1)
    const media = image && sourceBook.getImage(Number(image.imageId))
    if (media?.buffer) {
      const bytes = new Uint8Array(media.buffer as unknown as ArrayBuffer)
      const valid = checkLogo(bytes)
      if (valid.ok) logo = toDataUrl(bytes, valid.type)
    }
  }
  const sourceCells = fields.map(field => {
    const col = detected?.table.columns[field]
    return source && col && sourceHeader ? source.getCell(col + sourceHeader) : undefined
  })
  const actualWidths = fields.map((_,i) => {
    const cell = sourceCells[i]
    const width = cell && source?.getColumn(cell.col).width
    return width ? Math.max(widths[i] * .8, Math.min(width, 65)) : widths[i]
  })
  actualWidths.forEach((w,i) => {sheet.getColumn(i + 1).width = w})
  sheet.getColumn(7).hidden = true
  const numFmt = '"' + head.currency + '" #,##0.00;[Red]-"' + head.currency + '" #,##0.00'
  const money = new Intl.NumberFormat('en-PH', {style:'currency', currency:head.currency}).format
  function line(text: string, size = 11, bold = false, start = 1, sourceKey?: SemanticKey, center = false) {
    const row = sheet.addRow([])
    sheet.mergeCells(row.number,start,row.number,6)
    const cell = row.getCell(start)
    cell.value = text
    const anchor = sourceKey && detected?.fields[sourceKey]
    const original = anchor && source ? source.getCell(anchor) : undefined
    if (original) cell.style = structuredClone(original.style)
    cell.font = {name:'Calibri', ...cell.font, size, bold: bold || cell.font?.bold}
    cell.alignment = {...cell.alignment, vertical:'middle', wrapText:true, ...(center && !original?.alignment?.horizontal ? {horizontal:'center' as const} : {})}
    row.height = Math.max(size + 8,(size+4) * text.split('\n').reduce((n,l) => n+Math.max(1,Math.ceil(l.length/85)),0))
    return row
  }
  const heading = line(head.name, 19, true, logo ? 2 : 1, 'business.name', true)
  const logoSize = logo ? pictureSize(logo) : undefined
  if (logo && logoSize) {
    const ext = logoSize
    const id = book.addImage({base64:logo,extension:logo.startsWith('data:image/png')?'png':'jpeg'})
    sheet.addImage(id,{tl:{col:0,row:0},ext,editAs:'oneCell'})
    heading.height = Math.max(heading.height ?? 0, ext.height * .75 + 8)
  }
  // The letterhead is centered across the printed width, like a hand-made quotation header.
  if (head.address) line(head.address, 11, false, 1, 'business.address', true)
  if (head.tax) line(head.tax, 11, false, 1, 'business.taxText', true)
  if (head.contact) line(head.contact, 11, false, 1, 'business.phone', true)
  line(['Quotation',q.quoteNumber,q.quoteDateISO].filter(Boolean).join(' · '),15,true,1,undefined,true)
  line('Customer: ' + q.customerName,12,true)
  for (const [label,value] of [['Address',q.customerAddress],['TIN',q.customerTIN],['Vehicle',q.vehicle],['Engine',q.engine],['Plate',q.plate],['Chassis',q.chassis]]) if(value) line(label + ': ' + value)
  const header = sheet.addRow(labels.map((label,i) => sourceCells[i]?.text.trim() || label))
  header.height = 29
  header.eachCell((cell,i) => {
    const original = sourceCells[i-1]
    if(original) cell.style = structuredClone(original.style)
    else {
      cell.font = {bold:true,color:{argb:'FF1F2937'}}
      cell.fill = {type:'pattern',pattern:'solid',fgColor:{argb:'FFEAFBD7'}}
      cell.border = BOX
      cell.alignment = {horizontal:'center'}
    }
    cell.alignment = {...cell.alignment,wrapText:true,vertical:'middle'}
  })
  const totals = computeTotals(q)
  const first = header.number + 1
  for (const item of q.items.filter(i => i.included)) {
    const desc = [item.description,item.notes].filter(Boolean).join('\n')
    const row = sheet.addRow([desc,item.partNumber ?? '',Number(item.quantity),item.unit ?? '',item.isFree ? 0 : (item.unitPriceMinor ?? 0)/100,null,item.type])
    const n = row.number
    row.getCell(6).value = {formula:'ROUND(C'+n+'*E'+n+',2)',result:(lineAmountMinor(item) ?? 0)/100}
    fields.forEach((_,i) => {
      const cell = row.getCell(i+1), original = sourceCells[i]
      if(source && original) cell.style = structuredClone(source.getCell(original.row+1,original.col).style)
      else cell.border = BOX
      cell.alignment = {...cell.alignment,vertical:'middle',wrapText:true}
      if(i>=4) cell.numFmt = numFmt
    })
    row.height = Math.max(22, ...[desc,item.partNumber ?? '',item.unit ?? ''].map((t,i) =>
      16*t.split('\n').reduce((n,s)=>n+Math.max(1, Math.ceil(s.length / (actualWidths[[0,1,3][i]]*.85))),0)+5))
    if(row.height > 409) throw new Error('An item is too long for one Excel row. Shorten its description or split it into two lines of items.')
  }
  const last = sheet.rowCount
  function summary(label: string, value: ExcelJS.CellValue, bold = false) {
    const row = sheet.addRow([label,null,null,null,null,value])
    sheet.mergeCells(row.number,1,row.number,5)
    row.getCell(1).alignment = {horizontal:'right',wrapText:true}
    row.getCell(6).numFmt = numFmt
    row.font = {name:'Calibri',size:11,bold}
    row.height = Math.max(23,Math.ceil(label.length / 70)*16+6)
    row.getCell(6).border = bold ? {...BOX, bottom:{style:'double',color:{argb:'FF1F2937'}}} : BOX
    return row.number
  }
  const subtotal = summary('Subtotal',{formula:'ROUND(SUM(F'+first+':F'+last+'),2)',result:totals.subtotalMinor/100})
  for (const result of totals.adjustments) {
    const adj = q.adjustments.find(a=>a.id===result.id)!
    const sign = ['discount','deduction'].includes(adj.kind) ? -1 : 1
    const value = sign*result.amountMinor/100
    if(adj.mode==='fixed') { summary(adj.label,value); continue }
    const kindRange = 'G'+first+':G'+last, amountRange='F'+first+':F'+last
    const base = adj.base==='manual' ? String((adj.manualBaseMinor ?? 0)/100)
      : adj.base==='allBillable' ? 'F'+subtotal : 'SUMIF('+kindRange+',"'+(adj.base==='labor'?'labor':'<>labor')+'",'+amountRange+')'
    summary(adj.label+' ('+adj.value+'%)',{formula:(sign<0?'-':'')+'ROUND('+base+'*'+Number(adj.value)+'/100,2)',result:value})
  }
  summary('Grand total',{formula:'ROUND(SUM(F'+subtotal+':F'+sheet.rowCount+'),2)',result:totals.grandTotalMinor/100},true)
  for (const [label,value] of [['Notes',q.notes],['Terms',q.terms],['Prepared by',q.preparedBy],['Checked by',q.checkedBy],['Received by',q.receivedBy]]) if(value) line(label+': '+value)
  sheet.pageSetup = {orientation:source?.pageSetup.orientation ?? 'portrait',paperSize:source?.pageSetup.paperSize ?? 9,
    fitToPage:true,fitToWidth:1,fitToHeight:0,printArea:'A1:F'+sheet.rowCount,printTitlesRow:header.number+':'+header.number}
  book.calcProperties.fullCalcOnLoad = true
  sheet.eachRow(row => {
    const cells: PreviewCell[] = []
    for(let i=1;i<=6;i++) {
      const cell=row.getCell(i)
      if(cell.master.address !== cell.address) continue
      let span=1
      while(i+span<=6 && row.getCell(i+span).master.address===cell.address) span++
      const value=cell.type===ExcelJS.ValueType.Formula ? cell.result : cell.value
      const fill=cell.fill?.type==='pattern' && cell.fill.pattern==='solid' ? cell.fill.fgColor?.argb : undefined
      const color=cell.font?.color?.argb
      const align=cell.alignment?.horizontal
      cells.push({text:typeof value==='number' && cell.numFmt===numFmt ? money(value) : String(value ?? ''),
        span,bold:cell.font?.bold,size:cell.font?.size,font:cell.font?.name,border:!!cell.border?.bottom,
        box:!!(cell.border?.top && cell.border.left && cell.border.right && cell.border.bottom),double:cell.border?.bottom?.style==='double',
        align:align==='center'||align==='left'||align==='right'?align:typeof value==='number'?'right':'left',
        color:color?'#'+color.slice(-6):undefined,fill:fill?'#'+fill.slice(-6):undefined})
    }
    preview.push(cells)
  })
  return {bytes:new Uint8Array(await book.xlsx.writeBuffer()),widths:actualWidths,rows:preview,logo,logoSize,
    warning:source && !sourceHeader ? 'No item headings were recognized. Standard quotation columns are shown.' : undefined}
}

