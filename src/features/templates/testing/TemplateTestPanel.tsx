import { wiwoSuccess } from '../../wiwo/events'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Badge } from '../../../components/ui/Badge'
import { Button } from '../../../components/ui/Button'
import { Panel, PanelTitle } from '../../../components/ui/Panel'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { formatMoney } from '../../../domain/calculations/money'
import type { BusinessRecord } from '../../../domain/business/businessForm'
import { toDefinition } from '../../../domain/template/mappingDraft'
import type { TemplateSummary, TemplateTestResult } from '../../../domain/template/records'
import { downloadXlsx } from '../../../infrastructure/downloads/downloadBytes'
import { activateVersion, readWorkbookBytes, recordTestResult } from '../../../infrastructure/storage/templateRepository'
import { DiagnosticList } from '../DiagnosticList'
import { runTemplateTest } from './runTemplateTest'
import type { TestFile } from './runTemplateTest'

const STATUS: Record<TemplateTestResult['status'], { label: string; tone: 'positive' | 'notice' | 'danger' }> = {
  compatible: { label: 'Compatible', tone: 'positive' },
  warnings: { label: 'Compatible with warnings', tone: 'notice' },
  unsupported: { label: 'Not supported', tone: 'danger' },
}

export function TemplateTestPanel({ summary, business }: { summary: TemplateSummary; business: BusinessRecord }) {
  const { template, version } = summary
  const [running, setRunning] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [files, setFiles] = useState<TestFile[]>([])
  const definition = version.mapping ? toDefinition(version.mapping) : undefined
  const result = version.testResult

  async function run() {
    if (!definition || !version.mapping) return
    setRunning(true)
    try {
      const sourceBytes = await readWorkbookBytes(version.sourceBlobId)
      if (!sourceBytes) throw new Error('missing')
      const output = await runTemplateTest({
        templateName: template.name,
        versionNumber: version.version,
        sourceBytes,
        definition,
        business,
      })
      const saved = await recordTestResult(version.id, version.mapping, output.result)
      if (!saved.ok) toast.error(saved.error.message)
      else if (output.result.status !== 'unsupported') wiwoSuccess('template-tested')
      setFiles(output.files)
      toast[output.result.status === 'unsupported' ? 'error' : 'success'](STATUS[output.result.status].label)
    } catch {
      toast.error('Could not run the test')
    } finally {
      setRunning(false)
    }
  }

  async function activate() {
    const activated = await activateVersion(version.id)
    if (activated.ok) wiwoSuccess('template-activated')
    if (activated.ok) toast.success(`Version ${version.version} is now active`, { description: 'New quotations use this layout.' })
    else toast.error(activated.error.message)
  }

  if (!definition) {
    return (
      <Panel className="p-5">
        <PanelTitle>Finish the mapping first</PanelTitle>
        <p className="mt-1 text-muted">The test needs the item table and the required fields.</p>
        <Button asChild variant="secondary" className="mt-4">
          <Link to={`/templates/${template.id}/map`}>Open the mapping</Link>
        </Button>
      </Panel>
    )
  }

  const problems = result?.runs.flatMap(({ diagnostics }) => diagnostics).filter(({ severity }) => severity !== 'info') ?? []
  const uniqueProblems = problems.filter((problem, index) => problems.findIndex(({ message }) => message === problem.message) === index)

  return (
    <div className="flex flex-col gap-4">
      <Panel data-wiwo-record={`/templates/${version.templateId}`} data-wiwo-version={version.id} data-wiwo="template-test" data-wiwo-busy={running} data-wiwo-ready={result && result.status !== 'unsupported' && version.state !== 'draft' ? 'test-passed' : undefined} aria-labelledby="run-title" className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <PanelTitle id="run-title">Sample quotations</PanelTitle>
            <p className="mt-1 text-muted">
              Version {version.version} is filled with demo quotations of 3, 15, and 30 items, with long descriptions, a free item,
              labor, terms, and demo adjustments wherever adjustment rows or a discount cell are mapped. Your business details are used for the heading.
            </p>
          </div>
          {/* Once there is a result, activating is the main action, so running again steps back. */}
          <Button data-wiwo="test-run" variant={result ? 'secondary' : 'primary'} onClick={() => void run()} disabled={running}>
            {running ? 'Testing…' : result ? 'Test again' : 'Run test'}
          </Button>
        </div>

        {result && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
              <Badge tone={STATUS[result.status].tone}>{STATUS[result.status].label}</Badge>
              <span className="text-muted">Tested {new Date(result.testedAt).toLocaleString('en-PH')}</span>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th scope="col" className="py-2 pr-4 font-normal">
                      Sample
                    </th>
                    <th scope="col" className="py-2 pr-4 font-normal">
                      Result
                    </th>
                    <th scope="col" className="py-2 pr-4 text-right font-normal">
                      Grand total
                    </th>
                    <th scope="col" className="py-2 text-right font-normal">
                      <span className="sr-only">File</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.runs.map((runResult) => {
                    const file = files.find(({ items }) => items === runResult.items)
                    return (
                      <tr key={runResult.items} className="border-t border-rule">
                        <th scope="row" className="tabular py-2.5 pr-4 text-left font-normal">
                          {runResult.items} items
                        </th>
                        <td className="py-2.5 pr-4">{runResult.ok ? 'Generated' : <span className="text-danger">Failed</span>}</td>
                        <td className="tabular py-2.5 pr-4 text-right">
                          {runResult.grandTotalMinor === undefined ? <span className="text-muted">—</span> : formatMoney(runResult.grandTotalMinor, business.currency)}
                        </td>
                        <td className="py-2.5 text-right">
                          {file ? (
                            <Button variant="secondary" onClick={() => downloadXlsx(file.bytes, file.filename)} aria-label={`Download the ${runResult.items}-item sample`}>
                              Download
                            </Button>
                          ) : (
                            <span className="text-xs text-muted">{runResult.ok ? 'Run again to download' : ''}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {uniqueProblems.length > 0 && (
              <div className="mt-4 border-t border-rule pt-4">
                <DiagnosticList diagnostics={uniqueProblems} />
              </div>
            )}
          </>
        )}
      </Panel>

      {result && (
        <Panel data-wiwo="template-activate" data-wiwo-ready={version.state === 'active' ? 'template-active' : undefined} aria-labelledby="activate-title" className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="max-w-xl">
            <PanelTitle id="activate-title">Use this version</PanelTitle>
            <p className="mt-1 text-muted">
              {version.state === 'active'
                ? `Version ${version.version} is active. New quotations use it.`
                : version.state === 'tested'
                  ? `Version ${version.version} passed and is now locked. Make it active when the files look right in Excel.`
                  : 'Fix what failed in the mapping, then test again.'}
            </p>
          </div>
          {version.state === 'tested' && <Button onClick={() => setConfirming(true)}>Make version {version.version} active</Button>}
          <ConfirmDialog open={confirming} onOpenChange={setConfirming} title={`Activate version ${version.version}?`}
            description="Confirm you reviewed the mapping and sample quotations. New quotations will use this version; existing quotations keep theirs."
            confirmLabel="Confirm activation" onConfirm={() => void activate()} />
          {version.state === 'draft' && (
            <Button asChild variant="secondary">
              <Link to={`/templates/${template.id}/map`}>Open the mapping</Link>
            </Button>
          )}
          {version.state === 'active' && <Badge tone="positive">Active</Badge>}
        </Panel>
      )}

      <Panel aria-labelledby="manual-title" className="p-5">
        <PanelTitle id="manual-title">Check the files in Excel</PanelTitle>
        <p className="mt-1 text-muted">A browser cannot show exactly how Excel prints, so open the downloads before relying on this template.</p>
        <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5">
          <li>Open each file in Excel on your computer. It should open without a repair message.</li>
          <li>Check the totals, then change one quantity and watch them update.</li>
          <li>Open print preview. Everything should fit the page, with the table header repeated on later pages.</li>
          <li>Upload one file to OneDrive and open it in Excel Online.</li>
        </ol>
      </Panel>
    </div>
  )
}
