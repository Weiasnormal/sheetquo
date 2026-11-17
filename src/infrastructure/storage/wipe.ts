import { db } from './db'
import { attempt } from './storageResult'

export type DataCounts = { businesses: number; templates: number; quotations: number }

export async function countAllData(): Promise<DataCounts> {
  const [businesses, templates, quotations] = await Promise.all([db.businesses.count(), db.templates.count(), db.quotations.count()])
  return { businesses, templates, quotations }
}

/** Remembered layout choices live outside the database, keyed by business. */
function forgetLayoutChoices() {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
    for (const key of keys) if (key?.startsWith('quotation-layout:')) localStorage.removeItem(key)
  } catch {
    // A browser that blocks localStorage has nothing remembered there.
  }
}

/** Empties every Sheetquo table in this browser at once: businesses, logos, templates, workbooks, quotations and settings. */
export function wipeAllData() {
  return attempt(async () => {
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((table) => table.clear()))
    })
    forgetLayoutChoices()
  })
}
