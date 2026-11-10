import { Link } from 'react-router'

export function Logo({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link to="/" onClick={onNavigate} className="inline-flex rounded-chip">
      <img src="/brandassets/sheetquo-logo-primary.webp" alt="Sheetquo" width={138} height={32} className="h-8 w-auto" />
    </Link>
  )
}
