import { useCallback, useEffect, useState } from 'react'

export type StorageStatus =
  | { state: 'loading' }
  | { state: 'unavailable' }
  | { state: 'ready'; usedBytes: number; quotaBytes: number; persisted: boolean }

export function useStorageStatus(): { status: StorageStatus; refresh: () => void } {
  const [status, setStatus] = useState<StorageStatus>({ state: 'loading' })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true

    async function read() {
      try {
        const [{ usage = 0, quota = 0 }, persisted] = await Promise.all([
          navigator.storage.estimate(),
          navigator.storage.persisted(),
        ])
        if (active) setStatus({ state: 'ready', usedBytes: usage, quotaBytes: quota, persisted })
      } catch {
        if (active) setStatus({ state: 'unavailable' })
      }
    }

    void read()
    return () => {
      active = false
    }
  }, [version])

  const refresh = useCallback(() => setVersion((current) => current + 1), [])
  return { status, refresh }
}

export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toLocaleString('en-US', { maximumFractionDigits: unit === 0 ? 0 : 1 })} ${units[unit]}`
}
