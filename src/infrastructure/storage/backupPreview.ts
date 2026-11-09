import type { Backup } from './backup'
import type { BusinessRecord } from '../../domain/business/businessForm'

export const normalizeBusinessName = (name: string) => name.trim().toLocaleLowerCase()

export function restorePreview(backup: Backup, existing: BusinessRecord[]) {
  const conflicts = backup.businesses.filter((incoming) => existing.some((local) =>
    local.id === incoming.id || normalizeBusinessName(local.displayName) === normalizeBusinessName(incoming.displayName)))
  return { businesses: backup.businesses.length, templates: backup.templates.length,
    versions: backup.templateVersions.length, drafts: backup.quotations.length,
    conflicts: conflicts.map(({ id }) => id) }
}
