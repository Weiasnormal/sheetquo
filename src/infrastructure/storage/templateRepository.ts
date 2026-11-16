import type { Diagnostic } from '../../domain/template/diagnostics'
import type { MappingDraft } from '../../domain/template/mappingDraft'
import type { TemplateRecord, TemplateSummary, TemplateTestResult, TemplateVersionRecord } from '../../domain/template/records'
import type { Region } from '../../domain/template/region'
import { BUSINESS_LAYOUT } from '../../domain/quotation/letterhead'
import { db } from './db'
import { snapshotLetterhead } from './quotationRepository'
import { sha256 } from './hash'
import { attempt, now, StorageFailure } from './storageResult'

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export type ImportTemplateInput = {
  businessId: string
  name: string
  original: { fileName: string; bytes: Uint8Array }
  clean: Uint8Array
  sourceWorksheet: string
  region: Region
  capabilityWarnings: Diagnostic[]
}

const isActive = (template: TemplateRecord) => !template.archivedAt

async function assertUniqueName(businessId: string, name: string, exceptId?: string) {
  const lower = name.toLocaleLowerCase()
  const clash = await db.templates
    .where('businessId')
    .equals(businessId)
    .filter((template) => isActive(template) && template.id !== exceptId && template.name.toLocaleLowerCase() === lower)
    .first()
  if (clash) throw new StorageFailure('DUPLICATE_NAME', 'Another template for this business already uses this name.')
}

/** Saves the untouched upload, the clean copy, and version 1 together, or nothing at all. */
export async function importTemplate(input: ImportTemplateInput) {
  // Hashing is async work outside IndexedDB, so it runs before the transaction opens.
  const originalSha256 = await sha256(input.original.bytes)

  return attempt(() =>
    db.transaction('rw', [db.businesses, db.templates, db.templateVersions, db.blobs], async () => {
      const business = await db.businesses.get(input.businessId)
      if (!business || business.archivedAt) {
        throw new StorageFailure('NOT_FOUND', 'This business is no longer active, so the template was not saved.')
      }
      await assertUniqueName(input.businessId, input.name)

      const timestamp = now()
      const originalBlobId = crypto.randomUUID()
      const sourceBlobId = crypto.randomUUID()
      await db.blobs.bulkAdd([
        { id: originalBlobId, kind: 'workbook', name: input.original.fileName, type: XLSX_TYPE, bytes: input.original.bytes },
        { id: sourceBlobId, kind: 'workbook', name: `${input.name}.xlsx`, type: XLSX_TYPE, bytes: input.clean },
      ])

      const template: TemplateRecord = {
        id: crypto.randomUUID(),
        businessId: input.businessId,
        name: input.name,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      const version: TemplateVersionRecord = {
        id: crypto.randomUUID(),
        templateId: template.id,
        businessId: input.businessId,
        version: 1,
        state: 'draft',
        originalBlobId,
        originalSha256,
        originalFileName: input.original.fileName,
        originalSize: input.original.bytes.length,
        sourceBlobId,
        sourceWorksheet: input.sourceWorksheet,
        region: input.region,
        capabilityWarnings: input.capabilityWarnings,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await db.templates.add(template)
      await db.templateVersions.add(version)
      return { template, version, versions: [version] } satisfies TemplateSummary
    }),
  )
}

/** Keeps every earlier version and quotation untouched while adding a redesigned workbook draft. */
export async function importTemplateVersion(templateId: string, fromVersionId: string, input: ImportTemplateInput, mapping: MappingDraft) {
  const originalSha256 = await sha256(input.original.bytes)
  return attempt(() => db.transaction('rw', [db.businesses, db.templates, db.templateVersions, db.blobs], async () => {
    const template = await db.templates.get(templateId)
    const business = await db.businesses.get(input.businessId)
    const from = await requireVersion(fromVersionId)
    if (!template || template.archivedAt || !business || business.archivedAt || template.businessId !== input.businessId || from.templateId !== templateId) throw new StorageFailure('NOT_FOUND')
    const siblings = await db.templateVersions.where('templateId').equals(templateId).toArray()
    if (siblings.some(({ state }) => state === 'draft')) throw new StorageFailure('LOCKED', 'Finish and test the existing draft before uploading another version.')
    const timestamp = now(), originalBlobId = crypto.randomUUID(), sourceBlobId = crypto.randomUUID()
    await db.blobs.bulkAdd([
      { id: originalBlobId, kind: 'workbook', name: input.original.fileName, type: XLSX_TYPE, bytes: input.original.bytes },
      { id: sourceBlobId, kind: 'workbook', name: `${template.name}.xlsx`, type: XLSX_TYPE, bytes: input.clean },
    ])
    const version: TemplateVersionRecord = { id: crypto.randomUUID(), templateId, businessId: template.businessId,
      version: Math.max(...siblings.map(({ version }) => version)) + 1, state: 'draft', originalBlobId, sourceBlobId,
      originalSha256, originalFileName: input.original.fileName, originalSize: input.original.bytes.length,
      sourceWorksheet: input.sourceWorksheet, region: input.region, capabilityWarnings: input.capabilityWarnings,
      mapping, createdAt: timestamp, updatedAt: timestamp }
    await db.templateVersions.add(version)
    await db.templates.update(templateId, { updatedAt: timestamp })
    return { template, version }
  }))
}

export function duplicateTemplate(fromVersionId: string) {
  return attempt(() => db.transaction('rw', [db.templates, db.templateVersions, db.blobs, db.businesses], async () => {
    const from = await requireVersion(fromVersionId)
    const source = await db.templates.get(from.templateId)
    const business = await db.businesses.get(from.businessId)
    if (!source || !business || business.archivedAt) throw new StorageFailure('NOT_FOUND')
    const names = new Set((await db.templates.where('businessId').equals(from.businessId).toArray()).map(({ name }) => name.toLocaleLowerCase()))
    let name = `${source.name} (copy)`, suffix = 2
    while (names.has(name.toLocaleLowerCase())) name = `${source.name} (copy ${suffix++})`
    const timestamp = now(), id = crypto.randomUUID()
    const original = await db.blobs.get(from.originalBlobId), clean = await db.blobs.get(from.sourceBlobId)
    if (!original || !clean) throw new StorageFailure('NOT_FOUND', 'The source workbook is missing.')
    const originalBlobId = crypto.randomUUID(), sourceBlobId = crypto.randomUUID()
    await db.blobs.bulkAdd([{ ...original, id: originalBlobId }, { ...clean, id: sourceBlobId }])
    const template: TemplateRecord = { id, businessId: source.businessId, name, createdAt: timestamp, updatedAt: timestamp }
    const version: TemplateVersionRecord = { ...from, id: crypto.randomUUID(), templateId: id, version: 1, state: 'draft',
      originalBlobId, sourceBlobId, testResult: undefined, createdAt: timestamp, updatedAt: timestamp }
    await db.templates.add(template)
    await db.templateVersions.add(version)
    return { template, version }
  }))
}

/** The name of an active template already made from these exact bytes, if any. */
export async function findImportedFile(businessId: string, bytes: Uint8Array): Promise<string | undefined> {
  const hash = await sha256(bytes)
  const version = await db.templateVersions
    .where('businessId')
    .equals(businessId)
    .filter((candidate) => candidate.originalSha256 === hash)
    .first()
  if (!version) return undefined
  const template = await db.templates.get(version.templateId)
  return template && isActive(template) ? template.name : undefined
}

export function archiveTemplate(id: string) {
  return attempt(async () => {
    const updated = await db.templates.update(id, { archivedAt: now(), updatedAt: now() })
    if (!updated) throw new StorageFailure('NOT_FOUND', 'This template is no longer saved in this browser.')
  })
}

export function restoreTemplate(id: string) {
  return attempt(() =>
    db.transaction('rw', db.templates, async () => {
      const template = await db.templates.get(id)
      if (!template) throw new StorageFailure('NOT_FOUND', 'This template is no longer saved in this browser.')
      await assertUniqueName(template.businessId, template.name, id)
      await db.templates.update(id, { archivedAt: undefined, updatedAt: now() })
    }),
  )
}

/**
 * Removes a template for good: every version and both workbook files of each. Quotations made with it
 * switch to the business letterhead so they still open and download, and the business forgets it as a choice.
 */
export function deleteTemplate(id: string) {
  return attempt(() =>
    db.transaction('rw', [db.businesses, db.templates, db.templateVersions, db.blobs, db.quotations], async () => {
      const template = await db.templates.get(id)
      if (!template) throw new StorageFailure('NOT_FOUND', 'This template is no longer saved in this browser.')
      const versions = await db.templateVersions.where('templateId').equals(id).toArray()
      await db.blobs.bulkDelete(versions.flatMap(({ originalBlobId, sourceBlobId }) => [originalBlobId, sourceBlobId]))
      await db.templateVersions.bulkDelete(versions.map(({ id: versionId }) => versionId))
      await db.templates.delete(id)

      const business = await db.businesses.get(template.businessId)
      if (!business) return
      const quotations = await db.quotations.where('businessId').equals(business.id).filter((quote) => quote.templateId === id).toArray()
      const timestamp = now()
      for (const quote of quotations) {
        await db.quotations.put({ ...quote, templateId: BUSINESS_LAYOUT, templateVersionId: BUSINESS_LAYOUT,
          letterhead: quote.letterhead ?? (await snapshotLetterhead(business)), updatedAt: timestamp })
      }
      if (business.defaultTemplateId === id || business.lastTemplateId === id) {
        await db.businesses.update(business.id, {
          defaultTemplateId: business.defaultTemplateId === id ? undefined : business.defaultTemplateId,
          lastTemplateId: business.lastTemplateId === id ? undefined : business.lastTemplateId,
          updatedAt: timestamp,
        })
      }
    }),
  )
}

/** How many saved quotations were made with a template, for the delete confirmation. */
export function countTemplateQuotations(template: Pick<TemplateRecord, 'id' | 'businessId'>): Promise<number> {
  return db.quotations.where('businessId').equals(template.businessId).filter((quote) => quote.templateId === template.id).count()
}

/** Every template of one business, archived ones included, each with its versions. */
export async function readTemplatesFor(businessId: string): Promise<TemplateSummary[]> {
  const templates = await db.templates.where('businessId').equals(businessId).toArray()
  const versions = await db.templateVersions.where('businessId').equals(businessId).toArray()
  return templates
    .map((template) => {
      const own = versions.filter((version) => version.templateId === template.id).sort((a, b) => b.version - a.version)
      const active = own.find((version) => version.id === template.activeVersionId)
      return own[0] ? ({ template, version: own[0], versions: own, active } satisfies TemplateSummary as TemplateSummary) : undefined
    })
    .filter((summary): summary is TemplateSummary => summary !== undefined)
    .sort((a, b) => a.template.name.localeCompare(b.template.name))
}

async function requireVersion(id: string): Promise<TemplateVersionRecord> {
  const version = await db.templateVersions.get(id)
  if (!version) throw new StorageFailure('NOT_FOUND', 'This template version is no longer saved in this browser.')
  return version
}

/** Autosaves a draft's mapping. Tested and active versions are frozen. */
export function saveMappingDraft(versionId: string, mapping: MappingDraft) {
  return attempt(() =>
    db.transaction('rw', db.templateVersions, async () => {
      const version = await requireVersion(versionId)
      if (version.state !== 'draft') throw new StorageFailure('LOCKED')
      // A changed mapping makes the last test stale, so its result goes too.
      await db.templateVersions.update(versionId, { mapping, testResult: undefined, updatedAt: now() })
    }),
  )
}

/**
 * Stores a test run. A draft that passes, with or without warnings, becomes tested and frozen.
 * One that fails stays a draft, so it can be fixed.
 */
export function recordTestResult(versionId: string, mapping: MappingDraft, result: TemplateTestResult) {
  return attempt(() =>
    db.transaction('rw', db.templateVersions, async () => {
      const version = await requireVersion(versionId)
      if (version.state === 'draft') {
        await db.templateVersions.update(versionId, {
          mapping,
          testResult: result,
          state: result.status === 'unsupported' ? 'draft' : 'tested',
          updatedAt: now(),
        })
      } else {
        await db.templateVersions.update(versionId, { testResult: result, updatedAt: now() })
      }
    }),
  )
}

/** Makes a tested version the one quotations use. The one it replaces stays tested, so it can be switched back. */
export function activateVersion(versionId: string) {
  return attempt(() =>
    db.transaction('rw', db.templates, db.templateVersions, async () => {
      const version = await requireVersion(versionId)
      if (version.state === 'draft') {
        throw new StorageFailure('LOCKED', 'Test this version before making it active.')
      }
      const template = await db.templates.get(version.templateId)
      if (!template) throw new StorageFailure('NOT_FOUND', 'This template is no longer saved in this browser.')
      if (template.activeVersionId && template.activeVersionId !== versionId) {
        await db.templateVersions.update(template.activeVersionId, { state: 'tested', updatedAt: now() })
      }
      await db.templateVersions.update(versionId, { state: 'active', updatedAt: now() })
      await db.templates.update(template.id, { activeVersionId: versionId, updatedAt: now() })
    }),
  )
}

/** Starts a new draft from an existing version's mapping, keeping the same workbook. One draft at a time. */
export function createDraftVersion(fromVersionId: string) {
  return attempt(() =>
    db.transaction('rw', db.templateVersions, async () => {
      const from = await requireVersion(fromVersionId)
      const siblings = await db.templateVersions.where('templateId').equals(from.templateId).toArray()
      const existing = siblings.find(({ state }) => state === 'draft')
      if (existing) return existing

      const timestamp = now()
      const draft: TemplateVersionRecord = {
        ...from,
        id: crypto.randomUUID(),
        version: Math.max(...siblings.map(({ version }) => version)) + 1,
        state: 'draft',
        testResult: undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await db.templateVersions.add(draft)
      return draft
    }),
  )
}

export type TemplateDetail = TemplateSummary & { businessName: string }

export async function readTemplateDetail(id: string): Promise<TemplateDetail | undefined> {
  const template = await db.templates.get(id)
  if (!template) return undefined
  const [summary] = (await readTemplatesFor(template.businessId)).filter((candidate) => candidate.template.id === id)
  const business = await db.businesses.get(template.businessId)
  return summary ? { ...summary, businessName: business?.displayName ?? 'another business' } : undefined
}

export async function readWorkbookBytes(blobId: string): Promise<Uint8Array | undefined> {
  return (await db.blobs.get(blobId))?.bytes
}
