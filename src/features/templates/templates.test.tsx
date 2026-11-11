// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { routes } from '../../app/routes/routes'
import { createBusiness, selectBusiness } from '../../infrastructure/storage/businessRepository'
import { db } from '../../infrastructure/storage/db'
import { importTemplate } from '../../infrastructure/storage/templateRepository'
import { buildLegacyArchive } from '../../test/fixtures/synthetic/legacyArchive'
import { buildPartsTemplate } from '../../test/fixtures/synthetic/templates'

let parts: Uint8Array
let archive: Uint8Array

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

async function business(name: string) {
  const result = await createBusiness({ displayName: name, addressLines: [], phones: [], currency: 'PHP' })
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

const xlsx = (bytes: Uint8Array, name: string) => new File([bytes as BlobPart], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

beforeAll(async () => {
  parts = await buildPartsTemplate()
  archive = await buildLegacyArchive()
})

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('importing a template', () => {
  it('asks for a business first', async () => {
    renderAt('/templates/import')
    expect(await screen.findByRole('heading', { name: 'Add a business first' })).toBeInTheDocument()
  })

  it('T-01: reads a one-sheet template, preselects it, previews it, and saves it', async () => {
    await business('Demo Parts Supply')
    const user = userEvent.setup()
    const router = renderAt('/templates/import')

    await user.upload(await screen.findByLabelText('Choose file'), xlsx(parts, 'Parts quotation.xlsx'))

    expect(await screen.findByRole('radio', { name: /Quotation/ })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Last column' })).toHaveValue('F')
    expect(await screen.findByRole('table', { name: /Preview of Quotation/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Template name' })).toHaveValue('Parts quotation')

    await user.click(screen.getByRole('button', { name: 'Import template' }))

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/templates\/.+\/map$/), { timeout: 10_000 })
    expect(await screen.findByRole('heading', { level: 1, name: 'Parts quotation' })).toBeInTheDocument()
    const [version] = await db.templateVersions.toArray()
    expect(version).toMatchObject({ sourceWorksheet: 'Quotation', originalFileName: 'Parts quotation.xlsx', state: 'draft' })
    expect(await db.blobs.count()).toBe(2)
  })

  it('T-03: makes you choose the worksheet and the quotation in an archive, with no guess', async () => {
    await business('Demo Parts Supply')
    const user = userEvent.setup()
    renderAt('/templates/import')

    await user.upload(await screen.findByLabelText('Choose file'), xlsx(archive, 'Old quotes.xlsx'))

    const sheetOption = await screen.findByRole('radio', { name: /Old quotes 2025/ })
    expect(sheetOption).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /Empty/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Import template' })).not.toBeInTheDocument()

    await user.click(sheetOption)
    expect(screen.getByText('2 quotations')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'First row' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Rows 21–32' }))
    const lastColumn = screen.getByRole('textbox', { name: 'Last column' })
    expect(lastColumn).toHaveValue('H')
    await user.clear(lastColumn)
    await user.type(lastColumn, 'F')

    await user.click(screen.getByRole('button', { name: 'Import template' }))
    await waitFor(async () => expect(await db.templateVersions.count()).toBe(1), { timeout: 10_000 })
    const [version] = await db.templateVersions.toArray()
    expect(version.region).toEqual({ firstRow: 21, lastRow: 32, lastColumn: 6 })
    expect(version.capabilityWarnings.map(({ code }) => code)).toEqual(expect.arrayContaining(['FORMULA_OUTSIDE_AREA']))
  })

  it('T-02: turns away a file that only pretends to be a workbook, and saves nothing', async () => {
    await business('Demo Parts Supply')
    const user = userEvent.setup()
    renderAt('/templates/import')
    await user.upload(await screen.findByLabelText('Choose file'), xlsx(new TextEncoder().encode('not a zip'), 'fake.xlsx'))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('fake.xlsx cannot be used')
    expect(alert).toHaveTextContent('Your file was not changed.')
    expect(await db.blobs.count()).toBe(0)
  })

  it('explains an older .xls instead of trying to read it', async () => {
    await business('Demo Parts Supply')
    const user = userEvent.setup({ applyAccept: false })
    renderAt('/templates/import')
    await user.upload(await screen.findByLabelText('Choose file'), new File(['x'], 'old.xls'))
    expect(await screen.findByRole('alert')).toHaveTextContent('save it as .xlsx')
  })

  it('stops an area that cuts through merged cells and keeps the choices', async () => {
    await business('Demo Parts Supply')
    const user = userEvent.setup()
    renderAt('/templates/import')
    await user.upload(await screen.findByLabelText('Choose file'), xlsx(archive, 'Old quotes.xlsx'))
    await user.click(await screen.findByRole('radio', { name: /Old quotes 2025/ }))
    await user.click(screen.getByRole('radio', { name: 'Rows 1–12' }))
    const lastColumn = screen.getByRole('textbox', { name: 'Last column' })
    await user.clear(lastColumn)
    await user.type(lastColumn, 'C')
    await user.click(screen.getByRole('button', { name: 'Import template' }))

    // Three merged headings cross the narrowed area, and each is named.
    expect(await screen.findAllByText(/cross the edge of this area/, {}, { timeout: 10_000 })).toHaveLength(3)
    expect(lastColumn).toHaveValue('C')
    expect(await db.templates.count()).toBe(0)
  })

  it('asks before leaving an import that is not saved', async () => {
    await business('Demo Parts Supply')
    const user = userEvent.setup()
    const router = renderAt('/templates/import')
    await user.upload(await screen.findByLabelText('Choose file'), xlsx(parts, 'Parts quotation.xlsx'))
    await screen.findByRole('button', { name: 'Import template' })

    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: 'Dashboard' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Leave without importing?' })
    await user.click(within(dialog).getByRole('button', { name: 'Leave without importing' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
  })
})

describe('templates and businesses', () => {
  async function seedTemplate(businessId: string, name: string) {
    const result = await importTemplate({
      businessId,
      name,
      original: { fileName: `${name}.xlsx`, bytes: parts },
      clean: parts,
      sourceWorksheet: 'Quotation',
      region: { firstRow: 1, lastRow: 18, lastColumn: 6 },
      capabilityWarnings: [],
    })
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }

  it('T-13: lists only the current business’s templates', async () => {
    const first = await business('Demo Parts Supply')
    const second = await business('Demo Fleet Services')
    await seedTemplate(first.id, 'Parts quotation')
    await seedTemplate(second.id, 'Fleet estimate')

    renderAt('/templates')
    expect(await screen.findByRole('link', { name: 'Parts quotation' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Fleet estimate' })).not.toBeInTheDocument()
  })

  it('will not open another business’s template, and offers to switch', async () => {
    const first = await business('Demo Parts Supply')
    const second = await business('Demo Fleet Services')
    const { template } = await seedTemplate(second.id, 'Fleet estimate')

    const user = userEvent.setup()
    renderAt(`/templates/${template.id}/map`)
    expect(await screen.findByRole('heading', { name: 'This template belongs to Demo Fleet Services' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Switch to Demo Fleet Services' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Fleet estimate' })).toBeInTheDocument()
    expect(first.id).not.toBe(second.id)
  })

  it('shows setup progress once a template is uploaded', async () => {
    const owner = await business('Demo Parts Supply')
    await seedTemplate(owner.id, 'Parts quotation')
    await selectBusiness(owner.id)
    renderAt('/dashboard')
    expect(await screen.findByText('2 of 3 done')).toBeInTheDocument()
    expect(screen.getByText('Map and test your template to start quoting.')).toBeInTheDocument()
  })
})
