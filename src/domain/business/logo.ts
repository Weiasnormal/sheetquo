export const MAX_LOGO_BYTES = 2 * 1024 * 1024

export type LogoType = 'image/png' | 'image/jpeg'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff]

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte)
}

export type LogoCheck = { ok: true; type: LogoType } | { ok: false; message: string }

/**
 * Trusts the file's bytes rather than its name. Excel workbooks can embed PNG and JPEG,
 * so other image types are turned away here instead of failing at generation.
 */
export function checkLogo(bytes: Uint8Array): LogoCheck {
  if (bytes.length === 0) return { ok: false, message: 'This file is empty.' }
  if (bytes.length > MAX_LOGO_BYTES) return { ok: false, message: 'Choose an image of 2 MB or less.' }
  if (startsWith(bytes, PNG_SIGNATURE)) return { ok: true, type: 'image/png' }
  if (startsWith(bytes, JPEG_SIGNATURE)) return { ok: true, type: 'image/jpeg' }
  return { ok: false, message: 'Choose a PNG or JPEG image.' }
}

export function toDataUrl(bytes: Uint8Array, type: string): string {
  let binary = ''
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  }
  return `data:${type};base64,${btoa(binary)}`
}
