import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BusinessInput } from '../../domain/business/businessForm'
import { PNG_BYTES } from '../../test/fixtures/synthetic/logos'
import { db, SheetquoDatabase } from './db'
import {
  archiveBusiness,
  createBusiness,
  readWorkspace,
  restoreBusiness,
  selectBusiness,
  updateBusiness,
} from './businessRepository'

function input(displayName: string, overrides: Partial<BusinessInput> = {}): BusinessInput {
  return { displayName, addressLines: ['1 Demo Street'], phones: ['0900-000-0000'], currency: 'PHP', ...overrides }
}

async function create(displayName: string, overrides: Partial<BusinessInput> = {}) {
  const result = await createBusiness(input(displayName, overrides))
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

async function workspace() {
  const snapshot = await readWorkspace()
  if (snapshot.status !== 'ready') throw new Error('storage unavailable')
  return snapshot
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()))
})

describe('business profiles', () => {
  it('makes the first business current, and keeps the current one when more are added', async () => {
    const first = await create('Demo Parts Supply')
    await create('Demo Fleet Services')
    expect((await workspace()).business?.id).toBe(first.id)
  })

  it('keeps profiles after the database is closed and opened again, like a page reload', async () => {
    const saved = await create('Demo Parts Supply', { email: 'orders@example.test' })
    const reopened = new SheetquoDatabase()
    const loaded = await reopened.businesses.get(saved.id)
    reopened.close()
    expect(loaded?.displayName).toBe('Demo Parts Supply')
    expect(loaded?.email).toBe('orders@example.test')
  })

  it('updates fields and clears the ones left empty', async () => {
    const saved = await create('Demo Parts Supply', { email: 'orders@example.test' })
    const result = await updateBusiness(saved.id, input('Demo Parts Supply Co.', { email: undefined }))
    expect(result.ok && result.value.displayName).toBe('Demo Parts Supply Co.')
    expect((await db.businesses.get(saved.id))?.email).toBeUndefined()
    expect((await db.businesses.get(saved.id))?.createdAt).toBe(saved.createdAt)
  })

  it('rejects a second active business with the same name, ignoring case', async () => {
    await create('Demo Parts Supply')
    const result = await createBusiness(input('demo parts supply'))
    expect(result.ok ? null : result.error.code).toBe('DUPLICATE_NAME')
  })

  it('switches the current business only to an active one', async () => {
    await create('Demo Parts Supply')
    const second = await create('Demo Fleet Services')
    expect((await selectBusiness(second.id)).ok).toBe(true)
    expect((await workspace()).business?.id).toBe(second.id)

    await archiveBusiness(second.id)
    const result = await selectBusiness(second.id)
    expect(result.ok ? null : result.error.code).toBe('NOT_FOUND')
  })
})

describe('archiving', () => {
  it('hands the current spot to the next active business, or to none', async () => {
    const first = await create('Demo Parts Supply')
    const second = await create('Demo Fleet Services')

    await archiveBusiness(first.id)
    expect((await workspace()).business?.id).toBe(second.id)

    await archiveBusiness(second.id)
    expect((await workspace()).business).toBeNull()
    expect(await db.settings.get('currentBusinessId')).toBeUndefined()
  })

  it('keeps an archived business and its details, and restores it', async () => {
    const saved = await create('Demo Parts Supply')
    await archiveBusiness(saved.id)
    expect((await workspace()).businesses).toHaveLength(1)

    expect((await restoreBusiness(saved.id)).ok).toBe(true)
    const restored = await db.businesses.get(saved.id)
    expect(restored?.archivedAt).toBeUndefined()
    expect((await workspace()).business?.id).toBe(saved.id)
  })

  it('will not restore over an active business with the same name', async () => {
    const old = await create('Demo Parts Supply')
    await archiveBusiness(old.id)
    await create('Demo Parts Supply')
    const result = await restoreBusiness(old.id)
    expect(result.ok ? null : result.error.code).toBe('DUPLICATE_NAME')
  })
})

describe('logos', () => {
  const logo = { name: 'logo.png', type: 'image/png' as const, bytes: PNG_BYTES }

  it('stores a logo apart from the profile', async () => {
    const result = await createBusiness(input('Demo Parts Supply'), { kind: 'replace', logo })
    const business = result.ok ? result.value : null
    expect(business?.logoBlobId).toBeDefined()
    expect((await db.blobs.get(business!.logoBlobId!))?.bytes).toEqual(PNG_BYTES)
  })

  it('deletes the old file when a logo is replaced or removed', async () => {
    const created = await createBusiness(input('Demo Parts Supply'), { kind: 'replace', logo })
    const business = created.ok ? created.value : null
    await updateBusiness(business!.id, input('Demo Parts Supply'), { kind: 'replace', logo })
    expect(await db.blobs.count()).toBe(1)

    await updateBusiness(business!.id, input('Demo Parts Supply'), { kind: 'remove' })
    expect(await db.blobs.count()).toBe(0)
    expect((await db.businesses.get(business!.id))?.logoBlobId).toBeUndefined()
  })

  it('never shares a logo between businesses', async () => {
    const a = await createBusiness(input('Demo Parts Supply'), { kind: 'replace', logo })
    const b = await create('Demo Fleet Services')
    expect(a.ok && a.value.logoBlobId).toBeTruthy()
    expect(b.logoBlobId).toBeUndefined()
  })
})

describe('failures', () => {
  it('reports a full browser as QUOTA and saves nothing, logo included', async () => {
    const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' })
    vi.spyOn(db.businesses, 'add').mockRejectedValueOnce(quota)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await createBusiness(input('Demo Parts Supply'), {
      kind: 'replace',
      logo: { name: 'logo.png', type: 'image/png', bytes: PNG_BYTES },
    })

    expect(result.ok ? null : result.error.code).toBe('QUOTA')
    expect(await db.businesses.count()).toBe(0)
    expect(await db.blobs.count()).toBe(0)
    vi.restoreAllMocks()
  })

  it('reports a missing business instead of throwing', async () => {
    const result = await updateBusiness('gone', input('Demo Parts Supply'))
    expect(result.ok ? null : result.error.code).toBe('NOT_FOUND')
  })
})
