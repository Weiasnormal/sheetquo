import { z } from 'zod'
import type { QuotationRecord } from './records'

const text = z.string()
const id = text.min(1)
const optionalText = text.optional()
const minor = z.number().int().safe()
const fieldKey = z.enum(['customerName', 'customerAddress', 'customerTIN', 'quoteNumber', 'quoteDate', 'vehicle', 'engine', 'plate', 'chassis', 'notes'])
const parsedAdjustment = z.object({
  kind: z.enum(['discount', 'deduction']), mode: z.enum(['fixed', 'percentage']),
  value: text, label: text, enabled: z.boolean(),
})

/** Drafts may be incomplete, but their structure must be safe for the editor and parser review. */
export const quotationRecordSchema: z.ZodType<QuotationRecord> = z.object({
  id, businessId: id, templateId: id, templateVersionId: id,
  quoteNumber: optionalText, quoteDateISO: text, customerName: text,
  customerAddress: optionalText, customerTIN: optionalText, vehicle: optionalText,
  engine: optionalText, plate: optionalText, chassis: optionalText,
  preparedBy: optionalText, receivedBy: optionalText, checkedBy: optionalText,
  notes: optionalText, terms: optionalText, rawInput: optionalText,
  createdAt: text, updatedAt: text, generatedAt: optionalText, generatedFilename: optionalText,
  answeredLines: z.array(z.number().int().positive()).optional(),
  items: z.array(z.object({
    id, description: text, partNumber: optionalText, quantity: text, unit: optionalText,
    unitPriceMinor: minor.nullable(), type: z.enum(['part', 'labor', 'service', 'other']),
    isFree: z.boolean().optional(), included: z.boolean(), alternativeGroupId: optionalText, notes: optionalText,
  })),
  adjustments: z.array(z.object({
    id, label: text, kind: z.enum(['discount', 'deduction', 'fee', 'tax']),
    mode: z.enum(['fixed', 'percentage']), value: text,
    base: z.enum(['parts', 'labor', 'allBillable', 'manual']), manualBaseMinor: minor.optional(),
    enabled: z.boolean(), order: z.number().int(),
  })),
  parse: z.object({
    fields: z.partialRecord(fieldKey, text),
    lines: z.array(z.object({
      number: z.number().int().positive(), text,
      kind: z.enum(['field', 'item', 'adjustment', 'unread']),
      status: z.enum(['recognized', 'incomplete', 'needs-review', 'unread']),
      notes: z.array(z.object({ code: text, message: text })),
      field: z.object({ key: fieldKey, value: text }).optional(),
      adjustment: parsedAdjustment.optional(),
      item: z.object({
        description: text, partNumber: optionalText, quantity: optionalText, unit: optionalText,
        unitPriceMinor: minor.optional(), statedAmountMinor: minor.optional(),
        priceBasis: z.enum(['each', 'total', 'unknown']), isFree: z.boolean(), type: z.enum(['part', 'labor']),
        priceOptions: z.array(z.object({ label: text, priceMinor: minor })).optional(),
      }).optional(),
    })),
  }).optional(),
})
