import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Panel, PanelTitle } from '../../components/ui/Panel'
import { formatDate } from '../../domain/formatDate'
import type { TemplateSummary, TemplateVersionRecord } from '../../domain/template/records'
import { activateVersion } from '../../infrastructure/storage/templateRepository'
import { startNewVersion, versionStateLabel } from './versionActions'
import { duplicateTemplate } from '../../infrastructure/storage/templateRepository'
import { useState } from 'react'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'

export function VersionsPanel({ summary }: { summary: TemplateSummary }) {
  const { template, versions } = summary
  const navigate = useNavigate()
  const [activating, setActivating] = useState<TemplateVersionRecord>()
  const hasDraft = versions.some(({ state }) => state === 'draft')

  async function activate(version: TemplateVersionRecord) {
    const result = await activateVersion(version.id)
    if (result.ok) toast.success(`Version ${version.version} is now active`, { description: 'New quotations use this layout.' })
    else toast.error(result.error.message)
  }

  return (
    <Panel data-wiwo="template-versions" aria-labelledby="versions-title" className="p-5">
      <PanelTitle id="versions-title">Versions</PanelTitle>
      <p className="mt-1 text-muted">Tested versions never change, so you can switch back to an earlier one at any time.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {!hasDraft && !template.archivedAt && <Button asChild variant="secondary"><Link to={`/templates/${template.id}/replace`}>Upload redesigned workbook</Link></Button>}
        <Button variant="secondary" onClick={async () => {
          const result = await duplicateTemplate(summary.version.id)
          if (!result.ok) return toast.error(result.error.message)
          toast.success('Template copied')
          navigate(`/templates/${result.value.template.id}/map`)
        }}>Duplicate template</Button>
      </div>
      <ul className="mt-3 divide-y divide-rule">
        {versions.map((version) => (
          <li key={version.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
            <span className="tabular w-20 font-medium">Version {version.version}</span>
            <Badge tone={version.state === 'active' ? 'positive' : 'neutral'}>{versionStateLabel(version)}</Badge>
            <span className="min-w-0 flex-1 text-muted">Updated {formatDate(version.updatedAt)}</span>
            {version.state === 'tested' && (
              <Button variant="secondary" onClick={() => setActivating(version)}>
                Make active
              </Button>
            )}
            {version.state === 'draft' && version.mapping && (
              <Button asChild variant="secondary">
                <Link to={`/templates/${template.id}/test`}>Test</Link>
              </Button>
            )}
            {version.state !== 'draft' && !hasDraft && version === versions[0] && (
              <Button variant="secondary" onClick={() => void startNewVersion(version)}>
                New version
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog open={Boolean(activating)} onOpenChange={(open) => { if (!open) setActivating(undefined) }}
        title={`Activate version ${activating?.version}?`} description="Confirm you reviewed this version’s test output. Existing quotations keep their original version."
        confirmLabel="Confirm activation" onConfirm={() => { if (activating) void activate(activating) }} />
    </Panel>
  )
}
