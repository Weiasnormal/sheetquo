import { useId } from 'react'
import { Button } from './Button'

import { cn } from './cn'

type UnavailableActionProps = {
  label: string
  reason: string
  align?: 'center' | 'start'
}

/** Shows an action that exists in the plan but is not built, and says why it cannot be used. */
export function UnavailableAction({ label, reason, align = 'center' }: UnavailableActionProps) {
  const reasonId = useId()
  return (
    <div className={cn('flex flex-col gap-2', align === 'center' ? 'items-center' : 'items-start')}>
      <Button variant="unavailable" disabled aria-describedby={reasonId}>
        {label}
      </Button>
      <p id={reasonId} className="text-xs text-muted">
        {reason}
      </p>
    </div>
  )
}
