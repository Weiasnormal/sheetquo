import { defineConfig } from '@playwright/test'

const port = Number(process.env.SHEETQUO_TEST_PORT ?? '4173')
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './output/phase9/playwright',
  timeout: 60_000,
  workers: 1,
  use: { baseURL, channel: 'chrome', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  reporter: [['list'], ['json', { outputFile: 'output/phase9/e2e-results.json' }]],
  webServer: { command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`, url: baseURL, reuseExistingServer: false },
})
