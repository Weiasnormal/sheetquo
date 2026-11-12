// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useDraftAutosave } from './useDraftAutosave'
import { saveQuotation } from '../../infrastructure/storage/quotationRepository'
import { sampleQuotation } from '../../test/fixtures/synthetic/quotations'
import type { QuotationRecord } from '../../domain/quotation/records'

vi.mock('../../infrastructure/storage/quotationRepository', () => ({ saveQuotation: vi.fn() }))
afterEach(() => vi.resetAllMocks())
const initial: QuotationRecord = { ...sampleQuotation(3), templateId: 'template', createdAt: '', updatedAt: '' }

it('keeps failed changes dirty, warns on close, retries flush and preserves the in-memory draft', async () => {
  vi.mocked(saveQuotation).mockResolvedValue({ ok: false, error: { code: 'QUOTA', message: 'Out of storage' } })
  const { result } = renderHook(() => useDraftAutosave(initial))
  act(() => result.current.change((record) => ({ ...record, customerName: 'Unsaved customer' })))
  await act(async () => { expect(await result.current.flush()).toBe(false) })
  expect(result.current.record.customerName).toBe('Unsaved customer')
  const closing = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(closing)
  expect(closing.defaultPrevented).toBe(true)
  vi.mocked(saveQuotation).mockResolvedValue({ ok: true, value: '2026-11-03T00:00:00Z' })
  await act(async () => { expect(await result.current.flush()).toBe(true) })
  expect(saveQuotation).toHaveBeenLastCalledWith(expect.objectContaining({ customerName: 'Unsaved customer' }))
  expect(result.current.save.state).toBe('saved')
})

it('does not mark a newer edit saved when an older in-flight save finishes', async () => {
  let finish!: (value: Awaited<ReturnType<typeof saveQuotation>>) => void
  vi.mocked(saveQuotation).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  vi.mocked(saveQuotation).mockResolvedValue({ ok: true, value: '2026-11-03T00:00:01Z' })
  const { result } = renderHook(() => useDraftAutosave(initial))
  act(() => result.current.change((record) => ({ ...record, customerName: 'First edit' })))
  let saving!: Promise<boolean>
  act(() => { saving = result.current.flush() })
  await waitFor(() => expect(saveQuotation).toHaveBeenCalledTimes(1))
  act(() => result.current.change((record) => ({ ...record, customerName: 'Later edit' })))
  await act(async () => { finish({ ok: true, value: '2026-11-03T00:00:00Z' }); await saving })
  expect(result.current.save.state).toBe('saving')
  await act(async () => { await result.current.flush() })
  expect(saveQuotation).toHaveBeenLastCalledWith(expect.objectContaining({ customerName: 'Later edit' }))
  expect(result.current.record.customerName).toBe('Later edit')
})
