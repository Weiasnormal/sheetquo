import { useSyncExternalStore } from 'react'

type OfflineState = { ready: boolean; updateAvailable: boolean; error: boolean; online: boolean }
let state: OfflineState = { ready: false, updateAvailable: false, error: false, online: navigator.onLine }
const listeners = new Set<() => void>()
function change(patch: Partial<OfflineState>) { state = { ...state, ...patch }; listeners.forEach((listener) => listener()) }
let started = false

// Never activate a waiting worker mid-edit. A new version takes over when all old tabs close.
export async function startOffline() {
  if (started || !import.meta.env.PROD || !('serviceWorker' in navigator)) return
  started = true
  window.addEventListener('online', () => change({ online: true }))
  window.addEventListener('offline', () => change({ online: false }))
  try {
  const { registerSW } = await import('virtual:pwa-register')
  registerSW({
    immediate: true,
    onOfflineReady() { change({ ready: true, error: false }) },
    onNeedRefresh() { change({ updateAvailable: true }) },
    onRegisterError() { change({ error: true }) },
    onRegisteredSW(_url, registration) {
      if (registration?.active) change({ ready: true })
      if (registration?.waiting) change({ updateAvailable: true })
    },
  })
  } catch { change({ error: true }) }
}

export function useOffline() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => state)
}
