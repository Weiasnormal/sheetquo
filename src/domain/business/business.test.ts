import { describe, expect, it } from 'vitest'
import { JPEG_BYTES, PNG_BYTES } from '../../test/fixtures/synthetic/logos'
import { EMPTY_BUSINESS_FORM, parseBusinessForm, toFormValues } from './businessForm'
import { checkLogo, MAX_LOGO_BYTES } from './logo'

describe('business form', () => {
  it('requires a name and trims every field', () => {
    expect(parseBusinessForm(EMPTY_BUSINESS_FORM)).toEqual({ ok: false, errors: { displayName: 'Enter a business name' } })

    const parsed = parseBusinessForm({ ...EMPTY_BUSINESS_FORM, displayName: '  Demo Parts Supply  ', legalName: '   ' })
    expect(parsed.ok && parsed.input.displayName).toBe('Demo Parts Supply')
    expect(parsed.ok && parsed.input.legalName).toBeUndefined()
  })

  it('splits address and phone lines and drops blank ones', () => {
    const parsed = parseBusinessForm({
      ...EMPTY_BUSINESS_FORM,
      displayName: 'Demo Parts Supply',
      address: '1 Demo Street\n\n  Sample City  \r\n',
      phones: '0900-000-0000\n(02) 8000-0000',
    })
    expect(parsed.ok && parsed.input.addressLines).toEqual(['1 Demo Street', 'Sample City'])
    expect(parsed.ok && parsed.input.phones).toEqual(['0900-000-0000', '(02) 8000-0000'])
  })

  it('checks email only when one is given', () => {
    const bad = parseBusinessForm({ ...EMPTY_BUSINESS_FORM, displayName: 'Demo', email: 'not-an-email' })
    expect(bad.ok ? null : bad.errors.email).toBe('Enter a valid email address')
    expect(parseBusinessForm({ ...EMPTY_BUSINESS_FORM, displayName: 'Demo', email: '' }).ok).toBe(true)
  })

  it('round-trips a saved business through the form', () => {
    const parsed = parseBusinessForm({
      ...EMPTY_BUSINESS_FORM,
      displayName: 'Demo Parts Supply',
      address: '1 Demo Street\nSample City',
      currency: 'USD',
    })
    if (!parsed.ok) throw new Error('invalid')
    const values = toFormValues({ ...parsed.input, id: 'b1', createdAt: '', updatedAt: '' })
    expect(values.address).toBe('1 Demo Street\nSample City')
    expect(values.currency).toBe('USD')
  })
})

describe('logo check', () => {
  it('accepts PNG and JPEG by their bytes', () => {
    expect(checkLogo(PNG_BYTES)).toEqual({ ok: true, type: 'image/png' })
    expect(checkLogo(JPEG_BYTES)).toEqual({ ok: true, type: 'image/jpeg' })
  })

  it('rejects other formats even when named like an image', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
    expect(checkLogo(svg)).toEqual({ ok: false, message: 'Choose a PNG or JPEG image.' })
  })

  it('rejects empty and oversized files', () => {
    expect(checkLogo(new Uint8Array())).toMatchObject({ ok: false })
    const large = new Uint8Array(MAX_LOGO_BYTES + 1)
    large.set(PNG_BYTES)
    expect(checkLogo(large)).toEqual({ ok: false, message: 'Choose an image of 2 MB or less.' })
  })
})
