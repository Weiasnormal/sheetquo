import type { Business } from './types'
import { z } from 'zod'

// Reserved layout reference for adaptive quotations with no imported design.
export const BUSINESS_LAYOUT = 'sheetquo:business-layout'

export const letterheadSchema = z.object({
  name: z.string(), address: z.string(), contact: z.string(), tax: z.string(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  logo: z.string().max(2_800_000).regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/).optional(),
  useTemplateLogo: z.boolean().optional(),
})
export type Letterhead = z.infer<typeof letterheadSchema>

export function businessLetterhead(business: Business): Letterhead {
  return {
    name: business.legalName || business.displayName,
    address: business.addressLines.join('\n'),
    contact: [...business.phones, business.email].filter(Boolean).join(' · '),
    tax: business.taxRegistrationText ?? '', currency: business.currency,
  }
}

