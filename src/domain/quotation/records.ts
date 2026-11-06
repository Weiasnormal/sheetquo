import type { ParseResult } from '../parser/parseQuotationText'
import type { Quotation } from './types'

/** A quotation saved in this browser. It stays a draft that can be edited and generated again. */
export type QuotationRecord = Quotation & {
  templateId: string
  /** What the parser read from `rawInput`, kept so the review can show each source line after a reload. */
  parse?: ParseResult
  /** Lines the owner has made a choice on, so an item they chose to leave out stops waiting. */
  answeredLines?: number[]
  createdAt: string
  updatedAt: string
  /** When an Excel file was last made from this quotation, and its name. */
  generatedAt?: string
  generatedFilename?: string
}

/** Today's date in the browser's own time zone, as YYYY-MM-DD. */
export function todayISO(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** A name for lists and headings: the quote number, then the customer, then the date. */
export function quotationTitle(quotation: Pick<Quotation, 'quoteNumber' | 'customerName'>): string {
  const number = quotation.quoteNumber?.trim()
  const customer = quotation.customerName.trim()
  if (number && customer) return `${number} · ${customer}`
  return number || customer || 'Untitled quotation'
}
