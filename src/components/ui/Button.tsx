import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from './cn'

const buttonStyles = cva(
  'press inline-flex min-h-10 items-center justify-center gap-2 rounded-button px-4 text-sm font-medium whitespace-nowrap transition-[background-color,border-color,scale] duration-150 ease-out active:scale-[0.97] disabled:scale-100 disabled:cursor-not-allowed [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-lime text-ink hover:bg-lime-hover',
        secondary: 'border border-line bg-surface text-ink hover:border-control hover:bg-ground',
        danger: 'border border-danger/40 bg-surface text-danger hover:bg-danger-tint',
        // Disabled reads through its dashed edge, not just a paler fill.
        unavailable: 'border border-dashed border-control bg-surface text-muted',
      },
    },
    defaultVariants: { variant: 'primary' },
  },
)

type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonStyles> & { asChild?: boolean }

export function Button({ className, variant, asChild = false, type, ...props }: ButtonProps) {
  if (asChild) {
    return <Slot.Root className={cn(buttonStyles({ variant }), className)} {...props} />
  }
  return <button type={type ?? 'button'} className={cn(buttonStyles({ variant }), className)} {...props} />
}
