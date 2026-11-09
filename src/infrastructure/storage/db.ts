import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { BusinessRecord } from '../../domain/business/businessForm'
import type { QuotationRecord } from '../../domain/quotation/records'
import type { TemplateRecord, TemplateVersionRecord } from '../../domain/template/records'
import { applyMigrations } from './migrations'

export type StoredBlob = {
  id: string
  kind: 'logo' | 'workbook'
  name: string
  type: string
  /** Raw bytes rather than a Blob, so backups can read them without async file APIs. */
  bytes: Uint8Array
}

export type SettingKey = 'currentBusinessId' | 'lastBackupAt'
export type StoredSetting = { key: SettingKey; value: string }

export class SheetquoDatabase extends Dexie {
  declare businesses: EntityTable<BusinessRecord, 'id'>
  declare blobs: EntityTable<StoredBlob, 'id'>
  declare settings: EntityTable<StoredSetting, 'key'>
  declare templates: EntityTable<TemplateRecord, 'id'>
  declare templateVersions: EntityTable<TemplateVersionRecord, 'id'>
  declare quotations: EntityTable<QuotationRecord, 'id'>

  constructor(name = 'sheetquo') {
    super(name)
    applyMigrations(this)
  }
}

export const db = new SheetquoDatabase()
