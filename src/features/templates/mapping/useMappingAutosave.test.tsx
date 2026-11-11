// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useMappingAutosave } from './useMappingAutosave'
import { saveMappingDraft } from '../../../infrastructure/storage/templateRepository'
import { emptyDraft } from '../../../domain/template/mappingDraft'
vi.mock('../../../infrastructure/storage/templateRepository', () => ({ saveMappingDraft: vi.fn() }))
afterEach(() => vi.resetAllMocks())
const initial = emptyDraft({ lastColumn: 'F' })
it('retains unsaved edits after exceptions and retries before allowing navigation', async () => {
  vi.mocked(saveMappingDraft).mockRejectedValueOnce(new Error('storage unavailable'))
  const { result } = renderHook(() => useMappingAutosave('version', initial, false))
  act(() => result.current.change((draft) => ({ ...draft, fields: { 'quote.terms': 'A20' } })))
  await act(async () => { expect(await result.current.flush()).toBe(false) })
  expect(result.current.saveState).toBe('failed')
  expect(result.current.dirty.current).toBe(true)
  const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  vi.mocked(saveMappingDraft).mockResolvedValue({ ok: true, value: undefined })
  await act(async () => { expect(await result.current.flush()).toBe(true) })
  expect(result.current.dirty.current).toBe(false)
  expect(saveMappingDraft).toHaveBeenLastCalledWith('version', expect.objectContaining({ fields: { 'quote.terms': 'A20' } }))
})
it('serializes in-flight saves without dropping the latest edit', async () => {
  let finish!: (value: Awaited<ReturnType<typeof saveMappingDraft>>) => void
  vi.mocked(saveMappingDraft).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  vi.mocked(saveMappingDraft).mockResolvedValue({ ok: true, value: undefined })
  const { result } = renderHook(() => useMappingAutosave('version', initial, false))
  act(() => result.current.change((draft) => ({ ...draft, clearCells: ['A1'] })))
  let pending!: Promise<boolean>
  act(() => { pending = result.current.flush() })
  await waitFor(() => expect(saveMappingDraft).toHaveBeenCalledTimes(1))
  act(() => result.current.change((draft) => ({ ...draft, clearCells: ['A2'] })))
  await act(async () => { finish({ ok: true, value: undefined }); expect(await pending).toBe(false) })
  expect(result.current.dirty.current).toBe(true)
  await act(async () => { expect(await result.current.flush()).toBe(true) })
  expect(saveMappingDraft).toHaveBeenLastCalledWith('version', expect.objectContaining({ clearCells: ['A2'] }))
})
