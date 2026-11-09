import JSZip from 'jszip'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackup, readBackup } from './backup'
import { createBusiness } from './businessRepository'
import { createQuotation } from './quotationRepository'
import { importTemplate, saveMappingDraft } from './templateRepository'
import { restoreBackup } from './restoreBackup'
import { db } from './db'
import { sha256 } from './hash'
import { buildPartsTemplate } from '../../test/fixtures/synthetic/templates'
import { sampleQuotation } from '../../test/fixtures/synthetic/quotations'
import { emptyDraft } from '../../domain/template/mappingDraft'
import { parseQuotationText } from '../../domain/parser/parseQuotationText'

beforeEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(db.tables.map((table) => table.clear()))
})

async function seed() {
  const owner = await createBusiness({ displayName: 'Demo Parts', currency: 'PHP', addressLines: [], phones: [] })
  if (!owner.ok) throw Error('seed business')
  const bytes = await buildPartsTemplate()
  const imported = await importTemplate({ businessId: owner.value.id, name: 'Parts', original: { fileName: 'parts.xlsx', bytes },
    clean: bytes, sourceWorksheet: 'Quotation', region: { firstRow: 1, lastRow: 18, lastColumn: 6 }, capabilityWarnings: [] })
  if (!imported.ok) throw Error('seed template')
  const { template, version } = imported.value
  const mapping = { ...emptyDraft({ lastColumn: 'F', orientation: 'portrait' }), fields: { 'customer.name': 'B5' } }
  await saveMappingDraft(version.id, mapping)
  await db.businesses.update(owner.value.id, { defaultTemplateId: template.id })
  const draft = await createQuotation({ ...sampleQuotation(3), businessId: owner.value.id,
    templateId: template.id, templateVersionId: version.id, rawInput: 'Customer: Demo\n2 pcs Filter @ 100',
    parse: parseQuotationText('Customer: Demo\n2 pcs Filter @ 100'), answeredLines: [2] })
  if (!draft.ok) throw Error('seed draft')
  return { business: owner.value, template, version, draft: draft.value, bytes }
}

async function rewrite(bytes: Uint8Array, path: string, mutate: (value: unknown) => unknown) {
  const zip = await JSZip.loadAsync(bytes)
  const changed = new TextEncoder().encode(JSON.stringify(mutate(JSON.parse(await zip.file(path)!.async('string')))))
  zip.file(path, changed)
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
  const entry = manifest.files.find((file: { path: string }) => file.path === path)
  entry.sha256 = await sha256(changed)
  entry.size = changed.length
  zip.file('manifest.json', JSON.stringify(manifest))
  return zip.generateAsync({ type: 'uint8array' })
}

describe('Phase 9 portable restore', () => {
  it('excludes customer drafts by default, and preserves parser review when opted in', async () => {
    await seed()
    const excluded = await readBackup((await createBackup()).bytes)
    expect(excluded.ok && excluded.backup.quotations).toEqual([])
    const included = await readBackup((await createBackup(new Date(), { includeDrafts: true })).bytes)
    expect(included.ok && included.backup.quotations[0].parse?.lines).toHaveLength(2)
    expect(included.ok && included.backup.quotations[0].answeredLines).toEqual([2])
  })

  it('restores into an empty database with mappings, blobs and draft foreign keys intact', async () => {
    const original = await seed()
    const backup = await createBackup(new Date(), { includeDrafts: true })
    await Promise.all(db.tables.map((table) => table.clear()))
    expect((await restoreBackup(backup.bytes, 'merge')).ok).toBe(true)
    const [business] = await db.businesses.toArray()
    const [template] = await db.templates.toArray()
    const [version] = await db.templateVersions.toArray()
    const [draft] = await db.quotations.toArray()
    expect(business.defaultTemplateId).toBe(template.id)
    expect(version.businessId).toBe(business.id)
    expect(version.templateId).toBe(template.id)
    expect(version.mapping?.fields).toEqual({ 'customer.name': 'B5' })
    expect(draft.templateVersionId).toBe(version.id)
    expect(draft.businessId).toBe(business.id)
    expect((await db.blobs.get(version.sourceBlobId))?.bytes).toEqual(original.bytes)
  })

  it('merges only missing businesses; copies rename conflicts and remap every relationship', async () => {
    const original = await seed()
    const backup = await createBackup(new Date(), { includeDrafts: true })
    const merged = await restoreBackup(backup.bytes, 'merge')
    expect(merged.ok && merged.value).toMatchObject({ businesses: 0, skipped: 1 })
    expect(await db.quotations.count()).toBe(1)
    expect((await restoreBackup(backup.bytes, 'copy')).ok).toBe(true)
    expect(await db.businesses.count()).toBe(2)
    const copy = (await db.businesses.toArray()).find(({ id }) => id !== original.business.id)!
    expect(copy.displayName).toBe('Demo Parts (restored 1)')
    const quote = (await db.quotations.where('businessId').equals(copy.id).toArray())[0]
    expect(quote.templateVersionId).not.toBe(original.version.id)
    expect((await db.templateVersions.get(quote.templateVersionId))?.businessId).toBe(copy.id)
    expect(await db.blobs.count()).toBe(4)
  })

  it('requires confirmation for replacement, then replaces exactly the archive content', async () => {
    await seed()
    const backup = await createBackup()
    await createBusiness({ displayName: 'Later business', currency: 'PHP', phones: [], addressLines: [] })
    expect((await restoreBackup(backup.bytes, 'replace')).ok).toBe(false)
    expect(await db.businesses.count()).toBe(2)
    expect((await restoreBackup(backup.bytes, 'replace', true)).ok).toBe(true)
    expect(await db.businesses.count()).toBe(1)
    expect(await db.quotations.count()).toBe(0)
  })

  it('rolls back replacement on quota failure, preserving all original data', async () => {
    await seed()
    const backup = await createBackup()
    const before = await db.quotations.toArray()
    vi.spyOn(db.templates, 'bulkAdd').mockRejectedValueOnce(new DOMException('Full', 'QuotaExceededError'))
    const result = await restoreBackup(backup.bytes, 'replace', true)
    expect(result.ok ? '' : result.error.code).toBe('QUOTA')
    expect(await db.quotations.toArray()).toEqual(before)
    expect(await db.templates.count()).toBe(1)
  })

  it('rejects duplicate IDs even when the attacker recomputes the hashes', async () => {
    await seed()
    const backup = await createBackup()
    const damaged = await rewrite(backup.bytes, 'businesses.json', (value) => [...value as unknown[], ...(value as unknown[])])
    expect((await readBackup(damaged)).ok).toBe(false)
    expect((await restoreBackup(damaged, 'replace', true)).ok).toBe(false)
    expect(await db.quotations.count()).toBe(1)
  })

  it('rejects cross-business version references and malformed draft structures', async () => {
    await seed()
    const backup = await createBackup(new Date(), { includeDrafts: true })
    for (const [path, field, value] of [['templateVersions.json', 'businessId', 'different'], ['quotations.json', 'items', 'bad']] as const) {
      const bad = await rewrite(backup.bytes, path, (rows) => (rows as Record<string, unknown>[]).map((row) => ({ ...row, [field]: value })))
      expect((await readBackup(bad)).ok).toBe(false)
    }
  })

  it('reads format 2 backups without drafts and rejects unknown mapping keys', async () => {
    await seed()
    const backup = await createBackup()
    const zip = await JSZip.loadAsync(backup.bytes)
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
    manifest.formatVersion = 2
    manifest.files = manifest.files.filter((file: { path: string }) => file.path !== 'quotations.json')
    zip.remove('quotations.json')
    zip.file('manifest.json', JSON.stringify(manifest))
    const legacy = await readBackup(await zip.generateAsync({ type: 'uint8array' }))
    expect(legacy.ok && legacy.backup.quotations).toEqual([])
    const unknown = await rewrite(backup.bytes, 'templateVersions.json', (rows) =>
      (rows as { mapping: { fields: Record<string, string> } }[]).map((row) => ({ ...row,
        mapping: { ...row.mapping, fields: { 'unknown.field': 'A1' } } })))
    expect((await readBackup(unknown)).ok).toBe(false)
  })

  it('rejects duplicate manifest paths, extra files and oversized inflated entries', async () => {
    await seed()
    const backup = await createBackup()
    for (const kind of ['duplicate', 'extra', 'oversize']) {
      const zip = await JSZip.loadAsync(backup.bytes)
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
      if (kind === 'duplicate') manifest.files.push(manifest.files[0])
      if (kind === 'extra') zip.file('unlisted.json', '{}')
      if (kind === 'oversize') manifest.files[0].size = 1
      zip.file('manifest.json', JSON.stringify(manifest))
      expect((await readBackup(await zip.generateAsync({ type: 'uint8array' }))).ok).toBe(false)
    }
  })
})
