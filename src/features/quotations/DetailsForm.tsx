import { Field, Input, Textarea } from '../../components/forms/Field'
import { Panel, PanelTitle } from '../../components/ui/Panel'
import type { QuotationIssue } from '../../domain/quotation/checkQuotation'
import type { Quotation } from '../../domain/quotation/types'
import type { SemanticKey } from '../../domain/template/types'

type TextKey =
  | 'customerName'
  | 'customerAddress'
  | 'customerTIN'
  | 'quoteNumber'
  | 'vehicle'
  | 'engine'
  | 'plate'
  | 'chassis'
  | 'notes'
  | 'terms'
  | 'preparedBy'
  | 'checkedBy'
  | 'receivedBy'

type FieldDef = { key: TextKey; label: string; semanticKey: SemanticKey; hint?: string; long?: boolean; required?: boolean }

const CUSTOMER: FieldDef[] = [
  { key: 'customerName', label: 'Customer name', semanticKey: 'customer.name', required: true },
  { key: 'customerAddress', label: 'Customer address', semanticKey: 'customer.address' },
  { key: 'customerTIN', label: 'Customer TIN', semanticKey: 'customer.tin' },
]

const VEHICLE: FieldDef[] = [
  { key: 'vehicle', label: 'Vehicle', semanticKey: 'vehicle.description' },
  { key: 'engine', label: 'Engine', semanticKey: 'vehicle.engine' },
  { key: 'plate', label: 'Plate', semanticKey: 'vehicle.plate' },
  { key: 'chassis', label: 'Chassis', semanticKey: 'vehicle.chassis' },
]

const CLOSING: FieldDef[] = [
  { key: 'notes', label: 'Notes', semanticKey: 'quote.notes', long: true },
  { key: 'terms', label: 'Terms', semanticKey: 'quote.terms', long: true },
  { key: 'preparedBy', label: 'Prepared by', semanticKey: 'signatures.preparedBy' },
  { key: 'checkedBy', label: 'Checked by', semanticKey: 'signatures.checkedBy' },
  { key: 'receivedBy', label: 'Received by', semanticKey: 'signatures.receivedBy' },
]

const NOT_PRINTED = 'This template has no cell for it, so it is saved but not printed.'

type DetailsProps = {
  quotation: Quotation
  mapped: Set<SemanticKey>
  issues: QuotationIssue[]
  onChange: (patch: Partial<Quotation>) => void
}

function TextFields({ fields, quotation, mapped, issues, onChange }: DetailsProps & { fields: FieldDef[] }) {
  return fields.map(({ key, label, semanticKey, hint, long, required }) => {
    const error = key === 'customerName' ? issues.find(({ code }) => code === 'CUSTOMER_MISSING')?.message : undefined
    const value = quotation[key] ?? ''
    const update = (text: string) => onChange({ [key]: key === 'customerName' ? text : text || undefined })
    return (
      <div key={key} className={long ? 'sm:col-span-2' : undefined}>
        <Field label={label} required={required} hint={mapped.has(semanticKey) ? hint : NOT_PRINTED} error={error}>
          {(control) =>
            long ? (
              <Textarea {...control} name={key} value={value} onChange={(event) => update(event.target.value)} />
            ) : (
              <Input {...control} name={key} value={value} onChange={(event) => update(event.target.value)} />
            )
          }
        </Field>
      </div>
    )
  })
}

/** One panel of the quotation's own details. The review shows them around the items. */
export function DetailsSection({ section, ...props }: DetailsProps & { section: 'customer' | 'vehicle' | 'closing' }) {
  const { quotation, mapped, issues, onChange } = props
  const dateError = issues.find(({ code }) => code === 'DATE_INVALID')?.message

  if (section === 'vehicle') {
    return (
      <Panel data-wiwo="quote-vehicle" aria-labelledby="vehicle-title" className="p-5">
        <PanelTitle id="vehicle-title">Vehicle</PanelTitle>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <TextFields {...props} fields={VEHICLE} />
        </div>
      </Panel>
    )
  }

  if (section === 'closing') {
    return (
      <Panel data-wiwo="quote-closing" aria-labelledby="closing-title" className="p-5">
        <PanelTitle id="closing-title">Notes and signatures</PanelTitle>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <TextFields {...props} fields={CLOSING} />
        </div>
      </Panel>
    )
  }

  return (
    <Panel data-wiwo="quote-customer" aria-labelledby="customer-title" className="p-5">
      <PanelTitle id="customer-title">Customer and quotation</PanelTitle>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <TextFields {...props} fields={CUSTOMER} />
        <Field label="Date" required error={dateError}>
          {(control) => (
            <Input {...control} name="quoteDateISO" type="date" value={quotation.quoteDateISO} onChange={(event) => onChange({ quoteDateISO: event.target.value })} />
          )}
        </Field>
        <Field
          label="Quotation number"
          hint={mapped.has('quote.number') ? 'You choose it. Numbers are not shared between browsers or computers.' : NOT_PRINTED}
        >
          {(control) => (
            <Input {...control} value={quotation.quoteNumber ?? ''} onChange={(event) => onChange({ quoteNumber: event.target.value || undefined })} />
          )}
        </Field>
      </div>
    </Panel>
  )
}
