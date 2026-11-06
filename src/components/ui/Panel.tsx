import type { ComponentProps } from 'react'
import { cn } from './cn'

export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-card border border-line bg-surface', className)} {...props} />
}

export function PanelTitle({ className, ...props }: ComponentProps<'h2'>) {
  return <h2 className={cn('text-base leading-6 font-semibold', className)} {...props} />
}
