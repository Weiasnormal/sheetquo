import { Link } from 'react-router'
import { cn } from '../../components/ui/cn'

const STEPS = ['Paste', 'Review', 'Generate']

export type StepLink = { to: string; note?: string }

/** The three stages. Inside a draft each one is a link, with a short note on where it stands. */
export function QuotationSteps({ current, links }: { current: number; links?: StepLink[] }) {
  return (
    <nav aria-label="Quotation steps" className="mb-4">
      <ol className="grid grid-cols-3 gap-1 rounded-button border border-line bg-surface p-1">
        {STEPS.map((step, index) => {
          const active = index === current
          const style = cn(
            'flex flex-col items-center rounded-chip px-3 py-2 text-center',
            active ? 'bg-lime-tint font-semibold' : 'text-muted',
          )
          const link = links?.[index]
          const content = (
            <>
              <span>{step}</span>
              {link?.note && <span className="text-xs font-normal text-muted">{link.note}</span>}
            </>
          )
          return (
            <li key={step} className="min-w-0">
              {link ? (
                <Link to={link.to} aria-current={active ? 'step' : undefined} className={cn(style, !active && 'hover:bg-ground hover:text-ink')}>
                  {content}
                </Link>
              ) : (
                <span aria-current={active ? 'step' : undefined} className={style}>
                  {content}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
