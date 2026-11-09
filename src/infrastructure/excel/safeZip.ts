import JSZip from 'jszip'

export const XLSX_ZIP_LIMITS = { compressed: 15 * 1024 * 1024, expanded: 128 * 1024 * 1024, entry: 32 * 1024 * 1024, entries: 10_000 }
const fail = () => { throw new Error('Workbook exceeds safe archive limits or has inconsistent ZIP sizes. Use a smaller, unencrypted .xlsx without ZIP64.') }

/** Validate central-directory sizes before JSZip allocates entries; then bound actual inflation of each entry. */
export async function readSafeXlsxZip(bytes: Uint8Array): Promise<JSZip> {
  if (bytes.byteLength > XLSX_ZIP_LIMITS.compressed || bytes.byteLength < 22) fail()
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset--) {
    if (data.getUint32(offset, true) === 0x06054b50 && offset + 22 + data.getUint16(offset + 20, true) === bytes.length) { end = offset; break }
  }
  if (end < 0) fail()
  const entries = data.getUint16(end + 10, true), size = data.getUint32(end + 12, true), start = data.getUint32(end + 16, true)
  if (data.getUint16(end + 4, true) || data.getUint16(end + 6, true) || data.getUint16(end + 8, true) !== entries || entries > XLSX_ZIP_LIMITS.entries || start + size !== end) fail()
  const sizes = new Map<string, number>()
  let position = start, total = 0
  for (let index = 0; index < entries; index++) {
    if (position + 46 > end || data.getUint32(position, true) !== 0x02014b50) fail()
    const expanded = data.getUint32(position + 24, true), nameLength = data.getUint16(position + 28, true)
    const extraLength = data.getUint16(position + 30, true), commentLength = data.getUint16(position + 32, true)
    if (data.getUint16(position + 8, true) & 1 || expanded > XLSX_ZIP_LIMITS.entry) fail()
    total += expanded
    if (total > XLSX_ZIP_LIMITS.expanded || position + 46 + nameLength + extraLength + commentLength > end) fail()
    const name = new TextDecoder().decode(bytes.subarray(position + 46, position + 46 + nameLength))
    if (sizes.has(name) || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) fail()
    sizes.set(name, expanded)
    position += 46 + nameLength + extraLength + commentLength
  }
  if (position !== end) fail()
  const zip = await JSZip.loadAsync(bytes)
  for (const file of Object.values(zip.files)) {
    if (file.dir) continue
    const expected = sizes.get(file.name)
    if (expected === undefined || (file.unsafeOriginalName && file.unsafeOriginalName !== file.name)) fail()
    await new Promise<void>((resolve, reject) => {
      let actual = 0
      const stream = (file as JSZip.JSZipObject & { internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array> }).internalStream('uint8array')
      stream.on('data', (chunk) => {
        actual += chunk.length
        if (actual > expected!) { stream.pause(); reject(new Error('Workbook expanded beyond its declared size.')) }
      }).on('error', reject).on('end', () => actual === expected ? resolve() : reject(new Error('Workbook ZIP sizes do not match.'))).resume()
    })
  }
  return zip
}
