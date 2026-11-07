/** Unit words people type, mapped to the label printed on the quotation. Extend here, not in the parser. */
export const UNIT_WORDS: Record<string, string> = {
  pc: 'PC',
  pcs: 'PC',
  piece: 'PC',
  pieces: 'PC',
  set: 'SET',
  sets: 'SET',
  assy: 'ASSY',
  assys: 'ASSY',
  "ass'y": 'ASSY',
  "ass'ys": 'ASSY',
  ltr: 'LTR',
  ltrs: 'LTR',
  liter: 'LTR',
  liters: 'LTR',
  litre: 'LTR',
  litres: 'LTR',
  kg: 'KG',
  kgs: 'KG',
  unit: 'UNIT',
  units: 'UNIT',
  pair: 'PAIR',
  pairs: 'PAIR',
  box: 'BOX',
  boxes: 'BOX',
  roll: 'ROLL',
  rolls: 'ROLL',
  gal: 'GAL',
  gallon: 'GAL',
  gallons: 'GAL',
}

/** Labels for fields that sit on their own line, such as "Customer: Ventura Motors". */
export const FIELD_LABELS: [RegExp, FieldKey][] = [
  [/^(customer|client|name|sold to|bill to|prepared for)$/, 'customerName'],
  [/^(customer address|address)$/, 'customerAddress'],
  [/^(tin|customer tin)$/, 'customerTIN'],
  [/^(date|quotation date|quote date)$/, 'quoteDate'],
  [/^(quote|quotation|estimate|ref|reference) ?(no\.?|number|#)?$/, 'quoteNumber'],
  [/^(vehicle|unit|model|make|truck)$/, 'vehicle'],
  [/^engine( no\.?| model)?$/, 'engine'],
  [/^plate( no\.?| number)?$/, 'plate'],
  [/^(chassis|vin)( no\.?| number)?$/, 'chassis'],
  [/^(remarks?|notes?|note)$/, 'notes'],
]

export type FieldKey =
  | 'customerName'
  | 'customerAddress'
  | 'customerTIN'
  | 'quoteDate'
  | 'quoteNumber'
  | 'vehicle'
  | 'engine'
  | 'plate'
  | 'chassis'
  | 'notes'

export const LABOR_WORDS = /^(labou?r|installation|install|service fee|service charge|workmanship)\b/i
export const DISCOUNT_WORDS = /^(less )?discount\b|^less\b(?!.*\b2307\b)/i
export const DEDUCTION_2307 = /\b2307\b/
export const FREE_WORDS = /\b(free|foc|f\.o\.c\.?|no charge|complimentary)\b/i
export const EACH_WORDS = /\b(each|ea\.?|per (pc|piece|unit|set)|\/(pc|piece|unit|set|ea))\b/i
export const TOTAL_WORDS = /\b(total|all in|for all|in all|lot)\b/i
/** A Philippine mobile or landline number, which must never become a price. */
export const PHONE = /(\+?63[\s-]?|0)9\d{2}[\s-]?\d{3}[\s-]?\d{4}\b|\(0\d{1,2}\)\s?\d{3,4}[\s-]?\d{4}\b/
