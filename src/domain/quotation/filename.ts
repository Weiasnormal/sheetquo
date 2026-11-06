import type { Business, Quotation } from './types'

function slug(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function quotationFilename(
  business: Pick<Business, 'displayName'>,
  quotation: Pick<Quotation, 'id' | 'quoteNumber' | 'quoteDateISO'>,
): string {
  const year = quotation.quoteDateISO.slice(0, 4)
  const number = slug(quotation.quoteNumber ?? '') || quotation.id.slice(0, 8)
  return `${slug(business.displayName) || 'Quotation'}-Q-${year}-${number}.xlsx`
}
