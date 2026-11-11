import { toast } from 'sonner'
import type { TemplateVersionRecord } from '../../domain/template/records'
import { createDraftVersion } from '../../infrastructure/storage/templateRepository'

export function versionStateLabel(version: TemplateVersionRecord): string {
  if (version.state === 'active') return 'Active'
  if (version.state === 'tested') return 'Tested'
  return version.mapping ? 'Draft' : 'Needs mapping'
}

export async function startNewVersion(from: TemplateVersionRecord) {
  const result = await createDraftVersion(from.id)
  if (result.ok) toast.success(`Version ${result.value.version} started`, { description: 'Its mapping starts as a copy of the one you were viewing.' })
  else toast.error(result.error.message)
}
