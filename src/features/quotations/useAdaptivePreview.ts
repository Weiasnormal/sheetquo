import { useEffect, useState } from 'react'
import type { QuotationRecord } from '../../domain/quotation/records'
import { BUSINESS_LAYOUT } from '../../domain/quotation/letterhead'
import type { TemplateVersionRecord } from '../../domain/template/records'
import type { AdaptiveOutput } from '../../infrastructure/excel/adaptiveQuotation'
import { readWorkbookBytes } from '../../infrastructure/storage/templateRepository'

export function useAdaptivePreview(record: QuotationRecord, version: TemplateVersionRecord | undefined, blocked: boolean) {
  const [result,setResult] = useState<{record: QuotationRecord; version?: TemplateVersionRecord; output?: AdaptiveOutput; error?: string}>()
  useEffect(() => {
    if (!record.letterhead || blocked) return
    let current = true
    async function prepare() {
      const { buildAdaptiveQuotation } = await import('../../infrastructure/excel/adaptiveQuotation')
      const bytes = version && await readWorkbookBytes(version.sourceBlobId)
      if(record.templateId !== BUSINESS_LAYOUT && !bytes) throw new Error('The selected design is missing. Restore it from a backup.')
      const output = await buildAdaptiveQuotation(record,bytes)
      if(current) setResult({record,version,output})
    }
    void prepare().catch((error: unknown) => {if(current) setResult({record,version,error:error instanceof Error?error.message:'Could not prepare the quotation.'})})
    return () => {current=false}
  },[record,version,blocked])
  return !blocked && result?.record === record && result.version === version ? result : undefined
}
