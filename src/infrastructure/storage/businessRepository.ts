import type { BusinessInput, BusinessRecord } from '../../domain/business/businessForm'
import type { LogoType } from '../../domain/business/logo'
import { db } from './db'
import type { StoredBlob } from './db'
import { attempt, now, StorageFailure } from './storageResult'
import { readTemplatesFor } from './templateRepository'
import type { TemplateSummary } from '../../domain/template/records'
export type { StorageError, StorageErrorCode, StorageResult } from './storageResult'

export type NewLogo = { name: string; type: LogoType; bytes: Uint8Array }
export type LogoChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'replace'; logo: NewLogo }

const isActive = (business: BusinessRecord) => !business.archivedAt

async function requireBusiness(id: string): Promise<BusinessRecord> {
  const business = await db.businesses.get(id)
  if (!business) throw new StorageFailure('NOT_FOUND', 'This business is no longer saved in this browser.')
  return business
}

async function assertUniqueName(displayName: string, exceptId?: string) {
  const name = displayName.toLocaleLowerCase()
  const clash = await db.businesses
    .filter((business) => isActive(business) && business.id !== exceptId && business.displayName.toLocaleLowerCase() === name)
    .first()
  if (clash) throw new StorageFailure('DUPLICATE_NAME', 'Another business already uses this name.')
}

/** Replacing or removing a logo deletes the old file in the same transaction, so none are left behind. */
async function applyLogo(currentId: string | undefined, change: LogoChange): Promise<string | undefined> {
  if (change.kind === 'keep') return currentId
  if (currentId) await db.blobs.delete(currentId)
  if (change.kind === 'remove') return undefined
  const id = crypto.randomUUID()
  await db.blobs.add({ id, kind: 'logo', ...change.logo })
  return id
}

async function currentBusinessIsActive(): Promise<boolean> {
  const current = await db.settings.get('currentBusinessId')
  if (!current) return false
  const business = await db.businesses.get(current.value)
  return Boolean(business && isActive(business))
}

export function createBusiness(input: BusinessInput, logo: LogoChange = { kind: 'keep' }) {
  return attempt(() =>
    db.transaction('rw', db.businesses, db.blobs, db.settings, async () => {
      await assertUniqueName(input.displayName)
      const timestamp = now()
      const business: BusinessRecord = {
        ...input,
        id: crypto.randomUUID(),
        logoBlobId: await applyLogo(undefined, logo),
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await db.businesses.add(business)
      if (!(await currentBusinessIsActive())) {
        await db.settings.put({ key: 'currentBusinessId', value: business.id })
      }
      return business
    }),
  )
}

export function updateBusiness(id: string, input: BusinessInput, logo: LogoChange = { kind: 'keep' }) {
  return attempt(() =>
    db.transaction('rw', db.businesses, db.blobs, async () => {
      const existing = await requireBusiness(id)
      if (isActive(existing)) await assertUniqueName(input.displayName, id)
      const business: BusinessRecord = {
        ...existing,
        ...input,
        logoBlobId: await applyLogo(existing.logoBlobId, logo),
        updatedAt: now(),
      }
      await db.businesses.put(business)
      return business
    }),
  )
}

export function selectBusiness(id: string) {
  return attempt(() =>
    db.transaction('rw', db.businesses, db.settings, async () => {
      const business = await requireBusiness(id)
      if (!isActive(business)) throw new StorageFailure('NOT_FOUND')
      await db.settings.put({ key: 'currentBusinessId', value: id })
    }),
  )
}

export function archiveBusiness(id: string) {
  return attempt(() =>
    db.transaction('rw', db.businesses, db.settings, async () => {
      await requireBusiness(id)
      await db.businesses.update(id, { archivedAt: now(), updatedAt: now() })
      await replaceCurrent(id)
    }),
  )
}

/** Makes another active business current when the current one goes away. */
async function replaceCurrent(goneId: string) {
  const current = await db.settings.get('currentBusinessId')
  if (current?.value !== goneId) return
  const next = (await db.businesses.toArray()).filter(isActive).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
  if (next) await db.settings.put({ key: 'currentBusinessId', value: next.id })
  else await db.settings.delete('currentBusinessId')
}

/** What deleting a business also removes, so the confirmation can say so. */
export async function countBusinessData(id: string): Promise<{ templates: number; quotations: number }> {
  const [templates, quotations] = await Promise.all([
    db.templates.where('businessId').equals(id).count(),
    db.quotations.where('businessId').equals(id).count(),
  ])
  return { templates, quotations }
}

/** Removes a business for good, with its logo, templates and their workbook files, and its saved quotations. */
export function deleteBusiness(id: string) {
  return attempt(() =>
    db.transaction('rw', [db.businesses, db.blobs, db.settings, db.templates, db.templateVersions, db.quotations], async () => {
      const business = await requireBusiness(id)
      const versions = await db.templateVersions.where('businessId').equals(id).toArray()
      const blobIds = versions.flatMap(({ originalBlobId, sourceBlobId }) => [originalBlobId, sourceBlobId])
      if (business.logoBlobId) blobIds.push(business.logoBlobId)
      await db.blobs.bulkDelete(blobIds)
      await db.templateVersions.bulkDelete(versions.map(({ id: versionId }) => versionId))
      await db.templates.where('businessId').equals(id).delete()
      await db.quotations.where('businessId').equals(id).delete()
      await db.businesses.delete(id)
      await replaceCurrent(id)
    }),
  )
}

export function restoreBusiness(id: string) {
  return attempt(() =>
    db.transaction('rw', db.businesses, db.settings, async () => {
      const business = await requireBusiness(id)
      await assertUniqueName(business.displayName, id)
      await db.businesses.update(id, { archivedAt: undefined, updatedAt: now() })
      if (!(await currentBusinessIsActive())) {
        await db.settings.put({ key: 'currentBusinessId', value: id })
      }
    }),
  )
}

export function recordBackup(at: Date = new Date()) {
  return attempt(() => db.settings.put({ key: 'lastBackupAt', value: at.toISOString() }))
}

/** Template preference writes enforce business ownership and never select an untested or archived template. */
export function chooseBusinessTemplate(businessId: string, templateId: string | undefined, preference: 'default' | 'last') {
  return attempt(() => db.transaction('rw', [db.businesses, db.templates, db.templateVersions], async () => {
    const business = await requireBusiness(businessId)
    if (business.archivedAt) throw new StorageFailure('NOT_FOUND')
    if (templateId) {
      const template = await db.templates.get(templateId)
      const version = template?.activeVersionId ? await db.templateVersions.get(template.activeVersionId) : undefined
      if (!template || template.archivedAt || template.businessId !== businessId || !version || version.state !== 'active') throw new StorageFailure('NOT_FOUND', 'Choose an active template belonging to this business.')
    }
    await db.businesses.update(businessId, { [preference === 'default' ? 'defaultTemplateId' : 'lastTemplateId']: templateId,
      ...(preference === 'default' ? { lastTemplateId: undefined } : {}), updatedAt: now() })
  }))
}

export function getLogo(id: string): Promise<StoredBlob | undefined> {
  return db.blobs.get(id)
}

export type WorkspaceSnapshot =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | {
      status: 'ready'
      businesses: BusinessRecord[]
      business: BusinessRecord | null
      /** Only the current business's templates, archived ones included. */
      templates: TemplateSummary[]
      lastBackupAt?: string
    }

/** Never throws: a browser that blocks IndexedDB gets a snapshot that says so. */
export async function readWorkspace(): Promise<WorkspaceSnapshot> {
  try {
    const [businesses, current, lastBackup] = await Promise.all([
      db.businesses.toArray(),
      db.settings.get('currentBusinessId'),
      db.settings.get('lastBackupAt'),
    ])
    businesses.sort((a, b) => a.displayName.localeCompare(b.displayName))
    const active = businesses.filter(isActive)
    const business = active.find(({ id }) => id === current?.value) ?? active[0] ?? null
    const templates = business ? await readTemplatesFor(business.id) : []
    return { status: 'ready', businesses, business, templates, lastBackupAt: lastBackup?.value }
  } catch (error) {
    console.error('Sheetquo storage unavailable', error)
    return { status: 'unavailable' }
  }
}
