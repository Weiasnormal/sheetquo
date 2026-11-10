import JSZip from 'jszip'
import { beforeEach, describe, expect, it } from 'vitest'
import { PNG_BYTES } from '../../test/fixtures/synthetic/logos'
import { buildPartsTemplate } from '../../test/fixtures/synthetic/templates'
import { createBackup, readBackup } from './backup'
import { createBusiness } from './businessRepository'
import { db } from './db'
import { sha256 } from './hash'
import { importTemplate } from './templateRepository'

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
  await createBusiness(
    { displayName: 'Demo Parts Supply', addressLines: ['1 Demo Street'], phones: [], currency: 'PHP' },
    { kind: 'replace', logo: { name: 'logo.png', type: 'image/png', bytes: PNG_BYTES } },
  )
  await createBusiness({ displayName: 'Demo Fleet Services', addressLines: [], phones: [], currency: 'USD' })
})

async function editZip(bytes: Uint8Array, edit: (zip: JSZip) => void | Promise<void>) {
  const zip = await JSZip.loadAsync(bytes)
  await edit(zip)
  return zip.generateAsync({ type: 'uint8array' })
}

describe('backup', () => {
  it('round-trips businesses and logos', async () => {
    const created = await createBackup(new Date('2026-11-03T09:00:00Z'))
    expect(created.filename).toBe('sheetquo-backup-2026-11-03.backup.zip')
    expect(created.businessCount).toBe(2)

    const read = await readBackup(created.bytes)
    if (!read.ok) throw new Error(read.message)
    expect(read.backup.businesses.map(({ displayName }) => displayName).sort()).toEqual([
      'Demo Fleet Services',
      'Demo Parts Supply',
    ])
    expect(read.backup.blobs.find(({ kind }) => kind === 'logo')?.bytes).toEqual(PNG_BYTES)
  })

  it('includes templates with both of their workbooks', async () => {
    const [business] = await db.businesses.toArray()
    const imported = await importTemplate({
      businessId: business.id,
      name: 'Parts quotation',
      original: { fileName: 'parts.xlsx', bytes: await buildPartsTemplate() },
      clean: await buildPartsTemplate(),
      sourceWorksheet: 'Quotation',
      region: { firstRow: 1, lastRow: 18, lastColumn: 6 },
      capabilityWarnings: [],
    })
    expect(imported.ok).toBe(true)

    const created = await createBackup()
    expect(created.templateCount).toBe(1)
    const read = await readBackup(created.bytes)
    if (!read.ok) throw new Error(read.message)
    expect(read.backup.templates.map(({ name }) => name)).toEqual(['Parts quotation'])
    expect(read.backup.blobs.filter(({ kind }) => kind === 'workbook')).toHaveLength(2)
  })

  it('still reads a version 1 backup, which had only businesses and logos', async () => {
    const business = { id: 'b1', displayName: 'Demo Parts Supply', addressLines: [], phones: [], currency: 'PHP', logoBlobId: 'logo1', createdAt: '', updatedAt: '' }
    const files: [string, Uint8Array][] = [
      ['businesses.json', new TextEncoder().encode(JSON.stringify([business]))],
      ['logos.json', new TextEncoder().encode(JSON.stringify([{ id: 'logo1', name: 'logo.png', type: 'image/png' }]))],
      ['logos/logo1', PNG_BYTES],
    ]
    const zip = new JSZip()
    zip.file(
      'manifest.json',
      JSON.stringify({
        app: 'sheetquo',
        formatVersion: 1,
        schemaVersion: 1,
        createdAt: '2026-11-02T00:00:00Z',
        files: await Promise.all(files.map(async ([path, bytes]) => ({ path, size: bytes.length, sha256: await sha256(bytes) }))),
      }),
    )
    for (const [path, bytes] of files) zip.file(path, bytes)

    const read = await readBackup(await zip.generateAsync({ type: 'uint8array' }))
    if (!read.ok) throw new Error(read.message)
    expect(read.backup.businesses[0].displayName).toBe('Demo Parts Supply')
    expect(read.backup.blobs[0]).toMatchObject({ id: 'logo1', kind: 'logo' })
    expect(read.backup.templates).toEqual([])
  })

  it('rejects a file that is not a backup', async () => {
    const read = await readBackup(new TextEncoder().encode('hello'))
    expect(read.ok ? null : read.code).toBe('NOT_A_BACKUP')
  })

  it('rejects a backup edited after export', async () => {
    const { bytes } = await createBackup()
    const tampered = await editZip(bytes, (zip) => {
      zip.file('businesses.json', '[]')
    })
    const read = await readBackup(tampered)
    expect(read.ok ? null : read.code).toBe('DAMAGED')
  })

  it('rejects a backup with a missing logo file', async () => {
    const { bytes } = await createBackup()
    const broken = await editZip(bytes, (zip) => {
      const logoPath = Object.keys(zip.files).find((path) => path.startsWith('blobs/') && !zip.files[path].dir)!
      zip.remove(logoPath)
    })
    const read = await readBackup(broken)
    expect(read.ok ? null : read.code).toBe('DAMAGED')
  })

  it('rejects a backup from a newer version instead of guessing', async () => {
    const { bytes } = await createBackup()
    const newer = await editZip(bytes, async (zip) => {
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
      zip.file('manifest.json', JSON.stringify({ ...manifest, schemaVersion: 99 }))
    })
    const read = await readBackup(newer)
    expect(read.ok ? null : read.code).toBe('TOO_NEW')
  })

  it('rejects a manifest that points outside its own folders', async () => {
    const { bytes } = await createBackup()
    const escaping = await editZip(bytes, async (zip) => {
      const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'))
      manifest.files.push({ path: '../outside', size: 0, sha256: '0'.repeat(64) })
      zip.file('manifest.json', JSON.stringify(manifest))
    })
    const read = await readBackup(escaping)
    expect(read.ok ? null : read.code).toBe('NOT_A_BACKUP')
  })
})
