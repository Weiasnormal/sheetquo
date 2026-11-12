import { useId } from 'react'
import type { ReactNode } from 'react'
import { Textarea } from '../../components/forms/Field'
import { Panel, PanelTitle } from '../../components/ui/Panel'

export const PASTE_PLACEHOLDER = `Customer: Ventura Motors
Vehicle: Foton Tornado 4.4
2 pcs Brake Pad - 1,200 each
1 pc Oil Filter @ 350
Labor: 500
Discount: 100`

/** The message box. The text is kept with the draft but never printed on the quotation. */
export function PastePanel({ value, onChange, actions }: { value: string; onChange: (text: string) => void; actions: ReactNode }) {
  const id = useId()
  return (
    <Panel data-wiwo="paste" aria-labelledby={`${id}-title`} className="p-5">
      <PanelTitle id={`${id}-title`}>Customer’s message</PanelTitle>
      <p id={`${id}-hint`} className="mt-1 text-muted">
        Paste from Messenger, Viber, email, or notes. Sheetquo reads it on this device and shows every line before
        anything is added. The message stays with the draft and is never printed.
      </p>
      <label htmlFor={`${id}-text`} className="sr-only">
        Customer’s message
      </label>
      <Textarea
        id={`${id}-text`}
        aria-describedby={`${id}-hint`}
        value={value}
        placeholder={PASTE_PLACEHOLDER}
        spellCheck={false}
        className="mt-3 min-h-64 font-mono text-[13px]"
        onChange={(event) => onChange(event.target.value)}
      />
      <div data-wiwo="quote-create" className="mt-3 flex flex-wrap gap-2">{actions}</div>
    </Panel>
  )
}
