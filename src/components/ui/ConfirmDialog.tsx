import { AlertDialog } from 'radix-ui'
import { Button } from './Button'

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
}

/** For actions that lose or hide work. Cancel takes focus first, so Enter never confirms by accident. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-ink/40" />
        <AlertDialog.Content className="dialog-content fixed top-1/2 left-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-card border border-line bg-surface p-6 shadow-lg">
          <AlertDialog.Title className="text-base leading-6 font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-muted">{description}</AlertDialog.Description>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="danger" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
