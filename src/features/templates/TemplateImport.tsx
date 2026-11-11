import { wiwoSuccess } from '../wiwo/events'
import { FileUp, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useBlocker, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Field, Input, Select } from '../../components/forms/Field'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Panel, PanelTitle } from '../../components/ui/Panel'
import type { BusinessRecord } from '../../domain/business/businessForm'
import { hasErrors } from '../../domain/template/diagnostics'
import type { Diagnostic } from '../../domain/template/diagnostics'
import { checkRegion, checkTemplateFile, describeRegion } from '../../domain/template/region'
import type { Region } from '../../domain/template/region'
import { columnToNumber, numberToColumn } from '../../infrastructure/excel/a1'
import type { OpenedWorkbook, WorksheetSummary } from '../../infrastructure/excel/WorkbookAdapter'
import { formatBytes } from '../settings/useStorageStatus'
import { findImportedFile, importTemplate, importTemplateVersion, readWorkbookBytes } from '../../infrastructure/storage/templateRepository'
import { DiagnosticList } from './DiagnosticList'
import { loadAdapter } from './loadAdapter'
import { WorkbookGrid } from './WorkbookGrid'
import type { TemplateSummary } from '../../domain/template/records'
import { reuseMapping } from '../../domain/template/reuseMapping'
import { CLEAN_SHEET_NAME } from '../../domain/template/region'

type Picked = { fileName: string; bytes: Uint8Array; workbook: OpenedWorkbook; duplicateOf?: string }

type Stage =
  | { kind: 'choose' }
  | { kind: 'reading'; fileName: string }
  | { kind: 'rejected'; fileName: string; diagnostics: Diagnostic[] }
  | { kind: 'review'; picked: Picked }

/** Only these describe the whole workbook rather than the template made from it. */
const WORKBOOK_ONLY = new Set(['MULTIPLE_WORKSHEETS', 'MANY_WORKSHEETS', 'HIDDEN_WORKSHEETS'])

const SELECT_THRESHOLD = 6

export function TemplateImport({ business, replacement }: { business: BusinessRecord; replacement?: TemplateSummary }) {
  const [stage, setStage] = useState<Stage>({ kind: 'choose' })

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    const check = checkTemplateFile(file.name, file.size)
    if (!check.ok) {
      setStage({ kind: 'rejected', fileName: file.name, diagnostics: [{ severity: 'error', code: 'FILE_TYPE', message: check.message }] })
      return
    }

    setStage({ kind: 'reading', fileName: file.name })
    const bytes = new Uint8Array(await file.arrayBuffer())
    try {
      const opened = await (await loadAdapter()).open(bytes)
      if (!opened.ok) {
        setStage({ kind: 'rejected', fileName: file.name, diagnostics: opened.diagnostics })
        return
      }
      const duplicateOf = await findImportedFile(business.id, bytes)
      setStage({ kind: 'review', picked: { fileName: file.name, bytes, workbook: opened.workbook, duplicateOf } })
    } catch {
      setStage({
        kind: 'rejected',
        fileName: file.name,
        diagnostics: [{ severity: 'error', code: 'NOT_XLSX', message: 'Could not read this workbook.' }],
      })
    }
  }

  if (stage.kind === 'review') {
    return <ImportReview key={stage.picked.fileName} picked={stage.picked} business={business} replacement={replacement} onReset={() => setStage({ kind: 'choose' })} />
  }

  return (
    <Panel data-wiwo="import-file" data-wiwo-busy={stage.kind === 'reading'} aria-labelledby="choose-title" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {stage.kind === 'reading' ? (
        <LoaderCircle className="size-6 animate-spin text-muted motion-reduce:animate-none" strokeWidth={1.5} aria-hidden="true" />
      ) : (
        <FileUp className="size-6 text-muted" strokeWidth={1.5} aria-hidden="true" />
      )}
      <div className="max-w-md">
        <PanelTitle id="choose-title">{stage.kind === 'reading' ? `Reading ${stage.fileName}` : 'Choose an .xlsx workbook'}</PanelTitle>
        <p className="mt-1 text-muted" role={stage.kind === 'reading' ? 'status' : undefined}>
          {stage.kind === 'reading'
            ? 'Checking every worksheet. Large archives can take a few seconds.'
            : 'Use the quotation you already print. Your file stays on this computer and is never changed.'}
        </p>
      </div>

      {stage.kind === 'rejected' && (
        <div role="alert" className="w-full max-w-md rounded-button border border-danger/30 bg-danger-tint px-4 py-3 text-left">
          <p className="font-medium text-danger">{stage.fileName} cannot be used</p>
          <ul className="mt-1 list-disc pl-4 text-danger">
            {stage.diagnostics.map((diagnostic) => (
              <li key={diagnostic.code}>{diagnostic.message}</li>
            ))}
          </ul>
          <p className="mt-2 text-muted">Your file was not changed.</p>
        </div>
      )}

      {stage.kind !== 'reading' && (
        <label className="press mt-2 inline-flex min-h-10 cursor-pointer items-center rounded-button bg-lime px-4 font-medium transition-[background-color,scale] duration-150 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink hover:bg-lime-hover active:scale-[0.97]">
          {stage.kind === 'rejected' ? 'Choose another file' : 'Choose file'}
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => void choose(event)} />
        </label>
      )}
    </Panel>
  )
}

function isCandidate(sheet: WorksheetSummary) {
  return sheet.filledCellCount > 0
}

function sheetLabel(sheet: WorksheetSummary): string {
  const parts = [sheet.name]
  if (sheet.state !== 'visible') parts.push('hidden')
  if (sheet.filledCellCount === 0) parts.push('empty')
  else if (sheet.quoteBlocks.length > 1) parts.push(`${sheet.quoteBlocks.length} quotations`)
  return parts.join(' · ')
}

type AreaFields = { firstRow: string; lastRow: string; lastColumn: string }

const toFields = (region: Region): AreaFields => ({
  firstRow: String(region.firstRow),
  lastRow: String(region.lastRow),
  lastColumn: numberToColumn(region.lastColumn),
})

function parseFields(fields: AreaFields, sheet: WorksheetSummary): { region?: Region; error?: string } {
  const column = fields.lastColumn.trim().toUpperCase()
  if (!/^[A-Z]{1,3}$/.test(column)) return { error: 'Enter a column letter, such as H.' }
  const region = { firstRow: Number(fields.firstRow), lastRow: Number(fields.lastRow), lastColumn: columnToNumber(column) }
  const check = checkRegion(region, sheet.rowCount)
  return check.ok ? { region } : { error: check.message }
}

function ImportReview({ picked, business, replacement, onReset }: { picked: Picked; business: BusinessRecord; replacement?: TemplateSummary; onReset: () => void }) {
  const navigate = useNavigate()
  const finished = useRef(false)
  const { inspection } = picked.workbook
  const candidates = inspection.worksheets.filter(isCandidate)

  const [sheetName, setSheetName] = useState(candidates.length === 1 ? candidates[0].name : '')
  const sheet = inspection.worksheets.find(({ name }) => name === sheetName)
  const [fields, setFields] = useState<AreaFields | null>(
    candidates.length === 1 && candidates[0].quoteBlocks.length === 1 ? toFields(candidates[0].quoteBlocks[0]) : null,
  )
  const [name, setName] = useState(replacement?.template.name ?? picked.fileName.replace(/\.xlsx$/i, ''))
  const [nameError, setNameError] = useState<string>()
  const [extractErrors, setExtractErrors] = useState<Diagnostic[]>([])
  const [saveError, setSaveError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const blocker = useBlocker(({ currentLocation, nextLocation }) => !finished.current && currentLocation.pathname !== nextLocation.pathname)

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!finished.current) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const parsed = sheet && fields ? parseFields(fields, sheet) : {}
  const region = parsed.region
  // Reading at most 120 rows by 30 columns from the parsed workbook is quick, so it runs on each change.
  const grid = region ? picked.workbook.readGrid(sheetName, region) : undefined

  const workbookDiagnostics = inspection.diagnostics
  const templateDiagnostics = workbookDiagnostics.filter(({ code }) => !WORKBOOK_ONLY.has(code))

  function chooseSheet(next: string) {
    setSheetName(next)
    setExtractErrors([])
    const nextSheet = inspection.worksheets.find(({ name: candidate }) => candidate === next)
    if (nextSheet?.quoteBlocks.length === 1) {
      setFields(toFields(nextSheet.quoteBlocks[0]))
    } else {
      setFields(null)
    }
  }

  function chooseBlock(index: number) {
    if (!sheet) return
    setFields(toFields(sheet.quoteBlocks[index]))
    setExtractErrors([])
  }

  function editField(key: keyof AreaFields) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setFields((current) => ({ ...(current ?? { firstRow: '1', lastRow: '1', lastColumn: 'A' }), [key]: event.target.value }))
      setExtractErrors([])
    }
  }

  async function save() {
    setSaveError(undefined)
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Enter a template name')
      return
    }
    if (!sheet || !region) return

    setSaving(true)
    try {
    const extracted = await (await loadAdapter()).extractRegion(picked.bytes, sheet.name, region)
    if (!extracted.ok) {
      setSaving(false)
      setExtractErrors(extracted.diagnostics)
      return
    }

    const input = {
      businessId: business.id,
      name: trimmed,
      original: { fileName: picked.fileName, bytes: picked.bytes },
      clean: extracted.bytes,
      sourceWorksheet: sheet.name,
      region,
      capabilityWarnings: [...templateDiagnostics, ...extracted.diagnostics],
    }
    let result
      if (replacement) {
        const adapter = await loadAdapter()
        const previousBytes = await readWorkbookBytes(replacement.version.sourceBlobId)
        if (!previousBytes) throw new Error('Previous workbook is missing')
        const before = await adapter.open(previousBytes), after = await adapter.open(extracted.bytes)
        if (!before.ok || !after.ok) throw new Error('Could not compare the workbooks')
        const oldRegion = replacement.version.region
        const reuse = reuseMapping(replacement.version.mapping,
          before.workbook.readGrid(CLEAN_SHEET_NAME, { firstRow: 1, lastRow: oldRegion.lastRow - oldRegion.firstRow + 1, lastColumn: oldRegion.lastColumn }),
          after.workbook.readGrid(CLEAN_SHEET_NAME, { firstRow: 1, lastRow: region.lastRow - region.firstRow + 1, lastColumn: region.lastColumn }))
        result = await importTemplateVersion(replacement.template.id, replacement.version.id,
          { ...input, capabilityWarnings: [...input.capabilityWarnings, ...reuse.diagnostics] }, reuse.mapping)
      } else result = await importTemplate(input)
    setSaving(false)

    if (!result.ok) {
      if (result.error.code === 'DUPLICATE_NAME') setNameError(result.error.message)
      else setSaveError(result.error.message)
      return
    }

    wiwoSuccess('template-imported')
    finished.current = true
    toast.success(replacement ? 'New workbook version saved for review' : 'Template imported', { description: trimmed })
    navigate(`/templates/${result.value.template.id}/map`)
    } catch { setSaveError('Could not save this version. Your existing templates are unchanged.') }
    finally { setSaving(false) }
  }

  const blocks = sheet?.quoteBlocks ?? []
  // The chosen quotation follows the rows, so narrowing the columns keeps it selected.
  const block = fields ? blocks.findIndex((option) => String(option.firstRow) === fields.firstRow && String(option.lastRow) === fields.lastRow) : -1
  const canSave = Boolean(sheet && region) && !saving

  return (
    <div className="flex flex-col gap-4">
      <Panel data-wiwo="import-review" data-wiwo-busy={saving} aria-labelledby="file-title" className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <PanelTitle id="file-title" className="break-all">
              {picked.fileName}
            </PanelTitle>
            <p className="tabular text-muted">
              {formatBytes(picked.bytes.length)} · {inspection.worksheets.length} worksheet{inspection.worksheets.length === 1 ? '' : 's'}.
              Your original file is kept unchanged.
            </p>
          </div>
          <Button variant="secondary" onClick={onReset}>
            Choose another file
          </Button>
        </div>
        {picked.duplicateOf && (
          <p className="mt-3 rounded-button border border-notice/30 bg-notice-tint px-3 py-2 text-notice">
            This exact file was already imported as “{picked.duplicateOf}”.
          </p>
        )}
        <div className="mt-4 border-t border-rule pt-4">
          <DiagnosticList diagnostics={workbookDiagnostics} />
        </div>
      </Panel>

      <Panel data-wiwo="import-sheet" aria-labelledby="sheet-title" className="p-5">
        <PanelTitle id="sheet-title">Worksheet</PanelTitle>
        <p className="mt-1 text-muted">
          {candidates.length > 1 ? 'Choose the worksheet that holds the quotation layout you print.' : 'Sheetquo found one worksheet with content.'}
        </p>
        <div className="mt-3">
          {inspection.worksheets.length > SELECT_THRESHOLD ? (
            <Field label="Worksheet" required>
              {(control) => (
                <Select {...control} value={sheetName} onChange={(event) => chooseSheet(event.target.value)} className="sm:max-w-md">
                  <option value="" disabled>
                    Choose a worksheet
                  </option>
                  {inspection.worksheets.map((option) => (
                    <option key={option.name} value={option.name} disabled={!isCandidate(option)}>
                      {sheetLabel(option)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ) : (
            <fieldset>
              <legend className="sr-only">Worksheet</legend>
              <div className="flex flex-col gap-1">
                {inspection.worksheets.map((option) => (
                  <label
                    key={option.name}
                    className={cn(
                      'flex min-h-11 items-center gap-3 rounded-button border px-3',
                      option.name === sheetName ? 'border-control bg-lime-tint' : 'border-line',
                      isCandidate(option) ? 'cursor-pointer' : 'cursor-not-allowed text-muted',
                    )}
                  >
                    <input
                      type="radio"
                      name="worksheet"
                      value={option.name}
                      checked={option.name === sheetName}
                      disabled={!isCandidate(option)}
                      onChange={() => chooseSheet(option.name)}
                      className="size-4 accent-ink"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{option.name}</span>
                    {option.state !== 'visible' && <Badge>Hidden</Badge>}
                    {option.filledCellCount === 0 ? (
                      <span className="text-muted">Empty</span>
                    ) : option.quoteBlocks.length > 1 ? (
                      <Badge tone="notice">{option.quoteBlocks.length} quotations</Badge>
                    ) : null}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      </Panel>

      {sheet && (
        <Panel data-wiwo="import-area" aria-labelledby="area-title" className="p-5">
          <PanelTitle id="area-title">Quotation area</PanelTitle>
          <p className="mt-1 text-muted">
            {blocks.length > 1
              ? `${sheet.name} holds ${blocks.length} quotations. Choose the one to keep. The others stay in your original file.`
              : 'Leave out columns your customers never see, such as costs or notes.'}
          </p>

          {blocks.length > 1 && (
            <fieldset className="mt-3">
              <legend className="sr-only">Quotations on this worksheet</legend>
              <div className="flex flex-wrap gap-2">
                {blocks.map((option, index) => (
                  <label
                    key={`${option.firstRow}-${option.lastRow}`}
                    className={cn(
                      'tabular flex min-h-10 cursor-pointer items-center gap-2 rounded-button border px-3',
                      block === index ? 'border-control bg-lime-tint font-medium' : 'border-line',
                    )}
                  >
                    <input type="radio" name="block" checked={block === index} onChange={() => chooseBlock(index)} className="size-4 accent-ink" />
                    {describeRegion(option)}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {fields && (
            <>
              <div className="mt-4 grid max-w-xl grid-cols-3 gap-3">
                <Field label="First row" required>
                  {(control) => <Input {...control} inputMode="numeric" value={fields.firstRow} onChange={editField('firstRow')} />}
                </Field>
                <Field label="Last row" required>
                  {(control) => <Input {...control} inputMode="numeric" value={fields.lastRow} onChange={editField('lastRow')} />}
                </Field>
                <Field label="Last column" required>
                  {(control) => <Input {...control} value={fields.lastColumn} onChange={editField('lastColumn')} autoCapitalize="characters" />}
                </Field>
              </div>
              {parsed.error && (
                <p role="alert" className="mt-2 text-danger">
                  {parsed.error}
                </p>
              )}
            </>
          )}

          {extractErrors.length > 0 && (
            <div role="alert" className="mt-4 rounded-button border border-danger/30 bg-danger-tint px-4 py-3">
              <DiagnosticList diagnostics={extractErrors} />
            </div>
          )}

          {grid && region && (
            <div className="mt-4">
              <WorkbookGrid grid={grid} caption={`Preview of ${sheet.name}, ${describeRegion(region).toLowerCase()}, columns A to ${numberToColumn(region.lastColumn)}`} />
            </div>
          )}
        </Panel>
      )}

      {sheet && region && (
        <Panel data-wiwo="import-save" aria-labelledby="save-title" className="flex flex-col gap-4 p-5">
          <PanelTitle id="save-title">{replacement ? `New version of ${replacement.template.name}` : 'Save template'}</PanelTitle>
          {replacement && <p>Earlier versions and quotations stay unchanged. Matching mappings are reused; changed cells are flagged. Review and test this draft before activation.</p>}
          <div className="max-w-md">
            <Field label="Template name" required error={nameError} hint="Shown in your template list">
              {(control) => (
                <Input
                  {...control}
                  value={name}
                  disabled={Boolean(replacement)}
                  onChange={(event) => {
                    setName(event.target.value)
                    setNameError(undefined)
                  }}
                />
              )}
            </Field>
          </div>
          {hasErrors(templateDiagnostics) && (
            <p className="text-danger">This workbook has problems that stop the import. See the list at the top.</p>
          )}
          {saveError && (
            <p role="alert" className="rounded-button border border-danger/30 bg-danger-tint px-4 py-3 text-danger">
              {saveError}
            </p>
          )}
          <div className="flex justify-end">
            <Button disabled={!canSave || hasErrors(templateDiagnostics)} onClick={() => void save()}>
              {saving ? 'Importing…' : replacement ? 'Save new workbook version' : 'Import template'}
            </Button>
          </div>
        </Panel>
      )}

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset()
        }}
        title="Leave without importing?"
        description="Nothing has been saved yet. Your original file is not affected."
        confirmLabel="Leave without importing"
        cancelLabel="Keep going"
        onConfirm={() => blocker.proceed?.()}
      />
    </div>
  )
}
