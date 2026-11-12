import { Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Input, Select } from '../../components/forms/Field'
import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { Panel, PanelTitle } from '../../components/ui/Panel'
import { formatMoney } from '../../domain/calculations/money'
import type { AdjustmentTotal } from '../../domain/calculations/money'
import type { QuotationIssue } from '../../domain/quotation/checkQuotation'
import type { Adjustment } from '../../domain/quotation/types'
import { newAdjustment } from './draftSetup'
import { MoneyInput } from './MoneyInput'

type AdjustmentsUpdate = (update: (adjustments: Adjustment[]) => Adjustment[]) => void

const BASES: { value: Adjustment['base']; label: string }[] = [
  { value: 'allBillable', label: 'All items' },
  { value: 'parts', label: 'Parts and services' },
  { value: 'labor', label: 'Labor only' },
  { value: 'manual', label: 'An amount I type' },
]

function Cell({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  )
}

export function AdjustmentsEditor({
  adjustments,
  totals,
  currency,
  issues,
  onChange,
}: {
  adjustments: Adjustment[]
  totals: AdjustmentTotal[]
  currency: string
  issues: QuotationIssue[]
  onChange: AdjustmentsUpdate
}) {
  const patch = (id: string, change: Partial<Adjustment>) =>
    onChange((current) => current.map((adjustment) => (adjustment.id === id ? { ...adjustment, ...change } : adjustment)))

  const add = (kind: Adjustment['kind']) => onChange((current) => [...current, newAdjustment(kind, current.length + 1)])

  return (
    <Panel data-wiwo="adjustments" aria-labelledby="adjustments-title" className="@container p-5">
      <PanelTitle id="adjustments-title">Adjustments</PanelTitle>
      <p className="mt-1 text-muted">
        Discounts and deductions subtract; fees and taxes add. Each percentage names its base. Deductions such as 2307 apply only when you turn them on, and Sheetquo
        does not decide tax rules.
      </p>

      {adjustments.length > 0 && (
        <ul className="mt-3 divide-y divide-rule">
          {adjustments.map((adjustment) => {
            const total = totals.find(({ id }) => id === adjustment.id)
            const own = issues.filter(({ adjustmentId }) => adjustmentId === adjustment.id)
            const percentage = adjustment.mode === 'percentage'
            return (
              <li data-wiwo-adjustment={adjustment.id} key={adjustment.id} className={cn('py-3', !adjustment.enabled && 'text-muted')}>
                <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-[minmax(0,1fr)_7rem_10rem_7rem]">
                  <Cell label="Label" className="col-span-2 @2xl:col-span-1">
                    <Input value={adjustment.label} onChange={(event) => patch(adjustment.id, { label: event.target.value })} />
                  </Cell>
                  <Cell label="Kind">
                    <Select value={adjustment.kind} onChange={(event) => patch(adjustment.id, { kind: event.target.value as Adjustment['kind'] })}>
                      <option value="discount">Discount</option>
                      <option value="deduction">Deduction</option>
                      <option value="fee">Fee</option>
                      <option value="tax">Tax</option>
                    </Select>
                  </Cell>
                  <Cell label="Type">
                    <Select value={adjustment.mode} onChange={(event) => patch(adjustment.id, { mode: event.target.value as Adjustment['mode'] })}>
                      <option value="fixed">Amount ({currency})</option>
                      <option value="percentage">Percent (%)</option>
                    </Select>
                  </Cell>
                  <Cell label={percentage ? 'Percent' : 'Amount'}>
                    <Input
                      inputMode="decimal"
                      autoComplete="off"
                      className="tabular"
                      value={adjustment.value}
                      aria-invalid={own.some(({ code }) => code === 'ADJUSTMENT_VALUE_INVALID') ? true : undefined}
                      onChange={(event) => patch(adjustment.id, { value: event.target.value.replace(/[,₱%\s]/g, '') })}
                    />
                  </Cell>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                  {percentage && (
                    <label className="flex items-center gap-2 text-xs">
                      <span className="text-muted">Percentage base</span>
                      <Select
                        value={adjustment.base}
                        className="min-h-8 w-40"
                        onChange={(event) => patch(adjustment.id, { base: event.target.value as Adjustment['base'] })}
                      >
                        {BASES.map(({ value, label }) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
                  {percentage && adjustment.base === 'manual' && (
                    <label className="flex items-center gap-2 text-xs">
                      <span className="text-muted">Base amount</span>
                      <MoneyInput
                        value={adjustment.manualBaseMinor ?? null}
                        className="tabular min-h-8 w-32"
                        aria-invalid={own.some(({ code }) => code === 'ADJUSTMENT_BASE_MISSING') ? true : undefined}
                        onValueChange={(minor) => patch(adjustment.id, { manualBaseMinor: minor ?? undefined })}
                      />
                    </label>
                  )}
                  <label className="flex min-h-8 items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="size-4 accent-ink"
                      checked={adjustment.enabled}
                      onChange={(event) => patch(adjustment.id, { enabled: event.target.checked })}
                    />
                    On<span className="sr-only">, {adjustment.label}</span>
                  </label>
                  <span className="tabular ml-auto text-sm">
                    {adjustment.enabled && total
                      ? `${adjustment.kind === 'fee' || adjustment.kind === 'tax' ? '+' : '−'}${formatMoney(total.amountMinor, currency)}${total.baseMinor !== undefined ? ` of ${formatMoney(total.baseMinor, currency)}` : ''}`
                      : 'Off'}
                  </span>
                  <Button
                    variant="secondary"
                    aria-label={`Remove ${adjustment.label || 'adjustment'}`}
                    title="Remove"
                    className="min-h-8 w-8 px-0"
                    onClick={() => onChange((current) => current.filter(({ id }) => id !== adjustment.id))}
                  >
                    <Trash2 strokeWidth={1.75} aria-hidden="true" />
                  </Button>
                </div>
                {own.length > 0 && (
                  <ul className="mt-2 text-xs text-danger">
                    {own.map(({ code, message }) => (
                      <li key={code}>{message}</li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => add('discount')}>
          <Plus strokeWidth={1.75} aria-hidden="true" />
          Add discount
        </Button>
        <Button variant="secondary" onClick={() => add('deduction')}>
          <Plus strokeWidth={1.75} aria-hidden="true" />
          Add deduction
        </Button>
        <Button variant="secondary" onClick={() => add('fee')}><Plus strokeWidth={1.75} aria-hidden="true" />Add fee</Button>
        <Button variant="secondary" onClick={() => add('tax')}><Plus strokeWidth={1.75} aria-hidden="true" />Add tax</Button>
      </div>
    </Panel>
  )
}
