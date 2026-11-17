import { Dialog } from 'radix-ui'
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { toast } from 'sonner'
import { Field, Input } from '../../components/forms/Field'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import type { TemplateRecord } from '../../domain/template/records'
import { countTemplateQuotations, deleteTemplate, renameTemplate } from '../../infrastructure/storage/templateRepository'

/** Deletes a template and its versions for good. Quotations made with it move to the business letterhead. */
export function DeleteTemplateButton({ template, onDeleted, compact = false }: { template: TemplateRecord; onDeleted?: () => void; compact?: boolean }) {
  const [quotations, setQuotations] = useState<number | null>(null)

  async function remove() {
    const result = await deleteTemplate(template.id)
    if (!result.ok) return toast.error(result.error.message)
    toast.success('Template deleted', { description: template.name })
    onDeleted?.()
  }

  const moved = quotations === 1 ? ' 1 saved quotation uses it and will switch to your business letterhead.'
    : quotations ? ` ${quotations} saved quotations use it and will switch to your business letterhead.` : ''
  return (
    <>
      <Button variant="danger" aria-label={`Delete ${template.name}`} onClick={() => void countTemplateQuotations(template).then(setQuotations)}>
        {compact ? <Trash2 aria-hidden className="size-4" /> : 'Delete template'}
      </Button>
      <ConfirmDialog
        open={quotations !== null}
        onOpenChange={(open) => { if (!open) setQuotations(null) }}
        title={`Delete ${template.name}?`}
        description={`This cannot be undone. Its versions and uploaded workbooks are removed.${moved} Excel files you already downloaded are not affected.`}
        confirmLabel="Delete for good"
        onConfirm={() => void remove()}
      />
    </>
  )
}

/** Renames a template in a small dialog. Names stay unique within the business. */
export function RenameTemplateButton({ template }: { template: TemplateRecord }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(template.name)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    const result = await renameTemplate(template.id, name)
    setSaving(false)
    if (!result.ok) return setError(result.error.message)
    toast.success('Template renamed', { description: result.value.name })
    setOpen(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { setOpen(next); if (next) { setName(template.name); setError(undefined) } }}>
      <Dialog.Trigger asChild>
        <Button variant="secondary" aria-label={`Rename ${template.name}`}>
          <Pencil aria-hidden className="size-4" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-ink/40" />
        <Dialog.Content className="dialog-content fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-line bg-surface p-6 shadow-lg">
          <Dialog.Title className="text-base leading-6 font-semibold">Rename template</Dialog.Title>
          <Dialog.Description className="mt-2 text-muted">The new name shows in your template list and the design picker.</Dialog.Description>
          <form onSubmit={(event) => void save(event)} className="mt-4 flex flex-col gap-4" noValidate>
            <Field label="Template name" required error={error}>
              {(control) => <Input {...control} value={name} maxLength={80} onChange={(event) => { setName(event.target.value); setError(undefined) }} />}
            </Field>
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close asChild><Button variant="secondary">Cancel</Button></Dialog.Close>
              <Button type="submit" disabled={saving || !name.trim()}>Save name</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
