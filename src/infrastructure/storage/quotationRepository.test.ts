import { beforeEach, describe, expect, it } from 'vitest'
import { archiveBusiness, createBusiness } from './businessRepository'
import { db } from './db'
import {
  createQuotation,
  deleteQuotation,
  duplicateQuotation,
  listQuotations,
  readQuotation,
  recordGenerated,
  saveQuotation,
} from './quotationRepository'
import type { NewQuotation } from './quotationRepository'

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

async function setup(name = 'Demo Parts Supply') {
  const created = await createBusiness({ displayName: name, addressLines: [], phones: [], currency: 'PHP' })
  if (!created.ok) throw new Error(created.error.message)
  const business = created.value
  const templateId = crypto.randomUUID()
  const versionId = crypto.randomUUID()
  await db.templateVersions.add({
    id: versionId,
    templateId,
    businessId: business.id,
    version: 1,
    state: 'active',
    originalBlobId: 'o',
    originalSha256: 'h',
    originalFileName: 'parts.xlsx',
    originalSize: 1,
    sourceBlobId: 's',
    sourceWorksheet: 'Quotation',
    region: { firstRow: 1, lastRow: 18, lastColumn: 6 },
    capabilityWarnings: [],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  })
  const draft: NewQuotation = {
    businessId: business.id,
    templateId,
    templateVersionId: versionId,
    quoteDateISO: '2026-11-03',
    quoteNumber: 'Q-0142',
    customerName: 'Ventura Motors',
    items: [],
    adjustments: [],
  }
  return { business, draft }
}

async function start(draft: NewQuotation) {
  const result = await createQuotation(draft)
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

describe('quotation repository', () => {
  it('saves a draft and reads it back after edits', async () => {
    const { draft } = await setup()
    const record = await start(draft)
    const saved = await saveQuotation({ ...record, customerName: 'Ventura Motors Inc.' })
    expect(saved.ok).toBe(true)
    expect(await readQuotation(record.id)).toMatchObject({ customerName: 'Ventura Motors Inc.', createdAt: record.createdAt })
  })

  it('refuses a template version from another business', async () => {
    const first = await setup('First Business')
    const second = await setup('Second Business')
    const result = await createQuotation({ ...first.draft, templateVersionId: second.draft.templateVersionId, templateId: second.draft.templateId })
    expect(result).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
  })

  it('refuses to start a draft for an archived business', async () => {
    const { business, draft } = await setup()
    await archiveBusiness(business.id)
    expect((await createQuotation(draft)).ok).toBe(false)
  })

  it('never moves a saved draft to another business', async () => {
    const first = await setup('First Business')
    const second = await setup('Second Business')
    const record = await start(first.draft)
    const moved = await saveQuotation({ ...record, businessId: second.business.id })
    expect(moved.ok).toBe(false)
    expect((await readQuotation(record.id))?.businessId).toBe(first.business.id)
  })

  it('lists only one business’s quotations, newest change first', async () => {
    const first = await setup('First Business')
    const second = await setup('Second Business')
    const older = await start(first.draft)
    const newer = await start({ ...first.draft, quoteNumber: 'Q-0143' })
    await start(second.draft)
    await db.quotations.update(older.id, { updatedAt: '2026-11-01T00:00:00.000Z' })
    expect((await listQuotations(first.business.id)).map(({ id }) => id)).toEqual([newer.id, older.id])
    expect(await listQuotations(first.business.id, 1)).toHaveLength(1)
  })

  it('duplicates without the quotation number or the generated file', async () => {
    const { draft } = await setup()
    const record = await start(draft)
    await recordGenerated(record.id, 'Demo-Q-2026-Q-0142.xlsx')
    const copy = await duplicateQuotation(record.id)
    if (!copy.ok) throw new Error(copy.error.message)
    expect(copy.value).toMatchObject({ customerName: 'Ventura Motors', quoteNumber: undefined, generatedAt: undefined })
    expect(copy.value.id).not.toBe(record.id)
  })

  it('records the generated file and deletes a draft', async () => {
    const { draft } = await setup()
    const record = await start(draft)
    await recordGenerated(record.id, 'Demo-Q-2026-Q-0142.xlsx')
    expect(await readQuotation(record.id)).toMatchObject({ generatedFilename: 'Demo-Q-2026-Q-0142.xlsx' })
    expect((await deleteQuotation(record.id)).ok).toBe(true)
    expect(await readQuotation(record.id)).toBeUndefined()
    expect((await deleteQuotation(record.id)).ok).toBe(false)
  })
})
