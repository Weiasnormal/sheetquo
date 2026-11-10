import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { cn } from '../../components/ui/cn'
import type { BusinessRecord } from '../../domain/business/businessForm'
import { toDataUrl } from '../../domain/business/logo'
import { getLogo } from '../../infrastructure/storage/businessRepository'

const SIZES = { sm: 'size-6 text-[11px]', md: 'size-10 text-sm' }

/** Two letters, so businesses that share a first letter still look different. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return words.slice(0, 2).map((word) => word.charAt(0)).join('').toUpperCase() || '?'
}

type BusinessLogoProps = {
  business: Pick<BusinessRecord, 'displayName' | 'logoBlobId'>
  size?: keyof typeof SIZES
  /** A logo picked in the form but not saved yet. */
  src?: string
}

/** Decorative: the business name always sits beside it. */
export function BusinessLogo({ business, size = 'sm', src }: BusinessLogoProps) {
  const logoId = src ? undefined : business.logoBlobId
  const stored = useLiveQuery(() => (logoId ? getLogo(logoId).catch(() => undefined) : undefined), [logoId])
  // A live query keeps its last result until the next one lands, so match the id: after a
  // switch, the previous business's logo must never show beside the new name.
  const current = stored?.id === logoId ? stored : undefined
  const storedSrc = useMemo(() => (current ? toDataUrl(current.bytes, current.type) : undefined), [current])
  const image = src ?? storedSrc

  if (image) {
    return (
      <img
        src={image}
        alt=""
        className={cn(SIZES[size], 'flex-none rounded-chip border border-line bg-surface object-contain')}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={cn(SIZES[size], 'flex flex-none items-center justify-center rounded-chip bg-lime-tint font-semibold')}
    >
      {initials(business.displayName)}
    </span>
  )
}
