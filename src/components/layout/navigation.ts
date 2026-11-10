import { Building2, FileSpreadsheet, FilePlus2, LayoutDashboard, LifeBuoy, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export const WORK_NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/quotation/new', label: 'New quotation', icon: FilePlus2 },
  { to: '/quotations', label: 'Quotation history', icon: FileSpreadsheet },
  { to: '/templates', label: 'Templates', icon: FileSpreadsheet },
  { to: '/businesses', label: 'Businesses', icon: Building2 },
]

export const UTILITY_NAV: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/help', label: 'Help', icon: LifeBuoy },
]
