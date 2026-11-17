import { useEffect, useRef } from 'react'
import { Outlet, ScrollRestoration, useLocation } from 'react-router'
import { Toaster } from 'sonner'
import { useWorkspace } from '../../app/useWorkspace'
import { MobileBar } from './MobileBar'
import { NavContent } from './NavContent'

export function AppLayout() {
  const { pathname } = useLocation()
  const { status } = useWorkspace()
  const mainRef = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)

  // A client-side route change is silent to screen readers unless focus moves with it.
  useEffect(() => {
    if (previousPath.current !== pathname) mainRef.current?.focus({ preventScroll: true })
    previousPath.current = pathname
  }, [pathname])

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <a
        href="#main"
        className="fixed top-2 left-2 z-50 -translate-y-16 rounded-button bg-ink px-4 py-2 text-surface focus:translate-y-0"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-svh border-r border-line lg:block">
        <NavContent />
      </aside>
      <div className="min-w-0">
        <MobileBar />

        <main id="main" ref={mainRef} tabIndex={-1} className="min-w-0 outline-none">
          <div className="mx-auto max-w-300 px-4 py-6 sm:px-6 lg:px-9 lg:pt-9 lg:pb-9">
            {status === 'unavailable' && (
              <p data-wiwo="recovery" role="status" className="mb-6 rounded-button border border-notice/30 bg-notice-tint px-4 py-3 text-notice">
                This browser is blocking local storage, so nothing can be saved here. Private windows often do this.
              </p>
            )}
            <Outlet />
          </div>
        </main>
      </div>

      <ScrollRestoration />
      <Toaster position="bottom-right" toastOptions={{ className: 'font-sans' }} />
    </div>
  )
}
