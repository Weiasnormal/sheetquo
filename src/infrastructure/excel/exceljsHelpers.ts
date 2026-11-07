import ExcelJS from 'exceljs'

export function toBuffer(bytes: Uint8Array): ExcelJS.Buffer {
  return bytes as unknown as ExcelJS.Buffer
}

export function mergesOf(sheet: ExcelJS.Worksheet): string[] {
  return sheet.model.merges ?? []
}

/** ExcelJS keeps both of these on the model but leaves them out of its public types. */
export function formattingOf(sheet: ExcelJS.Worksheet): {
  conditionalFormattings: { ref: string }[]
  dataValidations: Record<string, unknown>
} {
  const model = sheet.model as unknown as {
    conditionalFormattings?: { ref: string }[]
    dataValidations?: Record<string, unknown>
  }
  return { conditionalFormattings: model.conditionalFormattings ?? [], dataValidations: model.dataValidations ?? {} }
}

export function isFilled(cell: ExcelJS.Cell): boolean {
  if (cell.type === ExcelJS.ValueType.Merge || cell.type === ExcelJS.ValueType.Null) return false
  return String(cell.text ?? '').trim() !== ''
}

export async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook | undefined> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(toBuffer(bytes))
    return workbook
  } catch {
    return undefined
  }
}

export const UNREADABLE = {
  severity: 'error' as const,
  code: 'NOT_XLSX',
  message: 'Could not read this workbook. Open it in Excel, save it again as .xlsx, and retry.',
}
