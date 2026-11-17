import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { countAllData, wipeAllData } from '../../infrastructure/storage/wipe'
import type { DataCounts } from '../../infrastructure/storage/wipe'

const plural = (count: number, noun: string, many = noun + 's') => `${count} ${count === 1 ? noun : many}`

/** Clears everything Sheetquo saved in this browser, after a confirmation that lists what goes. */
export function WipeDataControls() {
  const navigate = useNavigate()
  const [counts, setCounts] = useState<DataCounts | null>(null)

  async function wipe() {
    const result = await wipeAllData()
    if (!result.ok) return toast.error(result.error.message)
    toast.success('All Sheetquo data was removed from this browser')
    navigate('/businesses')
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <p className="max-w-md text-muted">
        Removes every business, logo, template, workbook and saved quotation from this browser, so you can start fresh. Excel files you downloaded and your Wiwo guide progress are kept.
      </p>
      <Button variant="danger" onClick={() => void countAllData().then(setCounts)}>
        Wipe all data
      </Button>
      <ConfirmDialog
        open={counts !== null}
        onOpenChange={(open) => { if (!open) setCounts(null) }}
        title="Wipe all Sheetquo data?"
        description={`This cannot be undone. It deletes ${plural(counts?.businesses ?? 0, 'business', 'businesses')}, ${plural(counts?.templates ?? 0, 'template')} and ${plural(counts?.quotations ?? 0, 'saved quotation')} from this browser. Export a backup first if you might want them back.`}
        confirmLabel="Wipe everything"
        onConfirm={() => void wipe()}
      />
    </div>
  )
}
