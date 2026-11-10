import { Check, ChevronRight, ChevronsUpDown, Store } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useWorkspace } from '../../app/useWorkspace'
import { selectBusiness } from '../../infrastructure/storage/businessRepository'
import { BusinessLogo } from './BusinessLogo'

const ROW = 'flex min-h-11 w-full items-center gap-2.5 rounded-button border border-line bg-surface px-3 text-left'

export function BusinessSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { status, business, activeBusinesses } = useWorkspace()

  if (status === 'loading') return <div aria-hidden="true" className={ROW} />

  if (!business) {
    return (
      <Link to="/businesses" onClick={onNavigate} className={`${ROW} transition-colors duration-150 hover:border-control`}>
        <Store className="size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">No business yet</span>
        <ChevronRight className="size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden="true" />
      </Link>
    )
  }

  async function choose(id: string) {
    if (id === business?.id) return
    const result = await selectBusiness(id)
    if (!result.ok) toast.error(result.error.message)
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        data-wiwo="business-switcher"
        aria-label={`Business: ${business.displayName}. Switch business`}
        className={`${ROW} transition-colors duration-150 hover:border-control data-[state=open]:border-control`}
      >
        <BusinessLogo business={business} />
        <span className="min-w-0 flex-1 truncate font-medium">{business.displayName}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden="true" />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="menu-content z-50 w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-button border border-line bg-surface p-1 shadow-lg"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-xs text-muted">Businesses</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={business.id} onValueChange={(id) => void choose(id)}>
            {activeBusinesses.map((option) => (
              <DropdownMenu.RadioItem
                key={option.id}
                value={option.id}
                className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-chip px-2 outline-none data-highlighted:bg-rule"
              >
                <BusinessLogo business={option} />
                <span className="min-w-0 flex-1 truncate">{option.displayName}</span>
                <DropdownMenu.ItemIndicator>
                  <Check className="size-4" strokeWidth={2} aria-hidden="true" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <DropdownMenu.Item asChild className="flex min-h-10 cursor-pointer items-center rounded-chip px-2 outline-none data-highlighted:bg-rule">
            <Link to="/businesses" onClick={onNavigate}>
              Manage businesses
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
