import { useId, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import type { ReactNode } from 'react'
import { useBlocker, useNavigate } from 'react-router'
import { Input, Select } from '../../../components/forms/Field'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { cn } from '../../../components/ui/cn'
import { Panel, PanelTitle } from '../../../components/ui/Panel'
import { FIELD_GROUPS, fieldSpec, ITEM_COLUMNS } from '../../../domain/template/fields'
import type { ItemColumnKey } from '../../../domain/template/fields'
import type { WorkbookGridData } from '../../../domain/template/grid'
import { findLeftovers } from '../../../domain/template/leftovers'
import { checkDraft, emptyDraft, normalizeAddress, shapeFromGrid } from '../../../domain/template/mappingDraft'
import type { MappingIssue } from '../../../domain/template/mappingDraft'
import type { TemplateVersionRecord } from '../../../domain/template/records'
import { suggestMapping } from '../../../domain/template/suggestMapping'
import type { PrintProfile, SemanticKey } from '../../../domain/template/types'
import { useMappingAutosave } from './useMappingAutosave'
import { OutputControls } from './OutputControls'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import type { CellMark, RowMark } from '../WorkbookGrid'
import { WorkbookGrid } from '../WorkbookGrid'

type TableRowKey = 'headerRow' | 'firstDataRow' | 'prototypeRow' | 'footerAnchorRow'

function MarginField({ label, value, onChange, disabled }: { label: string; value: number; onChange: (value: number) => void; disabled: boolean }) {
  return <label className="flex items-center justify-between gap-3 py-2">
    <span>{label}</span>
    <Input className="w-24 text-right" type="number" min="0" max="3" step="0.05" inputMode="decimal"
      defaultValue={value} disabled={disabled}
      onChange={(event) => { if (Number.isFinite(event.target.valueAsNumber)) onChange(event.target.valueAsNumber) }}
      onBlur={(event) => { if (event.target.value === '') event.target.value = String(value) }} />
  </label>
}
type Target = { kind: 'field'; key: SemanticKey } | { kind: 'row'; key: TableRowKey } | { kind: 'column'; key: ItemColumnKey }

const targetId = (target: Target) =>
  target.kind === 'field' ? target.key : target.kind === 'row' ? `table.${target.key}` : `table.columns.${target.key}`

const TABLE_ROWS: { key: TableRowKey; label: string }[] = [
  { key: 'headerRow', label: 'Header row' },
  { key: 'firstDataRow', label: 'First item row' },
  { key: 'prototypeRow', label: 'Prototype style row (defaults to first item)' },
  { key: 'footerAnchorRow', label: 'First row after the items' },
]

const TARGET_LABEL = (target: Target) =>
  target.kind === 'field'
    ? fieldSpec(target.key).label
    : target.kind === 'row'
      ? TABLE_ROWS.find(({ key }) => key === target.key)!.label
      : `${ITEM_COLUMNS.find(({ key }) => key === target.key)!.label} column`

type MappingStudioProps = {
  version: TemplateVersionRecord
  grid: WorkbookGridData
  defaults: { lastColumn: string; paper?: PrintProfile['paper']; orientation?: PrintProfile['orientation'] }
  readOnly: boolean
  lockedNotice?: ReactNode
  testHref: string
}

/** A label beside a short input, so twenty-odd fields fit in one column. */
function MappingRow({
  label,
  required,
  value,
  onChange,
  onFocus,
  active,
  error,
  disabled,
  after,
  inputMode,
  anchor,
}: {
  label: string
  required?: boolean
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  active?: boolean
  error?: string
  disabled?: boolean
  after?: ReactNode
  inputMode?: 'numeric'
  anchor?: string
}) {
  const id = useId()
  return (
    <div data-wiwo={anchor} className="py-1.5">
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="min-w-0 flex-1">
          {label}
          {required && <span className="text-muted"> (required)</span>}
        </label>
        {after}
        <input
          id={id}
          value={value}
          disabled={disabled}
          inputMode={inputMode}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onFocus={onFocus}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'tabular h-9 w-20 flex-none rounded-chip border border-control bg-surface px-2 text-sm uppercase transition-colors duration-150 disabled:bg-ground disabled:text-muted aria-invalid:border-danger',
            active && 'border-ink outline-2 outline-offset-1 outline-ink',
          )}
        />
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

function SmallButton(props: ComponentProps<typeof Button>) {
  return <Button variant="secondary" {...props} className={cn('min-h-8 px-2.5 text-xs', props.className)} />
}

export function MappingStudio({ version, grid, defaults, readOnly, lockedNotice, testHref }: MappingStudioProps) {
  const { draft, change, flush, dirty, saveState, saveError } = useMappingAutosave(version.id, version.mapping ?? emptyDraft(defaults), readOnly)
  const [target, setTarget] = useState<Target | null>(null)
  const navigate = useNavigate()
  const leaving = useRef(false)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => !readOnly && dirty.current && currentLocation.pathname !== nextLocation.pathname)

  const shape = shapeFromGrid(grid)
  const issues = checkDraft(draft, shape)
  const errorFor = (id: string) => issues.find((issue: MappingIssue) => issue.target === id)?.message
  const suggestion = suggestMapping(grid)
  const leftovers = findLeftovers(grid, draft)
  const leftoverValues = leftovers.filter(({ kind }) => kind === 'value')
  const leftoverLabels = leftovers.filter(({ kind }) => kind === 'label')
  const { headerRow, firstDataRow, footerAnchorRow } = draft.table

  const emptySuggestions =
    Object.entries(suggestion.fields).filter(([key]) => !draft.fields[key as SemanticKey]).length +
    TABLE_ROWS.filter(({ key }) => key !== 'prototypeRow' && suggestion.table[key] && !draft.table[key]).length +
    Object.entries(suggestion.table.columns).filter(([key]) => !draft.table.columns[key as ItemColumnKey]).length

  function applySuggestions() {
    change((current) => ({
      ...current,
      fields: { ...suggestion.fields, ...stripEmpty(current.fields) },
      table: {
        ...current.table,
        headerRow: current.table.headerRow ?? suggestion.table.headerRow,
        firstDataRow: current.table.firstDataRow ?? suggestion.table.firstDataRow,
        footerAnchorRow: current.table.footerAnchorRow ?? suggestion.table.footerAnchorRow,
        minDisplayRows: current.table.minDisplayRows ?? suggestion.table.minDisplayRows,
        columns: { ...suggestion.table.columns, ...stripEmpty(current.table.columns) },
      },
    }))
  }

  function pick(address: string) {
    if (readOnly || !target) return
    const [, column, row] = /^([A-Z]+)(\d+)$/.exec(address) ?? []
    if (target.kind === 'field') change((current) => ({ ...current, fields: { ...current.fields, [target.key]: address } }))
    if (target.kind === 'row') change((current) => ({ ...current, table: { ...current.table, [target.key]: Number(row) } }))
    if (target.kind === 'column') {
      change((current) => ({ ...current, table: { ...current.table, columns: { ...current.table.columns, [target.key]: column } } }))
    }
    setTarget(null)
  }

  const setField = (key: SemanticKey, value: string) =>
    change((current) => ({ ...current, fields: { ...current.fields, [key]: normalizeAddress(value) || undefined } }))
  const setRow = (key: TableRowKey | 'minDisplayRows' | 'maxItems', value: string) =>
    change((current) => ({ ...current, table: { ...current.table, [key]: value.trim() === '' || !Number.isFinite(Number(value)) ? undefined : Number(value) } }))
  const setColumn = (key: ItemColumnKey, value: string) =>
    change((current) => ({
      ...current,
      table: { ...current.table, columns: { ...current.table.columns, [key]: value.trim().toUpperCase() || undefined } },
    }))
  const setPrint = (update: Partial<PrintProfile>) => change((current) => ({ ...current, print: { ...current.print, ...update } }))
  const toggleClear = (address: string) =>
    change((current) => ({
      ...current,
      clearCells: current.clearCells.includes(address)
        ? current.clearCells.filter((cell) => cell !== address)
        : [...current.clearCells, address],
    }))

  const cellMarks: Record<string, { mark: CellMark; label?: string }> = {}
  for (const address of draft.clearCells) cellMarks[address] = { mark: 'cleared', label: 'Cleared in quotations' }
  for (const [key, address] of Object.entries(draft.fields) as [SemanticKey, string][]) {
    if (address) cellMarks[address] = { mark: 'mapped', label: fieldSpec(key).label }
  }
  const rowMarks: Record<number, RowMark> = {}
  if (firstDataRow && footerAnchorRow) for (let row = firstDataRow; row < footerAnchorRow; row += 1) rowMarks[row] = 'items'
  if (headerRow) rowMarks[headerRow] = 'header'
  if (footerAnchorRow) rowMarks[footerAnchorRow] = 'footer'

  const focus = (next: Target) => () => !readOnly && setTarget(next)
  const isActive = (candidate: Target) => target !== null && targetId(target) === targetId(candidate)
  const errors = issues.filter(({ severity }) => severity === 'error')

  return (
    <div data-wiwo-record={`/templates/${version.templateId}`} data-wiwo-version={version.id} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px] xl:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        {lockedNotice}
        <ConfirmDialog open={blocker.state === 'blocked'}
          onOpenChange={(open) => { if (!open && !leaving.current && blocker.state === 'blocked') blocker.reset() }}
          title="Leave with unsaved mapping changes?" description="Keep this page open and retry saving to preserve your latest mapping. Leaving can lose these changes."
          cancelLabel="Stay here" confirmLabel="Leave page"
          onConfirm={() => { leaving.current = true; if (blocker.state === 'blocked') blocker.proceed() }} />
        {saveState === 'failed' && <div role="alert" className="rounded-button border border-line p-4">
          <p>{saveError} Your mapping is still on this page.</p>
          <Button data-wiwo="save-failed" variant="secondary" onClick={() => void flush()}>Retry saving mapping</Button>
        </div>}

        <Panel data-wiwo="mapping-grid" aria-labelledby="grid-title" className="p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <PanelTitle id="grid-title">Template</PanelTitle>
            {!readOnly && (
              <p role="status" className="text-xs text-muted">
                {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'All changes saved' : saveState === 'failed' ? saveError : ''}
              </p>
            )}
          </div>
          <p className="mt-1 mb-3 text-muted">
            {readOnly
              ? 'Outlined cells are filled for each quotation. Tinted row numbers mark the item rows.'
              : target
                ? `Click the cell for ${TARGET_LABEL(target).toLowerCase()}, or type it in the field.`
                : 'Choose a field on the right, then click its cell here.'}
          </p>
          <WorkbookGrid
            grid={grid}
            caption="Template cells. Outlined cells are mapped; marked rows hold the item table."
            onCellClick={readOnly ? undefined : pick}
            cellMarks={cellMarks}
            rowMarks={rowMarks}
          />
        </Panel>

        <Panel data-wiwo="mapping-leftovers" aria-labelledby="leftover-title" className="p-5">
          <PanelTitle id="leftover-title">Cells that print as they are</PanelTitle>
          <p className="mt-1 text-muted">
            No field fills these, so every quotation shows them unchanged. Clear any that are left from an old quotation.
          </p>
          {leftoverValues.length === 0 ? (
            <p className="mt-3 text-muted">No leftover values. Only labels and headings remain.</p>
          ) : (
            <ul className="mt-3 divide-y divide-rule">
              {leftoverValues.map(({ address, text, repeats }) => (
                <li key={address} className="flex items-center gap-3 py-2">
                  <span className="tabular w-12 flex-none text-muted">{address}</span>
                  <span className={cn('min-w-0 flex-1 truncate', draft.clearCells.includes(address) && 'text-muted line-through')}>{text}</span>
                  {repeats && <Badge tone="notice">Repeats on every item</Badge>}
                  <label className="flex flex-none items-center gap-2">
                    <input
                      type="checkbox"
                      checked={draft.clearCells.includes(address)}
                      disabled={readOnly}
                      onChange={() => toggleClear(address)}
                      className="size-4 accent-ink"
                    />
                    Clear
                  </label>
                </li>
              ))}
            </ul>
          )}
          {leftoverLabels.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-muted hover:text-ink">
                {leftoverLabels.length} label{leftoverLabels.length === 1 ? '' : 's'} and headings stay as they are
              </summary>
              <ul className="mt-2 divide-y divide-rule">
                {leftoverLabels.map(({ address, text }) => (
                  <li key={address} className="flex items-center gap-3 py-1.5">
                    <span className="tabular w-12 flex-none text-muted">{address}</span>
                    <span className={cn('min-w-0 flex-1 truncate', draft.clearCells.includes(address) && 'text-muted line-through')}>{text}</span>
                    <label className="flex flex-none items-center gap-2 text-muted">
                      <input
                        type="checkbox"
                        checked={draft.clearCells.includes(address)}
                        disabled={readOnly}
                        onChange={() => toggleClear(address)}
                        className="size-4 accent-ink"
                      />
                      Clear
                    </label>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Panel>
      </div>

      <div className="flex flex-col gap-4">
        {!readOnly && emptySuggestions > 0 && (
          <Panel data-wiwo="mapping-suggestions" aria-labelledby="suggest-title" className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="max-w-xs">
              <PanelTitle id="suggest-title">Suggestions</PanelTitle>
              <p className="mt-1 text-muted">
                Sheetquo found likely cells for {emptySuggestions} empty setting{emptySuggestions === 1 ? '' : 's'}, from labels and headings. Check each one.
              </p>
            </div>
            <Button variant="secondary" onClick={applySuggestions}>
              Use suggestions
            </Button>
          </Panel>
        )}

        <Panel data-wiwo="mapping-table" aria-labelledby="table-title" className="p-5">
          <PanelTitle id="table-title">Item table</PanelTitle>
          <div className="mt-2 divide-y divide-rule">
            {TABLE_ROWS.map(({ key, label }) => (
              <MappingRow
                key={key}
                label={label}
                anchor={key === 'prototypeRow' ? 'mapping-prototype' : undefined}
                required={key !== 'prototypeRow'}
                inputMode="numeric"
                value={draft.table[key]?.toString() ?? ''}
                onChange={(value) => setRow(key, value)}
                onFocus={focus({ kind: 'row', key })}
                active={isActive({ kind: 'row', key })}
                error={errorFor(`table.${key}`)}
                disabled={readOnly}
              />
            ))}
            <MappingRow
              label="Rows shown when there are fewer items"
              inputMode="numeric"
              value={draft.table.minDisplayRows?.toString() ?? ''}
              onChange={(value) => setRow('minDisplayRows', value)}
              disabled={readOnly}
            />
          </div>
          <h3 className="mt-4 text-sm font-medium">Columns</h3>
          <div data-wiwo="mapping-columns" className="mt-1 divide-y divide-rule">
            {ITEM_COLUMNS.map(({ key, label, required }) => (
              <MappingRow
                key={key}
                label={label}
                required={required}
                value={draft.table.columns[key] ?? ''}
                onChange={(value) => setColumn(key, value)}
                onFocus={focus({ kind: 'column', key })}
                active={isActive({ kind: 'column', key })}
                error={errorFor(`table.columns.${key}`)}
                disabled={readOnly}
                after={
                  !readOnly && !draft.table.columns[key] && suggestion.table.columns[key] ? (
                    <SmallButton onClick={() => setColumn(key, suggestion.table.columns[key]!)}>Use {suggestion.table.columns[key]}</SmallButton>
                  ) : undefined
                }
              />
            ))}
          </div>
        </Panel>

        <div data-wiwo="mapping-fields" className="flex flex-col gap-4">{FIELD_GROUPS.map(({ title, fields }) => (
          <Panel key={title} aria-label={title} className="p-5">
            <PanelTitle>{title}</PanelTitle>
            <div className="mt-2 divide-y divide-rule">
              {fields.map((spec) => {
                const value = draft.fields[spec.key] ?? ''
                const suggested = suggestion.fields[spec.key]
                return (
                  <div key={spec.key}>
                    <MappingRow
                      label={spec.label}
                      required={spec.required}
                      value={value}
                      onChange={(next) => setField(spec.key, next)}
                      onFocus={focus({ kind: 'field', key: spec.key })}
                      active={isActive({ kind: 'field', key: spec.key })}
                      error={errorFor(spec.key)}
                      disabled={readOnly}
                      after={
                        !readOnly && !value && suggested ? <SmallButton onClick={() => setField(spec.key, suggested)}>Use {suggested}</SmallButton> : undefined
                      }
                    />
                    {spec.source === 'calculated' && value && (
                      <label className="flex items-center gap-2 pb-2 text-muted">
                        <input
                          type="checkbox"
                          checked={Boolean(draft.keepTemplateFormula[spec.key])}
                          disabled={readOnly}
                          onChange={(event) =>
                            change((current) => ({
                              ...current,
                              keepTemplateFormula: { ...current.keepTemplateFormula, [spec.key]: event.target.checked },
                            }))
                          }
                          className="size-4 accent-ink"
                        />
                        Keep the template’s own formula here
                      </label>
                    )}
                  </div>
                )
              })}
            </div>
          </Panel>
        ))}

        </div>
        <OutputControls draft={draft} change={change} readOnly={readOnly} />

        <Panel data-wiwo="print-settings" aria-labelledby="print-title" className="p-5">
          <PanelTitle id="print-title">Print</PanelTitle>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Paper
              <Select value={draft.print.paper} disabled={readOnly} onChange={(event) => setPrint({ paper: event.target.value as PrintProfile['paper'] })}>
                <option value="A4">A4</option>
                <option value="Letter">Letter</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Orientation
              <Select
                value={draft.print.orientation}
                disabled={readOnly}
                onChange={(event) => setPrint({ orientation: event.target.value as PrintProfile['orientation'] })}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </Select>
            </label>
          </div>
          <div className="mt-2 divide-y divide-rule">
            <MappingRow
              label="Last column to print"
              value={draft.print.columns.last}
              onChange={(value) => setPrint({ columns: { first: 'A', last: value.trim().toUpperCase() } })}
              disabled={readOnly}
            />
            <MappingRow
              label="Pages wide"
              inputMode="numeric"
              value={String(draft.print.fitToWidthPages)}
              onChange={(value) => setPrint({ fitToWidthPages: Number.isFinite(Number(value)) ? Number(value) : 0 })}
              error={errorFor('print.fitToWidthPages')}
              disabled={readOnly}
            />
          </div>
          <label className="mt-2 flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(draft.print.repeatHeaderRow)}
              disabled={readOnly}
              onChange={(event) => setPrint({ repeatHeaderRow: event.target.checked ? 1 : undefined })}
              className="size-4 accent-ink"
            />
            Repeat the header row on every page
          </label>
          <div className="mt-3 border-t border-rule pt-2">
            <p className="mb-1 text-xs text-muted">Margins in inches</p>
            {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
              <MarginField key={side} label={`${side[0].toUpperCase()}${side.slice(1)} margin`}
                value={draft.print.marginsInches[side]} disabled={readOnly}
                onChange={(value) => setPrint({ marginsInches: { ...draft.print.marginsInches, [side]: value } })} />
            ))}
            <MarginField label="Header margin" value={draft.print.headerMarginInches ?? 0.3} disabled={readOnly}
              onChange={(value) => setPrint({ headerMarginInches: value })} />
            <MarginField label="Footer margin" value={draft.print.footerMarginInches ?? 0.3} disabled={readOnly}
              onChange={(value) => setPrint({ footerMarginInches: value })} />
          </div>
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-ink" checked={draft.print.horizontalCentered ?? false} disabled={readOnly}
              onChange={(event) => setPrint({ horizontalCentered: event.target.checked })} />
            Center the quotation horizontally
          </label>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-ink" checked={draft.print.keepFooterTogether !== false} disabled={readOnly}
              onChange={(event) => setPrint({ keepFooterTogether: event.target.checked })} />
            Keep totals and signatures together
          </label>
          <p className="mt-2 text-xs text-muted">Page breaks are estimated from the template’s row heights. Check the result in Excel Print Preview; printer and font settings can change pagination.</p>
        </Panel>

        <Panel data-wiwo="mapping-check" data-wiwo-ready={errors.length === 0 && !dirty.current ? 'mapping-ready' : undefined} data-wiwo-busy={saveState === 'saving'} aria-labelledby="check-title" className="p-5">
          <PanelTitle id="check-title">Check</PanelTitle>
          {errors.length > 0 ? (
            <>
              <p className="mt-1 text-muted">
                {errors.length} thing{errors.length === 1 ? '' : 's'} to fix before testing:
              </p>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-danger">
                {errors.map((issue, index) => (
                  <li key={index}>{issue.message}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-muted">The mapping is complete. Test it with sample quotations before using it.</p>
          )}
          <div className="mt-4 flex justify-end">
            {errors.length > 0 ? (
              <Button disabled aria-describedby="check-title">
                Test template
              </Button>
            ) : (
              <Button onClick={async () => { if (await flush()) navigate(testHref) }}>Test template</Button>
            )}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function stripEmpty<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== '')) as Partial<T>
}
