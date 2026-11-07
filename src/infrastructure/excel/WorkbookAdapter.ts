import type { Totals } from '../../domain/calculations/money'
import type { Business, Quotation } from '../../domain/quotation/types'
import type { Diagnostic } from '../../domain/template/diagnostics'
import type { Region } from '../../domain/template/region'
import type { TemplateDefinition } from '../../domain/template/types'
import type { GridCell, WorkbookGridData } from '../../domain/template/grid'

export type { Diagnostic, GridCell, WorkbookGridData }

export type WorksheetSummary = {
  name: string
  state: 'visible' | 'hidden' | 'veryHidden'
  rowCount: number
  columnCount: number
  filledCellCount: number
  merges: string[]
  formulaAddresses: string[]
  imageCount: number
  hiddenRowCount: number
  hiddenColumnCount: number
  conditionalFormatCount: number
  validationCount: number
  /** Suggested quotation areas. More than one means the sheet is an archive of old quotations. */
  quoteBlocks: Region[]
  printArea?: string
  orientation?: string
  paperSize?: number
}

export type WorkbookInspection = {
  worksheets: WorksheetSummary[]
  definedNames: string[]
  diagnostics: Diagnostic[]
}

export interface OpenedWorkbook {
  readonly inspection: WorkbookInspection
  readGrid(worksheet: string, region: Region): WorkbookGridData
}

export type OpenResult = { ok: true; workbook: OpenedWorkbook } | { ok: false; diagnostics: Diagnostic[] }

export type ExtractResult = { ok: true; bytes: Uint8Array; diagnostics: Diagnostic[] } | { ok: false; diagnostics: Diagnostic[] }

export type GenerateRequest = {
  templateBytes: Uint8Array
  template: TemplateDefinition
  quotation: Quotation
  business: Business
}

export type GeneratedLayout = {
  firstItemRow: number
  lastItemRow: number
  rowDelta: number
  printArea: string
  /** Final cell address for each mapped key, after the footer has moved. */
  addresses: Record<string, string>
}

export type GeneratedWorkbook = {
  bytes: Uint8Array
  filename: string
  layout: GeneratedLayout
  totals: Totals
  diagnostics: Diagnostic[]
}

export type GenerateResult =
  | { ok: true; workbook: GeneratedWorkbook }
  | { ok: false; diagnostics: Diagnostic[] }

/** Keeps library types out of the rest of the app, so the engine can be swapped. */
export interface WorkbookAdapter {
  open(bytes: Uint8Array): Promise<OpenResult>
  inspect(bytes: Uint8Array): Promise<WorkbookInspection>
  /** Builds the clean copy: one worksheet holding only the area. The input bytes are never changed. */
  extractRegion(bytes: Uint8Array, worksheet: string, region: Region): Promise<ExtractResult>
  generate(request: GenerateRequest): Promise<GenerateResult>
}
