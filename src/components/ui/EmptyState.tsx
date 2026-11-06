import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Panel, PanelTitle } from './Panel'

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  children: ReactNode
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, children, action }: EmptyStateProps) {
  return (
    <Panel data-wiwo="recovery" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <Icon className="size-6 text-muted" strokeWidth={1.5} aria-hidden="true" />
      <div className="max-w-md">
        <PanelTitle>{title}</PanelTitle>
        <p className="mt-1 text-muted">{children}</p>
      </div>
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </Panel>
  )
}
