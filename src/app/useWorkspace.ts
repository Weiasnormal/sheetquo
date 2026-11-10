import { createContext, useContext } from 'react'
import type { BusinessRecord } from '../domain/business/businessForm'
import type { TemplateSummary } from '../domain/template/records'
import type { WorkspaceSnapshot } from '../infrastructure/storage/businessRepository'

export type Workspace = {
  status: WorkspaceSnapshot['status']
  businesses: BusinessRecord[]
  activeBusinesses: BusinessRecord[]
  business: BusinessRecord | null
  /** The current business's templates, archived ones included. */
  templates: TemplateSummary[]
  activeTemplates: TemplateSummary[]
  lastBackupAt?: string
}

export function toWorkspace(snapshot: WorkspaceSnapshot): Workspace {
  if (snapshot.status !== 'ready') {
    return { status: snapshot.status, businesses: [], activeBusinesses: [], business: null, templates: [], activeTemplates: [] }
  }
  return {
    status: 'ready',
    businesses: snapshot.businesses,
    activeBusinesses: snapshot.businesses.filter((business) => !business.archivedAt),
    business: snapshot.business,
    templates: snapshot.templates,
    activeTemplates: snapshot.templates.filter(({ template }) => !template.archivedAt),
    lastBackupAt: snapshot.lastBackupAt,
  }
}

export const WorkspaceContext = createContext<Workspace>(toWorkspace({ status: 'loading' }))

export function useWorkspace(): Workspace {
  return useContext(WorkspaceContext)
}
