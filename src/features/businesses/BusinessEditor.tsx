import { wiwoSuccess } from '../wiwo/events'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useBlocker, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Field, Input, Select, Textarea } from '../../components/forms/Field'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { Panel, PanelTitle } from '../../components/ui/Panel'
import {
  CURRENCIES,
  EMPTY_BUSINESS_FORM,
  parseBusinessForm,
  toFormValues,
} from '../../domain/business/businessForm'
import type { BusinessFormErrors, BusinessFormValues, BusinessRecord } from '../../domain/business/businessForm'
import { checkLogo, toDataUrl } from '../../domain/business/logo'
import {
  archiveBusiness,
  createBusiness,
  restoreBusiness,
  updateBusiness,
} from '../../infrastructure/storage/businessRepository'
import type { LogoChange } from '../../infrastructure/storage/businessRepository'
import { BusinessPreview } from './BusinessPreview'

export function BusinessEditor({ business }: { business?: BusinessRecord }) {
  const navigate = useNavigate()
  const formRef = useRef<HTMLFormElement>(null)
  const finished = useRef(false)
  const initial = useMemo(() => (business ? toFormValues(business) : EMPTY_BUSINESS_FORM), [business])

  const [values, setValues] = useState<BusinessFormValues>(initial)
  const [errors, setErrors] = useState<BusinessFormErrors>({})
  const [logoChange, setLogoChange] = useState<LogoChange>({ kind: 'keep' })
  const [logoError, setLogoError] = useState<string>()
  const [saveError, setSaveError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)

  const dirty =
    logoChange.kind !== 'keep' ||
    (Object.keys(initial) as (keyof BusinessFormValues)[]).some((key) => values[key] !== initial[key])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !finished.current && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const pendingLogoSrc = useMemo(
    () => (logoChange.kind === 'replace' ? toDataUrl(logoChange.logo.bytes, logoChange.logo.type) : undefined),
    [logoChange],
  )
  const hasLogo = logoChange.kind === 'replace' || (logoChange.kind === 'keep' && Boolean(business?.logoBlobId))

  function update(field: keyof BusinessFormValues) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setValues((current) => ({ ...current, [field]: event.target.value }))
      if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
    }
  }

  async function chooseLogo(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const file = input.files?.[0]
    if (!file) return
    const bytes = new Uint8Array(await file.arrayBuffer())
    const check = checkLogo(bytes)
    if (!check.ok) {
      setLogoError(check.message)
      input.value = ''
      return
    }
    setLogoError(undefined)
    setLogoChange({ kind: 'replace', logo: { name: file.name, type: check.type, bytes } })
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaveError(undefined)
    const parsed = parseBusinessForm(values)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }

    setSaving(true)
    const result = business
      ? await updateBusiness(business.id, parsed.input, logoChange)
      : await createBusiness(parsed.input, logoChange)
    setSaving(false)

    if (!result.ok) {
      if (result.error.code === 'DUPLICATE_NAME') {
        setErrors({ displayName: result.error.message })
        requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      } else {
        setSaveError(result.error.message)
      }
      return
    }

    wiwoSuccess('business-saved')
    finished.current = true
    toast.success(business ? 'Business saved' : 'Business added', { description: result.value.displayName })
    navigate('/businesses')
  }

  async function archive() {
    if (!business) return
    const result = await archiveBusiness(business.id)
    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    finished.current = true
    toast.success('Business archived', { description: business.displayName })
    navigate('/businesses')
  }

  async function restore() {
    if (!business) return
    const result = await restoreBusiness(business.id)
    if (result.ok) toast.success('Business restored', { description: business.displayName })
    else toast.error(result.error.message)
  }

  return (
    // On a phone the preview follows the form and archiving comes last; on desktop the preview is a side column.
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-1">
        {business?.archivedAt && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-button border border-line bg-surface px-4 py-3">
            <p>This business is archived, so it is not in the business switcher.</p>
            <Button variant="secondary" onClick={() => void restore()}>
              Restore business
            </Button>
          </div>
        )}

        <form data-wiwo="business-form" data-wiwo-busy={saving} ref={formRef} onSubmit={(event) => void save(event)} noValidate className="flex flex-col gap-4">
          <Panel data-wiwo="business-identity" aria-labelledby="details-title" className="flex flex-col gap-4 p-5">
            <PanelTitle id="details-title">Business details</PanelTitle>
            <Field label="Business name" required error={errors.displayName}>
              {(control) => <Input {...control} value={values.displayName} onChange={update('displayName')} autoComplete="organization" />}
            </Field>
            <Field label="Legal name" hint="Use this if your registered name differs" error={errors.legalName}>
              {(control) => <Input {...control} value={values.legalName} onChange={update('legalName')} />}
            </Field>
            <Field label="Logo" hint="PNG or JPEG, up to 2 MB" error={logoError}>
              {(control) => (
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    {...control}
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(event) => void chooseLogo(event)}
                    className="min-w-0 flex-1 text-sm text-muted file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-button file:border file:border-line file:bg-surface file:px-4 file:font-medium file:text-ink hover:file:border-control"
                  />
                  {hasLogo && (
                    <Button variant="secondary" onClick={() => setLogoChange({ kind: 'remove' })}>
                      Remove logo
                    </Button>
                  )}
                </div>
              )}
            </Field>
          </Panel>

          <Panel aria-labelledby="contact-title" className="flex flex-col gap-4 p-5">
            <PanelTitle id="contact-title">Contact</PanelTitle>
            <Field label="Address" hint="One line per row, as it should print" error={errors.address}>
              {(control) => <Textarea {...control} value={values.address} onChange={update('address')} rows={3} />}
            </Field>
            <Field label="Phone numbers" hint="One number per row" error={errors.phones}>
              {(control) => <Textarea {...control} value={values.phones} onChange={update('phones')} rows={2} className="min-h-16" />}
            </Field>
            <Field label="Email" error={errors.email}>
              {(control) => <Input {...control} type="email" value={values.email} onChange={update('email')} autoComplete="email" />}
            </Field>
            <Field label="Tax registration text" hint="For example a TIN or VAT line, printed as you type it" error={errors.taxRegistrationText}>
              {(control) => <Input {...control} value={values.taxRegistrationText} onChange={update('taxRegistrationText')} />}
            </Field>
          </Panel>

          <Panel data-wiwo="business-branding" aria-labelledby="defaults-title" className="flex flex-col gap-4 p-5">
            <PanelTitle id="defaults-title">Quotation defaults</PanelTitle>
            <Field label="Currency" required error={errors.currency}>
              {(control) => (
                <Select {...control} value={values.currency} onChange={update('currency')} className="sm:max-w-48">
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Prepared by" hint="Filled in on new quotations, and you can change it on each one" error={errors.defaultPreparedBy}>
              {(control) => <Input {...control} value={values.defaultPreparedBy} onChange={update('defaultPreparedBy')} autoComplete="name" />}
            </Field>
            <Field label="Notes" error={errors.defaultNotes}>
              {(control) => <Textarea {...control} value={values.defaultNotes} onChange={update('defaultNotes')} rows={3} />}
            </Field>
            <Field label="Terms" error={errors.defaultTerms}>
              {(control) => <Textarea {...control} value={values.defaultTerms} onChange={update('defaultTerms')} rows={3} />}
            </Field>
          </Panel>

          {saveError && (
            <p role="alert" className="rounded-button border border-danger/30 bg-danger-tint px-4 py-3 text-danger">
              {saveError} Your changes are still here.
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button asChild variant="secondary">
              <Link to="/businesses">Cancel</Link>
            </Button>
            <Button data-wiwo="business-save" type="submit" disabled={saving}>
              {business ? 'Save business' : 'Add business'}
            </Button>
          </div>
        </form>
      </div>

      <aside className="lg:sticky lg:top-9 lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <BusinessPreview
          values={values}
          logoBlobId={logoChange.kind === 'keep' ? business?.logoBlobId : undefined}
          logoSrc={pendingLogoSrc}
          hideLogo={!hasLogo}
        />
      </aside>

      {business && !business.archivedAt && (
        <Panel aria-labelledby="archive-title" className="flex flex-wrap items-center justify-between gap-4 p-5 lg:col-start-1">
          <div className="max-w-md">
            <PanelTitle id="archive-title">Archive business</PanelTitle>
            <p className="mt-1 text-muted">It leaves the business switcher. Its details and logo stay saved, and you can restore it.</p>
          </div>
          <Button variant="danger" onClick={() => setConfirmArchive(true)}>
            Archive business
          </Button>
        </Panel>
      )}

      {business && (
        <ConfirmDialog
          open={confirmArchive}
          onOpenChange={setConfirmArchive}
          title={`Archive ${business.displayName}?`}
          description={
            dirty
              ? 'Your unsaved changes will be lost. The business leaves the switcher, and you can restore it from Businesses.'
              : 'It leaves the business switcher. Its details and logo stay saved, and you can restore it from Businesses.'
          }
          confirmLabel="Archive"
          onConfirm={() => void archive()}
        />
      )}

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset()
        }}
        title="Leave without saving?"
        description="Your changes to this business will be lost."
        confirmLabel="Leave without saving"
        cancelLabel="Keep editing"
        onConfirm={() => blocker.proceed?.()}
      />
    </div>
  )
}
