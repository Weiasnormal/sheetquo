import JSZip from 'jszip'
import { expect, it } from 'vitest'
import { readSafeXlsxZip, XLSX_ZIP_LIMITS } from './safeZip'

async function archive(name = 'xl/workbook.xml', content = 'x'.repeat(100_000)) {
  return new JSZip().file(name, content).generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}
function central(bytes: Uint8Array) { const view = new DataView(bytes.buffer); return { view, offset: view.getUint32(bytes.length - 6, true) } }
it('reads normal deflated XML archives', async () => { const zip = await readSafeXlsxZip(await archive()); expect((await zip.file('xl/workbook.xml')!.async('string')).length).toBe(100_000) })
it('rejects expanded-size bombs before inflation', async () => {
  const bytes = await archive(); const { view, offset } = central(bytes)
  // The first entry is the automatically created directory.
  const next = offset + 46 + view.getUint16(offset + 28, true)
  view.setUint32(next + 24, XLSX_ZIP_LIMITS.entry + 1, true)
  await expect(readSafeXlsxZip(bytes)).rejects.toThrow(/safe archive/)
})
it('bounds real inflation when directory sizes understate the payload', async () => {
  const bytes = await archive('payload.xml'); const { view, offset } = central(bytes)
  view.setUint32(offset + 24, 10, true)
  await expect(readSafeXlsxZip(bytes)).rejects.toThrow()
})
it.each(['../escape.xml', '/absolute.xml', 'bad\\path.xml'])('rejects unsafe path %s', async (name) => { await expect(readSafeXlsxZip(await archive(name))).rejects.toThrow() })
it('rejects excessive entry counts and truncated archives', async () => {
  const bytes = await archive(); const { view } = central(bytes)
  view.setUint16(bytes.length - 12, XLSX_ZIP_LIMITS.entries + 1, true)
  await expect(readSafeXlsxZip(bytes)).rejects.toThrow()
  await expect(readSafeXlsxZip(bytes.slice(0, -3))).rejects.toThrow()
})
