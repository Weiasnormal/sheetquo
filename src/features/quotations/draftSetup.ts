import type { BusinessRecord } from '../../domain/business/businessForm'
import { parseQuotationText } from '../../domain/parser/parseQuotationText'
import { quotationFromParse } from '../../domain/parser/toQuotation'
import type { QuotationRecord } from '../../domain/quotation/records'
import { todayISO } from '../../domain/quotation/records'
import type { Adjustment, Quotation, QuoteItem } from '../../domain/quotation/types'
import type { SemanticKey } from '../../domain/template/types'
import type { TemplateSummary, TemplateVersionRecord } from '../../domain/template/records'
import { BUSINESS_LAYOUT, businessLetterhead } from '../../domain/quotation/letterhead'
import type { NewQuotation } from '../../infrastructure/storage/quotationRepository'

/** Templates whose active version can fill quotations. */
export const readyTemplates = (templates: TemplateSummary[]) => templates.filter(({ active }) => active)

/** A blank draft carrying the business's own defaults, never another business's details. */
export function blankDraft(business: BusinessRecord, summary?: TemplateSummary, adaptive = !summary): NewQuotation {
  return {
    businessId: business.id,
    templateId: summary?.template.id ?? BUSINESS_LAYOUT,
    templateVersionId: (summary?.active ?? summary?.version)?.id ?? BUSINESS_LAYOUT,
    letterhead: adaptive ? businessLetterhead(business) : undefined,
    quoteDateISO: todayISO(),
    customerName: '',
    items: [],
    adjustments: [],
    notes: business.defaultNotes,
    terms: business.defaultTerms,
    preparedBy: business.defaultPreparedBy,
  }
}

export function draftFromText(text: string, business: BusinessRecord, summary?: TemplateSummary, adaptive = !summary): NewQuotation {
  const defaults = blankDraft(business, summary, adaptive)
  const parse = parseQuotationText(text)
  // The repository gives the draft its id.
  const parsed: Partial<Quotation> = quotationFromParse(parse, text, { ...defaults, id: '' })
  delete parsed.id
  return { ...defaults, ...parsed, parse }
}

/** Reads the message again, replacing the items, adjustments, and any field it finds. Other fields stay. */
export function extractInto(record: QuotationRecord, text: string): QuotationRecord {
  const parse = parseQuotationText(text)
  return { ...record, ...quotationFromParse(parse, text, record), parse, answeredLines: undefined }
}

export function newItem(): QuoteItem {
  return { id: crypto.randomUUID(), description: '', quantity: '1', unitPriceMinor: null, type: 'part', included: true }
}

export function newAdjustment(kind: Adjustment['kind'], order: number): Adjustment {
  return {
    id: crypto.randomUUID(),
    label: { discount: 'Less discount', deduction: 'Less deduction', fee: 'Fee', tax: 'Tax' }[kind],
    kind,
    mode: kind === 'discount' || kind === 'fee' ? 'fixed' : 'percentage',
    value: '',
    base: 'allBillable',
    enabled: true,
    order,
  }
}

/** The id of an item's input, so a problem in the summary can take the owner straight to it. */
export const itemFieldId = (itemId: string, field: 'description' | 'quantity' | 'price') => `item-${itemId}-${field}`

export function moveItem(items: QuoteItem[], index: number, delta: -1 | 1): QuoteItem[] {
  const target = index + delta
  if (target < 0 || target >= items.length) return items
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** The version a draft fills, and whether a newer one has since become active. */
export function draftTemplate(record: Pick<QuotationRecord, 'templateId' | 'templateVersionId'>, templates: TemplateSummary[]) {
  const summary = templates.find(({ template }) => template.id === record.templateId)
  const version: TemplateVersionRecord | undefined = summary?.versions.find(({ id }) => id === record.templateVersionId)
  const newerActive = summary?.active && summary.active.id !== record.templateVersionId ? summary.active : undefined
  return { summary, version, newerActive }
}

/** The fields a version's mapping fills, so the form can say which ones will not print. */
export function mappedFields(version: TemplateVersionRecord | undefined): Set<SemanticKey> {
  const fields = version?.mapping?.fields ?? {}
  return new Set((Object.entries(fields) as [SemanticKey, string | undefined][]).filter(([, address]) => address).map(([key]) => key))
}
