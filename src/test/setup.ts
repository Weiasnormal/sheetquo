// Must load before Dexie, so every test gets an in-memory IndexedDB instead of a real one.
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Engine tests run in Node, so the DOM stubs apply only to component tests.
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn()
  // Radix menus measure and capture pointers, which jsdom does not implement.
  Element.prototype.scrollIntoView = vi.fn()
  Element.prototype.hasPointerCapture = vi.fn(() => false)
  Element.prototype.releasePointerCapture = vi.fn()
  afterEach(cleanup)
}
