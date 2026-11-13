export type WiwoEvent = 'business-saved' | 'template-imported' | 'template-tested' | 'template-activated' | 'template-copied' | 'preference-saved' | 'quote-created' | 'quote-generated' | 'quote-copied' | 'backup-exported' | 'backup-restored'

/** A success notification only, with no customer, workbook or price payload. Has no business side effects. */
export function wiwoSuccess(event: WiwoEvent) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('sheetquo:wiwo-success', { detail: event }))
}
