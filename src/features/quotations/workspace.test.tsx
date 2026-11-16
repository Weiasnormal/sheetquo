// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ExcelJS from 'exceljs'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routes } from '../../app/routes/routes'
import type { MappingDraft } from '../../domain/template/mappingDraft'
import { downloadXlsx } from '../../infrastructure/downloads/downloadBytes'
import { ExcelJsAdapter } from '../../infrastructure/excel/ExcelJsAdapter'
import { createBusiness, selectBusiness } from '../../infrastructure/storage/businessRepository'
import { db } from '../../infrastructure/storage/db'
import { importTemplate } from '../../infrastructure/storage/templateRepository'
import { buildPartsTemplate, PARTS_TEMPLATE } from '../../test/fixtures/synthetic/templates'

vi.mock('../../infrastructure/downloads/downloadBytes', () => ({ downloadXlsx: vi.fn(), downloadFile: vi.fn() }))

const FIXTURE_ONE = [
  'Customer: Ventura Motors',
  'Vehicle: Foton Tornado 4.4',
  'Date: 2026-11-02',
  '2 pcs Brake Pad - ₱1,200 each',
  '1 pc Oil Filter @ 350',
  'Labor: 500',
  'Discount: 100',
].join('\n')

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

/** The parts template, imported the way the wizard does and made active with its known mapping. */
async function seedActiveTemplate(businessId: string) {
  const bytes = await buildPartsTemplate()
  const region = { firstRow: 1, lastRow: 18, lastColumn: 6 }
  const extracted = await new ExcelJsAdapter().extractRegion(bytes, 'Quotation', region)
  if (!extracted.ok) throw new Error('extract failed')
  const imported = await importTemplate({
    businessId,
    name: 'Parts quotation',
    original: { fileName: 'parts.xlsx', bytes },
    clean: extracted.bytes,
    sourceWorksheet: 'Quotation',
    region,
    capabilityWarnings: [],
  })
  if (!imported.ok) throw new Error(imported.error.message)
  const { itemRegion, printProfile, cellMappings } = PARTS_TEMPLATE
  const mapping: MappingDraft = {
    fields: Object.fromEntries(cellMappings.map(({ semanticKey, address }) => [semanticKey, address])),
    keepTemplateFormula: {},
    table: { headerRow: itemRegion.headerRow, firstDataRow: itemRegion.firstDataRow, footerAnchorRow: itemRegion.footerAnchorRow, minDisplayRows: 3, columns: itemRegion.columns },
    print: printProfile,
    clearCells: [],
  }
  await db.templateVersions.update(imported.value.version.id, { mapping, state: 'active' })
  await db.templates.update(imported.value.template.id, { activeVersionId: imported.value.version.id })
  return imported.value
}

async function business(name: string) {
  const created = await createBusiness({ displayName: name, addressLines: ['1 Sample Street'], phones: [], currency: 'PHP', defaultPreparedBy: 'Demo Preparer' })
  if (!created.ok) throw new Error(created.error.message)
  return created.value
}

const summary = () => screen.getByRole('region', { name: 'Summary' })

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
  vi.mocked(downloadXlsx).mockClear()
})

describe('quotation workspace', () => {
  it('pastes a message, reviews it, and downloads the filled template', async () => {
    const owner = await business('Demo Parts Supply')
    await seedActiveTemplate(owner.id)
    const user = userEvent.setup()
    renderAt('/quotation/new')

    await user.click(await screen.findByRole('textbox', { name: 'Customer’s message' }))
    const layouts = screen.getByRole('combobox', {name: 'Quotation layout'})
    await user.selectOptions(layouts, within(layouts).getByRole('option', {name: /fixed Excel form/}))
    await user.click(screen.getByRole('textbox', { name: 'Customer’s message' }))
    await user.paste(FIXTURE_ONE)
    await user.click(screen.getByRole('button', { name: 'Extract details' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Ventura Motors' })).toBeInTheDocument()
    expect(within(summary()).getByText('₱3,150.00')).toBeInTheDocument()
    const source = screen.getByRole('region', { name: 'From the message' })
    expect(within(source).getByText('7 lines read')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^Prepared by/ })).toHaveValue('Demo Preparer')

    await user.click(within(summary()).getByRole('link', { name: 'Continue to generate' }))
    await user.click(await screen.findByRole('button', { name: 'Generate Excel' }))
    await waitFor(() => expect(downloadXlsx).toHaveBeenCalledTimes(1), { timeout: 20_000 })

    const [bytes, filename] = vi.mocked(downloadXlsx).mock.calls[0]
    expect(filename).toMatch(/^Demo-Parts-Supply-Q-2026-[0-9a-f]{8}\.xlsx$/)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer)
    const sheet = workbook.getWorksheet('Quotation')!
    expect(sheet.getCell('B6').value).toBe('Ventura Motors')
    expect(sheet.getCell('A18').value).toBe('Demo Preparer')
    expect(await screen.findByText(/Last downloaded/)).toBeInTheDocument()
    const [saved] = await db.quotations.toArray()
    expect(saved).toMatchObject({ customerName: 'Ventura Motors', generatedFilename: filename, rawInput: FIXTURE_ONE })
  }, 60_000)

  it('keeps an unclear amount out until the owner says each or total', async () => {
    const owner = await business('Demo Parts Supply')
    await seedActiveTemplate(owner.id)
    const user = userEvent.setup()
    renderAt('/quotation/new')

    await user.click(await screen.findByRole('textbox', { name: 'Customer’s message' }))
    await user.paste('Customer: Ventura Motors\n3 clutch bearings 1800')
    await user.click(screen.getByRole('button', { name: 'Extract details' }))

    const source = await screen.findByRole('region', { name: 'From the message' })
    expect(within(summary()).getByText('Grand total').nextSibling).toHaveTextContent('₱0.00')
    expect(within(source).getByText(/1 waiting for you/)).toBeInTheDocument()

    await user.click(within(source).getByRole('button', { name: '₱1,800.00 for all 3' }))
    expect(within(summary()).getByText('Grand total').nextSibling).toHaveTextContent('₱1,800.00')
    expect(screen.getByRole('textbox', { name: 'Unit price, item 1' })).toHaveValue('600.00')
  }, 30_000)

  it('builds a quotation by hand, saves it, and keeps it after a reload', async () => {
    const owner = await business('Demo Parts Supply')
    await seedActiveTemplate(owner.id)
    const user = userEvent.setup()
    const router = renderAt('/quotation/new')

    await user.click(await screen.findByRole('button', { name: 'Type the items instead' }))
    await user.type(await screen.findByRole('textbox', { name: /^Customer name/ }), 'Sample City Office')
    await user.click(screen.getByRole('button', { name: 'Add item' }))
    expect(screen.getByRole('textbox', { name: 'Description, item 1' })).toHaveFocus()
    await user.keyboard('Air Filter')
    await user.clear(screen.getByRole('textbox', { name: 'Qty, item 1' }))
    await user.type(screen.getByRole('textbox', { name: 'Qty, item 1' }), '2')
    await user.type(screen.getByRole('textbox', { name: 'Unit price, item 1' }), '1,250.50')
    expect(within(summary()).getByText('Grand total').nextSibling).toHaveTextContent('₱2,501.00')

    await user.click(screen.getByRole('button', { name: 'Add discount' }))
    await user.type(screen.getByRole('textbox', { name: 'Amount' }), '1')
    expect(within(summary()).getByText('Grand total').nextSibling).toHaveTextContent('₱2,500.00')

    await waitFor(async () => expect((await db.quotations.toArray())[0]?.adjustments[0]?.value).toBe('1'))
    const id = router.state.location.pathname.split('/').pop()!
    cleanup()
    renderAt(`/quotation/${id}`)
    expect(await screen.findByDisplayValue('Air Filter')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Sample City Office')).toBeInTheDocument()
  }, 30_000)

  it('blocks generating until every counted item has a price, and points to it', async () => {
    const owner = await business('Demo Parts Supply')
    await seedActiveTemplate(owner.id)
    const user = userEvent.setup()
    renderAt('/quotation/new')

    await user.click(await screen.findByRole('textbox', { name: 'Customer’s message' }))
    await user.paste('Customer: Ventura Motors\n2 pcs Brake Pad')
    await user.click(screen.getByRole('button', { name: 'Extract details' }))

    const fix = await within(await screen.findByRole('region', { name: 'Summary' })).findByRole('button', { name: /Brake Pad needs a price/ })
    await user.click(fix)
    expect(screen.getByRole('textbox', { name: 'Unit price, item 1' })).toHaveFocus()

    await user.click(screen.getByRole('link', { name: /^Generate/ }))
    expect(await screen.findByRole('link', { name: 'Back to review' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generate Excel' })).not.toBeInTheDocument()
  }, 30_000)

  it('never shows one business’s draft while another is selected', async () => {
    const first = await business('First Parts Supply')
    await seedActiveTemplate(first.id)
    const user = userEvent.setup()
    const router = renderAt('/quotation/new')
    await user.click(await screen.findByRole('button', { name: 'Type the items instead' }))
    await user.type(await screen.findByRole('textbox', { name: /^Customer name/ }), 'Private Customer')
    await waitFor(async () => expect((await db.quotations.toArray())[0]?.customerName).toBe('Private Customer'))

    await selectBusiness((await business('Second Parts Supply')).id)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'This quotation belongs to First Parts Supply' })).toBeInTheDocument())
    expect(screen.queryByDisplayValue('Private Customer')).not.toBeInTheDocument()

    await selectBusiness(first.id)
    expect(await screen.findByDisplayValue('Private Customer')).toBeInTheDocument()
    expect(router.state.location.pathname).toMatch(/^\/quotation\//)
  }, 30_000)
})
