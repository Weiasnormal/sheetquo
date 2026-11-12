import { useCallback, useEffect, useRef, useState } from 'react'
import type { QuotationRecord } from '../../domain/quotation/records'
import { saveQuotation } from '../../infrastructure/storage/quotationRepository'

export type SaveState = { state: 'idle' | 'saving' | 'saved' | 'failed'; message?: string }

/**
 * Keeps the draft in memory and saves it half a second after the last change. Leaving the screen
 * saves anything still waiting, and closing the tab first asks while a save is pending.
 */
export function useDraftAutosave(initial: QuotationRecord) {
  const [record, setRecord] = useState(initial)
  const [save, setSave] = useState<SaveState>({ state: 'idle' })
  const latest = useRef(record)
  const pending = useRef(false)
  const revision = useRef(0)
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const saveNow = useCallback(async () => {
    const work = queue.current.then(async () => {
      const savingRevision = revision.current
      const result = await saveQuotation(latest.current)
      if (result.ok) {
        pending.current = revision.current !== savingRevision
        setSave({ state: pending.current ? 'saving' : 'saved' })
        latest.current = { ...latest.current, updatedAt: result.value }
        setRecord(latest.current)
      } else {
        // Keep dirty after failure: flush must retry, and closing must still warn.
        pending.current = true
        setSave({ state: 'failed', message: result.error.message })
      }
      return result.ok
    })
    queue.current = work.catch(() => undefined)
    return work
  }, [])

  useEffect(() => {
    if (!pending.current) return
    const timer = setTimeout(() => void saveNow(), 500)
    return () => clearTimeout(timer)
  }, [record, saveNow])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pending.current) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
      if (pending.current) void saveQuotation(latest.current)
    }
  }, [])

  const change = useCallback((update: (current: QuotationRecord) => QuotationRecord) => {
    pending.current = true
    revision.current += 1
    latest.current = update(latest.current)
    setSave({ state: 'saving' })
    setRecord(latest.current)
  }, [])

  /** For values already written to storage elsewhere, such as the generated file name. */
  const absorb = useCallback((patch: Partial<QuotationRecord>) => {
    latest.current = { ...latest.current, ...patch }
    setRecord(latest.current)
  }, [])

  /** Saves at once if anything is waiting. Resolves false when the save failed. */
  const flush = useCallback(async () => (pending.current ? saveNow() : true), [saveNow])

  return { record, save, change, absorb, flush }
}
