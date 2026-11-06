import type { RepeatRegion, SemanticKey } from './types'

export type FieldSpec = {
  key: SemanticKey
  label: string
  source: 'business' | 'quotation' | 'calculated'
  required?: boolean
}

export const FIELD_GROUPS: { title: string; fields: FieldSpec[] }[] = [
  {
    title: 'Business',
    fields: [
      { key: 'business.name', label: 'Business name', source: 'business' },
      { key: 'business.address', label: 'Address', source: 'business' },
      { key: 'business.phone', label: 'Phone numbers', source: 'business' },
      { key: 'business.taxText', label: 'Tax registration', source: 'business' },
    ],
  },
  {
    title: 'Customer and vehicle',
    fields: [
      { key: 'customer.name', label: 'Customer name', source: 'quotation', required: true },
      { key: 'customer.address', label: 'Customer address', source: 'quotation' },
      { key: 'customer.tin', label: 'Customer TIN', source: 'quotation' },
      { key: 'vehicle.description', label: 'Vehicle', source: 'quotation' },
      { key: 'vehicle.engine', label: 'Engine', source: 'quotation' },
      { key: 'vehicle.plate', label: 'Plate', source: 'quotation' },
      { key: 'vehicle.chassis', label: 'Chassis', source: 'quotation' },
    ],
  },
  {
    title: 'Quotation',
    fields: [
      { key: 'quote.date', label: 'Date', source: 'quotation', required: true },
      { key: 'quote.number', label: 'Quotation number', source: 'quotation' },
      { key: 'quote.notes', label: 'Notes', source: 'quotation' },
      { key: 'quote.terms', label: 'Terms', source: 'quotation' },
    ],
  },
  {
    title: 'Totals',
    fields: [
      { key: 'totals.subtotal', label: 'Subtotal', source: 'calculated' },
      { key: 'totals.labor', label: 'Labor', source: 'calculated' },
      { key: 'totals.discount', label: 'Discount', source: 'calculated' },
      { key: 'totals.grandTotal', label: 'Grand total', source: 'calculated', required: true },
    ],
  },
  {
    title: 'Signatures',
    fields: [
      { key: 'signatures.preparedBy', label: 'Prepared by', source: 'quotation' },
      { key: 'signatures.checkedBy', label: 'Checked by', source: 'quotation' },
      { key: 'signatures.receivedBy', label: 'Received by', source: 'quotation' },
    ],
  },
]

export const ALL_FIELDS: FieldSpec[] = FIELD_GROUPS.flatMap(({ fields }) => fields)

export const fieldSpec = (key: SemanticKey): FieldSpec => ALL_FIELDS.find((field) => field.key === key)!

export type ItemColumnKey = keyof RepeatRegion['columns']

export const ITEM_COLUMNS: { key: ItemColumnKey; label: string; required?: boolean }[] = [
  { key: 'description', label: 'Description', required: true },
  { key: 'partNumber', label: 'Part number' },
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'unit', label: 'Unit' },
  { key: 'unitPrice', label: 'Unit price', required: true },
  { key: 'lineAmount', label: 'Amount', required: true },
  { key: 'itemNumber', label: 'Item number' },
]
