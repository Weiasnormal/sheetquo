import { useSyncExternalStore } from 'react'

const MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function useReducedMotion() {
  return useSyncExternalStore((changed) => {
    const query = window.matchMedia(MOTION_QUERY)
    query.addEventListener('change', changed)
    return () => query.removeEventListener('change', changed)
  }, () => window.matchMedia(MOTION_QUERY).matches, () => false)
}
