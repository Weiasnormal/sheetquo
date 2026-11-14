import { mkdir, writeFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { db } from '../../src/infrastructure/storage/db'
import { createBusiness } from '../../src/infrastructure/storage/businessRepository'
import { importTemplate } from '../../src/infrastructure/storage/templateRepository'
import { createQuotation } from '../../src/infrastructure/storage/quotationRepository'
import { createBackup } from '../../src/infrastructure/storage/backup'
import { buildPartsTemplate, buildServiceTemplate, PARTS_TEMPLATE, SERVICE_TEMPLATE } from '../../src/test/fixtures/synthetic/templates'
import { sampleQuotation } from '../../src/test/fixtures/synthetic/quotations'
import { ExcelJsAdapter } from '../../src/infrastructure/excel/ExcelJsAdapter'
import type { MappingDraft } from '../../src/domain/template/mappingDraft'

/** Synthetic fixture for repeatable production-browser restore/offline tests. No private workbooks. */
it('builds a portable two-business setup with active templates and drafts for browser QA', async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
  for (const [name, build, definition] of [
    ['Demo Parts Supply', buildPartsTemplate, PARTS_TEMPLATE],
    ['Demo Fleet Services', buildServiceTemplate, SERVICE_TEMPLATE],
  ] as const) {
    const owner = await createBusiness({ displayName: name, currency: 'PHP', phones: [], addressLines: ['1 Sample Street'] })
    if (!owner.ok) throw Error('business')
    const bytes = await build()
    await mkdir('output/phase9', { recursive: true })
    await writeFile(`output/phase9/${name.includes('Parts') ? 'parts' : 'service'}-template.xlsx`, bytes)
    const region = { firstRow: 1, lastRow: name.includes('Parts') ? 18 : 22, lastColumn: name.includes('Parts') ? 6 : 9 }
    const clean = await new ExcelJsAdapter().extractRegion(bytes, definition.worksheetName, region)
    if (!clean.ok) throw Error('extract')
    const imported = await importTemplate({ businessId: owner.value.id, name: 'Quotation template',
      original: { fileName: 'synthetic.xlsx', bytes }, clean: clean.bytes, sourceWorksheet: definition.worksheetName, region, capabilityWarnings: [] })
    if (!imported.ok) throw Error('import')
    const { cellMappings, itemRegion, printProfile } = definition
    const mapping: MappingDraft = { fields: Object.fromEntries(cellMappings.map(({ semanticKey, address }) => [semanticKey, address])),
      table: { ...itemRegion, columns: itemRegion.columns }, print: printProfile, keepTemplateFormula: {}, clearCells: [] }
    await db.templateVersions.update(imported.value.version.id, { mapping, state: 'active' })
    await db.templates.update(imported.value.template.id, { activeVersionId: imported.value.version.id })
    const draft = await createQuotation({ ...sampleQuotation(30), businessId: owner.value.id,
      templateId: imported.value.template.id, templateVersionId: imported.value.version.id })
    expect(draft.ok).toBe(true)
  }
  const backup = await createBackup(new Date(), { includeDrafts: true })
  expect(backup.businessCount).toBe(2)
  expect(backup.quotationCount).toBe(2)
  await mkdir('output/phase9', { recursive: true })
  await writeFile('output/phase9/synthetic.backup.zip', backup.bytes)
})
