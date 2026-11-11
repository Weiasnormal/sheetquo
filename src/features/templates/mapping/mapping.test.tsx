// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { routes } from '../../../app/routes/routes'
import { ExcelJsAdapter } from '../../../infrastructure/excel/ExcelJsAdapter'
import { createBusiness } from '../../../infrastructure/storage/businessRepository'
import { db } from '../../../infrastructure/storage/db'
import { importTemplate } from '../../../infrastructure/storage/templateRepository'
import { ARCHIVE_BLOCK_TWO, ARCHIVE_SHEET, buildLegacyArchive } from '../../../test/fixtures/synthetic/legacyArchive'
import { buildPartsTemplate, buildServiceTemplate } from '../../../test/fixtures/synthetic/templates'

const adapter = new ExcelJsAdapter()

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

/** Imports a workbook the way the wizard does, so the clean copy has its one "Quotation" worksheet. */
async function seed(name: string, bytes: Uint8Array, sheet: string, region: { firstRow: number; lastRow: number; lastColumn: number }) {
  const owner = (await db.businesses.toArray())[0]
  const extracted = await adapter.extractRegion(bytes, sheet, region)
  if (!extracted.ok) throw new Error('extract failed')
  const result = await importTemplate({
    businessId: owner.id,
    name,
    original: { fileName: `${name}.xlsx`, bytes },
    clean: extracted.bytes,
    sourceWorksheet: sheet,
    region,
    capabilityWarnings: extracted.diagnostics,
  })
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

const row = (label: string) => screen.getByRole('textbox', { name: new RegExp(`^${label}`) })

async function waitForGrid() {
  return screen.findByRole('table', { name: /Template cells/ }, { timeout: 10_000 })
}

async function testAndActivate(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Test template' }))
  await user.click(await screen.findByRole('button', { name: 'Run test' }))
  const activate = await screen.findByRole('button', { name: 'Make version 1 active' }, { timeout: 20_000 })
  expect(screen.getAllByRole('button', { name: /Download the \d+-item sample/ })).toHaveLength(3)
  await user.click(activate)
  await user.click(screen.getByRole('button', { name: 'Confirm activation' }))
  expect(await screen.findByText('Version 1 is active. New quotations use it.')).toBeInTheDocument()
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
  await createBusiness({ displayName: 'Demo Parts Supply', addressLines: ['1 Sample Street'], phones: ['0900-000-0000'], currency: 'PHP' })
})

describe('mapping two differently shaped templates', () => {
  it('maps the parts template from suggestions alone, tests it, and makes it active', async () => {
    const { template, version } = await seed('Parts quotation', await buildPartsTemplate(), 'Quotation', { firstRow: 1, lastRow: 18, lastColumn: 6 })
    const user = userEvent.setup()
    renderAt(`/templates/${template.id}/map`)
    await waitForGrid()

    expect(screen.getByRole('button', { name: 'Test template' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Use suggestions' }))

    expect(row('Customer name')).toHaveValue('B6')
    expect(row('Header row')).toHaveValue('9')
    const topMargin = screen.getByRole('spinbutton', { name: 'Top margin' })
    await user.clear(topMargin)
    await user.type(topMargin, '0.75')
    await user.tab()
    await user.click(screen.getByRole('checkbox', { name: 'Center the quotation horizontally' }))
    await waitFor(async () => expect((await db.templateVersions.get(version.id))?.mapping?.print).toMatchObject({ marginsInches: { top: 0.75 }, horizontalCentered: true }))
    expect(await screen.findByText(/The mapping is complete/)).toBeInTheDocument()
    await waitFor(async () => expect((await db.templateVersions.get(version.id))?.mapping?.fields['customer.name']).toBe('B6'))

    await testAndActivate(user)
    expect((await db.templates.get(template.id))?.activeVersionId).toBe(version.id)
  }, 60_000)

  it('maps the service template with fixes, by typing and by clicking a cell, keeping its own totals', async () => {
    const { template, version } = await seed('Service estimate', await buildServiceTemplate(), 'Estimate', { firstRow: 1, lastRow: 22, lastColumn: 9 })
    const user = userEvent.setup()
    renderAt(`/templates/${template.id}/map`)
    const grid = await waitForGrid()

    await user.click(screen.getByRole('button', { name: 'Use suggestions' }))
    expect(row('Header row')).toHaveValue('11')
    expect(row('Item number')).toHaveValue('A')

    // The customer has no label beside it here, so it is typed.
    await user.type(row('Customer name'), 'A7')

    // The date label's neighbour is the wrong cell in this layout, so pick the right one in the grid.
    const date = row('Date')
    await user.clear(date)
    await user.click(date)
    await user.click(within(grid).getByTitle(/^H4/))
    expect(date).toHaveValue('H4')

    await user.click(screen.getAllByRole('checkbox', { name: 'Keep the template’s own formula here' })[0])
    await waitFor(async () => {
      const saved = await db.templateVersions.get(version.id)
      expect(saved?.mapping?.fields).toMatchObject({ 'customer.name': 'A7', 'quote.date': 'H4' })
      expect(saved?.mapping?.keepTemplateFormula['totals.subtotal']).toBe(true)
    })

    expect(await screen.findByText(/The mapping is complete/)).toBeInTheDocument()
    await testAndActivate(user)
  }, 60_000)
})

describe('versions and leftover cells', () => {
  it('locks a tested version, and a new version starts as an editable copy', async () => {
    const { template } = await seed('Parts quotation', await buildPartsTemplate(), 'Quotation', { firstRow: 1, lastRow: 18, lastColumn: 6 })
    const user = userEvent.setup()
    const router = renderAt(`/templates/${template.id}/map`)
    await waitForGrid()
    await user.click(screen.getByRole('button', { name: 'Use suggestions' }))
    await screen.findByText(/The mapping is complete/)
    await user.click(screen.getByRole('button', { name: 'Test template' }))
    await user.click(await screen.findByRole('button', { name: 'Run test' }))
    await screen.findByRole('button', { name: 'Make version 1 active' }, { timeout: 20_000 })

    await router.navigate(`/templates/${template.id}/map`)
    await waitForGrid()
    expect(screen.getByText(/Version 1 is tested, so its mapping is locked/)).toBeInTheDocument()
    expect(row('Customer name')).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'Start version 2' }))
    await waitFor(() => expect(row('Customer name')).toBeEnabled(), { timeout: 10_000 })
    expect(row('Customer name')).toHaveValue('B6')
    expect(await db.templateVersions.count()).toBe(2)
    expect(screen.getByText(/Version 2 · Draft/)).toBeInTheDocument()
  }, 60_000)

  it('lists old values from the archive quotation and saves the ones to clear', async () => {
    const { template, version } = await seed('Old quotes', await buildLegacyArchive(), ARCHIVE_SHEET, ARCHIVE_BLOCK_TWO)
    const user = userEvent.setup()
    renderAt(`/templates/${template.id}/map`)
    await waitForGrid()
    await user.click(screen.getByRole('button', { name: 'Use suggestions' }))

    const leftovers = screen.getByRole('region', { name: 'Cells that print as they are' })
    const markup = within(leftovers).getByText('960').closest('li')!
    await user.click(within(markup).getByRole('checkbox', { name: 'Clear' }))

    await waitFor(async () => expect((await db.templateVersions.get(version.id))?.mapping?.clearCells).toEqual(['F11']))
    expect(within(leftovers).getByText('960')).toHaveClass('line-through')
  }, 60_000)
})
