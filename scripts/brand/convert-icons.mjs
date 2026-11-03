// Format-only copies of the supplied icons. Pixel dimensions and artwork are unchanged.
import { chromium } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage()
  for (const name of ['favicon-32x32', 'android-chrome-192x192', 'android-chrome-512x512']) {
    const bytes = await readFile(`public/brandassets/${name}.webp`)
    const png = await page.evaluate(async (base64) => {
      const image = new Image()
      image.src = `data:image/webp;base64,${base64}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      canvas.getContext('2d').drawImage(image, 0, 0)
      return canvas.toDataURL('image/png').split(',')[1]
    }, bytes.toString('base64'))
    const output = Buffer.from(png, 'base64')
    await writeFile(`public/brandassets/${name}.png`, output)
    if (name === 'favicon-32x32') {
      const header = Buffer.alloc(22)
      header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4)
      header[6] = 32; header[7] = 32
      header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12)
      header.writeUInt32LE(output.length, 14); header.writeUInt32LE(22, 18)
      await writeFile('public/brandassets/favicon.ico', Buffer.concat([header, output]))
    }
  }
} finally { await browser.close() }
