import { Input, Select } from '../../../components/forms/Field'
import { Button } from '../../../components/ui/Button'
import { Panel, PanelTitle } from '../../../components/ui/Panel'
import type { MappingDraft } from '../../../domain/template/mappingDraft'
import { normalizeAddress } from '../../../domain/template/mappingDraft'
import type { OutputProfile } from '../../../domain/template/types'

export function OutputControls({ draft, change, readOnly }: {
  draft: MappingDraft; change: (update: (draft: MappingDraft) => MappingDraft) => void; readOnly: boolean
}) {
  const output = draft.output ?? { moneyFormat: 'template', dateFormat: 'template' }
  const update = (patch: Partial<OutputProfile>) => change((current) => ({ ...current, output: { ...output, ...patch } }))
  return <>
    <Panel data-wiwo="output-formats" aria-labelledby="output-title" className="p-5">
      <PanelTitle id="output-title">Output formats</PanelTitle>
      <fieldset disabled={readOnly} className="mt-3 grid min-w-0 gap-3">
        <label className="flex flex-col gap-1">Money format
          <Select value={output.moneyFormat} onChange={(event) => update({ moneyFormat: event.target.value as OutputProfile['moneyFormat'] })}>
            <option value="template">Keep template formats; use business currency for empty formats</option>
            <option value="business">Use business currency for all amounts</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1">Date format
          <Select value={output.dateFormat} onChange={(event) => update({ dateFormat: event.target.value as OutputProfile['dateFormat'] })}>
            <option value="template">Keep template format</option><option value="iso">YYYY-MM-DD</option>
            <option value="short">MM/DD/YYYY</option><option value="long">Month D, YYYY</option>
          </Select>
        </label>
        <div data-wiwo="output-heights" className="grid grid-cols-2 gap-3">
          {(['minRowHeight', 'maxRowHeight'] as const).map((key) => <label key={key} className="flex flex-col gap-1">
            {key === 'minRowHeight' ? 'Minimum item height (pt)' : 'Maximum item height (pt)'}
            <Input type="number" min={1} max={409} value={output[key] ?? ''} placeholder={key === 'minRowHeight' ? 'Template height' : '409'}
              onChange={(event) => update({ [key]: event.target.value === '' ? undefined : event.target.valueAsNumber })} />
          </label>)}
        </div>
        <p className="text-xs text-muted">Descriptions always wrap. Text exceeding the maximum height blocks generation instead of being clipped.</p>
      </fieldset>
    </Panel>
    <Panel data-wiwo="adjustment-mapping" aria-labelledby="adjustment-map-title" className="p-5">
      <PanelTitle id="adjustment-map-title">Adjustment rows</PanelTitle>
      <p className="mt-1 text-sm text-muted">Map one existing footer row for each discount, deduction, fee or tax. Enabled adjustments fill these rows in order. Label and amount are required; base and rate are optional. Leave these empty to use the single Discount field.</p>
      {(draft.adjustmentRows ?? []).map((slot, index) => <fieldset key={index} disabled={readOnly} className="mt-4 min-w-0 border-t border-rule pt-3">
        <legend className="font-medium">Adjustment row {index + 1}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['label', 'amount', 'base', 'rate'] as const).map((key) => <label key={key} className="flex flex-col gap-1 text-sm">
            {key[0].toUpperCase() + key.slice(1)} cell {key === 'base' || key === 'rate' ? '(optional)' : '(required)'}
            <Input aria-label={`Adjustment ${index + 1} ${key} cell`} value={slot[key] ?? ''} placeholder="A20" onChange={(event) => {
              const value = normalizeAddress(event.target.value)
              change((current) => ({ ...current, adjustmentRows: current.adjustmentRows?.map((row, i) => i === index ? { ...row, [key]: value || (key === 'base' || key === 'rate' ? undefined : '') } : row) }))
            }} />
          </label>)}
        </div>
        <Button variant="secondary" className="mt-2" onClick={() => change((current) => ({ ...current, adjustmentRows: current.adjustmentRows?.filter((_, i) => i !== index) }))}>Remove adjustment row {index + 1}</Button>
      </fieldset>)}
      <Button className="mt-3" variant="secondary" disabled={readOnly || (draft.adjustmentRows?.length ?? 0) >= 50}
        onClick={() => change((current) => ({ ...current, adjustmentRows: [...(current.adjustmentRows ?? []), { label: '', amount: '' }] }))}>Add adjustment row</Button>
    </Panel>
  </>
}
