import { Panel } from '../../components/ui/Panel'
import type { BusinessFormValues } from '../../domain/business/businessForm'
import { BusinessLogo } from './BusinessLogo'

const lines = (text: string) => text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

type BusinessPreviewProps = {
  values: BusinessFormValues
  logoBlobId?: string
  logoSrc?: string
  hideLogo: boolean
}

/** Shows the details a template can place, as they read now. The template decides the real layout. */
export function BusinessPreview({ values, logoBlobId, logoSrc, hideLogo }: BusinessPreviewProps) {
  const name = values.displayName.trim()
  const contact = [...lines(values.address), ...lines(values.phones), values.email.trim()].filter(Boolean)

  return (
    <Panel aria-labelledby="preview-title" className="p-5">
      <h2 id="preview-title" className="text-sm font-medium">
        On your quotations
      </h2>
      <div className="mt-4 rounded-button border border-line p-4">
        <div className="flex items-start gap-3">
          {!hideLogo && (logoSrc || logoBlobId) && (
            <BusinessLogo business={{ displayName: name, logoBlobId }} src={logoSrc} size="md" />
          )}
          <div className="min-w-0">
            <p className={name ? 'font-semibold break-words' : 'text-muted'}>{name || 'Business name'}</p>
            {values.legalName.trim() && <p className="break-words">{values.legalName.trim()}</p>}
          </div>
        </div>
        {contact.length > 0 && (
          <ul className="mt-3 flex flex-col gap-0.5 text-muted">
            {contact.map((line, index) => (
              <li key={index} className="break-words">
                {line}
              </li>
            ))}
          </ul>
        )}
        {values.taxRegistrationText.trim() && <p className="mt-2 text-muted">{values.taxRegistrationText.trim()}</p>}
      </div>
      <p className="mt-3 text-xs text-muted">Your template decides where each detail goes.</p>
    </Panel>
  )
}
