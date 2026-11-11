import type { WorkbookAdapter } from '../../infrastructure/excel/WorkbookAdapter'

/** The Excel engine is large, so it loads only when a screen needs to read a workbook. */
export async function loadAdapter(): Promise<WorkbookAdapter> {
  const { ExcelJsAdapter } = await import('../../infrastructure/excel/ExcelJsAdapter')
  return new ExcelJsAdapter()
}
