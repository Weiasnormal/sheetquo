export type UUID = string
export type CurrencyCode = 'PHP' | string

export type Business = {
  id: UUID
  displayName: string
  legalName?: string
  addressLines: string[]
  phones: string[]
  email?: string
  taxRegistrationText?: string
  logoBlobId?: UUID
  currency: CurrencyCode
  defaultTemplateId?: UUID
  lastTemplateId?: UUID
  defaultNotes?: string
  defaultTerms?: string
  defaultPreparedBy?: string
}

export type QuoteItem = {
  id: UUID
  description: string
  partNumber?: string
  /** Decimal string, so "1.5" never passes through binary floating point. */
  quantity: string
  unit?: string
  /** Integer centavos, or null while the price is still unknown. A quotation cannot be generated with one. */
  unitPriceMinor: number | null
  type: 'part' | 'labor' | 'service' | 'other'
  isFree?: boolean
  included: boolean
  /** Items sharing a group are alternatives, such as genuine and replacement. At most one may be included. */
  alternativeGroupId?: UUID
  notes?: string
}

export type Adjustment = {
  id: UUID
  label: string
  kind: 'discount' | 'deduction' | 'fee' | 'tax'
  mode: 'fixed' | 'percentage'
  /** Fixed amounts are decimal currency strings, percentages are rates such as "5". */
  value: string
  base: 'parts' | 'labor' | 'allBillable' | 'manual'
  manualBaseMinor?: number
  enabled: boolean
  order: number
}

export type Quotation = {
  id: UUID
  businessId: UUID
  templateVersionId: UUID
  quoteNumber?: string
  quoteDateISO: string
  customerName: string
  customerAddress?: string
  customerTIN?: string
  vehicle?: string
  engine?: string
  plate?: string
  chassis?: string
  items: QuoteItem[]
  adjustments: Adjustment[]
  preparedBy?: string
  receivedBy?: string
  checkedBy?: string
  notes?: string
  terms?: string
  /** The message as pasted, kept with the draft but never written into the quotation itself. */
  rawInput?: string
}
