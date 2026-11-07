import { z } from 'zod'
import type { Business } from '../quotation/types'

export type BusinessRecord = Business & {
  createdAt: string
  updatedAt: string
  archivedAt?: string
}

export type BusinessInput = Omit<Business, 'id' | 'logoBlobId' | 'defaultTemplateId' | 'lastTemplateId'>

export const CURRENCIES = ['PHP', 'USD', 'EUR', 'GBP', 'SGD', 'AUD', 'JPY']

function optionalText(label: string, max: number) {
  return z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer`)
    .transform((text) => text || undefined)
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

const formSchema = z.object({
  displayName: z.string().trim().min(1, 'Enter a business name').max(120, 'Business name must be 120 characters or fewer'),
  legalName: optionalText('Legal name', 160),
  address: z.string().max(400, 'Address must be 400 characters or fewer').transform(lines),
  phones: z.string().max(200, 'Phone numbers must be 200 characters or fewer').transform(lines),
  email: z
    .string()
    .trim()
    .refine((text) => !text || z.email().safeParse(text).success, 'Enter a valid email address')
    .transform((text) => text || undefined),
  taxRegistrationText: optionalText('Tax text', 200),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Choose a currency'),
  defaultNotes: optionalText('Notes', 1000),
  defaultTerms: optionalText('Terms', 1000),
  defaultPreparedBy: optionalText('Prepared by', 120),
})

export type BusinessFormValues = z.input<typeof formSchema>
export type BusinessFormErrors = Partial<Record<keyof BusinessFormValues, string>>

export const EMPTY_BUSINESS_FORM: BusinessFormValues = {
  displayName: '',
  legalName: '',
  address: '',
  phones: '',
  email: '',
  taxRegistrationText: '',
  currency: 'PHP',
  defaultNotes: '',
  defaultTerms: '',
  defaultPreparedBy: '',
}

export function toFormValues(business: BusinessRecord): BusinessFormValues {
  return {
    displayName: business.displayName,
    legalName: business.legalName ?? '',
    address: business.addressLines.join('\n'),
    phones: business.phones.join('\n'),
    email: business.email ?? '',
    taxRegistrationText: business.taxRegistrationText ?? '',
    currency: business.currency,
    defaultNotes: business.defaultNotes ?? '',
    defaultTerms: business.defaultTerms ?? '',
    defaultPreparedBy: business.defaultPreparedBy ?? '',
  }
}

export type ParsedBusinessForm = { ok: true; input: BusinessInput } | { ok: false; errors: BusinessFormErrors }

export function parseBusinessForm(values: BusinessFormValues): ParsedBusinessForm {
  const result = formSchema.safeParse(values)
  if (result.success) {
    const { address, ...rest } = result.data
    return { ok: true, input: { ...rest, addressLines: address } }
  }

  const errors: BusinessFormErrors = {}
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof BusinessFormValues
    errors[field] ??= issue.message
  }
  return { ok: false, errors }
}

/** Guards data read back from a backup file, which may have been edited by hand. */
export const businessRecordSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  legalName: z.string().optional(),
  addressLines: z.array(z.string()),
  phones: z.array(z.string()),
  email: z.string().optional(),
  taxRegistrationText: z.string().optional(),
  logoBlobId: z.string().optional(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  defaultTemplateId: z.string().optional(),
  lastTemplateId: z.string().optional(),
  defaultNotes: z.string().optional(),
  defaultTerms: z.string().optional(),
  defaultPreparedBy: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().optional(),
})
