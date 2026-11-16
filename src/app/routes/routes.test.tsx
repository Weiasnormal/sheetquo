// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../infrastructure/storage/db'
import { generateSample } from '../generateSample'
import { routes } from './routes'

vi.mock('../generateSample', () => ({ generateSample: vi.fn() }))

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
  return router
}

describe('routes', () => {
  it.each([
    ['/dashboard', 'Dashboard'],
    ['/quotation/new', 'New quotation'],
    ['/quotation/abc', 'Quotation not found'],
    ['/templates', 'Templates'],
    ['/templates/import', 'Upload template'],
    ['/templates/abc/map', 'Template not found'],
    ['/templates/abc/test', 'Template not found'],
    ['/businesses', 'Businesses'],
    ['/settings', 'Settings'],
    ['/help', 'Help'],
    ['/nowhere', 'Page not found'],
  ])('%s has one h1 and its own document title', async (path, title) => {
    renderAt(path)
    // Some screens load on demand, and lookups settle after the first render.
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(title))
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    await waitFor(() => expect(document.title).toBe(`${title} · Sheetquo`))
  })

  it('reports a missing quotation by its id, not a blank screen', async () => {
    renderAt('/quotation/q-204')
    expect(await screen.findByText(/Nothing is saved under “q-204”/)).toBeInTheDocument()
  })
})

describe('navigation', () => {
  it('marks the current section for assistive tech', async () => {
    renderAt('/templates/import')
    const nav = await screen.findByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'Templates' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })

  it('moves focus to the content after a route change', async () => {
    const user = userEvent.setup()
    renderAt('/dashboard')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    await user.click(within(nav).getByRole('link', { name: 'Help' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Help' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveFocus()
  })

  it('offers a skip link as the first focusable element', async () => {
    const user = userEvent.setup()
    renderAt('/dashboard')
    await user.tab()
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveFocus()
  })

  it('opens the menu, then closes it after choosing a page', async () => {
    const user = userEvent.setup()
    const router = renderAt('/dashboard')
    await user.click(screen.getByRole('button', { name: 'Open menu' }))

    const menu = await screen.findByRole('dialog', { name: 'Menu' })
    await user.click(within(menu).getByRole('link', { name: 'Settings' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/settings')
  })
})

describe('first-run honesty', () => {
  it('shows true setup progress at zero', async () => {
    renderAt('/dashboard')
    expect(await screen.findByText('0 of 3 done')).toBeInTheDocument()
    expect(screen.getAllByText('Not started')).toHaveLength(3)
  })

  it('blocks a new quotation until setup is done, and links to it', async () => {
    renderAt('/quotation/new')
    expect(await screen.findByRole('heading', { name: 'Add your business first' })).toBeInTheDocument()
    expect(screen.getByText('Paste').parentElement).toHaveAttribute('aria-current', 'step')
  })

  it.each([
    ['/settings', 'Export backup', /Add a business first/],
  ])('%s disables %s and explains why', async (path, label, reason) => {
    renderAt(path)
    const button = await screen.findByRole('button', { name: label })
    expect(button).toBeDisabled()
    expect(button).toHaveAccessibleDescription(reason)
  })

  it('allows a backup to be restored before any business is added', async () => {
    renderAt('/settings')
    expect(await screen.findByLabelText('Choose a Sheetquo backup (.zip)')).toBeEnabled()
  })

  it('computes the example total from its rows', () => {
    renderAt('/dashboard')
    expect(screen.getByText('₱3,150.00')).toBeInTheDocument()
  })
})

describe('settings', () => {
  it('reports real storage figures', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: {
        estimate: async () => ({ usage: 2_097_152, quota: 1_073_741_824 }),
        persisted: async () => false,
      },
    })
    renderAt('/settings')
    expect(await screen.findByText('2 MB')).toBeInTheDocument()
    expect(screen.getByText('Can be cleared by the browser')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('says so when the browser does not report storage', async () => {
    renderAt('/settings')
    expect(await screen.findByText('This browser does not report its storage.')).toBeInTheDocument()
  })
})

describe('demo downloads', () => {
  it('confirms only after the workbook is generated', async () => {
    const user = userEvent.setup()
    vi.mocked(generateSample).mockResolvedValueOnce({ ok: true, filename: 'Sample-Q-2026-DEMO-3.xlsx' })
    renderAt('/help')

    await user.click(await screen.findByRole('button', { name: 'Download Parts quotation with 3 items' }))

    expect(generateSample).toHaveBeenCalledWith('parts', 3)
    expect(await screen.findByText('Download started')).toBeInTheDocument()
  })

  it('shows the engine message when generation is blocked', async () => {
    const user = userEvent.setup()
    vi.mocked(generateSample).mockResolvedValueOnce({
      ok: false,
      diagnostics: [{ severity: 'error', code: 'TOO_MANY_ITEMS', message: 'This template holds 2 items.' }],
    })
    renderAt('/help')

    await user.click(await screen.findByRole('button', { name: 'Download Service estimate with 30 items' }))

    expect(await screen.findByText('This template holds 2 items.')).toBeInTheDocument()
  })
})
