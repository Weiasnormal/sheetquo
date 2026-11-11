import { useCallback, useEffect, useRef, useState } from 'react'
import type { MappingDraft } from '../../../domain/template/mappingDraft'
import { saveMappingDraft } from '../../../infrastructure/storage/templateRepository'

export function useMappingAutosave(versionId: string, initial: MappingDraft, readOnly: boolean) {
  const [draft, setDraft] = useState(initial)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [saveError, setSaveError] = useState<string>()
  const latest = useRef(initial), dirty = useRef(false), revision = useRef(0)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const flush = useCallback(async () => {
    const work = queue.current.then(async () => {
      if (!dirty.current || readOnly) return true
      const saving = revision.current
      const result = await saveMappingDraft(versionId, latest.current).catch(() => ({ ok: false as const, error: { message: 'Could not save the mapping. Retry before leaving this page.' } }))
      if (result.ok && saving === revision.current) dirty.current = false
      setSaveState(result.ok ? dirty.current ? 'saving' : 'saved' : 'failed')
      setSaveError(result.ok ? undefined : result.error.message)
      return result.ok && !dirty.current
    })
    queue.current = work.catch(() => undefined)
    return work
  }, [versionId, readOnly])
  useEffect(() => {
    if (!dirty.current || readOnly) return
    const timer = setTimeout(() => void flush(), 500)
    return () => clearTimeout(timer)
  }, [draft, readOnly, flush])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => { window.removeEventListener('beforeunload', warn) }
  }, [])
  function change(update: (current: MappingDraft) => MappingDraft) {
    if (readOnly) return
    latest.current = update(latest.current)
    revision.current += 1
    dirty.current = true
    setDraft(latest.current)
    setSaveState('saving')
  }
  return { draft, change, flush, dirty, saveState, saveError }
}
