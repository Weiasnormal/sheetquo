import { CircleAlert, MapPinOff } from 'lucide-react'
import { Link } from 'react-router'
import { PageHeader } from '../../components/layout/PageHeader'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <EmptyState
        icon={MapPinOff}
        title="This page does not exist"
        action={
          <Button asChild variant="secondary">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        }
      >
        Check the address, or go back to your dashboard.
      </EmptyState>
    </>
  )
}

export function RouteErrorPage() {
  return (
    <div className="mx-auto max-w-xl p-6">
      <PageHeader title="Something went wrong" />
      <EmptyState
        icon={CircleAlert}
        title="This screen could not load"
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload
          </Button>
        }
      >
        Your saved data was not changed.
      </EmptyState>
    </div>
  )
}
