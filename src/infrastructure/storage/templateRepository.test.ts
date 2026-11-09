import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildPartsTemplate } from '../../test/fixtures/synthetic/templates'
import { archiveBusiness, createBusiness, readWorkspace, selectBusiness } from './businessRepository'
import { db } from './db'
import { applyMigrations } from './migrations'
import { emptyDraft } from '../../domain/template/mappingDraft'
import type { TemplateTestResult } from '../../domain/template/records'
import {
  activateVersion,
  archiveTemplate,
  createDraftVersion,
  findImportedFile,
  importTemplate,
  readTemplateDetail,
  readWorkbookBytes,
  recordTestResult,
  restoreTemplate,
  saveMappingDraft,
} from './templateRepository'
import type { ImportTemplateInput } from './templateRepository'

let original: Uint8Array
let clean: Uint8Array

async function business(name: string) {
  const result = await createBusiness({ displayName: name, addressLines: [], phones: [], currency: 'PHP' })
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

function input(businessId: string, name = 'Parts quotation'): ImportTemplateInput {
  return {
    businessId,
    name,
    original: { fileName: 'parts.xlsx', bytes: original },
    clean,
    sourceWorksheet: 'Quotation',
    region: { firstRow: 1, lastRow: 18, lastColumn: 6 },
    capabilityWarnings: [{ severity: 'info', code: 'OLD_VALUES_KEPT', message: 'The area still holds old values.' }],
  }
}

async function templatesOfCurrent() {
  const snapshot = await readWorkspace()
  return snapshot.status === 'ready' ? snapshot.templates : []
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
  original = await buildPartsTemplate()
  clean = new Uint8Array([...original])
})

describe('importing a template', () => {
  it('stores the untouched upload, the clean copy, and version 1 as a draft', async () => {
    const owner = await business('Demo Parts Supply')
    const result = await importTemplate(input(owner.id))
    if (!result.ok) throw new Error(result.error.message)

    const { template, version } = result.value
    expect(template.businessId).toBe(owner.id)
    expect(version).toMatchObject({ version: 1, state: 'draft', originalFileName: 'parts.xlsx', originalSize: original.length })
    expect(version.originalSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(await readWorkbookBytes(version.originalBlobId)).toEqual(original)
    expect(await readWorkbookBytes(version.sourceBlobId)).toEqual(clean)
    expect(version.originalBlobId).not.toBe(version.sourceBlobId)
  })

  it('T-14: keeps the stored original even if the file on disk changes later', async () => {
    const owner = await business('Demo Parts Supply')
    const result = await importTemplate(input(owner.id))
    const stored = result.ok ? await readWorkbookBytes(result.value.version.originalBlobId) : undefined
    original.fill(0)
    expect(stored?.[0]).toBe(0x50)
  })

  it('rejects a second active template with the same name in one business, but not in another', async () => {
    const first = await business('Demo Parts Supply')
    const second = await business('Demo Fleet Services')
    await importTemplate(input(first.id))
    const clash = await importTemplate(input(first.id, 'parts QUOTATION'))
    expect(clash.ok ? null : clash.error.code).toBe('DUPLICATE_NAME')
    expect((await importTemplate(input(second.id))).ok).toBe(true)
  })

  it('refuses to save into an archived business', async () => {
    const owner = await business('Demo Parts Supply')
    await archiveBusiness(owner.id)
    const result = await importTemplate(input(owner.id))
    expect(result.ok ? null : result.error.code).toBe('NOT_FOUND')
    expect(await db.blobs.count()).toBe(0)
  })

  it('saves nothing when the browser is full', async () => {
    const owner = await business('Demo Parts Supply')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(db.templateVersions, 'add').mockRejectedValueOnce(Object.assign(new Error('full'), { name: 'QuotaExceededError' }))
    const result = await importTemplate(input(owner.id))
    expect(result.ok ? null : result.error.code).toBe('QUOTA')
    expect(await db.templates.count()).toBe(0)
    expect(await db.blobs.count()).toBe(0)
    vi.restoreAllMocks()
  })

  it('recognises a file that was already imported', async () => {
    const owner = await business('Demo Parts Supply')
    await importTemplate(input(owner.id))
    expect(await findImportedFile(owner.id, original)).toBe('Parts quotation')
    expect(await findImportedFile(owner.id, new Uint8Array([1, 2, 3]))).toBeUndefined()
  })
})

describe('templates and businesses', () => {
  it('T-13: shows only the current business’s templates', async () => {
    const first = await business('Demo Parts Supply')
    const second = await business('Demo Fleet Services')
    await importTemplate(input(first.id, 'Parts quotation'))
    await importTemplate(input(second.id, 'Fleet estimate'))

    expect((await templatesOfCurrent()).map(({ template }) => template.name)).toEqual(['Parts quotation'])
    await selectBusiness(second.id)
    expect((await templatesOfCurrent()).map(({ template }) => template.name)).toEqual(['Fleet estimate'])
  })

  it('archives and restores, keeping the files', async () => {
    const owner = await business('Demo Parts Supply')
    const result = await importTemplate(input(owner.id))
    const id = result.ok ? result.value.template.id : ''
    await archiveTemplate(id)
    expect((await templatesOfCurrent())[0].template.archivedAt).toBeDefined()
    expect(await db.blobs.count()).toBe(2)
    expect((await restoreTemplate(id)).ok).toBe(true)
    expect((await templatesOfCurrent())[0].template.archivedAt).toBeUndefined()
  })

  it('names the owning business in a template’s details', async () => {
    const owner = await business('Demo Parts Supply')
    const result = await importTemplate(input(owner.id))
    const detail = await readTemplateDetail(result.ok ? result.value.template.id : '')
    expect(detail?.businessName).toBe('Demo Parts Supply')
  })
})

describe('upgrading from version 1', () => {
  it('keeps businesses saved before templates existed', async () => {
    const name = 'upgrade-v1-v2-test'
    const v1 = new Dexie(name)
    v1.version(1).stores({ businesses: 'id', blobs: 'id', settings: 'key' })
    await v1.table('businesses').add({ id: 'b1', displayName: 'Demo Parts Supply' })
    v1.close()

    const v2 = new Dexie(name)
    applyMigrations(v2)
    expect(await v2.table('businesses').get('b1')).toMatchObject({ displayName: 'Demo Parts Supply' })
    expect(await v2.table('templates').count()).toBe(0)
    v2.close()
  })
})

describe('versions', () => {
  const mapping = emptyDraft({ lastColumn: 'F' })
  const passed: TemplateTestResult = { testedAt: '2026-11-03T10:00:00Z', status: 'compatible', runs: [{ items: 3, ok: true, diagnostics: [] }] }
  const failed: TemplateTestResult = { ...passed, status: 'unsupported', runs: [{ items: 3, ok: false, diagnostics: [] }] }

  async function imported() {
    const owner = await business('Demo Parts Supply')
    const result = await importTemplate(input(owner.id))
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }

  it('autosaves a draft mapping, and drops a stale test result with it', async () => {
    const { version } = await imported()
    await recordTestResult(version.id, mapping, failed)
    expect((await saveMappingDraft(version.id, { ...mapping, clearCells: ['A1'] })).ok).toBe(true)
    const saved = await db.templateVersions.get(version.id)
    expect(saved?.mapping?.clearCells).toEqual(['A1'])
    expect(saved?.testResult).toBeUndefined()
  })

  it('keeps a failed draft editable, and freezes one that passes', async () => {
    const { version } = await imported()
    await recordTestResult(version.id, mapping, failed)
    expect((await db.templateVersions.get(version.id))?.state).toBe('draft')

    await recordTestResult(version.id, mapping, passed)
    expect((await db.templateVersions.get(version.id))?.state).toBe('tested')
    const locked = await saveMappingDraft(version.id, mapping)
    expect(locked.ok ? null : locked.error.code).toBe('LOCKED')
  })

  it('will not activate an untested version', async () => {
    const { version } = await imported()
    const result = await activateVersion(version.id)
    expect(result.ok ? null : result.error.message).toBe('Test this version before making it active.')
  })

  it('activates a tested version, and switching back keeps both', async () => {
    const { template, version } = await imported()
    await recordTestResult(version.id, mapping, passed)
    await activateVersion(version.id)
    expect((await db.templates.get(template.id))?.activeVersionId).toBe(version.id)

    const draft = await createDraftVersion(version.id)
    if (!draft.ok) throw new Error(draft.error.message)
    await recordTestResult(draft.value.id, mapping, passed)
    await activateVersion(draft.value.id)
    expect((await db.templateVersions.get(version.id))?.state).toBe('tested')
    expect((await db.templateVersions.get(draft.value.id))?.state).toBe('active')

    await activateVersion(version.id)
    const [summary] = await templatesOfCurrent()
    expect(summary.active?.version).toBe(1)
    expect(summary.versions.map(({ version: number, state }) => [number, state])).toEqual([
      [2, 'tested'],
      [1, 'active'],
    ])
  })

  it('starts a new draft from a version, sharing its workbook, one draft at a time', async () => {
    const { version } = await imported()
    await saveMappingDraft(version.id, { ...mapping, clearCells: ['B2'] })
    await recordTestResult(version.id, { ...mapping, clearCells: ['B2'] }, passed)

    const first = await createDraftVersion(version.id)
    const second = await createDraftVersion(version.id)
    if (!first.ok || !second.ok) throw new Error('failed')
    expect(first.value.id).toBe(second.value.id)
    expect(first.value).toMatchObject({ version: 2, state: 'draft', sourceBlobId: version.sourceBlobId })
    expect(first.value.mapping?.clearCells).toEqual(['B2'])
    expect(first.value.testResult).toBeUndefined()
    expect(await db.blobs.count()).toBe(2)
  })
})
