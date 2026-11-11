import { CircleX, Info, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Diagnostic } from '../../domain/template/diagnostics'

const GROUPS: { severity: Diagnostic['severity']; title: string; icon: LucideIcon; tone: string }[] = [
  { severity: 'error', title: 'Stops the import', icon: CircleX, tone: 'text-danger' },
  { severity: 'warning', title: 'Changed or left out', icon: TriangleAlert, tone: 'text-notice' },
  { severity: 'info', title: 'Good to know', icon: Info, tone: 'text-muted' },
]

export function DiagnosticList({ diagnostics, empty = 'No compatibility problems found.' }: { diagnostics: Diagnostic[]; empty?: string }) {
  if (diagnostics.length === 0) return <p className="text-muted">{empty}</p>

  return (
    <div className="flex flex-col gap-4">
      {GROUPS.map(({ severity, title, icon: Icon, tone }) => {
        const items = diagnostics.filter((diagnostic) => diagnostic.severity === severity)
        if (items.length === 0) return null
        return (
          <section key={severity} aria-label={title}>
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Icon className={`size-4 ${tone}`} strokeWidth={1.75} aria-hidden="true" />
              {title}
            </h3>
            <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-10">
              {items.map((diagnostic, index) => (
                <li key={`${diagnostic.code}-${index}`}>{diagnostic.message}</li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
