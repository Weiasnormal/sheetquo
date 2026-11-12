// @vitest-environment jsdom
import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AdjustmentsEditor } from './AdjustmentsEditor'
import { computeTotals, formatMoney } from '../../domain/calculations/money'
import type { Adjustment } from '../../domain/quotation/types'

function Editor() {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const totals = computeTotals({ adjustments, items: [{ id: 'part', description: 'Part', quantity: '1', unitPriceMinor: 10_000, type: 'part', included: true }] })
  return <><AdjustmentsEditor currency="USD" adjustments={adjustments} totals={totals.adjustments} issues={[]} onChange={setAdjustments} /><output aria-label="Grand total">{formatMoney(totals.grandTotalMinor, 'USD')}</output></>
}
describe('adjustment editor', () => {
  it('offers all four kinds without adding tax or deductions automatically', async () => {
    const user = userEvent.setup(); render(<Editor />)
    expect(screen.queryByRole('combobox', { name: 'Kind' })).not.toBeInTheDocument()
    for (const kind of ['discount', 'deduction', 'fee', 'tax']) await user.click(screen.getByRole('button', { name: `Add ${kind}` }))
    expect(screen.getAllByRole('combobox', { name: 'Kind' }).map((node) => (node as HTMLSelectElement).value)).toEqual(['discount', 'deduction', 'fee', 'tax'])
    expect(screen.getAllByRole('option', { name: 'Amount (USD)' })).toHaveLength(4)
  })
  it('shows fees/tax as additions in the business currency and respects manual bases and disable', async () => {
    const user = userEvent.setup(); render(<Editor />)
    await user.click(screen.getByRole('button', { name: 'Add fee' }))
    await user.type(screen.getByLabelText('Amount', { exact: true }), '10')
    expect(screen.getByText(`+${formatMoney(1000, 'USD')}`)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Add tax' }))
    await user.type(screen.getByLabelText('Percent', { exact: true }), '10')
    const row = screen.getByLabelText('Percent', { exact: true }).closest('li')!
    expect(within(row).getByText(`+${formatMoney(1000, 'USD')} of ${formatMoney(10000, 'USD')}`)).toBeVisible()
    await user.selectOptions(within(row).getByLabelText('Percentage base'), 'manual')
    await user.type(within(row).getByLabelText('Base amount'), '50')
    expect(screen.getByLabelText('Grand total')).toHaveTextContent(formatMoney(11500, 'USD'))
    await user.click(within(row).getByRole('checkbox'))
    expect(screen.getByLabelText('Grand total')).toHaveTextContent(formatMoney(11000, 'USD'))
    expect(within(row).getByText('Off')).toBeVisible()
  })
  it('updates the sign and total when an addition becomes a deduction', async () => {
    const user = userEvent.setup(); render(<Editor />)
    await user.click(screen.getByRole('button', { name: 'Add fee' }))
    await user.type(screen.getByLabelText('Amount', { exact: true }), '10')
    await user.selectOptions(screen.getByLabelText('Kind'), 'deduction')
    expect(screen.getByText(`−${formatMoney(1000, 'USD')}`)).toBeVisible()
    expect(screen.getByLabelText('Grand total')).toHaveTextContent(formatMoney(9000, 'USD'))
  })
})
