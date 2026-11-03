import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'prompt',
    injectRegister: false,
    includeAssets: ['brandassets/*.{webp,png,ico}'],
    manifest: {
      name: 'Sheetquo', short_name: 'Sheetquo', description: 'Private, local quotation workbooks.',
      theme_color: '#A8F047', background_color: '#FAFBF6', display: 'standalone',
      start_url: '/dashboard', scope: '/',
      icons: [192, 512].map((size) => ({ src: `/brandassets/android-chrome-${size}x${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })),
    },
    workbox: {
      // Only build assets. No runtime caches, user uploads, generated files or private IndexedDB records.
      globPatterns: ['**/*.{js,css,html,webp,png,ico,woff2}'],
      maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/^\/private\//, /\.(?:xlsx|zip)$/i],
      cleanupOutdatedCaches: true,
      skipWaiting: false,
      clientsClaim: true,
    },
  })],
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 30_000,
  },
})
