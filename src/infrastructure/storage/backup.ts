import JSZip from 'jszip'
import { z } from 'zod'
import { businessRecordSchema } from '../../domain/business/businessForm'
import type { BusinessRecord } from '../../domain/business/businessForm'
import { checkLogo } from '../../domain/business/logo'
import type { TemplateRecord, TemplateVersionRecord } from '../../domain/template/records'
import { diagnosticSchema, editableMappingDraftSchema, mappingDraftSchema, testResultSchema } from '../../domain/template/mappingSchema'
import { db } from './db'
import type { StoredBlob } from './db'
import { sha256 } from './hash'
import { SCHEMA_VERSION } from './migrations'
import { quotationRecordSchema } from '../../domain/quotation/recordSchema'
import type { QuotationRecord } from '../../domain/quotation/records'

/** Format 4 adds adjustment/output mappings and template preferences; formats 1–3 remain readable. */
export const BACKUP_FORMAT_VERSION = 4
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024
const MAX_EXPANDED_BYTES = 250 * 1024 * 1024
const MAX_ENTRIES = 10_000

const SAFE_ID = /^[A-Za-z0-9-]+$/
const ZIP_SIGNATURE = [0x50, 0x4b]

const manifestSchema = z.object({
  app: z.literal('sheetquo'),
  formatVersion: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
  createdAt: z.string(),
  files: z.array(
    z.object({
      path: z.string().regex(/^((businesses|templates|templateVersions|quotations|blobs|logos)\.json|(blobs|logos)\/[A-Za-z0-9-]+)$/),
      size: z.number().int().nonnegative(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  ),
})

const blobListSchema = z.array(
  z.object({
    id: z.string().regex(SAFE_ID),
    kind: z.enum(['logo', 'workbook']).default('logo'),
    name: z.string(),
    type: z.string(),
  }),
)

const regionSchema = z.object({ firstRow: z.number().int(), lastRow: z.number().int(), lastColumn: z.number().int() })
const templateSchema = z.object({
  id: z.string().min(1),
  businessId: z.string().min(1),
  name: z.string().min(1),
  activeVersionId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().optional(),
})

const templateVersionSchema = z.object({
  id: z.string().min(1),
  templateId: z.string().min(1),
  businessId: z.string().min(1),
  version: z.number().int().positive(),
  state: z.enum(['draft', 'tested', 'active', 'archived']),
  originalBlobId: z.string().min(1),
  originalSha256: z.string(),
  originalFileName: z.string(),
  originalSize: z.number().int().nonnegative(),
  sourceBlobId: z.string().min(1),
  sourceWorksheet: z.string(),
  region: regionSchema,
  capabilityWarnings: z.array(diagnosticSchema),
  mapping: editableMappingDraftSchema.optional(),
  testResult: testResultSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).superRefine((version, context) => {
  if (version.state !== 'draft' && version.mapping && !mappingDraftSchema.safeParse(version.mapping).success) {
    context.addIssue({ code: 'custom', path: ['mapping'], message: 'Published mappings must contain valid addresses and settings.' })
  }
})

export type Backup = {
  createdAt: string
  schemaVersion: number
  businesses: BusinessRecord[]
  templates: TemplateRecord[]
  templateVersions: TemplateVersionRecord[]
  blobs: StoredBlob[]
  quotations: QuotationRecord[]
}

const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, null, 2))

export type CreatedBackup = {
  bytes: Uint8Array
  filename: string
  businessCount: number
  templateCount: number
  quotationCount: number
}

/** Customer drafts and pasted messages are excluded unless explicitly selected. */
export async function createBackup(at: Date = new Date(), options: { includeDrafts?: boolean } = {}): Promise<CreatedBackup> {
  const content = await db.transaction('r', [db.businesses, db.templates, db.templateVersions, db.blobs, db.quotations], async () => ({
    businesses: await db.businesses.toArray(),
    templates: await db.templates.toArray(),
    templateVersions: await db.templateVersions.toArray(),
    blobs: await db.blobs.toArray(),
    quotations: options.includeDrafts ? await db.quotations.toArray() : [],
  }))

  const files = new Map<string, Uint8Array>([
    ['businesses.json', encode(content.businesses)],
    ['templates.json', encode(content.templates)],
    ['templateVersions.json', encode(content.templateVersions)],
    ['quotations.json', encode(content.quotations)],
    ['blobs.json', encode(content.blobs.map(({ id, kind, name, type }) => ({ id, kind, name, type })))],
    ...content.blobs.map((blob): [string, Uint8Array] => [`blobs/${blob.id}`, blob.bytes]),
  ])
  if (files.size > MAX_ENTRIES || [...files.values()].reduce((size, bytes) => size + bytes.length, 0) > MAX_EXPANDED_BYTES) {
    throw new Error(BACKUP_MESSAGES.TOO_LARGE)
  }

  const manifest: z.infer<typeof manifestSchema> = {
    app: 'sheetquo',
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    createdAt: at.toISOString(),
    files: await Promise.all(
      [...files].map(async ([path, bytes]) => ({ path, size: bytes.length, sha256: await sha256(bytes) })),
    ),
  }

  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  for (const [path, bytes] of files) zip.file(path, bytes)

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  if (bytes.length > MAX_BACKUP_BYTES) throw new Error(BACKUP_MESSAGES.TOO_LARGE)
  return {
    bytes,
    filename: `sheetquo-backup-${at.toISOString().slice(0, 10)}.backup.zip`,
    businessCount: content.businesses.length,
    templateCount: content.templates.length,
    quotationCount: content.quotations.length,
  }
}

export type BackupErrorCode = 'NOT_A_BACKUP' | 'TOO_NEW' | 'DAMAGED' | 'TOO_LARGE'

const BACKUP_MESSAGES: Record<BackupErrorCode, string> = {
  NOT_A_BACKUP: 'This is not a Sheetquo backup file.',
  TOO_NEW: 'This backup comes from a newer version of Sheetquo. Update Sheetquo before restoring it.',
  DAMAGED: 'This backup is damaged or was changed after it was exported.',
  TOO_LARGE: 'This backup is too large. The limit is 100 MB compressed and 250 MB expanded.',
}

export type BackupRead = { ok: true; backup: Backup } | { ok: false; code: BackupErrorCode; message: string }

const fail = (code: BackupErrorCode): BackupRead => ({ ok: false, code, message: BACKUP_MESSAGES[code] })

const parseJson = (bytes: Uint8Array | undefined): unknown =>
  bytes === undefined ? undefined : JSON.parse(new TextDecoder().decode(bytes))

function blobIsValid(kind: StoredBlob['kind'], bytes: Uint8Array): boolean {
  return kind === 'logo' ? checkLogo(bytes).ok : ZIP_SIGNATURE.every((byte, index) => bytes[index] === byte)
}

/** Stop inflating a dishonest ZIP before it can allocate an unbounded result. */
function readLimited(file: JSZip.JSZipObject, limit: number): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []
    let size = 0
    // JSZip exposes this documented streaming reader but omits it from JSZipObject's typings.
    const stream = (file as JSZip.JSZipObject & {
      internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array>
    }).internalStream('uint8array')
    stream.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) { stream.pause(); reject(new Error('TOO_LARGE')); return }
      chunks.push(chunk)
    }).on('error', reject).on('end', () => {
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      resolve(bytes)
    }).resume()
  })
}

/** Validates the complete archive before any database write. Hashes detect damage, not authorship. */
export async function readBackup(bytes: Uint8Array): Promise<BackupRead> {
  if (bytes.length > MAX_BACKUP_BYTES) return fail('TOO_LARGE')
  try { return await readArchive(bytes) }
  catch (error) { return fail(error instanceof Error && error.message === 'TOO_LARGE' ? 'TOO_LARGE' : 'DAMAGED') }
}

async function readArchive(bytes: Uint8Array): Promise<BackupRead> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    return fail('NOT_A_BACKUP')
  }

  const manifestFile = zip.file('manifest.json')
  if (!manifestFile) return fail('NOT_A_BACKUP')

  let manifest: z.infer<typeof manifestSchema>
  try {
    const parsed = manifestSchema.safeParse(parseJson(await readLimited(manifestFile, 4 * 1024 * 1024)))
    if (!parsed.success) return fail('NOT_A_BACKUP')
    manifest = parsed.data
  } catch {
    return fail('NOT_A_BACKUP')
  }

  if (manifest.formatVersion > BACKUP_FORMAT_VERSION || manifest.schemaVersion > SCHEMA_VERSION) {
    return fail('TOO_NEW')
  }
  if (manifest.files.length > MAX_ENTRIES || manifest.files.reduce((size, file) => size + file.size, 0) > MAX_EXPANDED_BYTES) return fail('TOO_LARGE')
  const paths = new Set(manifest.files.map(({ path }) => path))
  if (paths.size !== manifest.files.length) return fail('DAMAGED')
  if (Object.values(zip.files).some((file) => !file.dir && (
    (file.name !== 'manifest.json' && !paths.has(file.name)) ||
    (file.unsafeOriginalName !== undefined && file.unsafeOriginalName !== file.name)
  ))) return fail('DAMAGED')

  const contents = new Map<string, Uint8Array>()
  for (const { path, size, sha256: expected } of manifest.files) {
    const file = zip.file(path)
    if (!file) return fail('DAMAGED')
    const fileBytes = await readLimited(file, size)
    if (fileBytes.length !== size || (await sha256(fileBytes)) !== expected) return fail('DAMAGED')
    contents.set(path, fileBytes)
  }

  try {
    const isVersion1 = manifest.formatVersion === 1
    const folder = isVersion1 ? 'logos' : 'blobs'
    const businesses = z.array(businessRecordSchema).safeParse(parseJson(contents.get('businesses.json')))
    const blobList = blobListSchema.safeParse(parseJson(contents.get(`${folder}.json`)))
    const templates = z.array(templateSchema).safeParse(parseJson(contents.get('templates.json')) ?? [])
    const versions = z.array(templateVersionSchema).safeParse(parseJson(contents.get('templateVersions.json')) ?? [])
    const quotations = z.array(quotationRecordSchema).safeParse(parseJson(contents.get('quotations.json')) ?? [])
    if (!businesses.success || !blobList.success || !templates.success || !versions.success || !quotations.success) return fail('DAMAGED')
    if (manifest.formatVersion >= 2 && (!contents.has('templates.json') || !contents.has('templateVersions.json'))) return fail('DAMAGED')
    if (manifest.formatVersion >= 3 && !contents.has('quotations.json')) return fail('DAMAGED')
    for (const records of [businesses.data, blobList.data, templates.data, versions.data, quotations.data]) {
      if (new Set(records.map(({ id }) => id)).size !== records.length) return fail('DAMAGED')
    }

    const blobs: StoredBlob[] = []
    for (const { id, kind, name, type } of blobList.data) {
      const blobBytes = contents.get(`${folder}/${id}`)
      if (!blobBytes || !blobIsValid(kind, blobBytes)) return fail('DAMAGED')
      blobs.push({ id, kind, name, type, bytes: blobBytes })
    }

    const blobKinds = new Map(blobs.map(({ id, kind }) => [id, kind]))
    const businessIds = new Set(businesses.data.map(({ id }) => id))
    const templateMap = new Map(templates.data.map((template) => [template.id, template]))
    const versionMap = new Map(versions.data.map((version) => [version.id, version]))
    const broken =
      businesses.data.some(({ id, logoBlobId, defaultTemplateId, lastTemplateId }) =>
        (logoBlobId && blobKinds.get(logoBlobId) !== 'logo') ||
        (defaultTemplateId && templateMap.get(defaultTemplateId)?.businessId !== id) ||
        (lastTemplateId && templateMap.get(lastTemplateId)?.businessId !== id)) ||
      templates.data.some(({ id, businessId, activeVersionId }) => !businessIds.has(businessId) ||
        (activeVersionId && (versionMap.get(activeVersionId)?.templateId !== id || versionMap.get(activeVersionId)?.state !== 'active'))) ||
      versions.data.some(
        (version) =>
          templateMap.get(version.templateId)?.businessId !== version.businessId ||
          (version.state === 'active' && templateMap.get(version.templateId)?.activeVersionId !== version.id) ||
          (version.state !== 'draft' && !version.mapping) ||
          blobKinds.get(version.originalBlobId) !== 'workbook' ||
          blobKinds.get(version.sourceBlobId) !== 'workbook',
      ) || quotations.data.some((quote) => versionMap.get(quote.templateVersionId)?.businessId !== quote.businessId ||
        versionMap.get(quote.templateVersionId)?.templateId !== quote.templateId)
    if (broken) return fail('DAMAGED')
    for (const version of versions.data) {
      const original = blobs.find(({ id }) => id === version.originalBlobId)!
      if (original.bytes.length !== version.originalSize || await sha256(original.bytes) !== version.originalSha256) return fail('DAMAGED')
    }

    return {
      ok: true,
      backup: {
        createdAt: manifest.createdAt,
        schemaVersion: manifest.schemaVersion,
        businesses: businesses.data,
        templates: templates.data,
        templateVersions: versions.data,
        blobs,
        quotations: quotations.data,
      },
    }
  } catch {
    return fail('DAMAGED')
  }
}
