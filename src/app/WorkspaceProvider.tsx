import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { readWorkspace } from '../infrastructure/storage/businessRepository'
import type { WorkspaceSnapshot } from '../infrastructure/storage/businessRepository'
import { toWorkspace, WorkspaceContext } from './useWorkspace'

const LOADING: WorkspaceSnapshot = { status: 'loading' }

/** One live query for the whole app, so every screen sees a save or a switch at once. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const snapshot = useLiveQuery(readWorkspace, [], LOADING)
  const workspace = useMemo(() => toWorkspace(snapshot), [snapshot])
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>
}
