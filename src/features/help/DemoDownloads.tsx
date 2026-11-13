import { useState } from 'react'
import { toast } from 'sonner'
import { generateSample } from '../../app/generateSample'
import type { SampleTemplateId } from '../../app/generateSample'
import { Button } from '../../components/ui/Button'

const SAMPLES: { id: SampleTemplateId; name: string; detail: string }[] = [
  { id: 'parts', name: 'Parts quotation', detail: 'A4 landscape, six columns' },
  { id: 'service', name: 'Service estimate', detail: 'Letter portrait, merged cells' },
]

const ITEM_COUNTS = [3, 15, 30]

export function DemoDownloads() {
  const [busy, setBusy] = useState(false)

  async function download(templateId: SampleTemplateId, itemCount: number) {
    setBusy(true)
    try {
      const result = await generateSample(templateId, itemCount)
      if (result.ok) {
        toast.success('Download started', { description: result.filename })
      } else {
        toast.error('Could not generate this workbook', {
          description: result.diagnostics.map(({ message }) => message).join(' '),
        })
      }
    } catch {
      toast.error('Could not generate this workbook')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ul className="divide-y divide-rule">
      {SAMPLES.map((sample) => (
        <li
          key={sample.id}
          className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 xl:flex-row xl:items-center xl:justify-between"
        >
          <div>
            <p className="font-medium">{sample.name}</p>
            <p className="text-muted">{sample.detail}</p>
          </div>
          <div className="flex gap-2">
            {ITEM_COUNTS.map((itemCount) => (
              <Button
                key={itemCount}
                variant="secondary"
                disabled={busy}
                aria-label={`Download ${sample.name} with ${itemCount} items`}
                onClick={() => void download(sample.id, itemCount)}
              >
                <span className="tabular">{itemCount} items</span>
              </Button>
            ))}
          </div>
        </li>
      ))}
    </ul>
  )
}
