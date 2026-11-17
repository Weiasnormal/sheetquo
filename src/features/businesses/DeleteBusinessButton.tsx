import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import type { BusinessRecord } from '../../domain/business/businessForm'
import { countBusinessData, deleteBusiness } from '../../infrastructure/storage/businessRepository'

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

/** Deletes a business for good after a confirmation that says what else goes with it. */
export function DeleteBusinessButton({ business, onDeleted, compact = false }: { business: BusinessRecord; onDeleted?: () => void; compact?: boolean }) {
  const [counts, setCounts] = useState<{ templates: number; quotations: number } | null>(null)

  async function remove() {
    const result = await deleteBusiness(business.id)
    if (!result.ok) return toast.error(result.error.message)
    toast.success('Business deleted', { description: business.displayName })
    onDeleted?.()
  }

  return (
    <>
      <Button variant="danger" aria-label={`Delete ${business.displayName}`} onClick={() => void countBusinessData(business.id).then(setCounts)}>
        {compact ? <Trash2 aria-hidden className="size-4" /> : 'Delete business'}
      </Button>
      <ConfirmDialog
        open={counts !== null}
        onOpenChange={(open) => { if (!open) setCounts(null) }}
        title={`Delete ${business.displayName}?`}
        description={`This cannot be undone. It also deletes its logo, ${plural(counts?.templates ?? 0, 'template')} and ${plural(counts?.quotations ?? 0, 'saved quotation')}. Excel files you already downloaded are not affected. Export a backup first if you might want them back.`}
        confirmLabel="Delete for good"
        onConfirm={() => void remove()}
      />
    </>
  )
}
