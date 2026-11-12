import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Panel, PanelTitle } from '../../components/ui/Panel'
import type { LineStatus, ParsedLine } from '../../domain/parser/parseQuotationText'
import { isWaiting, reviewLine } from '../../domain/parser/review'
import type { LineOutcome } from '../../domain/parser/review'
import type { Quotation } from '../../domain/quotation/types'

const STATUS: Record<LineStatus, { label: string; tone: 'positive' | 'notice' | 'neutral' }> = {
  recognized: { label: 'Recognized', tone: 'positive' },
  incomplete: { label: 'Incomplete', tone: 'notice' },
  'needs-review': { label: 'Needs review', tone: 'notice' },
  unread: { label: 'Not read', tone: 'neutral' },
}

const OUTCOME: Record<LineOutcome, string> = {
  added: 'Added',
  'left-out': 'Not added',
  removed: 'Removed',
  used: 'Used',
  'not-used': 'Not used',
  ignored: 'Ignored',
}

type SourceLinesProps = {
  quotation: Quotation
  lines: ParsedLine[]
  answered?: number[]
  onChoose: (line: ParsedLine, choiceId: string) => void
}

/** Every line of the message beside what it became, so nothing is added or dropped without the owner seeing it. */
export function SourceLines({ quotation, lines, answered, onChoose }: SourceLinesProps) {
  const reviews = lines.map((line) => reviewLine(quotation, line))
  const waiting = reviews.filter((review) => isWaiting(review, answered)).length

  return (
    <Panel data-wiwo="source-lines" id="source-lines" tabIndex={-1} aria-labelledby="source-title" className="p-5 outline-none">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <PanelTitle id="source-title">From the message</PanelTitle>
        <span className="text-muted">
          {lines.length} {lines.length === 1 ? 'line' : 'lines'} read
          {waiting > 0 && `, ${waiting} waiting for you`}
        </span>
      </div>
      <p className="mt-1 text-muted">Lines that need review stay out of the quotation until you choose.</p>

      <ol className="mt-3 divide-y divide-rule">
        {reviews.map(({ line, outcome, summary, choices }) => {
          const status = STATUS[line.status]
          return (
            <li key={line.number} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 py-3">
              <span className="tabular pt-0.5 text-xs text-muted">
                <span className="sr-only">Line </span>
                {line.number}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 break-words">{line.text}</p>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  <span className="font-medium text-ink">{OUTCOME[outcome]}</span>
                  {summary && ` · ${summary}`}
                </p>
                {line.notes.length > 0 && (
                  <ul className={`mt-1 text-xs ${outcome === 'added' || outcome === 'used' ? 'text-muted' : 'text-notice'}`}>
                    {line.notes.map(({ code, message }) => (
                      <li key={code}>{message}</li>
                    ))}
                  </ul>
                )}
                {choices.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Choices for line ${line.number}`}>
                    {choices.map(({ id, label }) => (
                      <Button key={id} variant="secondary" className="min-h-8 px-2.5 text-xs" onClick={() => onChoose(line, id)}>
                        {label}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
