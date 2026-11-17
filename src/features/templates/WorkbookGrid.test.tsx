// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { WorkbookGridData } from '../../infrastructure/excel/WorkbookAdapter'
import { WorkbookGrid } from './WorkbookGrid'

afterEach(cleanup)

const columns = ['A', 'B', 'C', 'D', 'E'].map((letter) => ({ letter, width: 10 }))
const grid = (cells: WorkbookGridData['rows'][number]['cells']): WorkbookGridData => ({ columns, rows: [{ number: 1, cells }], truncatedRows: false, truncatedColumns: false })
const cellOf = (text: string) => screen.getByText(text).closest('td')!

describe('WorkbookGrid text overflow', () => {
  it('lets a centered header spill across empty cells on both sides instead of cutting it off', () => {
    render(<WorkbookGrid caption="Sheet" grid={grid([{ text: '' }, { text: '' }, { text: 'WCCE AUTO PARTS SUPPLY', align: 'center' }, { text: '' }, { text: '' }])} />)
    expect(cellOf('WCCE AUTO PARTS SUPPLY').className).toContain('overflow-visible')
    expect(cellOf('WCCE AUTO PARTS SUPPLY').className).not.toContain('truncate')
  })

  it('spills left-aligned text to the right only when the next cell is empty', () => {
    render(<WorkbookGrid caption="Sheet" grid={grid([{ text: 'DATE: 2/03/25' }, { text: '' }, { text: 'NAME: BRGY.' }, { text: 'ISUZU' }, { text: '' }])} />)
    expect(cellOf('DATE: 2/03/25').className).toContain('overflow-visible')
    expect(cellOf('NAME: BRGY.').className).toContain('truncate')
  })

  it('keeps cutting off centered text when a neighbour has content, and never spills numbers', () => {
    render(<WorkbookGrid caption="Sheet" grid={grid([{ text: 'Label' }, { text: 'Centered', align: 'center' }, { text: '' }, { text: '13475', numeric: true }, { text: '' }])} />)
    expect(cellOf('Centered').className).toContain('truncate')
    expect(cellOf('13475').className).toContain('truncate')
  })
})
