import type Dexie from 'dexie'

export const SCHEMA_VERSION = 3

/**
 * Every schema version lives here, in order. Add a new version instead of editing an old
 * one: browsers that already hold version 1 only run the upgrades after it, and a version
 * without an explicit upgrade keeps all existing rows.
 */
export function applyMigrations(db: Dexie) {
  db.version(1).stores({
    businesses: 'id',
    blobs: 'id',
    settings: 'key',
  })

  // Templates belong to a business; each keeps immutable versions with their workbook files in `blobs`.
  db.version(2).stores({
    templates: 'id, businessId',
    templateVersions: 'id, templateId, businessId',
  })

  // Quotation drafts belong to a business and remember the template version they were started with.
  db.version(3).stores({
    quotations: 'id, businessId, updatedAt',
  })
}
