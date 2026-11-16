import type { QuotationRecord } from '../../domain/quotation/records'
import { BUSINESS_LAYOUT, businessLetterhead } from '../../domain/quotation/letterhead'
import { toDataUrl } from '../../domain/business/logo'
import type { Business } from '../../domain/quotation/types'
import { db } from './db'
import { attempt, now, StorageFailure } from './storageResult'

export type NewQuotation = Omit<QuotationRecord, 'id' | 'createdAt' | 'updatedAt' | 'generatedAt' | 'generatedFilename'>

const NOT_FOUND = 'This quotation is no longer saved in this browser.'

async function requireQuotation(id: string) {
  const quotation = await db.quotations.get(id)
  if (!quotation) throw new StorageFailure('NOT_FOUND', NOT_FOUND)
  return quotation
}

async function snapshotLetterhead(business: Business, useTemplateLogo?: boolean) {
  const header = businessLetterhead(business)
  header.useTemplateLogo = useTemplateLogo
  if (business.logoBlobId) {
    const logo = await db.blobs.get(business.logoBlobId)
    if (!logo) throw new StorageFailure('NOT_FOUND', 'The saved business logo is missing. Upload it again in Businesses.')
    header.logo = toDataUrl(logo.bytes, logo.type)
  }
  return header
}

/** Starts a draft for an active business, using a version of one of that business's own templates. */
export function createQuotation(input: NewQuotation) {
  return attempt(() =>
    db.transaction('rw', [db.businesses, db.templateVersions, db.quotations, db.blobs], async () => {
      const business = await db.businesses.get(input.businessId)
      if (!business || business.archivedAt) {
        throw new StorageFailure('NOT_FOUND', 'This business is no longer active, so the quotation was not started.')
      }
      const version = await db.templateVersions.get(input.templateVersionId)
      const builtIn = input.letterhead && input.templateId === BUSINESS_LAYOUT && input.templateVersionId === BUSINESS_LAYOUT
      if (!builtIn && (!version || version.businessId !== input.businessId || version.templateId !== input.templateId)) {
        throw new StorageFailure('NOT_FOUND', 'This template is no longer saved for this business.')
      }
      const timestamp = now()
      const record: QuotationRecord = { ...input, id: crypto.randomUUID(), createdAt: timestamp, updatedAt: timestamp }
      if (record.letterhead) record.letterhead = await snapshotLetterhead(business, record.letterhead.useTemplateLogo)
      await db.quotations.add(record)
      return record
    }),
  )
}

/** Saves the whole draft. It can never move to another business. */
export function saveQuotation(record: QuotationRecord) {
  return attempt(() =>
    db.transaction('rw', db.quotations, async () => {
      const current = await requireQuotation(record.id)
      if (current.businessId !== record.businessId) throw new StorageFailure('NOT_FOUND', NOT_FOUND)
      const updatedAt = now()
      await db.quotations.put({ ...record, createdAt: current.createdAt, updatedAt })
      return updatedAt
    }),
  )
}

export function readQuotation(id: string): Promise<QuotationRecord | undefined> {
  return db.quotations.get(id)
}

/** One business's quotations, most recently changed first. */
export async function listQuotations(businessId: string, limit?: number): Promise<QuotationRecord[]> {
  const all = await db.quotations.where('businessId').equals(businessId).toArray()
  const sorted = all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return limit === undefined ? sorted : sorted.slice(0, limit)
}

/** A copy to quote again. The quotation number is cleared, so two files never share one by accident. */
export function duplicateQuotation(id: string, adaptive = false) {
  return attempt(() =>
    db.transaction('rw', [db.quotations, db.businesses, db.blobs], async () => {
      const source = await requireQuotation(id)
      const timestamp = now()
      const copy: QuotationRecord = {
        ...source,
        id: crypto.randomUUID(),
        quoteNumber: undefined,
        generatedAt: undefined,
        generatedFilename: undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      if (adaptive || source.letterhead) {
        const business = await db.businesses.get(source.businessId)
        if (!business || business.archivedAt) throw new StorageFailure('NOT_FOUND')
        copy.letterhead = await snapshotLetterhead(business, source.letterhead?.useTemplateLogo)
      }
      await db.quotations.add(copy)
      return copy
    }),
  )
}

export function deleteQuotation(id: string) {
  return attempt(async () => {
    await requireQuotation(id)
    await db.quotations.delete(id)
  })
}

/** Notes that an Excel file was made. It does not count as a change to the quotation itself. */
export function recordGenerated(id: string, filename: string) {
  return attempt(() =>
    db.transaction('rw', db.quotations, async () => {
      await requireQuotation(id)
      const at = now()
      await db.quotations.update(id, { generatedAt: at, generatedFilename: filename, updatedAt: at })
      return at
    }),
  )
}
