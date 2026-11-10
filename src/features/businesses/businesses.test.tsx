// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routes } from '../../app/routes/routes'
import { createBusiness } from '../../infrastructure/storage/businessRepository'
import { db } from '../../infrastructure/storage/db'
import { PNG_BYTES } from '../../test/fixtures/synthetic/logos'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const view = render(<RouterProvider router={router} />)
  return { router, ...view }
}

const nav = () => screen.getByRole('navigation', { name: 'Main' })

async function seed(displayName: string, logo = false) {
  const result = await createBusiness(
    { displayName, addressLines: ['1 Demo Street'], phones: ['0900-000-0000'], currency: 'PHP' },
    logo ? { kind: 'replace', logo: { name: 'logo.png', type: 'image/png', bytes: PNG_BYTES } } : { kind: 'keep' },
  )
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('adding a business', () => {
  it('saves it, makes it current, and shows it in the switcher', async () => {
    const user = userEvent.setup()
    const { router } = renderAt('/businesses/new')

    await user.type(await screen.findByRole('textbox', { name: 'Business name' }), 'Demo Parts Supply')
    await user.type(screen.getByRole('textbox', { name: 'Address (optional)' }), '1 Demo Street{Enter}Sample City')
    await user.upload(screen.getByLabelText('Logo (optional)'), new File([PNG_BYTES], 'logo.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: 'Add business' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/businesses'))
    expect(await screen.findByText('In use')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Business: Demo Parts Supply/ })).toBeInTheDocument()

    const [saved] = await db.businesses.toArray()
    expect(saved.addressLines).toEqual(['1 Demo Street', 'Sample City'])
    expect(saved.logoBlobId).toBeDefined()
  })

  it('shows the details as they will print before saving', async () => {
    const user = userEvent.setup()
    renderAt('/businesses/new')
    await user.type(await screen.findByRole('textbox', { name: 'Business name' }), 'Demo Parts Supply')
    const preview = screen.getByRole('region', { name: 'On your quotations' })
    expect(within(preview).getByText('Demo Parts Supply')).toBeInTheDocument()
  })

  it('blocks an empty name with an inline error and focuses it', async () => {
    const user = userEvent.setup()
    renderAt('/businesses/new')
    await user.click(await screen.findByRole('button', { name: 'Add business' }))

    const name = screen.getByRole('textbox', { name: 'Business name' })
    expect(name).toHaveAccessibleDescription('Enter a business name')
    await waitFor(() => expect(name).toHaveFocus())
    expect(await db.businesses.count()).toBe(0)
  })

  it('rejects a file that is not a PNG or JPEG, whatever its name', async () => {
    const user = userEvent.setup({ applyAccept: false })
    renderAt('/businesses/new')
    const fake = new File(['<svg></svg>'], 'logo.png', { type: 'image/png' })
    await user.upload(await screen.findByLabelText('Logo (optional)'), fake)
    expect(await screen.findByText('Choose a PNG or JPEG image.')).toBeInTheDocument()
  })

  it('reports a duplicate name on the field, keeping what was typed', async () => {
    await seed('Demo Parts Supply')
    const user = userEvent.setup()
    renderAt('/businesses/new')
    const name = await screen.findByRole('textbox', { name: 'Business name' })
    await user.type(name, 'demo parts supply')
    await user.click(screen.getByRole('button', { name: 'Add business' }))
    await waitFor(() => expect(name).toHaveAccessibleDescription('Another business already uses this name.'))
    expect(name).toHaveValue('demo parts supply')
  })
})

describe('persistence and switching', () => {
  it('still lists businesses after the app is opened again', async () => {
    await seed('Demo Parts Supply')
    const first = renderAt('/businesses')
    expect(await screen.findByRole('link', { name: 'Demo Parts Supply' })).toBeInTheDocument()
    first.unmount()

    renderAt('/businesses')
    expect(await screen.findByRole('link', { name: 'Demo Parts Supply' })).toBeInTheDocument()
  })

  it('switches business from the sidebar, and logos never carry across', async () => {
    await seed('Demo Parts Supply', true)
    await seed('Demo Fleet Services')
    const user = userEvent.setup()
    renderAt('/dashboard')

    const trigger = await within(document.body).findByRole('button', { name: /Business: Demo Parts Supply/ })
    await waitFor(() => expect(trigger.querySelector('img')).not.toBeNull())

    trigger.focus()
    await user.keyboard('{Enter}')
    await user.click(await screen.findByRole('menuitemradio', { name: 'Demo Fleet Services' }))

    // Checked on the first render after the switch, before any later query could tidy it up.
    const switched = await screen.findByRole('button', { name: /Business: Demo Fleet Services/ })
    expect(switched.querySelector('img')).toBeNull()
    expect(await screen.findByRole('link', { name: /Demo Fleet Services/ })).toBeInTheDocument()
  })

  it('says so when storage is blocked, instead of crashing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(db.businesses, 'toArray').mockRejectedValue(new Error('blocked'))
    renderAt('/businesses')
    expect(await screen.findByText(/This browser is blocking local storage/)).toBeInTheDocument()
    vi.restoreAllMocks()
  })
})

describe('editing and archiving', () => {
  it('asks before leaving with unsaved changes', async () => {
    const business = await seed('Demo Parts Supply')
    const user = userEvent.setup()
    const { router } = renderAt(`/businesses/${business.id}`)

    await user.type(await screen.findByRole('textbox', { name: 'Email (optional)' }), 'orders@example.test')
    await user.click(within(nav()).getByRole('link', { name: 'Dashboard' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Leave without saving?' })
    await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect(router.state.location.pathname).toBe(`/businesses/${business.id}`)
    expect(screen.getByRole('textbox', { name: 'Email (optional)' })).toHaveValue('orders@example.test')

    await user.click(within(nav()).getByRole('link', { name: 'Dashboard' }))
    await user.click(await screen.findByRole('button', { name: 'Leave without saving' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
  })

  it('archives only after a confirmation that names the business', async () => {
    const business = await seed('Demo Parts Supply')
    const user = userEvent.setup()
    const { router } = renderAt(`/businesses/${business.id}`)

    await user.click(await screen.findByRole('button', { name: 'Archive business' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Archive Demo Parts Supply?' })
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/businesses'))
    expect(await screen.findByText('Archived')).toBeInTheDocument()
    expect((await db.businesses.get(business.id))?.archivedAt).toBeDefined()
  })

  it('reports a business that is not in this browser', async () => {
    renderAt('/businesses/missing-id')
    expect(await screen.findByRole('heading', { name: 'This business is not in this browser' })).toBeInTheDocument()
  })
})
