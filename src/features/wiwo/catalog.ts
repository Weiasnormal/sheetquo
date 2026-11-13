export type ChapterId = 'welcome' | 'business' | 'import' | 'fields' | 'table' | 'output' | 'test' | 'templates' | 'start' | 'items' | 'adjustments' | 'details' | 'generate' | 'history' | 'backup' | 'offline' | 'recovery'
export type Chapter = { id: ChapterId; title: string; description: string; anchors: string[]; route: 'home' | 'business' | 'import' | 'map' | 'test' | 'templates' | 'start' | 'review' | 'generate' | 'history' | 'settings' | 'any' }
export const CHAPTERS: Chapter[] = [
  { id: 'welcome', title: 'Find your way', description: 'Your workspace, setup checklist and Wiwo controls.', anchors: ['setup', 'navigation'], route: 'home' },
  { id: 'business', title: 'Businesses', description: 'Details, branding, currency and switching businesses.', anchors: ['business-list', 'business-form'], route: 'business' },
  { id: 'import', title: 'Import a template', description: 'Choose a workbook, worksheet and one quotation area.', anchors: ['import-file', 'import-review'], route: 'import' },
  { id: 'fields', title: 'Map document fields', description: 'Connect fields to cells and clear historical values.', anchors: ['mapping-fields'], route: 'map' },
  { id: 'table', title: 'Map the item table', description: 'Columns, the prototype row and the moving footer.', anchors: ['mapping-table'], route: 'map' },
  { id: 'output', title: 'Output and printing', description: 'Formats, adjustment slots, wrapping and page settings.', anchors: ['output-formats'], route: 'map' },
  { id: 'test', title: 'Test and activate', description: 'Generate sample files and activate a reviewed version.', anchors: ['template-test'], route: 'test' },
  { id: 'templates', title: 'Maintain templates', description: 'Versions, redesigned workbooks, copies and defaults.', anchors: ['template-list', 'template-versions'], route: 'templates' },
  { id: 'start', title: 'Start a quotation', description: 'Select a layout, paste a request or enter items yourself.', anchors: ['quote-start', 'paste'], route: 'start' },
  { id: 'items', title: 'Review lines and items', description: 'Resolve uncertain prices, alternatives, FREE items and labor.', anchors: ['items'], route: 'review' },
  { id: 'adjustments', title: 'Discounts, fees and tax', description: 'Choose additions, deductions and their percentage bases.', anchors: ['adjustments'], route: 'review' },
  { id: 'details', title: 'Details, notes and terms', description: 'Customer and vehicle details, terms and signatures.', anchors: ['quote-customer'], route: 'review' },
  { id: 'generate', title: 'Generate and review Excel', description: 'Download, check calculations and review the printed result.', anchors: ['generate'], route: 'generate' },
  { id: 'history', title: 'Saved work and history', description: 'Find, reopen and maintain saved quotations.', anchors: ['history', 'recent-quotes'], route: 'history' },
  { id: 'backup', title: 'Backup and restore', description: 'Portable copies, privacy and restore choices.', anchors: ['backup-export'], route: 'settings' },
  { id: 'offline', title: 'Offline and installation', description: 'Offline readiness, updates and browser storage.', anchors: ['offline'], route: 'settings' },
  { id: 'recovery', title: 'Problems and recovery', description: 'Save failures, missing records and errors without losing work.', anchors: ['recovery', 'save-failed', 'mapping-check'], route: 'any' },
]
export const chapterById = (id: ChapterId) => CHAPTERS.find((chapter) => chapter.id === id)!

export function matchesRoute(chapter: Chapter, pathname: string, search = ''): boolean {
  switch (chapter.route) {
    case 'home': return pathname === '/dashboard'
    case 'business': return pathname.startsWith('/businesses')
    case 'import': return pathname === '/templates/import' || /^\/templates\/[^/]+\/replace$/.test(pathname)
    case 'map': return /^\/templates\/[^/]+\/map$/.test(pathname)
    case 'test': return /^\/templates\/[^/]+\/test$/.test(pathname)
    case 'templates': return pathname === '/templates' || /^\/templates\/[^/]+\/map$/.test(pathname)
    case 'start': return pathname === '/quotation/new' || (/^\/quotation\/[^/]+$/.test(pathname) && new URLSearchParams(search).get('step') === 'paste')
    case 'review': return /^\/quotation\/(?!new$)[^/]+$/.test(pathname) && !['paste', 'generate'].includes(new URLSearchParams(search).get('step') ?? '')
    case 'generate': return /^\/quotation\/(?!new$)[^/]+$/.test(pathname) && new URLSearchParams(search).get('step') === 'generate'
    case 'history': return pathname === '/quotations' || pathname === '/dashboard' || /^\/quotation\/(?!new$)[^/]+$/.test(pathname)
    case 'settings': return pathname === '/settings'
    case 'any': return true
  }
}
