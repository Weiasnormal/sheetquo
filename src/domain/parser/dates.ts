const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

export type ParsedDate = { iso: string; ambiguous: boolean } | undefined

function iso(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const monthOf = (word: string) => MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1

/**
 * Reads the date formats people type in the Philippines. Slashed dates are read month first, the
 * local habit, and flagged as ambiguous when the day could also be a month.
 */
export function parseDate(text: string): ParsedDate {
  const value = text.trim().replace(/,/g, ' ').replace(/\s+/g, ' ')

  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value)
  if (match) {
    const result = iso(Number(match[1]), Number(match[2]), Number(match[3]))
    return result ? { iso: result, ambiguous: false } : undefined
  }

  match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(value)
  if (match) {
    const first = Number(match[1])
    const second = Number(match[2])
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])
    const result = iso(year, first, second)
    if (result) return { iso: result, ambiguous: first !== second && first <= 12 && second <= 12 }
    // Day first, when month first is impossible (for example 25/11/2026).
    const dayFirst = iso(year, second, first)
    return dayFirst ? { iso: dayFirst, ambiguous: false } : undefined
  }

  match = /^([A-Za-z]{3,9})\.? (\d{1,2}) (\d{4})$/.exec(value)
  if (match && monthOf(match[1]) > 0) {
    const result = iso(Number(match[3]), monthOf(match[1]), Number(match[2]))
    return result ? { iso: result, ambiguous: false } : undefined
  }

  match = /^(\d{1,2}) ([A-Za-z]{3,9})\.? (\d{4})$/.exec(value)
  if (match && monthOf(match[2]) > 0) {
    const result = iso(Number(match[3]), monthOf(match[2]), Number(match[1]))
    return result ? { iso: result, ambiguous: false } : undefined
  }

  return undefined
}
