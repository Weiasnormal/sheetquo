import { useEffect, useState } from 'react'
import type { WorkbookGridData } from '../../domain/template/grid'
import type { TemplateVersionRecord } from '../../domain/template/records'
import { CLEAN_SHEET_NAME } from '../../domain/template/region'
import type { PrintProfile } from '../../domain/template/types'
import { numberToColumn } from '../../infrastructure/excel/a1'
import { readWorkbookBytes } from '../../infrastructure/storage/templateRepository'
import { loadAdapter } from './loadAdapter'

export type CleanGrid =
  | { status: 'loading' }
  | { status: 'failed' }
  | {
      status: 'ready'
      grid: WorkbookGridData
      bytes: Uint8Array
      defaults: { lastColumn: string; paper: PrintProfile['paper']; orientation: PrintProfile['orientation'] }
    }

/** Opens a version's clean copy once, for its grid and the page setup it came with. */
export function useCleanGrid(version: TemplateVersionRecord): CleanGrid {
  const [state, setState] = useState<CleanGrid>({ status: 'loading' })
  const { sourceBlobId, region } = version
  const rows = region.lastRow - region.firstRow + 1

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const bytes = await readWorkbookBytes(sourceBlobId)
        if (!bytes) throw new Error('missing')
        const opened = await (await loadAdapter()).open(bytes)
        if (!opened.ok) throw new Error('unreadable')
        const grid = opened.workbook.readGrid(CLEAN_SHEET_NAME, { firstRow: 1, lastRow: rows, lastColumn: region.lastColumn })
        const sheet = opened.workbook.inspection.worksheets[0]
        if (active) {
          setState({
            status: 'ready',
            grid,
            bytes,
            defaults: {
              lastColumn: numberToColumn(region.lastColumn),
              paper: sheet?.paperSize === 1 ? 'Letter' : 'A4',
              orientation: sheet?.orientation === 'landscape' ? 'landscape' : 'portrait',
            },
          })
        }
      } catch {
        if (active) setState({ status: 'failed' })
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [sourceBlobId, rows, region.lastColumn])

  return state
}
