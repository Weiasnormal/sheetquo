import { useId } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../ui/cn'

type ControlProps = {
  id: string
  required?: boolean
  'aria-describedby'?: string
  'aria-invalid'?: true
}

type FieldProps = {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: (control: ControlProps) => ReactNode
}

/** Ties a label, hint, and inline error to its control, so each one reaches screen readers. */
export function Field({ label, hint, error, required = false, children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {!required && ' '}
        {!required && <span className="font-normal text-muted">(optional)</span>}
      </label>
      {children({
        id,
        required: required || undefined,
        'aria-describedby': describedBy || undefined,
        'aria-invalid': error ? true : undefined,
      })}
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

const CONTROL =
  'w-full rounded-button border border-control bg-surface px-3 text-sm text-ink transition-colors duration-150 placeholder:text-muted aria-invalid:border-danger'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(CONTROL, 'min-h-10', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(CONTROL, 'min-h-24 py-2 leading-5', className)} {...props} />
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(CONTROL, 'min-h-10', className)} {...props} />
}
