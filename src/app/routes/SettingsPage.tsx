import { WiwoSettings } from '../../features/wiwo/WiwoLibrary'
import { BackupControls } from '../../features/settings/BackupControls'
import { OfflineControls } from '../../features/settings/OfflineControls'
import { WipeDataControls } from '../../features/settings/WipeDataControls'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '../../components/layout/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Panel } from '../../components/ui/Panel'
import { formatBytes, useStorageStatus } from '../../features/settings/useStorageStatus'

function SettingsSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section data-wiwo={title === 'Storage' ? 'storage' : undefined} className="grid gap-4 border-b border-line py-6 first:pt-0 last:border-b-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-8">
      <div>
        <h2 className="text-base leading-6 font-medium">{title}</h2>
        <p className="mt-1 text-muted">{description}</p>
      </div>
      <Panel className="p-5">{children}</Panel>
    </section>
  )
}

function StorageSummary() {
  const { status, refresh } = useStorageStatus()

  async function protect() {
    try {
      const granted = await navigator.storage.persist()
      if (granted) toast.success('This browser will keep Sheetquo’s data')
      else toast.message('The browser said no', { description: 'Export a backup regularly instead.' })
    } catch {
      toast.error('This browser cannot keep data on request')
    }
    refresh()
  }

  if (status.state === 'loading') return <p className="text-muted">Checking this browser's storage</p>
  if (status.state === 'unavailable') return <p className="text-muted">This browser does not report its storage.</p>

  return (
    <dl>
      <div className="flex justify-between gap-4 pb-2">
        <dt className="text-muted">Used</dt>
        <dd className="tabular text-right">
          {formatBytes(status.usedBytes)} <span className="text-muted">of {formatBytes(status.quotaBytes)}</span>
        </dd>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-rule pt-2">
        <dt className="text-muted">Protection</dt>
        <dd className="flex flex-wrap items-center justify-end gap-2">
          {status.persisted ? (
            <Badge tone="positive">Kept by the browser</Badge>
          ) : (
            <>
              <Badge tone="notice">Can be cleared by the browser</Badge>
              <Button variant="secondary" onClick={() => void protect()}>
                Ask to keep it
              </Button>
            </>
          )}
        </dd>
      </div>
    </dl>
  )
}

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Local data and privacy for this browser." />

      <SettingsSection
        title="Storage"
        description="Sheetquo keeps its data in this browser, on this device. Private windows and clearing site data can remove it. Asking the browser to keep it stops it being cleared when space runs low."
      >
        <StorageSummary />
      </SettingsSection>

      <SettingsSection
        title="Backup"
        description="A backup file is how you move your setup to another computer or keep a copy if this browser loses it."
      >
        <BackupControls />
      </SettingsSection>

      <SettingsSection title="Offline access" description="Use Sheetquo after the app has finished saving for offline use.">
        <OfflineControls />
      </SettingsSection>

      <SettingsSection title="Wiwo" description="Your cursor guide remembers learning in this browser."><WiwoSettings /></SettingsSection>

      <SettingsSection title="Wipe data" description="Start over in this browser without clearing site data by hand.">
        <WipeDataControls />
      </SettingsSection>

      <SettingsSection title="Privacy" description="What happens to your quotation data.">
        <ul className="flex list-disc flex-col gap-2 pl-4">
          <li>Parsing and Excel generation run in this browser.</li>
          <li>Customer details and prices are not sent to a server, an AI service, or analytics.</li>
          <li>Sheetquo has no accounts, so your data is not shared between devices.</li>
        </ul>
      </SettingsSection>
    </>
  )
}
