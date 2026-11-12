import { useState } from 'react'
import type { ComponentProps } from 'react'
import { Input } from '../../components/forms/Field'
import { formatMoneyInput, parseMoneyInput } from '../../domain/calculations/money'

type MoneyInputProps = Omit<ComponentProps<'input'>, 'value' | 'onChange'> & {
  value: number | null
  onValueChange: (minor: number | null) => void
}

const show = (minor: number | null) => (minor === null ? '' : formatMoneyInput(minor))

/** Keeps what the owner typed, such as "1,2", while passing on only amounts it can read. */
export function MoneyInput({ value, onValueChange, onBlur, ...props }: MoneyInputProps) {
  const [text, setText] = useState(() => show(value))
  const [known, setKnown] = useState(value)

  // A price set from elsewhere, such as a review choice, replaces the text.
  if (value !== known) {
    setKnown(value)
    setText(show(value))
  }

  const unreadable = text.trim() !== '' && parseMoneyInput(text) === undefined

  return (
    <Input
      {...props}
      inputMode="decimal"
      autoComplete="off"
      value={text}
      aria-invalid={unreadable || props['aria-invalid'] ? true : undefined}
      onChange={(event) => {
        const next = event.target.value
        const minor = next.trim() === '' ? null : (parseMoneyInput(next) ?? null)
        setText(next)
        setKnown(minor)
        onValueChange(minor)
      }}
      onBlur={(event) => {
        if (!unreadable) setText(show(known))
        onBlur?.(event)
      }}
    />
  )
}
