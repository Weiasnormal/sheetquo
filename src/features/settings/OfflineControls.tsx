import { useOffline } from '../../infrastructure/offline/pwa'

export function OfflineControls() {
  const offline = useOffline()
  return <div data-wiwo="offline" data-wiwo-ready={import.meta.env.PROD && offline.ready && !offline.error ? 'offline-ready' : undefined} className="flex flex-col gap-3">
    <p role="status" className="font-medium">{!import.meta.env.PROD ? 'Offline caching is enabled in the production build.'
      : !('serviceWorker' in navigator) ? 'This browser cannot save the app for offline use. Use a supported browser over HTTPS or localhost.'
      : offline.error ? 'Offline setup failed. Reconnect and reload to try again.'
        : offline.ready ? 'Ready for offline use' : 'Preparing offline access. Keep this page open while connected.'}</p>
    {!offline.online && <p>You are offline. Your saved businesses, templates and drafts stay available.</p>}
    {offline.updateAvailable && <p className="rounded-button border border-line p-3">An update is ready. Finish your work and wait for “Saved”, then close every Sheetquo tab and app window. Reopen Sheetquo to use the new version.</p>}
    <p className="text-sm text-muted">After offline access is ready, you can import templates, paste quotations, generate Excel files and restore backups without a connection. App updates wait until you close all Sheetquo windows.</p>
    <p className="text-sm text-muted">To install, use your browser’s “Install app” or “Add to Home Screen” menu when available. Installation is optional. Clearing site data removes offline access and local records; keep a backup.</p>
  </div>
}
