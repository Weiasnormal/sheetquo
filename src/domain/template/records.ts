import type { Diagnostic } from './diagnostics'
import type { MappingDraft } from './mappingDraft'
import type { Region } from './region'

export type TemplateState = 'draft' | 'tested' | 'active' | 'archived'

export type TemplateRecord = {
  id: string
  businessId: string
  name: string
  activeVersionId?: string
  createdAt: string
  updatedAt: string
  archivedAt?: string
}

/** One layout of a template. Drafts can change; tested and active versions cannot. */
export type TemplateVersionRecord = {
  id: string
  templateId: string
  businessId: string
  version: number
  state: TemplateState
  /** The file as uploaded. Never changed or overwritten. */
  originalBlobId: string
  originalSha256: string
  originalFileName: string
  originalSize: number
  /** The clean copy: one worksheet holding only the chosen area. */
  sourceBlobId: string
  sourceWorksheet: string
  region: Region
  capabilityWarnings: Diagnostic[]
  /** Editable while the version is a draft, then frozen once it passes its test. */
  mapping?: MappingDraft
  testResult?: TemplateTestResult
  createdAt: string
  updatedAt: string
}

export type TestRun = {
  items: number
  ok: boolean
  grandTotalMinor?: number
  printArea?: string
  diagnostics: Diagnostic[]
}

export type TemplateTestResult = {
  testedAt: string
  status: 'compatible' | 'warnings' | 'unsupported'
  runs: TestRun[]
}

/** A template with its versions, newest first. `version` is the newest; `active` is the one quotations use. */
export type TemplateSummary = {
  template: TemplateRecord
  version: TemplateVersionRecord
  versions: TemplateVersionRecord[]
  active?: TemplateVersionRecord
}
