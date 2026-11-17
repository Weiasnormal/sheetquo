// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { BUSINESS_LAYOUT } from '../../domain/quotation/letterhead'
import { emptyDraft } from '../../domain/template/mappingDraft'
import { PNG_BYTES } from '../../test/fixtures/synthetic/logos'
import { buildPartsTemplate } from '../../test/fixtures/synthetic/templates'
import {
  chooseBusinessTemplate,
  countBusinessData,
  createBusiness,
  deleteBusiness,
  readWorkspace,
} from './businessRepository'
import { db } from './db'
import { createQuotation, readQuotation } from './quotationRepository'
import { activateVersion, countTemplateQuotations, deleteTemplate, importTemplate, recordTestResult, renameTemplate } from './templateRepository'
import { countAllData, wipeAllData } from './wipe'

let workbook: Uint8Array

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
  workbook = await buildPartsTemplate()
})

async function business(displayName: string, withLogo = false) {
  const result = await createBusiness(
    { displayName, addressLines: ['1 Demo Street'], phones: [], currency: 'PHP' },
    withLogo ? { kind: 'replace', logo: { name: 'logo.png', type: 'image/png', bytes: PNG_BYTES } } : { kind: 'keep' },
  )
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

async function template(businessId: string, name = 'Parts quotation') {
  const result = await importTemplate({
    businessId,
    name,
    original: { fileName: 'parts.xlsx', bytes: workbook },
    clean: new Uint8Array([...workbook]),
    sourceWorksheet: 'Quotation',
    region: { firstRow: 1, lastRow: 18, lastColumn: 6 },
    capabilityWarnings: [],
  })
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

async function quotation(businessId: string, templateId: string, templateVersionId: string) {
  const result = await createQuotation({
    businessId, templateId, templateVersionId, quoteDateISO: '2026-11-05', customerName: 'Demo Customer', items: [], adjustments: [],
  })
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

describe('deleting a template', () => {
  it('removes every version and workbook file, and moves its quotations to the business letterhead', async () => {
    const owner = await business('Demo Parts Supply')
    const { template: saved, version } = await template(owner.id)
    const kept = await template(owner.id, 'Service quotation')
    const quote = await quotation(owner.id, saved.id, version.id)
    expect(await countTemplateQuotations(saved)).toBe(1)

    const result = await deleteTemplate(saved.id)
    expect(result.ok).toBe(true)

    expect(await db.templates.get(saved.id)).toBeUndefined()
    expect(await db.templateVersions.where('templateId').equals(saved.id).count()).toBe(0)
    expect(await db.blobs.bulkGet([version.originalBlobId, version.sourceBlobId])).toEqual([undefined, undefined])
    expect(await db.templates.get(kept.template.id)).toBeDefined()

    const moved = await readQuotation(quote.id)
    expect(moved).toMatchObject({ templateId: BUSINESS_LAYOUT, templateVersionId: BUSINESS_LAYOUT })
    expect(moved?.letterhead?.name).toBe('Demo Parts Supply')
  })

  it('stops the business using a deleted template as its default', async () => {
    const owner = await business('Demo Parts Supply')
    const { template: saved, version } = await template(owner.id)
    await recordTestResult(version.id, emptyDraft({ lastColumn: 'F' }), { testedAt: '2026-11-05T10:00:00Z', status: 'compatible', runs: [{ items: 3, ok: true, diagnostics: [] }] })
    await activateVersion(version.id)
    const chosen = await chooseBusinessTemplate(owner.id, saved.id, 'default')
    expect(chosen.ok).toBe(true)

    await deleteTemplate(saved.id)
    expect((await db.businesses.get(owner.id))?.defaultTemplateId).toBeUndefined()
  })

  it('reports a template that is already gone', async () => {
    const result = await deleteTemplate('missing')
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })
})

describe('deleting a business', () => {
  it('removes its logo, templates, workbook files and quotations, leaving other businesses alone', async () => {
    const owner = await business('Demo Parts Supply', true)
    const other = await business('Demo Fleet Services')
    const { template: saved, version } = await template(owner.id)
    const otherTemplate = await template(other.id)
    await quotation(owner.id, saved.id, version.id)
    const otherQuote = await quotation(other.id, otherTemplate.template.id, otherTemplate.version.id)
    expect(await countBusinessData(owner.id)).toEqual({ templates: 1, quotations: 1 })

    const result = await deleteBusiness(owner.id)
    expect(result.ok).toBe(true)

    expect(await db.businesses.get(owner.id)).toBeUndefined()
    expect(await db.blobs.get(owner.logoBlobId!)).toBeUndefined()
    expect(await db.templates.where('businessId').equals(owner.id).count()).toBe(0)
    expect(await db.templateVersions.where('businessId').equals(owner.id).count()).toBe(0)
    expect(await db.quotations.where('businessId').equals(owner.id).count()).toBe(0)
    expect(await db.blobs.bulkGet([version.originalBlobId, version.sourceBlobId])).toEqual([undefined, undefined])

    expect(await readQuotation(otherQuote.id)).toBeDefined()
    expect(await db.blobs.get(otherTemplate.version.sourceBlobId)).toBeDefined()
    const snapshot = await readWorkspace()
    expect(snapshot.status === 'ready' && snapshot.business?.id).toBe(other.id)
  })

  it('leaves no current business when the last one is deleted', async () => {
    const only = await business('Demo Parts Supply')
    await deleteBusiness(only.id)
    expect(await db.settings.get('currentBusinessId')).toBeUndefined()
    const snapshot = await readWorkspace()
    expect(snapshot.status === 'ready' && snapshot.business).toBeNull()
  })
})

describe('renaming a template', () => {
  it('renames it, refusing a blank name or one another template already uses', async () => {
    const owner = await business('Demo Parts Supply')
    const { template: saved } = await template(owner.id)
    await template(owner.id, 'Service quotation')
    expect(await renameTemplate(saved.id, '  Parts form  ')).toMatchObject({ ok: true, value: { name: 'Parts form' } })
    expect((await db.templates.get(saved.id))?.name).toBe('Parts form')
    expect(await renameTemplate(saved.id, 'service quotation')).toMatchObject({ ok: false, error: { code: 'DUPLICATE_NAME' } })
    expect((await renameTemplate(saved.id, '   ')).ok).toBe(false)
  })
})

describe('wiping all data', () => {
  it('empties every table and forgets remembered layout choices', async () => {
    const owner = await business('Demo Parts Supply', true)
    const { template: saved, version } = await template(owner.id)
    await quotation(owner.id, saved.id, version.id)
    localStorage.setItem('quotation-layout:' + owner.id, saved.id)
    localStorage.setItem('unrelated', 'kept')
    expect(await countAllData()).toEqual({ businesses: 1, templates: 1, quotations: 1 })

    expect((await wipeAllData()).ok).toBe(true)
    for (const table of db.tables) expect(await table.count()).toBe(0)
    expect(localStorage.getItem('quotation-layout:' + owner.id)).toBeNull()
    expect(localStorage.getItem('unrelated')).toBe('kept')
    localStorage.removeItem('unrelated')
  })
})
