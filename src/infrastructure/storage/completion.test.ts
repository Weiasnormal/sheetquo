import { beforeEach, expect, it } from 'vitest'
import { db } from './db'
import { createBusiness, chooseBusinessTemplate } from './businessRepository'
import { activateVersion, duplicateTemplate, importTemplate, importTemplateVersion, readWorkbookBytes, recordTestResult } from './templateRepository'
import { emptyDraft } from '../../domain/template/mappingDraft'
import { buildPartsTemplate } from '../../test/fixtures/synthetic/templates'
import { createBackup, readBackup } from './backup'
import { restoreBackup } from './restoreBackup'
import { reuseMapping } from '../../domain/template/reuseMapping'
import { ExcelJsAdapter } from '../excel/ExcelJsAdapter'

beforeEach(async () => { await Promise.all(db.tables.map((table) => table.clear())) })
async function fixture() {
  const owner = await createBusiness({ displayName: 'Completion demo', addressLines: [], phones: [], currency: 'PHP' })
  if (!owner.ok) throw new Error('business')
  const bytes = await buildPartsTemplate()
  const input = { businessId: owner.value.id, name: 'Original', original: { fileName: 'original.xlsx', bytes }, clean: bytes, sourceWorksheet: 'Quotation', region: { firstRow: 1, lastRow: 18, lastColumn: 6 }, capabilityWarnings: [] }
  const imported = await importTemplate(input)
  if (!imported.ok) throw new Error('template')
  const mapping = emptyDraft({ lastColumn: 'F' })
  mapping.fields = { 'customer.name': 'B6', 'quote.date': 'E6', 'quote.terms': 'A13' }
  mapping.table = { headerRow: 9, firstDataRow: 10, prototypeRow: 11, footerAnchorRow: 13, columns: { description: 'A', quantity: 'C', unitPrice: 'E', lineAmount: 'F' } }
  mapping.output = { moneyFormat: 'business', dateFormat: 'iso', minRowHeight: 25, maxRowHeight: 250 }
  await recordTestResult(imported.value.version.id, mapping, { status: 'compatible', testedAt: new Date().toISOString(), runs: [] })
  await activateVersion(imported.value.version.id)
  return { ...imported.value, input, mapping, owner: owner.value }
}

it('adds replacement versions without changing the active version or original blobs and refuses overlapping drafts', async () => {
  const { template, version, input, mapping } = await fixture()
  const before = await db.templateVersions.get(version.id)
  const added = await importTemplateVersion(template.id, version.id, { ...input, original: { ...input.original, fileName: 'redesigned.xlsx' } }, mapping)
  if (!added.ok) throw new Error(added.error.message)
  expect(added.value.version).toMatchObject({ version: 2, state: 'draft', originalFileName: 'redesigned.xlsx' })
  expect(added.value.version.sourceBlobId).not.toBe(version.sourceBlobId)
  expect(await db.templateVersions.get(version.id)).toEqual(before)
  expect((await db.templates.get(template.id))?.activeVersionId).toBe(version.id)
  expect(await readWorkbookBytes(version.originalBlobId)).toEqual(input.original.bytes)
  expect((await importTemplateVersion(template.id, version.id, input, mapping)).ok).toBe(false)
  expect(await db.blobs.count()).toBe(4)
})

it('duplicates into an independent untested template with unique names and independent workbook IDs', async () => {
  const { template, version, mapping } = await fixture()
  for (const name of ['Original (copy)', 'Original (copy 2)']) {
    const result = await duplicateTemplate(version.id)
    if (!result.ok) throw new Error(result.error.message)
    expect(result.value.template).toMatchObject({ name, businessId: template.businessId })
    expect(result.value.template.activeVersionId).toBeUndefined()
    expect(result.value.version).toMatchObject({ state: 'draft', version: 1, mapping })
    expect(result.value.version.testResult).toBeUndefined()
    expect(result.value.version.originalBlobId).not.toBe(version.originalBlobId)
  }
})

it('round-trips output controls, partial adjustment mappings, prototype and per-business preferences through copy restore', async () => {
  const { template, version, owner, mapping } = await fixture()
  expect((await chooseBusinessTemplate(owner.id, template.id, 'default')).ok).toBe(true)
  expect((await chooseBusinessTemplate(owner.id, template.id, 'last')).ok).toBe(true)
  const other = await createBusiness({ displayName: 'Other owner', currency: 'USD', phones: [], addressLines: [] })
  if (!other.ok) throw new Error('business')
  expect((await chooseBusinessTemplate(other.value.id, template.id, 'default')).ok).toBe(false)
  // Incomplete draft mappings must be portable too.
  await db.templateVersions.update(version.id, { state: 'draft', mapping: { ...mapping, fields: { ...mapping.fields, 'quote.terms': 'A' }, table: { ...mapping.table, prototypeRow: 11.5 }, adjustmentRows: [{ label: 'E14', amount: 'F' }] } })
  await db.templates.update(template.id, { activeVersionId: undefined })
  const backup = await createBackup()
  const read = await readBackup(backup.bytes)
  if (!read.ok) throw new Error(read.message)
  expect(read.backup.templateVersions[0].mapping?.output).toEqual(mapping.output)
  expect(read.backup.templateVersions[0].mapping?.adjustmentRows?.[0].amount).toBe('F')
  const restored = await restoreBackup(backup.bytes, 'copy')
  expect(restored.ok).toBe(true)
  const copied = (await db.businesses.toArray()).find((business) => business.id !== owner.id && business.displayName.startsWith(owner.displayName))!
  expect(copied.defaultTemplateId).not.toBe(template.id)
  expect(copied.lastTemplateId).toBe(copied.defaultTemplateId)
  expect((await db.templates.get(copied.defaultTemplateId!))?.businessId).toBe(copied.id)
})

it('refuses incomplete addresses in a published version backup', async () => {
  const { version, mapping } = await fixture()
  await db.templateVersions.update(version.id, { mapping: { ...mapping, fields: { 'customer.name': 'B' } } })
  expect((await readBackup((await createBackup()).bytes)).ok).toBe(false)
})

it('keeps identical mappings including merged table cells and drops changed labels for review', async () => {
  const { input, mapping } = await fixture()
  const opened = await new ExcelJsAdapter().open(input.clean)
  if (!opened.ok) throw new Error('open')
  const before = opened.workbook.readGrid('Quotation', input.region), after = structuredClone(before)
  expect(reuseMapping(mapping, before, after).mapping.table).toEqual(mapping.table)
  after.rows[5].cells[0].text = 'Different recipient:'
  const reused = reuseMapping(mapping, before, after)
  expect(reused.mapping.fields['customer.name']).toBeUndefined()
  expect(reused.mapping.fields['quote.date']).toBe('E6')
  expect(reused.diagnostics.some(({ code }) => code === 'MAPPING_CHANGED')).toBe(true)
})
