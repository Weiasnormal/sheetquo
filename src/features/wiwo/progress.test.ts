// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { chapterProgress, emptyProgress, parseProgress, readProgress, WIWO_KEY, writeProgress } from './progress'
import { CHAPTERS, chapterById, matchesRoute } from './catalog'
import { LESSONS } from './lessons'
import { isReady, targetFor } from './dom'

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); document.body.innerHTML = '' })
describe('Wiwo learning storage', () => {
  it('retains a valid resume position, skips and dismissals', () => {
    const progress = emptyProgress()
    progress.chapters.import = { ...chapterProgress(progress, 'import'), status: 'dismissed', completed: ['file'], skipped: ['worksheet'], resume: 2 }
    expect(writeProgress(progress)).toBe(true)
    expect(readProgress().progress).toEqual(progress)
  })
  it('recovers from corrupt, oversized and future-version records', () => {
    for (const raw of ['{', 'null', 'a'.repeat(50_001), JSON.stringify({ ...emptyProgress(), version: 9 })]) expect(parseProgress(raw)).toEqual(emptyProgress())
    expect(parseProgress(JSON.stringify({ ...emptyProgress(), chapters: { import: { revision: 99 }, privateCustomer: { name: 'private' } } }))).toEqual(emptyProgress())
  })
  it('resets only its namespaced record', () => {
    localStorage.setItem('unrelated', 'keep me')
    writeProgress(emptyProgress())
    expect(localStorage.getItem('unrelated')).toBe('keep me')
    expect(localStorage.getItem(WIWO_KEY)).not.toContain('keep me')
  })
  it('continues in memory when storage is denied or full', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full') })
    expect(readProgress()).toEqual({ progress: emptyProgress(), persistent: false })
    expect(writeProgress(emptyProgress())).toBe(false)
  })
  it('keeps every chapter addressable with unique resumable step IDs', () => {
    expect(CHAPTERS).toHaveLength(17)
    for (const chapter of CHAPTERS) {
      const ids = LESSONS[chapter.id].map(({ id }) => id)
      expect(new Set(ids).size).toBe(ids.length)
      expect(ids.length).toBeGreaterThan(0)
    }
    expect(matchesRoute(chapterById('items'), '/quotation/new')).toBe(false)
    expect(matchesRoute(chapterById('generate'), '/quotation/id', '?step=review')).toBe(false)
    expect(matchesRoute(chapterById('generate'), '/quotation/id', '?step=generate')).toBe(true)
  })
})
describe('safe target resolution', () => {
  function visible() { vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 80, right: 100, bottom: 180, width: 100, height: 100, x: 0, y: 80, toJSON() {} }) }
  it('refuses ambiguous repeated controls and uses a unique fallback', () => {
    visible()
    document.body.innerHTML = '<div data-wiwo="items"></div><div data-wiwo="items"></div><button data-wiwo="fallback"></button>'
    expect(targetFor(['items'])).toBeUndefined()
    expect(targetFor(['items', 'fallback'])?.tagName).toBe('BUTTON')
  })
  it('ignores hidden and inert controls and readiness markers', () => {
    visible()
    document.body.innerHTML = '<div inert><button data-wiwo="save" data-wiwo-ready="saved"></button></div>'
    expect(targetFor(['save'])).toBeUndefined()
    expect(isReady('saved')).toBe(false)
    document.querySelector('div')!.removeAttribute('inert')
    expect(isReady('saved')).toBe(true)
  })
})
