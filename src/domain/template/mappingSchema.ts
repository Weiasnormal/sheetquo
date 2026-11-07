import { z } from 'zod'
import { ALL_FIELDS, ITEM_COLUMNS } from './fields'

const column = z.string().regex(/^[A-Z]{1,3}$/)
const address = z.string().regex(/^[A-Z]{1,3}[1-9]\d*$/)
const row = z.number().int().positive()

const diagnosticSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  code: z.string(),
  message: z.string(),
  worksheet: z.string().optional(),
  cell: z.string().optional(),
})

/** Guards a mapping read back from a backup file. */
export const mappingDraftSchema = z.object({
  fields: z.partialRecord(z.enum(ALL_FIELDS.map(({ key }) => key)), address),
  keepTemplateFormula: z.partialRecord(z.enum(ALL_FIELDS.map(({ key }) => key)), z.boolean()),
  table: z.object({
    headerRow: row.optional(),
    firstDataRow: row.optional(),
    prototypeRow: row.optional(),
    footerAnchorRow: row.optional(),
    minDisplayRows: z.number().int().nonnegative().optional(),
    maxItems: row.optional(),
    columns: z.partialRecord(z.enum(ITEM_COLUMNS.map(({ key }) => key)), column),
  }),
  print: z.object({
    paper: z.enum(['A4', 'Letter']),
    orientation: z.enum(['landscape', 'portrait']),
    marginsInches: z.object({ top: z.number(), bottom: z.number(), left: z.number(), right: z.number() }),
    fitToWidthPages: z.number().int().positive(),
    repeatHeaderRow: z.number().int().positive().optional(),
    headerMarginInches: z.number().min(0).max(3).optional(),
    footerMarginInches: z.number().min(0).max(3).optional(),
    horizontalCentered: z.boolean().optional(),
    keepFooterTogether: z.boolean().optional(),
    columns: z.object({ first: column, last: column }),
  }),
  clearCells: z.array(address),
  adjustmentRows: z.array(z.object({ label: z.union([address, z.literal('')]), amount: z.union([address, z.literal('')]), base: address.optional(), rate: address.optional() })).max(50).optional(),
  output: z.object({
    moneyFormat: z.enum(['template', 'business']), dateFormat: z.enum(['template', 'iso', 'short', 'long']),
    minRowHeight: z.number().min(1).max(409).optional(), maxRowHeight: z.number().min(1).max(409).optional(),
  }).optional(),
})

/** Autosaved drafts can contain half-typed addresses and invalid finite numbers awaiting correction. */
export const editableMappingDraftSchema = mappingDraftSchema.extend({
  fields: z.partialRecord(z.enum(ALL_FIELDS.map(({ key }) => key)), z.string().max(64)),
  table: mappingDraftSchema.shape.table.extend({
    headerRow: z.number().optional(), firstDataRow: z.number().optional(), prototypeRow: z.number().optional(),
    footerAnchorRow: z.number().optional(), minDisplayRows: z.number().optional(), maxItems: z.number().optional(),
    columns: z.partialRecord(z.enum(ITEM_COLUMNS.map(({ key }) => key)), z.string().max(16)),
  }),
  adjustmentRows: z.array(z.object({ label: z.string().max(64), amount: z.string().max(64), base: z.string().max(64).optional(), rate: z.string().max(64).optional() })).max(50).optional(),
  output: mappingDraftSchema.shape.output.unwrap().extend({ minRowHeight: z.number().optional(), maxRowHeight: z.number().optional() }).optional(),
  print: mappingDraftSchema.shape.print.extend({ fitToWidthPages: z.number(), repeatHeaderRow: z.number().optional(), headerMarginInches: z.number().optional(), footerMarginInches: z.number().optional(), columns: z.object({ first: z.string().max(16), last: z.string().max(16) }) }),
})

export const testResultSchema = z.object({
  testedAt: z.string(),
  status: z.enum(['compatible', 'warnings', 'unsupported']),
  runs: z.array(
    z.object({
      items: z.number().int().positive(),
      ok: z.boolean(),
      grandTotalMinor: z.number().int().optional(),
      printArea: z.string().optional(),
      diagnostics: z.array(diagnosticSchema),
    }),
  ),
})

export { diagnosticSchema }
