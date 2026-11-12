import type { ReactNode } from 'react'
import { cn } from '../../components/ui/cn'
import { Panel, PanelTitle } from '../../components/ui/Panel'
import { formatMoney } from '../../domain/calculations/money'
import type { Totals } from '../../domain/calculations/money'
import { formatDate } from '../../domain/formatDate'
import type { Quotation } from '../../domain/quotation/types'
import type { WorkspaceIssue } from './workspaceIssues'

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1.5', strong && 'border-t border-line pt-3')}>
      <dt className={strong ? 'font-semibold' : 'text-muted'}>{label}</dt>
      <dd className={cn('tabular', strong ? 'text-lg font-bold' : 'font-medium')}>{value}</dd>
    </div>
  )
}

export function IssueList({ issues, onFocus }: { issues: WorkspaceIssue[]; onFocus?: (issue: WorkspaceIssue) => void }) {
  const errors = issues.filter(({ severity }) => severity === 'error')
  const warnings = issues.filter(({ severity }) => severity === 'warning')
  if (issues.length === 0) return null
  const item = (issue: WorkspaceIssue, index: number) => (
    <li key={`${issue.code}-${index}`}>
      {onFocus && issue.target ? (
        <button type="button" className="text-left underline decoration-current/40 underline-offset-2 hover:decoration-current" onClick={() => onFocus(issue)}>
          {issue.message}
        </button>
      ) : (
        issue.message
      )}
    </li>
  )
  return (
    <div className="flex flex-col gap-2">
      {errors.length > 0 && (
        <div className="rounded-button bg-danger-tint p-3 text-danger">
          <p className="font-medium">
            {errors.length === 1 ? '1 thing to fix before generating' : `${errors.length} things to fix before generating`}
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm">{errors.map(item)}</ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-button bg-notice-tint p-3 text-notice">
          <ul className="list-disc pl-5 text-sm">{warnings.map(item)}</ul>
        </div>
      )}
    </div>
  )
}

type SummaryProps = {
  quotation: Quotation
  totals: Totals
  currency: string
  templateLabel: string
  issues: WorkspaceIssue[]
  onFocus: (issue: WorkspaceIssue) => void
  action: ReactNode
}

/** The figures the Excel file will show, computed the same way its formulas are. */
export function QuoteSummary({ quotation, totals, currency, templateLabel, issues, onFocus, action }: SummaryProps) {
  const money = (minor: number) => formatMoney(minor, currency)
  const counted = quotation.items.filter(({ included }) => included).length
  const left = quotation.items.length - counted

  return (
    <Panel data-wiwo="quote-summary" aria-labelledby="summary-title" className="flex flex-col gap-4 p-5">
      <div>
        <PanelTitle id="summary-title">Summary</PanelTitle>
        <p className="mt-1 text-muted">
          {quotation.customerName.trim() || 'No customer yet'}
          {quotation.quoteDateISO && ` · ${formatDateSafe(quotation.quoteDateISO)}`}
        </p>
        <p className="text-xs text-muted">{templateLabel}</p>
      </div>

      <dl>
        <Row label={`Items (${counted}${left > 0 ? `, ${left} left out` : ''})`} value={money(totals.partsMinor)} />
        {totals.laborMinor > 0 && <Row label="Labor" value={money(totals.laborMinor)} />}
        <Row label="Subtotal" value={money(totals.subtotalMinor)} />
        {totals.adjustments.map(({ id, label, baseMinor, amountMinor }) => (
          <Row key={id} label={baseMinor === undefined ? label : `${label} (of ${money(baseMinor)})`} value={`−${money(amountMinor)}`} />
        ))}
        <Row label="Grand total" value={money(totals.grandTotalMinor)} strong />
      </dl>

      {totals.unpricedItemIds.length > 0 && (
        <p className="text-xs text-muted">
          {totals.unpricedItemIds.length === 1 ? '1 item has' : `${totals.unpricedItemIds.length} items have`} no price or
          quantity yet, so the total leaves {totals.unpricedItemIds.length === 1 ? 'it' : 'them'} out.
        </p>
      )}

      <IssueList issues={issues} onFocus={onFocus} />
      {action}
    </Panel>
  )
}

function formatDateSafe(iso: string): string {
  try {
    return formatDate(iso)
  } catch {
    return iso
  }
}
