import { createContext, useContext } from 'react'
import type { ChapterId } from './catalog'
import type { Progress } from './progress'
import type { LessonStep } from './lessons'

export type WiwoRun = { chapter: ChapterId; index: number; owner?: string; record?: string; version?: string; observed: string[]; finished: boolean }
export type WiwoContextValue = {
  progress: Progress; persistent: boolean; run?: WiwoRun; lessons?: Record<ChapterId, LessonStep[]>; loadError?: string
  offer?: ChapterId; start: (id: ChapterId, replay?: boolean, navigate?: boolean) => void
  toggle: () => void; cancel: () => void; next: (skip?: boolean) => void; back: () => void
  dismissOffer: () => void; reset: () => void; setAnimation: (value: boolean) => void
  paused: boolean; current: ChapterId
}
export const WiwoContext = createContext<WiwoContextValue | null>(null)
export const useWiwo = () => useContext(WiwoContext)
