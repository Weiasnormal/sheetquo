import { test, expect } from '@playwright/test'

test('front page: 3D stages, static fallback, navigation and guided workspace entry', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your next quotation starts with a message.')
  await expect(page.locator('.front-webgl')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('.front-webgl canvas')).toHaveCount(1)
  const paintedPixels = () => page.locator('.front-webgl canvas').evaluate((canvas: HTMLCanvasElement) => {
    const copy = document.createElement('canvas'); copy.width = 100; copy.height = 100
    const context = copy.getContext('2d')!
    context.drawImage(canvas, 0, 0, 100, 100)
    const pixels = context.getImageData(0, 0, 100, 100).data
    return Array.from(pixels).filter((value, index) => index % 4 === 3 && value > 0).length
  })
  await expect.poll(paintedPixels).toBeGreaterThan(2000)
  await page.setViewportSize({ width: 1440, height: 950 })
  await expect.poll(paintedPixels).toBeGreaterThan(2000)
  await page.screenshot({ path: 'output/frontpage/3d-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Request', exact: true }).click()
  await expect(page.getByText('Paste a request', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Excel', exact: true }).click()
  await expect(page.getByText('An editable .xlsx file', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Use static view', exact: true }).click()
  await expect(page.locator('.front-webgl canvas')).toHaveCount(0)
  await expect(page.getByRole('table', { name: 'Example quotation' })).toBeVisible()
  await expect(page.getByText('PHP 3,150.00', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Enable 3D view', exact: true }).click()
  await expect(page.locator('.front-webgl canvas')).toHaveCount(1)
  await page.getByRole('navigation', { name: 'Front page' }).getByRole('link', { name: 'Open workspace' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard')
  await page.goto('/')
  await page.getByRole('button', { name: 'Wiwo — show me the workspace', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('region', { name: 'Wiwo tutorial' }).getByRole('heading')).toHaveText('Meet Wiwo')
  expect(errors).toEqual([])
})

test('reduced motion retains the example and responsive keyboard controls without a WebGL scene', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Static preview', exact: true })).toBeDisabled()
  await expect(page.locator('.front-webgl canvas')).toHaveCount(0)
  for (const width of [1440, 1024, 768, 390, 360]) {
    await page.setViewportSize({ width, height: 950 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('link', { name: 'Open workspace', exact: true }).first()).toBeVisible()
    const button = page.getByRole('button', { name: 'Excel', exact: true })
    await button.focus(); await page.keyboard.press('Enter')
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('table', { name: 'Example quotation' })).toBeVisible()
    await page.screenshot({ path: `output/frontpage/static-${width}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: 'Let Wiwo show me', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('region', { name: 'Wiwo tutorial' })).toBeVisible()
})

test('unavailable WebGL keeps a usable front page', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type.startsWith('webgl') || type === 'experimental-webgl') return null
      return Reflect.apply(original, this, [type, ...args])
    } as typeof original
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Static preview', exact: true })).toBeDisabled()
  await expect(page.getByRole('table', { name: 'Example quotation' })).toBeVisible()
  await page.getByRole('button', { name: 'Request', exact: true }).click()
  await expect(page.getByText('Your customer', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Open workspace', exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard')
})
