// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Field, Input } from './Field'

describe('Field', () => {
  it('labels its control and marks optional fields in the label', () => {
    render(<Field label="Phone">{(control) => <Input {...control} />}</Field>)
    expect(screen.getByRole('textbox', { name: 'Phone (optional)' })).not.toBeRequired()
  })

  it('marks required fields', () => {
    render(
      <Field label="Business name" required>
        {(control) => <Input {...control} />}
      </Field>,
    )
    expect(screen.getByRole('textbox', { name: 'Business name' })).toBeRequired()
  })

  it('ties a hint and an inline error to the control', () => {
    render(
      <Field label="Business name" required hint="Shown on every quotation" error="Enter a business name">
        {(control) => <Input {...control} />}
      </Field>,
    )
    const input = screen.getByRole('textbox', { name: 'Business name' })
    expect(input).toBeInvalid()
    expect(input).toHaveAccessibleDescription('Shown on every quotation Enter a business name')
  })
})
