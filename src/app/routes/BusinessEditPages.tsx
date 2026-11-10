import { SearchX } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { BusinessEditor } from '../../features/businesses/BusinessEditor'
import { useWorkspace } from '../useWorkspace'

// Loaded on demand: the editor brings form validation and dialogs the rest of the app does not need.

export function NewBusinessPage() {
  return (
    <>
      <PageHeader title="Add business" description="These details fill the business fields on your quotations." />
      <BusinessEditor />
    </>
  )
}

export function EditBusinessPage() {
  const { id } = useParams()
  const { status, businesses } = useWorkspace()
  const business = businesses.find((candidate) => candidate.id === id)

  if (status === 'loading') return <PageHeader title="Business" />

  if (!business) {
    return (
      <>
        <PageHeader title="Business not found" />
        <EmptyState
          icon={SearchX}
          title="This business is not in this browser"
          action={
            <Button asChild variant="secondary">
              <Link to="/businesses">Back to businesses</Link>
            </Button>
          }
        >
          Businesses stay on the device and browser where they were added.
        </EmptyState>
      </>
    )
  }

  return (
    <>
      <PageHeader title={business.displayName} description="Changes apply to quotations you make from now on." />
      <BusinessEditor key={business.id} business={business} />
    </>
  )
}
