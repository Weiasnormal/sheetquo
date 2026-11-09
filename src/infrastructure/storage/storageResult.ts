import Dexie from 'dexie'

export type StorageErrorCode = 'QUOTA' | 'DUPLICATE_NAME' | 'NOT_FOUND' | 'LOCKED' | 'UNAVAILABLE'
export type StorageError = { code: StorageErrorCode; message: string }
export type StorageResult<T> = { ok: true; value: T } | { ok: false; error: StorageError }

const MESSAGES: Record<StorageErrorCode, string> = {
  QUOTA: 'This browser is out of storage space. Export a backup and free up space, then try again.',
  DUPLICATE_NAME: 'This name is already in use.',
  NOT_FOUND: 'This item is no longer saved in this browser.',
  LOCKED: 'This version is tested, so it cannot change. Start a new version to edit it.',
  UNAVAILABLE: 'Could not save. This browser may be blocking storage.',
}

/** Thrown inside a transaction to roll it back with a message meant for the screen. */
export class StorageFailure extends Error {
  code: StorageErrorCode

  constructor(code: StorageErrorCode, message = MESSAGES[code]) {
    super(message)
    this.code = code
  }
}

function isQuotaError(error: unknown): boolean {
  const failure = error as { name?: string; inner?: { name?: string } } | null
  return [failure?.name, failure?.inner?.name].includes(Dexie.errnames.QuotaExceeded)
}

function toStorageError(error: unknown): StorageError {
  if (error instanceof StorageFailure) return { code: error.code, message: error.message }
  const code = isQuotaError(error) ? 'QUOTA' : 'UNAVAILABLE'
  return { code, message: MESSAGES[code] }
}

/** Every write goes through here, so a failure is reported instead of thrown at a screen. */
export async function attempt<T>(work: () => Promise<T>): Promise<StorageResult<T>> {
  try {
    return { ok: true, value: await work() }
  } catch (error) {
    if (!(error instanceof StorageFailure)) console.error('Sheetquo storage error', error)
    return { ok: false, error: toStorageError(error) }
  }
}

export const now = () => new Date().toISOString()
