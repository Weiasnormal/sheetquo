import { majorToMinor, parseDecimal } from '../calculations/money'
import { parseDate } from './dates'
import {
  DEDUCTION_2307,
  DISCOUNT_WORDS,
  EACH_WORDS,
  FIELD_LABELS,
  FREE_WORDS,
  LABOR_WORDS,
  PHONE,
  TOTAL_WORDS,
  UNIT_WORDS,
} from './vocabulary'
import type { FieldKey } from './vocabulary'

export type { FieldKey }

export type ParseNote = { code: string; message: string }
export type PriceBasis = 'each' | 'total' | 'unknown'
export type LineStatus = 'recognized' | 'incomplete' | 'needs-review' | 'unread'

export type ParsedItem = {
  description: string
  partNumber?: string
  quantity?: string
  unit?: string
  /** Set only when it is certain the amount is per piece. */
  unitPriceMinor?: number
  /** The amount as written, kept when it is unclear whether it is per piece or for all. */
  statedAmountMinor?: number
  priceBasis: PriceBasis
  isFree: boolean
  type: 'part' | 'labor'
  /** Several prices for one part, such as genuine and replacement. None is chosen for the owner. */
  priceOptions?: { label: string; priceMinor: number }[]
}

export type ParsedAdjustment = {
  kind: 'discount' | 'deduction'
  mode: 'fixed' | 'percentage'
  value: string
  label: string
  /** Deductions start off, so they apply only once the owner turns them on. */
  enabled: boolean
}

export type ParsedLine = {
  number: number
  text: string
  kind: 'field' | 'item' | 'adjustment' | 'unread'
  status: LineStatus
  notes: ParseNote[]
  field?: { key: FieldKey; value: string }
  item?: ParsedItem
  adjustment?: ParsedAdjustment
}

export type ParseResult = {
  lines: ParsedLine[]
  fields: Partial<Record<FieldKey, string>>
}

const AMOUNT = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`
const CURRENCY = String.raw`(?:₱|php\.?|p(?=\s?\d))`
const UNIT_PATTERN = Object.keys(UNIT_WORDS)
  .sort((a, b) => b.length - a.length)
  .map((word) => word.replace(/[.'*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|')

const WITH_UNIT = new RegExp(String.raw`(?<![\w.])(\d+(?:\.\d+)?)\s*(${UNIT_PATTERN})\.?(?![\w'])`, 'i')
const TIMES = new RegExp(String.raw`(?<![\w.])(\d+(?:\.\d+)?)\s*[x×]\s*${CURRENCY}?\s*${AMOUNT}(?![\w])`, 'i')
const AT_PRICE = new RegExp(String.raw`@\s*${CURRENCY}?\s*${AMOUNT}(?![\w])`, 'i')
const MONEY = new RegExp(String.raw`${CURRENCY}\s*${AMOUNT}(?![\w])`, 'gi')
const PLAIN = new RegExp(String.raw`(?<![\w.,/-])${AMOUNT}(?![\w,%]|\.\d)`, 'g')
const LEADING_QUANTITY = /^(\d+(?:\.\d+)?)\s+(?=\p{L})/u
const QUANTITY_LABEL = /\b(?:qty|quantity)\.?\s*[:=]?\s*(\d+(?:\.\d+)?)\b/i
const PART_LABEL = /\b(?:part\s*(?:no\.?|number|#)|p\/n)\s*[:#]?\s*([A-Za-z0-9][\w-]*)/i
const PERCENT = /(\d+(?:\.\d+)?)\s*%/
const FIELD_LINE = /^([\p{L}][\p{L} .#']{0,30}?)\s*[:：]\s*(.+)$/u
const PART_CELL = /^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9][\w-]*$/

const toMinor = (text: string) => majorToMinor(text.replace(/,/g, ''))
const pesos = (minor: number) => `₱${(minor / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:|,;]+|[\s\-–—:|,;@]+$/g, '')
    .trim()
}

function normalize(input: string): string[] {
  return input
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\t/g, ' | ').replace(/[ \u00A0]+/g, ' ').trim())
}

/** The price for each one when a total divides exactly by the quantity, to the centavo. */
export function unitPriceFromTotal(totalMinor: number, quantity: string): number | undefined {
  const { scaled, scale } = parseDecimal(quantity)
  const numerator = BigInt(totalMinor) * scale
  return numerator % scaled === 0n ? Number(numerator / scaled) : undefined
}

/** A pipe- or tab-separated row, such as one copied from a spreadsheet: description, part, quantity, unit, price. */
function parseTableRow(cells: string[]): ParsedItem | undefined {
  const item: ParsedItem = { description: '', priceBasis: 'each', isFree: false, type: 'part' }
  const rest: string[] = []
  for (const cell of cells) {
    const lower = cell.toLowerCase()
    if (!item.quantity && /^\d+(\.\d+)?$/.test(cell) && rest.length > 0) item.quantity = cell
    else if (!item.unit && UNIT_WORDS[lower.replace(/\.$/, '')]) item.unit = UNIT_WORDS[lower.replace(/\.$/, '')]
    else if (FREE_WORDS.test(cell) && cell.split(' ').length <= 2) item.isFree = true
    else if (item.quantity && new RegExp(String.raw`^${CURRENCY}?\s*${AMOUNT}$`, 'i').test(cell)) {
      item.unitPriceMinor = toMinor(cell.replace(new RegExp(CURRENCY, 'i'), '').trim())
    } else if (!item.partNumber && rest.length > 0 && PART_CELL.test(cell)) item.partNumber = cell
    else rest.push(cell)
  }
  item.description = tidy(rest.join(' '))
  if (item.isFree) item.unitPriceMinor = 0
  return item.description ? item : undefined
}

/** Prices written as alternatives, such as "Part A - genuine 1200 / replacement 700". */
function parseAlternatives(text: string): { description: string; options: { label: string; priceMinor: number }[] } | undefined {
  const segments = text.split(/\s+\/\s+|\s+or\s+/i)
  if (segments.length < 2) return undefined
  const last = new RegExp(String.raw`^(.*?)\b([\p{L}][\p{L} ]*?)\s*${CURRENCY}?\s*${AMOUNT}\s*$`, 'iu')
  const options: { label: string; priceMinor: number }[] = []
  let description = ''
  for (const [index, segment] of segments.entries()) {
    const match = last.exec(segment.trim())
    if (!match) return undefined
    if (index === 0) description = match[1]
    else if (tidy(match[1])) return undefined
    options.push({ label: match[2].trim(), priceMinor: toMinor(match[3]) })
  }
  return { description: tidy(description), options }
}

function parseItem(text: string): { item?: ParsedItem; notes: ParseNote[] } {
  const notes: ParseNote[] = []
  let rest = ` ${text} `

  if (/\|/.test(text)) {
    const cells = text.split('|').map((cell) => cell.trim()).filter(Boolean)
    if (cells.length >= 3) {
      const item = parseTableRow(cells)
      if (item) return { item, notes }
    }
  }

  const phone = PHONE.exec(rest)
  if (phone) rest = rest.replace(phone[0], ' ')

  const item: ParsedItem = { description: '', priceBasis: 'unknown', isFree: false, type: 'part' }

  if (FREE_WORDS.test(rest)) {
    item.isFree = true
    rest = rest.replace(FREE_WORDS, ' ')
  }

  const part = PART_LABEL.exec(rest)
  if (part) {
    item.partNumber = part[1]
    rest = rest.replace(part[0], ' ')
  }

  const times = TIMES.exec(rest)
  if (times) {
    item.quantity = times[1]
    item.unitPriceMinor = toMinor(times[2])
    item.priceBasis = 'each'
    rest = rest.replace(times[0], ' ')
  }

  const withUnit = WITH_UNIT.exec(rest)
  if (withUnit && !item.quantity) {
    item.quantity = withUnit[1]
    item.unit = UNIT_WORDS[withUnit[2].toLowerCase()]
    rest = rest.replace(withUnit[0], ' ')
  }

  const labelled = QUANTITY_LABEL.exec(rest)
  if (labelled && !item.quantity) {
    item.quantity = labelled[1]
    rest = rest.replace(labelled[0], ' ')
  }

  if (!item.quantity) {
    const leading = LEADING_QUANTITY.exec(rest.trim())
    if (leading) {
      item.quantity = leading[1]
      rest = rest.trim().slice(leading[0].length)
    }
  }

  if (!item.isFree && item.unitPriceMinor === undefined) {
    const alternatives = parseAlternatives(tidy(rest))
    if (alternatives) {
      item.priceOptions = alternatives.options
      item.description = alternatives.description
      notes.push({
        code: 'ALTERNATIVE_PRICES',
        message: `Several prices are given (${alternatives.options.map(({ label, priceMinor }) => `${label} ${pesos(priceMinor)}`).join(', ')}). Choose one.`,
      })
      return { item, notes }
    }

    const at = AT_PRICE.exec(rest)
    if (at) {
      item.statedAmountMinor = toMinor(at[1])
      item.priceBasis = 'each'
      rest = rest.replace(at[0], ' ')
    } else {
      const money = [...rest.matchAll(MONEY)]
      const plain = [...rest.matchAll(PLAIN)]
      const chosen = money.at(-1) ?? plain.at(-1)
      if (chosen) {
        item.statedAmountMinor = toMinor(chosen[1])
        rest = rest.slice(0, chosen.index) + ' ' + rest.slice(chosen.index! + chosen[0].length)
      }
    }
  }

  if (item.priceBasis === 'unknown' && EACH_WORDS.test(rest)) item.priceBasis = 'each'
  else if (item.priceBasis === 'unknown' && TOTAL_WORDS.test(rest)) item.priceBasis = 'total'
  rest = rest.replace(EACH_WORDS, ' ').replace(TOTAL_WORDS, ' ')
  item.description = tidy(rest)

  const hasSignal = item.quantity || item.statedAmountMinor !== undefined || item.unitPriceMinor !== undefined || item.isFree || item.partNumber
  if (!hasSignal) {
    if (phone) notes.push({ code: 'PHONE_NUMBER', message: 'This looks like a phone number, so it was not read as an item.' })
    return { notes }
  }
  return { item, notes }
}

/** Settles the price from what was found and says exactly what is still unclear. */
function settle(item: ParsedItem, notes: ParseNote[]): LineStatus {
  let status: LineStatus = 'recognized'
  const flag = (next: LineStatus) => {
    if (status === 'recognized' || (status === 'incomplete' && next === 'needs-review')) status = next
  }

  if (item.isFree) {
    item.unitPriceMinor = 0
    item.statedAmountMinor = undefined
  } else if (item.priceOptions) {
    flag('needs-review')
  } else if (item.unitPriceMinor === undefined && item.statedAmountMinor !== undefined) {
    const stated = item.statedAmountMinor
    if (item.priceBasis === 'each') {
      item.unitPriceMinor = stated
      item.statedAmountMinor = undefined
    } else if (item.priceBasis === 'total' && item.quantity) {
      const unit = unitPriceFromTotal(stated, item.quantity)
      if (unit === undefined) {
        notes.push({
          code: 'TOTAL_DOES_NOT_DIVIDE',
          message: `${pesos(stated)} for ${item.quantity} does not divide evenly to the centavo. Enter the price for each.`,
        })
        flag('needs-review')
      } else {
        item.unitPriceMinor = unit
        item.statedAmountMinor = undefined
      }
    } else if (item.quantity && Number(item.quantity) === 1) {
      item.unitPriceMinor = stated
      item.statedAmountMinor = undefined
    } else if (item.quantity) {
      notes.push({
        code: 'PRICE_BASIS_UNCLEAR',
        message: `Is ${pesos(stated)} the price for each one, or for all ${item.quantity}?`,
      })
      flag('needs-review')
    }
  }

  if (!item.quantity) {
    notes.push({ code: 'QUANTITY_MISSING', message: 'No quantity was found.' })
    flag('incomplete')
  }
  if (!item.isFree && !item.priceOptions && item.unitPriceMinor === undefined && item.statedAmountMinor === undefined) {
    notes.push({ code: 'PRICE_MISSING', message: 'No price was found.' })
    flag('incomplete')
  }
  if (!item.description) {
    notes.push({ code: 'DESCRIPTION_MISSING', message: 'No description was found.' })
    flag('incomplete')
  }
  return status
}

function parseLabor(text: string): ParsedLine['item'] | undefined {
  const label = LABOR_WORDS.exec(text)
  if (!label) return undefined
  const parsed = parseItem(text.slice(label[0].length)).item ?? { description: '', priceBasis: 'unknown' as const, isFree: false, type: 'part' as const }
  const description = tidy(text.slice(0, label[0].length) + ' ' + parsed.description)
  // A labor charge with no count is one charge, the way workshops write it.
  return { ...parsed, type: 'labor', description: description.charAt(0).toUpperCase() + description.slice(1), quantity: parsed.quantity ?? '1' }
}

function parseAdjustment(text: string): { adjustment: ParsedAdjustment; notes: ParseNote[] } | undefined {
  const isDeduction = DEDUCTION_2307.test(text) && /^less\b/i.test(text)
  if (!isDeduction && !DISCOUNT_WORDS.test(text)) return undefined

  const percent = PERCENT.exec(text)
  const money = new RegExp(String.raw`${CURRENCY}?\s*${AMOUNT}(?![\w%])`, 'i').exec(text.replace(DEDUCTION_2307, ''))
  if (!percent && !money) return undefined

  const label = tidy(text.replace(/[:：].*$/, '')) || 'Discount'
  const adjustment: ParsedAdjustment = {
    kind: isDeduction ? 'deduction' : 'discount',
    mode: percent ? 'percentage' : 'fixed',
    value: percent ? percent[1] : money![1].replace(/,/g, ''),
    label: label.charAt(0).toUpperCase() + label.slice(1),
    enabled: !isDeduction,
  }
  const notes: ParseNote[] = isDeduction
    ? [{ code: 'DEDUCTION_OFF', message: 'Deductions start off. Turn this one on and check its base before using it.' }]
    : [{ code: 'DISCOUNT_BASE', message: 'Taken from all billable items, labor included. Change the base if it is for parts only.' }]
  return { adjustment, notes }
}

/**
 * Turns a pasted message into fields, items, and adjustments, line by line, with no network and no
 * guessing: anything unclear is flagged for review. The same text always gives the same result.
 */
export function parseQuotationText(input: string): ParseResult {
  const lines: ParsedLine[] = []
  const fields: Partial<Record<FieldKey, string>> = {}

  normalize(input).forEach((text, index) => {
    const number = index + 1
    if (!/[\p{L}\p{N}]/u.test(text)) return

    const labor = parseLabor(text)
    if (labor) {
      const notes: ParseNote[] = []
      const status = settle(labor, notes)
      lines.push({ number, text, kind: 'item', status, notes, item: labor })
      return
    }

    const adjustment = parseAdjustment(text)
    if (adjustment) {
      lines.push({ number, text, kind: 'adjustment', status: adjustment.adjustment.enabled ? 'recognized' : 'needs-review', notes: adjustment.notes, adjustment: adjustment.adjustment })
      return
    }

    const fieldLine = FIELD_LINE.exec(text)
    const key = fieldLine ? FIELD_LABELS.find(([pattern]) => pattern.test(fieldLine[1].trim().toLowerCase().replace(/\.$/, '')))?.[1] : undefined
    if (fieldLine && key) {
      const notes: ParseNote[] = []
      let value = fieldLine[2].trim()
      let status: LineStatus = 'recognized'
      if (key === 'quoteDate') {
        const date = parseDate(value)
        if (!date) {
          notes.push({ code: 'DATE_UNREADABLE', message: `“${value}” could not be read as a date.` })
          status = 'needs-review'
        } else {
          if (date.ambiguous) {
            const readable = new Date(`${date.iso}T00:00:00Z`).toLocaleDateString('en-PH', { dateStyle: 'long', timeZone: 'UTC' })
            notes.push({ code: 'DATE_AMBIGUOUS', message: `Read as ${readable}, month first. Check it.` })
            status = 'needs-review'
          }
          value = date.iso
        }
      }
      if (fields[key] !== undefined && fields[key] !== value) {
        notes.push({ code: 'FIELD_REPEATED', message: `This repeats a field found earlier, so the first one is kept.` })
        status = 'needs-review'
      } else {
        fields[key] = value
      }
      lines.push({ number, text, kind: 'field', status, notes, field: { key, value } })
      return
    }

    const parsed = parseItem(text)
    if (!parsed.item) {
      lines.push({ number, text, kind: 'unread', status: 'unread', notes: parsed.notes })
      return
    }
    const status = settle(parsed.item, parsed.notes)
    lines.push({ number, text, kind: 'item', status, notes: parsed.notes, item: parsed.item })
  })

  return { lines, fields }
}
