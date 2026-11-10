import { NavLink } from 'react-router'
import { BusinessSwitcher } from '../../features/businesses/BusinessSwitcher'
import { cn } from '../ui/cn'
import { Logo } from './Logo'
import { UTILITY_NAV, WORK_NAV } from './navigation'
import type { NavItem } from './navigation'

function NavRow({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const { to, label, icon: Icon, end } = item
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'flex min-h-11 items-center gap-2.5 rounded-button px-3 transition-colors duration-150 lg:min-h-9',
            isActive ? 'bg-lime-tint font-semibold text-ink' : 'text-muted hover:bg-rule hover:text-ink',
          )
        }
      >
        <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {label}
      </NavLink>
    </li>
  )
}

export function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-1 pt-1">
        <Logo onNavigate={onNavigate} />
      </div>

      <BusinessSwitcher onNavigate={onNavigate} />

      <nav data-wiwo="navigation" aria-label="Main" className="flex flex-1 flex-col justify-between gap-6">
        <ul className="flex flex-col gap-0.5">
          {WORK_NAV.map((item) => (
            <NavRow key={item.to} item={item} onNavigate={onNavigate} />
          ))}
        </ul>
        <ul className="flex flex-col gap-0.5">
          {UTILITY_NAV.map((item) => (
            <NavRow key={item.to} item={item} onNavigate={onNavigate} />
          ))}
        </ul>
      </nav>
    </div>
  )
}
