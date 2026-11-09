import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { applyMigrations, SCHEMA_VERSION } from './index'

describe('migrations', () => {
  it('declares the version the backups record', () => {
    const db = new Dexie('migration-version-test')
    applyMigrations(db)
    expect(db.verno).toBe(SCHEMA_VERSION)
  })

  it('keeps existing rows when a later version adds a table', async () => {
    const name = 'migration-upgrade-test'
    const current = new Dexie(name)
    applyMigrations(current)
    await current.table('businesses').add({ id: 'b1', displayName: 'Demo Parts Supply' })
    current.close()

    // Stands in for a future release: every shipped version, plus one more.
    const next = new Dexie(name)
    applyMigrations(next)
    next.version(SCHEMA_VERSION + 1).stores({ futureTable: 'id' })
    expect(await next.table('businesses').get('b1')).toMatchObject({ displayName: 'Demo Parts Supply' })
    expect(await next.table('futureTable').count()).toBe(0)
    next.close()
  })
})
