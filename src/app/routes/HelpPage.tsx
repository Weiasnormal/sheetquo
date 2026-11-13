import { WiwoLibrary } from '../../features/wiwo/WiwoLibrary'
import { PageHeader } from '../../components/layout/PageHeader'
import { Badge } from '../../components/ui/Badge'
import { Panel, PanelTitle } from '../../components/ui/Panel'
import { DemoDownloads } from '../../features/help/DemoDownloads'

const SUPPORT: { feature: string; status: 'Kept' | 'Warned' | 'Blocked'; note: string }[] = [
  { feature: 'Fonts, fills, borders, and number formats', status: 'Kept', note: 'Copied to every new item row' },
  { feature: 'Merged cells', status: 'Kept', note: 'Unless a merge crosses the item rows' },
  { feature: 'Pictures and logos', status: 'Kept', note: 'Footer pictures move with the footer' },
  { feature: 'Simple formulas', status: 'Kept', note: 'Totals expand to cover every item row' },
  { feature: 'Simple dropdowns and conditional formatting', status: 'Kept', note: 'Copied from the item prototype; footer rules move with their cells' },
  { feature: 'Rules using other sheets or complex visual effects', status: 'Warned', note: 'Unsupported rules are left out with a reason' },
  { feature: 'Text boxes and drawn shapes', status: 'Warned', note: 'Removed. Use a picture or cell text' },
  { feature: 'Array and cross-sheet formulas', status: 'Blocked', note: 'Generation stops and names the cell' },
  { feature: 'Macros, passwords, and protected sheets', status: 'Blocked', note: 'Remove these in Excel first' },
]

const STATUS_TONE = { Kept: 'positive', Warned: 'notice', Blocked: 'danger' } as const

export function HelpPage() {
  return (
    <>
      <PageHeader title="Help" description="How to prepare a template and what happens to it." />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <WiwoLibrary />
        <Panel aria-labelledby="prepare-title" className="p-5">
          <PanelTitle id="prepare-title">Prepare a template</PanelTitle>
          <ol className="mt-3 flex list-decimal flex-col gap-2 pl-4">
            <li>Keep one quotation on one worksheet, with old quotations removed.</li>
            <li>Leave one styled row for items. Sheetquo repeats it for every item.</li>
            <li>Put totals and signatures below the item rows.</li>
            <li>Save as .xlsx, with no macros or password.</li>
          </ol>
        </Panel>

        <Panel aria-labelledby="demo-title" className="p-5">
          <PanelTitle id="demo-title">Try a demo quotation</PanelTitle>
          <p className="mt-1 mb-3 text-muted">Download a real, editable .xlsx filled with demo data.</p>
          <DemoDownloads />
        </Panel>
      </div>

      <Panel aria-labelledby="support-title" className="mt-4 p-5">
        <PanelTitle id="support-title">What happens to your template</PanelTitle>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="py-2 pr-4 font-normal">
                  Excel feature
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Result
                </th>
                <th scope="col" className="py-2 font-normal">
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {SUPPORT.map(({ feature, status, note }) => (
                <tr key={feature} className="border-t border-rule">
                  <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                    {feature}
                  </th>
                  <td className="py-2.5 pr-4">
                    <Badge tone={STATUS_TONE[status]}>{status}</Badge>
                  </td>
                  <td className="py-2.5 text-muted">{note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}
