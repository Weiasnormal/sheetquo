import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { Input, Select } from '../../components/forms/Field'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { cn } from '../../components/ui/cn'
import { Panel, PanelTitle } from '../../components/ui/Panel'
import { formatMoney, lineAmountMinor } from '../../domain/calculations/money'
import type { QuotationIssue } from '../../domain/quotation/checkQuotation'
import type { QuoteItem } from '../../domain/quotation/types'
import { itemFieldId, moveItem, newItem } from './draftSetup'
import { MoneyInput } from './MoneyInput'

type ItemsUpdate = (update: (items: QuoteItem[]) => QuoteItem[]) => void

const TYPES: { value: QuoteItem['type']; label: string }[] = [
  { value: 'part', label: 'Part' },
  { value: 'labor', label: 'Labor' },
  { value: 'service', label: 'Service' },
  { value: 'other', label: 'Other' },
]

/** Which input an issue points at, so the right box is marked. */
const ISSUE_FIELD: Record<string, 'description' | 'quantity' | 'price'> = {
  ITEM_DESCRIPTION_MISSING: 'description',
  ITEM_QUANTITY_MISSING: 'quantity',
  ITEM_QUANTITY_INVALID: 'quantity',
  ITEM_PRICE_MISSING: 'price',
  ITEM_PRICE_NEGATIVE: 'price',
}

function Cell({ label, item, wide, className, children }: { label: string; item: number; wide?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className={cn('text-xs text-muted', wide && '@2xl:sr-only')}>
        {label}
        <span className="sr-only">, item {item}</span>
      </span>
      {children}
    </label>
  )
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Button variant="secondary" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="min-h-8 w-8 px-0 disabled:opacity-40">
      {children}
    </Button>
  )
}

export function ItemsEditor({ items, issues, onChange }: { items: QuoteItem[]; issues: QuotationIssue[]; onChange: ItemsUpdate }) {
  // Rows added here stay quiet about missing values until the owner leaves them once.
  const [fresh, setFresh] = useState<Set<string>>(() => new Set())
  const [focusId, setFocusId] = useState<string>()

  useEffect(() => {
    if (focusId) document.getElementById(focusId)?.focus()
  }, [focusId])

  const patch = (id: string, change: Partial<QuoteItem>) =>
    onChange((current) =>
      current.map((item) => {
        if (item.id === id) return { ...item, ...change }
        // Counting one alternative stops counting the others in its group.
        const chosen = current.find((candidate) => candidate.id === id)
        if (change.included && chosen?.alternativeGroupId && item.alternativeGroupId === chosen.alternativeGroupId) {
          return { ...item, included: false }
        }
        return item
      }),
    )

  function add() {
    const item = newItem()
    setFresh((current) => new Set(current).add(item.id))
    onChange((current) => [...current, item])
    setFocusId(itemFieldId(item.id, 'description'))
  }

  function duplicate(index: number) {
    const copy = { ...items[index], id: crypto.randomUUID() }
    onChange((current) => [...current.slice(0, index + 1), copy, ...current.slice(index + 1)])
    setFocusId(itemFieldId(copy.id, 'description'))
  }

  function remove(index: number) {
    const removed = items[index]
    onChange((current) => current.filter(({ id }) => id !== removed.id))
    toast('Item removed', {
      description: removed.description || `Item ${index + 1}`,
      action: { label: 'Undo', onClick: () => onChange((current) => [...current.slice(0, index), removed, ...current.slice(index)]) },
    })
  }

  return (
    <Panel data-wiwo="items" aria-labelledby="items-title" className="@container p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <PanelTitle id="items-title">Items</PanelTitle>
        <span className="tabular text-muted">
          {items.filter(({ included }) => included).length} of {items.length} counted
        </span>
      </div>

      {items.length === 0 ? (
        <p className="mt-3 rounded-button border border-dashed border-line p-4 text-muted">
          No items yet. Add one here, or paste the customer’s message to read them in.
        </p>
      ) : (
        <>
          <div aria-hidden="true" className="mt-3 hidden gap-3 border-b border-line pb-2 text-xs text-muted @2xl:grid @2xl:grid-cols-[1.5rem_minmax(0,1fr)_5rem_5rem_8rem_7rem]">
            <span>#</span>
            <span>Description</span>
            <span>Qty</span>
            <span>Unit</span>
            <span>Unit price</span>
            <span className="text-right">Amount</span>
          </div>
          <ol className="divide-y divide-rule">
            {items.map((item, index) => {
              const number = index + 1
              const quiet = fresh.has(item.id)
              const own = quiet ? [] : issues.filter(({ itemId, severity }) => itemId === item.id && severity === 'error')
              const invalid = (field: 'description' | 'quantity' | 'price') =>
                own.some(({ code }) => ISSUE_FIELD[code] === field) ? (true as const) : undefined
              const amount = lineAmountMinor(item)
              const name = item.description.trim() || `item ${number}`

              return (
                <li
                  key={item.id}
                  data-wiwo-item={item.id}
                  className={cn('py-3', !item.included && 'text-muted')}
                  onBlur={(event) => {
                    if (quiet && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
                      setFresh((current) => {
                        const next = new Set(current)
                        next.delete(item.id)
                        return next
                      })
                    }
                  }}
                >
                  <div className="grid grid-cols-3 gap-x-3 gap-y-2 @2xl:grid-cols-[1.5rem_minmax(0,1fr)_5rem_5rem_8rem_7rem] @2xl:items-start">
                    <span className="tabular col-span-3 text-xs text-muted @2xl:col-span-1 @2xl:pt-2.5 @2xl:text-sm">
                      <span className="@2xl:hidden">Item </span>
                      {number}
                    </span>
                    <Cell label="Description" item={number} wide className="col-span-3 @2xl:col-span-1">
                      <Input
                        id={itemFieldId(item.id, 'description')}
                        value={item.description}
                        aria-invalid={invalid('description')}
                        onChange={(event) => patch(item.id, { description: event.target.value })}
                      />
                    </Cell>
                    <Cell label="Qty" item={number} wide>
                      <Input
                        id={itemFieldId(item.id, 'quantity')}
                        inputMode="decimal"
                        autoComplete="off"
                        value={item.quantity}
                        aria-invalid={invalid('quantity')}
                        className="tabular"
                        onChange={(event) => patch(item.id, { quantity: event.target.value.trim() })}
                      />
                    </Cell>
                    <Cell label="Unit" item={number} wide>
                      <Input value={item.unit ?? ''} onChange={(event) => patch(item.id, { unit: event.target.value || undefined })} />
                    </Cell>
                    <Cell label="Unit price" item={number} wide>
                      <MoneyInput
                        id={itemFieldId(item.id, 'price')}
                        value={item.isFree ? 0 : item.unitPriceMinor}
                        disabled={item.isFree}
                        aria-invalid={invalid('price')}
                        className="tabular"
                        onValueChange={(unitPriceMinor) => patch(item.id, { unitPriceMinor })}
                      />
                    </Cell>
                    <div className="col-span-3 flex items-baseline justify-between gap-2 @2xl:col-span-1 @2xl:block @2xl:pt-2.5 @2xl:text-right">
                      <span className="text-xs text-muted @2xl:sr-only">Amount</span>
                      <span className={cn('tabular font-medium', !item.included && 'line-through')}>
                        {item.isFree ? 'FREE' : amount === null ? '—' : formatMoney(amount)}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 @2xl:pl-[calc(1.5rem+0.75rem)]">
                    <label className="flex items-center gap-2 text-xs">
                      <span className="text-muted">Part no.</span>
                      <Input
                        value={item.partNumber ?? ''}
                        onChange={(event) => patch(item.id, { partNumber: event.target.value || undefined })}
                        aria-label={`Part number, item ${number}`}
                        className="min-h-8 w-32"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <span className="text-muted">Type</span>
                      <Select
                        value={item.type}
                        aria-label={`Type, item ${number}`}
                        className="min-h-8 w-28"
                        onChange={(event) => patch(item.id, { type: event.target.value as QuoteItem['type'] })}
                      >
                        {TYPES.map(({ value, label }) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="flex min-h-8 items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="size-4 accent-ink"
                        checked={Boolean(item.isFree)}
                        onChange={(event) => patch(item.id, { isFree: event.target.checked || undefined })}
                      />
                      Free<span className="sr-only">, item {number}</span>
                    </label>
                    <label className="flex min-h-8 items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="size-4 accent-ink"
                        checked={item.included}
                        onChange={(event) => patch(item.id, { included: event.target.checked })}
                      />
                      Counted<span className="sr-only">, item {number}</span>
                    </label>
                    {item.alternativeGroupId && <Badge>One of several prices</Badge>}
                    <div className="ml-auto flex gap-1">
                      <IconButton label={`Move ${name} up`} disabled={index === 0} onClick={() => onChange((current) => moveItem(current, index, -1))}>
                        <ArrowUp strokeWidth={1.75} aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={`Move ${name} down`}
                        disabled={index === items.length - 1}
                        onClick={() => onChange((current) => moveItem(current, index, 1))}
                      >
                        <ArrowDown strokeWidth={1.75} aria-hidden="true" />
                      </IconButton>
                      <IconButton label={`Duplicate ${name}`} onClick={() => duplicate(index)}>
                        <Copy strokeWidth={1.75} aria-hidden="true" />
                      </IconButton>
                      <IconButton label={`Remove ${name}`} onClick={() => remove(index)}>
                        <Trash2 strokeWidth={1.75} aria-hidden="true" />
                      </IconButton>
                    </div>
                  </div>

                  {item.notes && <p className="mt-2 text-xs text-muted @2xl:pl-[calc(1.5rem+0.75rem)]">From the message: {item.notes}</p>}
                  {own.length > 0 && (
                    <ul className="mt-2 text-xs text-danger @2xl:pl-[calc(1.5rem+0.75rem)]">
                      {own.map(({ code, message }) => (
                        <li key={code}>{message}</li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ol>
        </>
      )}

      <Button variant="secondary" className="mt-3" onClick={add}>
        <Plus strokeWidth={1.75} aria-hidden="true" />
        Add item
      </Button>
    </Panel>
  )
}
