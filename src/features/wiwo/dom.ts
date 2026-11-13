export function isVisible(element: Element): element is HTMLElement {
  const box = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !element.closest('[hidden],[inert]')
}
export function targetFor(keys: string[]): HTMLElement | undefined {
  for (const key of keys) {
    const matches = [...document.querySelectorAll(`[data-wiwo~="${key}"]`)].filter(isVisible)
    // Never guess between two live controls with the same identifier.
    if (matches.length === 1) {
      const selector = key === 'items' ? '[data-wiwo-item]' : key === 'adjustments' ? '[data-wiwo-adjustment]' : undefined
      const selected = selector ? document.activeElement?.closest(selector) : undefined
      return selected && matches[0].contains(selected) && isVisible(selected) ? selected : matches[0]
    }
  }
}
export function isReady(key?: string) {
  return Boolean(key && [...document.querySelectorAll(`[data-wiwo-ready~="${key}"]`)].some(isVisible))
}
export function openDialog(): HTMLElement | undefined {
  return [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].filter(isVisible).at(-1)
}
export function inViewport(element?: HTMLElement) {
  if (!element) return false
  const box = element.getBoundingClientRect()
  return box.top < window.innerHeight - 48 && box.bottom > 56 && box.left < window.innerWidth && box.right > 0
}
