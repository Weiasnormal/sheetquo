import { wiwoSuccess } from '../wiwo/events'
import { useState } from 'react'
import { toast } from 'sonner'
import { useWorkspace } from '../../app/useWorkspace'
import { Button } from '../../components/ui/Button'
import { formatDate } from '../../domain/formatDate'
import { downloadFile } from '../../infrastructure/downloads/downloadBytes'
import type { Backup } from '../../infrastructure/storage/backup'
import { recordBackup } from '../../infrastructure/storage/businessRepository'
import { restorePreview } from '../../infrastructure/storage/backupPreview'
import type { RestoreMode } from '../../infrastructure/storage/restoreBackup'

export function BackupControls() {
  const { businesses, lastBackupAt } = useWorkspace()
  const [busy, setBusy] = useState(false)
  const [includeDrafts, setIncludeDrafts] = useState(false)
  const [incoming, setIncoming] = useState<{ bytes: Uint8Array; backup: Backup }>()
  const [mode, setMode] = useState<RestoreMode>('merge')
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState('')
  const preview = incoming && restorePreview(incoming.backup, businesses)

  async function exportBackup() {
    setBusy(true)
    setMessage('')
    try {
      const { createBackup } = await import('../../infrastructure/storage/backup')
      const backup = await createBackup(new Date(), { includeDrafts })
      downloadFile(backup.bytes, backup.filename, 'application/zip')
      await recordBackup()
      wiwoSuccess('backup-exported')
      toast.success('Download started', { description: backup.filename })
    } catch (error) {
      setMessage(error instanceof Error ? `Could not export: ${error.message}` : 'Could not export the backup. Try again.')
    } finally { setBusy(false) }
  }

  async function inspect(file: File) {
    setBusy(true)
    setIncoming(undefined)
    setMessage('Checking backup…')
    setConfirmed(false)
    setMode('merge')
    try {
      const { readBackup, MAX_BACKUP_BYTES } = await import('../../infrastructure/storage/backup')
      if (file.size > MAX_BACKUP_BYTES) { setMessage('Choose a backup smaller than 100 MB.'); return }
      const bytes = new Uint8Array(await file.arrayBuffer())
      const read = await readBackup(bytes)
      if (!read.ok) { setMessage(read.message); return }
      setIncoming({ bytes, backup: read.backup })
      setMessage('Backup checked. Review the contents and choose how to restore.')
    } catch { setMessage('Could not read this file. Choose a Sheetquo backup and try again.') }
    finally { setBusy(false) }
  }

  async function restore() {
    if (!incoming) return
    setBusy(true)
    try {
      const { restoreBackup } = await import('../../infrastructure/storage/restoreBackup')
      const result = await restoreBackup(incoming.bytes, mode, confirmed)
      if (!result.ok) { setMessage(result.error.message); return }
      setMessage(`Restored ${result.value.businesses} businesses, ${result.value.templates} templates and ${result.value.drafts} drafts. Skipped ${result.value.skipped} existing businesses.`)
      setIncoming(undefined)
      setConfirmed(false)
      wiwoSuccess('backup-restored')
      toast.success('Backup restored')
    } catch { setMessage('Restore failed. Your previous data is unchanged. Try again.') }
    finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset data-wiwo="backup-export" data-wiwo-busy={busy} disabled={busy} className="flex min-w-0 flex-col items-start gap-3">
        <legend className="mb-2 font-medium">Export a backup</legend>
        <p className="text-sm text-muted">Includes every business, logo, template workbook, mapping and version. Template workbooks may contain private information. Keep the file somewhere safe; it is not encrypted.</p>
        <label className="flex items-start gap-2">
          <input type="checkbox" checked={includeDrafts} onChange={(event) => setIncludeDrafts(event.target.checked)} className="mt-1" />
          Include quotation drafts and pasted messages (customer details and prices)
        </label>
        <Button data-wiwo="backup-export-button" variant="secondary" disabled={businesses.length === 0} aria-describedby={businesses.length === 0 ? 'backup-empty' : undefined} onClick={() => void exportBackup()}>Export backup</Button>
        {businesses.length === 0 && <p id="backup-empty" className="text-sm text-muted">Add a business first. There is nothing to back up yet.</p>}
        <p className="text-xs text-muted">{lastBackupAt ? `Last export started ${formatDate(lastBackupAt)}` : 'Not exported yet'}. Check that the file finished saving.</p>
      </fieldset>
      <fieldset data-wiwo="backup-restore" data-wiwo-busy={busy} disabled={busy} className="flex min-w-0 flex-col gap-3 border-t border-rule pt-4">
        <legend className="font-medium">Restore a backup</legend>
        <p className="text-sm text-muted">Close other Sheetquo tabs before restoring. Only open backups you trust.</p>
        <label className="flex flex-col gap-2">
          Choose a Sheetquo backup (.zip)
          <input type="file" accept=".zip,application/zip" className="w-full min-w-0 text-sm" onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void inspect(file)
          }} />
        </label>
        {incoming && preview && <>
          <div className="rounded-button border border-line p-3">
            <p className="font-medium">Backup preview</p>
            <p className="text-sm">Exported {formatDate(incoming.backup.createdAt)}. {preview.businesses} businesses, {preview.templates} templates, {preview.versions} versions and {preview.drafts} drafts.</p>
            <ul className="mt-2 list-disc pl-5 text-sm break-words">{incoming.backup.businesses.map((business) => <li key={business.id}>{business.displayName}{preview.conflicts.includes(business.id) ? ' — already present' : ''}</li>)}</ul>
          </div>
          <label className="flex flex-col gap-2">How to restore
            <select data-wiwo="backup-mode" value={mode} onChange={(event) => { setMode(event.target.value as RestoreMode); setConfirmed(false) }} className="min-w-0 rounded-button border border-line bg-surface p-2">
              <option value="merge">Add missing businesses</option>
              <option value="copy">Restore as separate copies</option>
              <option value="replace">Replace all local data</option>
            </select>
          </label>
          <p className="text-sm text-muted">{mode === 'merge'
            ? `Keeps existing businesses and all their records. Skips ${preview.conflicts.length} businesses with a matching ID or name, including their templates and drafts.`
            : mode === 'copy' ? 'Adds every business separately. Matching names get a restored suffix. All existing data stays.'
              : 'Removes all businesses, templates and drafts in this browser, then restores this backup. Drafts absent from the backup will be lost. Export your current data above first.'}</p>
          {mode === 'replace' && <label className="flex items-start gap-2">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />
            I saved any backup I need and confirm replacing all local data.
          </label>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={mode === 'replace' && !confirmed} onClick={() => void restore()}>Restore backup</Button>
            <Button variant="secondary" onClick={() => { setIncoming(undefined); setMessage(''); setConfirmed(false) }}>Cancel</Button>
          </div>
        </>}
      </fieldset>
      <p role="status" aria-live="polite" className="text-sm break-words">{busy ? 'Working… Keep this page open.' : message}</p>
    </div>
  )
}
