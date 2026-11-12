// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, it } from 'vitest'
import { db } from '../../infrastructure/storage/db'
import { WorkspaceContext, toWorkspace } from '../useWorkspace'
import { QuotationHistoryPage } from './QuotationHistoryPage'
import { SAMPLE_BUSINESS_A, SAMPLE_BUSINESS_B, sampleQuotation } from '../../test/fixtures/synthetic/quotations'

beforeEach(async () => { await db.quotations.clear() })
const businesses = [SAMPLE_BUSINESS_A, SAMPLE_BUSINESS_B].map((b) => ({ ...b, createdAt: '', updatedAt: '' }))
function page(id = 0) {
  return <MemoryRouter><WorkspaceContext.Provider value={toWorkspace({ status: 'ready', businesses, business: businesses[id], templates: [] })}><QuotationHistoryPage /></WorkspaceContext.Provider></MemoryRouter>
}
it('paginates the complete history beyond five recent drafts and searches older records', async () => {
  await db.quotations.bulkAdd(Array.from({ length: 31 }, (_, index) => ({ ...sampleQuotation(3), id: `history-${index}`, customerName: `Customer ${index}`, templateId: 'template', updatedAt: `2026-11-03T00:${String(index).padStart(2, '0')}:00Z`, createdAt: '', generatedAt: index === 0 ? '2026-11-03' : undefined })))
  const user = userEvent.setup()
  const view = render(page())
  expect(await screen.findByText('31 matching quotations')).toBeVisible()
  expect(screen.getAllByRole('link')).toHaveLength(25)
  await user.click(screen.getByRole('button', { name: 'Next page' }))
  expect(screen.getAllByRole('link')).toHaveLength(6)
  await user.type(screen.getByRole('searchbox'), 'Customer 0')
  expect(screen.getByText('1 matching quotations')).toBeVisible()
  await user.selectOptions(screen.getByLabelText('Status'), 'draft')
  expect(screen.getByText('0 matching quotations')).toBeVisible()
  await user.selectOptions(screen.getByLabelText('Status'), 'generated')
  expect(screen.getByText('1 matching quotations')).toBeVisible()
  view.rerender(page(1))
  expect(screen.queryByText(/DEMO-3 · Customer 0/)).not.toBeInTheDocument()
  expect(await screen.findByText('0 matching quotations')).toBeVisible()
})
