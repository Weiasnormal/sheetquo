import { WiwoProvider } from '../../features/wiwo/WiwoProvider'
import { Outlet, type RouteObject } from 'react-router'
import { AppLayout } from '../../components/layout/AppLayout'
import { WorkspaceProvider } from '../WorkspaceProvider'
import { BusinessesPage } from './BusinessesPage'
import { DashboardPage } from './DashboardPage'
import { NotFoundPage, RouteErrorPage } from './ErrorPages'
import { TemplatesPage } from './TemplatePages'

export const routes: RouteObject[] = [
  {
    element: (
      <WorkspaceProvider>
        <WiwoProvider><Outlet /></WiwoProvider>
      </WorkspaceProvider>
    ),
    errorElement: <WiwoProvider><RouteErrorPage /></WiwoProvider>,
    children: [
      { path: '/', lazy: async () => ({ Component: (await import('./FrontPage')).FrontPage }) },
      { element: <AppLayout />, children: [
        { path: '/dashboard', element: <DashboardPage /> },
        { path: '/quotation/new', lazy: async () => ({ Component: (await import('./QuotationPages')).NewQuotationPage }) },
        { path: '/quotations', lazy: async () => ({ Component: (await import('./QuotationHistoryPage')).QuotationHistoryPage }) },
        { path: '/quotation/:id', lazy: async () => ({ Component: (await import('./QuotationPages')).QuotationPage }) },
        { path: '/templates', element: <TemplatesPage /> },
        { path: '/templates/import', lazy: async () => ({ Component: (await import('./TemplateDetailPages')).TemplateImportPage }) },
        { path: '/templates/:id/map', lazy: async () => ({ Component: (await import('./TemplateDetailPages')).TemplateMapPage }) },
        { path: '/templates/:id/replace', lazy: async () => ({ Component: (await import('./TemplateDetailPages')).TemplateReplacePage }) },
        { path: '/templates/:id/test', lazy: async () => ({ Component: (await import('./TemplateDetailPages')).TemplateTestPage }) },
        { path: '/businesses', element: <BusinessesPage /> },
        {
          path: '/businesses/new',
          lazy: async () => ({ Component: (await import('./BusinessEditPages')).NewBusinessPage }),
        },
        {
          path: '/businesses/:id',
          lazy: async () => ({ Component: (await import('./BusinessEditPages')).EditBusinessPage }),
        },
        { path: '/settings', lazy: async () => ({ Component: (await import('./SettingsPage')).SettingsPage }) },
        { path: '/help', lazy: async () => ({ Component: (await import('./HelpPage')).HelpPage }) },
        { path: '*', element: <NotFoundPage /> },
      ] },
    ],
  },
]
