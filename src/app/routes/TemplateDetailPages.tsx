import { useLiveQuery } from 'dexie-react-hooks'
import { Building2, FileQuestion } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Panel, PanelTitle } from '../../components/ui/Panel'

import { DiagnosticList } from '../../features/templates/DiagnosticList'
import { MappingStudio } from '../../features/templates/mapping/MappingStudio'
import { TemplateImport } from '../../features/templates/TemplateImport'
import { TemplateTestPanel } from '../../features/templates/testing/TemplateTestPanel'
import { useCleanGrid } from '../../features/templates/useCleanGrid'
import { startNewVersion, versionStateLabel } from '../../features/templates/versionActions'
import { VersionsPanel } from '../../features/templates/VersionsPanel'
import { describeRegion } from '../../domain/template/region'
import { selectBusiness } from '../../infrastructure/storage/businessRepository'
import {
  archiveTemplate,
  readTemplateDetail,
  restoreTemplate,
} from '../../infrastructure/storage/templateRepository'
import type { TemplateDetail } from '../../infrastructure/storage/templateRepository'
import { useWorkspace } from '../useWorkspace'

// Loaded on demand: these screens read workbooks, which brings in the Excel engine.

export function TemplateImportPage() {
  const { status, business } = useWorkspace()

  return (
    <>
      <PageHeader title="Upload template" description="Sheetquo checks the workbook first and tells you what it can keep." />
      {status === 'ready' && !business ? (
        <EmptyState
          icon={Building2}
          title="Add a business first"
          action={
            <Button asChild variant="secondary">
              <Link to="/businesses/new">Add business</Link>
            </Button>
          }
        >
          Each template belongs to one business.
        </EmptyState>
      ) : business ? (
        <TemplateImport business={business} />
      ) : null}
    </>
  )
}

export function TemplateReplacePage() {
  const { business } = useWorkspace()
  return <TemplateGate title="Upload redesigned workbook">{(detail) => <>
    <PageHeader title="Upload redesigned workbook" description={`Add a new version of ${detail.template.name}. Existing quotations keep their original version.`} />
    {detail.versions.some(({ state }) => state === 'draft') || detail.template.archivedAt
      ? <p>Finish and test the current draft, and restore the template if archived, before uploading another version.</p>
      : business && <TemplateImport business={business} replacement={detail} />}
  </>}</TemplateGate>
}

/** Shows a template only to the business that owns it, so one business never sees another's layout. */
function TemplateGate({ title, children }: { title: string; children: (detail: TemplateDetail) => ReactNode }) {
  const { id = '' } = useParams()
  const { business, activeBusinesses } = useWorkspace()
  const detail = useLiveQuery(() => readTemplateDetail(id).catch(() => undefined), [id], 'loading' as const)

  if (detail === 'loading') return <PageHeader title={title} />

  if (!detail) {
    return (
      <>
        <PageHeader title="Template not found" />
        <EmptyState
          icon={FileQuestion}
          title="This template is not in this browser"
          action={
            <Button asChild variant="secondary">
              <Link to="/templates">Back to templates</Link>
            </Button>
          }
        >
          Templates stay on the device and browser that imported them.
        </EmptyState>
      </>
    )
  }

  if (detail.template.businessId !== business?.id) {
    const owner = activeBusinesses.find(({ id: businessId }) => businessId === detail.template.businessId)
    return (
      <>
        <PageHeader title={title} />
        <EmptyState
          icon={Building2}
          title={`This template belongs to ${detail.businessName}`}
          action={
            owner ? (
              <Button variant="secondary" onClick={() => void selectBusiness(owner.id)}>
                Switch to {owner.displayName}
              </Button>
            ) : undefined
          }
        >
          Switch to that business to use it.
        </EmptyState>
      </>
    )
  }

  return <>{children(detail)}</>
}

function ArchiveControls({ detail }: { detail: TemplateDetail }) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const { template } = detail

  async function archive() {
    const result = await archiveTemplate(template.id)
    if (!result.ok) return toast.error(result.error.message)
    toast.success('Template archived', { description: template.name })
    navigate('/templates')
  }

  async function restore() {
    const result = await restoreTemplate(template.id)
    if (result.ok) toast.success('Template restored', { description: template.name })
    else toast.error(result.error.message)
  }

  if (template.archivedAt) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-button border border-line bg-surface px-4 py-3">
        <p>This template is archived.</p>
        <Button variant="secondary" onClick={() => void restore()}>
          Restore template
        </Button>
      </div>
    )
  }

  return (
    <Panel data-wiwo="template-archive" aria-labelledby="archive-title" className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="max-w-md">
        <PanelTitle id="archive-title">Archive template</PanelTitle>
        <p className="mt-1 text-muted">It leaves your template list. Its files stay saved, and you can restore it.</p>
      </div>
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Archive template
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Archive ${template.name}?`}
        description="It leaves your template list. Its files stay saved, and you can restore it from Templates."
        confirmLabel="Archive"
        onConfirm={() => void archive()}
      />
    </Panel>
  )
}

function StateLine({ detail }: { detail: TemplateDetail }) {
  const { version } = detail
  return (
    <>
      Version {version.version} · {versionStateLabel(version)} · From {version.originalFileName} · {version.sourceWorksheet} ·{' '}
      {describeRegion(version.region)}
    </>
  )
}

function MappingScreen({ detail }: { detail: TemplateDetail }) {
  const { template, version } = detail
  const clean = useCleanGrid(version)
  const readOnly = version.state !== 'draft'

  if (clean.status === 'loading') return <div aria-busy="true" className="h-96 rounded-card border border-line bg-surface" />
  if (clean.status === 'failed') return <p className="text-danger">Could not open the stored template.</p>

  return (
    <MappingStudio
      key={version.id}
      version={version}
      grid={clean.grid}
      defaults={clean.defaults}
      readOnly={readOnly}
      testHref={`/templates/${template.id}/test`}
      lockedNotice={
        readOnly ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-button border border-line bg-surface px-4 py-3">
            <p>
              Version {version.version} is {version.state === 'active' ? 'active' : 'tested'}, so its mapping is locked. A new version
              starts as a copy you can change.
            </p>
            <Button variant="secondary" onClick={() => void startNewVersion(version)}>
              Start version {Math.max(...detail.versions.map((candidate) => candidate.version)) + 1}
            </Button>
          </div>
        ) : undefined
      }
    />
  )
}

export function TemplateMapPage() {
  return (
    <TemplateGate title="Map template">
      {(detail) => (
        <>
          <PageHeader title={detail.template.name} description={<StateLine detail={detail} />} />
          <div className="flex flex-col gap-4">
            {!detail.template.archivedAt && <Panel className="p-5">
              <PanelTitle>Use this design</PanelTitle>
              <p className="my-3 text-muted">Start an adaptive quotation with this sheet’s column styling and your business letterhead. Only fixed Excel forms need the mapping below.</p>
              <Button asChild><Link to={'/quotation/new?design=' + detail.template.id}>Start adaptive quotation</Link></Button>
            </Panel>}
            <MappingScreen detail={detail} />
            <VersionsPanel summary={detail} />
            <Panel aria-labelledby="compatibility-title" className="p-5">
              <PanelTitle id="compatibility-title">Compatibility</PanelTitle>
              <div className="mt-3">
                <DiagnosticList diagnostics={detail.version.capabilityWarnings} />
              </div>
            </Panel>
            <ArchiveControls detail={detail} />
          </div>
        </>
      )}
    </TemplateGate>
  )
}

export function TemplateTestPage() {
  const { business } = useWorkspace()
  return (
    <TemplateGate title="Test template">
      {(detail) => (
        <>
          <PageHeader title={`Test ${detail.template.name}`} description={<StateLine detail={detail} />} />
          {business && <TemplateTestPanel summary={detail} business={business} />}
        </>
      )}
    </TemplateGate>
  )
}
