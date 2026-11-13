import { CHAPTERS, type ChapterId } from './catalog'

export const WIWO_KEY = 'sheetquo.wiwo.v1'
export const REVISION = 1
export type ChapterProgress = { revision: number; status: 'introduced' | 'completed' | 'dismissed'; completed: string[]; skipped: string[]; resume: number }
export type Progress = { version: 1; animation: boolean; chapters: Partial<Record<ChapterId, ChapterProgress>> }
export const emptyProgress = (): Progress => ({ version: 1, animation: true, chapters: {} })

/** Only tutorial identifiers/status are accepted. Never deserialize arbitrary business data here. */
export function parseProgress(raw: string | null): Progress {
  if (!raw || raw.length > 50_000) return emptyProgress()
  try {
    const data = JSON.parse(raw)
    if (data?.version !== 1 || typeof data.animation !== 'boolean' || !data.chapters || typeof data.chapters !== 'object') return emptyProgress()
    const result = emptyProgress(); result.animation = data.animation
    const ids = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 40 && value.every((id) => typeof id === 'string' && /^[a-z0-9-]{1,64}$/.test(id))
    for (const { id } of CHAPTERS) {
      const value = data.chapters[id]
      if (!value || value.revision !== REVISION || !['introduced', 'completed', 'dismissed'].includes(value.status) || !ids(value.completed) || !ids(value.skipped) || !Number.isInteger(value.resume) || value.resume < 0 || value.resume > 40) continue
      result.chapters[id] = { revision: REVISION, status: value.status, completed: value.completed, skipped: value.skipped, resume: value.resume }
    }
    return result
  } catch { return emptyProgress() }
}
export function readProgress(): { progress: Progress; persistent: boolean } {
  try { return { progress: parseProgress(localStorage.getItem(WIWO_KEY)), persistent: true } }
  catch { return { progress: emptyProgress(), persistent: false } }
}
export function writeProgress(progress: Progress): boolean {
  try { localStorage.setItem(WIWO_KEY, JSON.stringify(progress)); return true }
  catch { return false }
}
export function chapterProgress(progress: Progress, id: ChapterId): ChapterProgress {
  return progress.chapters[id] ?? { revision: REVISION, status: 'introduced', completed: [], skipped: [], resume: 0 }
}
