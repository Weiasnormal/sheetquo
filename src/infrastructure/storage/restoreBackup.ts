import { BUSINESS_LAYOUT } from '../../domain/quotation/letterhead'
import { readBackup } from './backup'
import { db } from './db'
import { attempt, StorageFailure } from './storageResult'
import { normalizeBusinessName as normalized, restorePreview } from './backupPreview'

export type RestoreMode = 'merge' | 'copy' | 'replace'

/** Revalidate bytes at the write boundary; all changes, including replacement, commit atomically. */
export function restoreBackup(bytes: Uint8Array, mode: RestoreMode, confirmReplacement = false) {
  return attempt(async () => {
    if (mode === 'replace' && !confirmReplacement) throw new StorageFailure('LOCKED', 'Confirm replacement before restoring.')
    const read = await readBackup(bytes)
    if (!read.ok) throw new StorageFailure('LOCKED', read.message)
    const backup = read.backup
    return db.transaction('rw', [db.businesses, db.templates, db.templateVersions, db.blobs, db.quotations, db.settings], async () => {
      const existing = await db.businesses.toArray()
      const preview = restorePreview(backup, existing)
      const selected = backup.businesses.filter(({ id }) => mode !== 'merge' || !preview.conflicts.includes(id))
      const businessIds = new Set(selected.map(({ id }) => id))
      const templates = backup.templates.filter(({ businessId }) => businessIds.has(businessId))
      const versions = backup.templateVersions.filter(({ businessId }) => businessIds.has(businessId))
      const quotations = backup.quotations.filter(({ businessId }) => businessIds.has(businessId))
      const blobIds = new Set([...selected.flatMap(({ logoBlobId }) => logoBlobId ? [logoBlobId] : []),
        ...versions.flatMap(({ originalBlobId, sourceBlobId }) => [originalBlobId, sourceBlobId])])
      const blobs = backup.blobs.filter(({ id }) => blobIds.has(id))

      // Allocate fresh IDs for additive restores, including all foreign keys. Never attach to existing private data.
      const remap = (records: { id: string }[]) => new Map(records.map(({ id }) => [id, mode === 'replace' ? id : crypto.randomUUID()]))
      const b = remap(selected), t = remap(templates), v = remap(versions), f = remap(blobs), q = remap(quotations)
      const names = new Set(mode === 'replace' ? [] : existing.map(({ displayName }) => normalized(displayName)))
      const businesses = selected.map((business) => {
        let displayName = business.displayName
        let suffix = 1
        while (names.has(normalized(displayName))) displayName = `${business.displayName.slice(0, 95)} (restored ${suffix++})`
        names.add(normalized(displayName))
        return { ...business, id: b.get(business.id)!, displayName,
          logoBlobId: business.logoBlobId ? f.get(business.logoBlobId) : undefined,
          defaultTemplateId: business.defaultTemplateId ? t.get(business.defaultTemplateId) : undefined,
          lastTemplateId: business.lastTemplateId ? t.get(business.lastTemplateId) : undefined }
      })
      if (mode === 'replace') {
        // No file/network awaits inside the transaction: a failed bulk write rolls back these clears too.
        for (const table of [db.quotations, db.templateVersions, db.templates, db.businesses, db.blobs, db.settings]) await table.clear()
      }
      await db.blobs.bulkAdd(blobs.map((blob) => ({ ...blob, id: f.get(blob.id)! })))
      await db.businesses.bulkAdd(businesses)
      await db.templates.bulkAdd(templates.map((template) => ({ ...template,
        id: t.get(template.id)!, businessId: b.get(template.businessId)!,
        activeVersionId: template.activeVersionId ? v.get(template.activeVersionId) : undefined })))
      await db.templateVersions.bulkAdd(versions.map((version) => ({ ...version,
        id: v.get(version.id)!, businessId: b.get(version.businessId)!, templateId: t.get(version.templateId)!,
        originalBlobId: f.get(version.originalBlobId)!, sourceBlobId: f.get(version.sourceBlobId)! })))
      await db.quotations.bulkAdd(quotations.map((quote) => ({ ...quote, id: q.get(quote.id)!,
        businessId: b.get(quote.businessId)!, templateId: t.get(quote.templateId) ?? BUSINESS_LAYOUT, templateVersionId: v.get(quote.templateVersionId) ?? BUSINESS_LAYOUT })))
      const current = await db.settings.get('currentBusinessId')
      if (!current || !(await db.businesses.get(current.value))) {
        const first = businesses.find((business) => !business.archivedAt)
        if (first) await db.settings.put({ key: 'currentBusinessId', value: first.id })
      }
      return { businesses: businesses.length, templates: templates.length, drafts: quotations.length,
        skipped: backup.businesses.length - selected.length }
    })
  })
}
