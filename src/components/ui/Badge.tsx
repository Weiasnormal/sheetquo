import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from './cn'

const badgeStyles = cva(
  'inline-flex h-6 flex-none items-center rounded-chip px-2 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-rule text-ink',
        positive: 'bg-lime-tint text-ink',
        notice: 'bg-notice-tint text-notice',
        danger: 'bg-danger-tint text-danger',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
)

type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeStyles>

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeStyles({ tone }), className)} {...props} />
}
