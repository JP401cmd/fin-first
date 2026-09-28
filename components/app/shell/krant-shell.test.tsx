/**
 * Krant 2B — de shell van een Krant-account, en het bewijs dat een bestaand
 * account niets merkt.
 *
 *  - KrantRouteGuard: buiten de grens rendert hij niets en vervangt hij de route
 *    door /nieuws (client-navigatie, waarbij de server-layout niet opnieuw rendert);
 *    binnen de grens en voor elk ander account is hij een doorgeefluik.
 *  - Zijbalk en nav-sheet: een Krant-account ziet Krant en Mijn (→ /mijn/account),
 *    geen hefbomen, Toekomst, Tips, Berichten, Rapportages of "Vraag Fin".
 *  - /mijn-tabbalk: alleen de tabs binnen de grens.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { ALL_MODULES, type ModuleId } from '@/lib/module-registry'
import type { FeatureAccessData } from '@/lib/compute-feature-access'
import { FeatureAccessProvider } from '@/components/app/feature-access-provider'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { mijnNav } from '@/lib/navigation'

const nav = vi.hoisted(() => ({ pathname: '/nieuws', replace: vi.fn() }))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: () => {}, replace: nav.replace, back: () => {}, refresh: () => {} }),
}))
vi.mock('@/components/app/command-palette-provider', () => ({
  useCommandPalette: () => ({ open: () => {}, close: () => {}, isOpen: false }),
}))
vi.mock('@/components/command-palette/command-palette-provider', () => ({
  useCommandPalette: () => ({ open: () => {}, close: () => {}, isOpen: false }),
}))
vi.mock('@/components/app/perspective-switcher', () => ({ PerspectiveSwitcher: () => null }))
vi.mock('@/components/app/notifications/notification-provider', () => ({
  useNotifications: () => ({ unreadCount: 0, openModal: () => {} }),
}))
vi.mock('@/components/app/cashflow-status-provider', () => ({ useCashflowStatusContext: () => ({}) }))
vi.mock('@/components/sync/global-sync-button', () => ({ GlobalSyncButton: () => <span>sync-knop</span> }))
vi.mock('@/components/sync/sync-report-modal', () => ({ SyncReportModal: () => null }))

import { KrantRouteGuard } from './krant-route-guard'
import { Sidebar } from './sidebar'
import { NavMenuSheet } from './nav-menu-sheet'
import { ModuleNav } from '@/components/app/module-nav'

const DATA = {
  features: {},
  phase: 'stability',
  level: 1,
  subscriptions: [],
  netWorth: 0,
  monthlyExpenses: 0,
  freedomPct: 0,
} as unknown as FeatureAccessData

const KRANT: ModuleId[] = ['nieuws']

function withModules(modules: ModuleId[], node: ReactNode) {
  return (
    <FeatureAccessProvider data={DATA} activeModules={modules}>
      <DisplayModeProvider initialMode="full">{node}</DisplayModeProvider>
    </FeatureAccessProvider>
  )
}

beforeEach(() => {
  nav.pathname = '/nieuws'
  nav.replace.mockReset()
})
afterEach(cleanup)

describe('KrantRouteGuard', () => {
  it('Krant-account buiten de grens: rendert niets en vervangt de route door /nieuws', () => {
    nav.pathname = '/overzicht'
    render(withModules(KRANT, <KrantRouteGuard isSuperadmin={false}><p>pagina</p></KrantRouteGuard>))
    expect(screen.queryByText('pagina')).not.toBeInTheDocument()
    expect(nav.replace).toHaveBeenCalledWith('/nieuws')
  })

  it.each(['/nieuws', '/mijn/account', '/mijn/notificaties'])(
    'Krant-account binnen de grens (%s): pagina zichtbaar, geen redirect (ook niet op /nieuws)',
    (path) => {
      nav.pathname = path
      render(withModules(KRANT, <KrantRouteGuard isSuperadmin={false}><p>pagina</p></KrantRouteGuard>))
      expect(screen.getByText('pagina')).toBeInTheDocument()
      expect(nav.replace).not.toHaveBeenCalled()
    },
  )

  it('superadmin met Krant-account houdt /beheer', () => {
    nav.pathname = '/beheer/nieuws'
    render(withModules(KRANT, <KrantRouteGuard isSuperadmin><p>beheer</p></KrantRouteGuard>))
    expect(screen.getByText('beheer')).toBeInTheDocument()
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it.each(['/overzicht', '/toekomst', '/mijn', '/beheer'])('Geheel-account op %s: doorgeefluik', (path) => {
    nav.pathname = path
    render(withModules([...ALL_MODULES], <KrantRouteGuard isSuperadmin={false}><p>pagina</p></KrantRouteGuard>))
    expect(screen.getByText('pagina')).toBeInTheDocument()
    expect(nav.replace).not.toHaveBeenCalled()
  })

  it('buiten een FeatureAccessProvider (alle modules): doorgeefluik', () => {
    nav.pathname = '/overzicht'
    render(<KrantRouteGuard isSuperadmin={false}><p>pagina</p></KrantRouteGuard>)
    expect(screen.getByText('pagina')).toBeInTheDocument()
    expect(nav.replace).not.toHaveBeenCalled()
  })
})

function sidebar(modules: ModuleId[]) {
  return render(
    withModules(modules, <Sidebar netWorth={0} actionCount={0} userInitials="JP" userName="Jan" />),
  )
}

describe('Sidebar per product', () => {
  it('Krant-account: alleen Krant + Mijn (naar /mijn/account), geen sync', () => {
    sidebar(KRANT)
    const aside = screen.getByRole('complementary', { name: 'Hoofdnavigatie' })
    const hrefs = within(aside).getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/nieuws')
    expect(hrefs).toContain('/mijn/account')
    for (const weg of ['/overzicht', '/toekomst', '/overzicht/tips', '/berichten', '/rapportages', '/mijn', '/beheer']) {
      expect(hrefs, weg).not.toContain(weg)
    }
    expect(within(aside).queryByText('sync-knop')).not.toBeInTheDocument()
  })

  it('Geheel-account: het volledige menu, Mijn naar /mijn en de sync-knop', () => {
    sidebar([...ALL_MODULES])
    const aside = screen.getByRole('complementary', { name: 'Hoofdnavigatie' })
    const hrefs = within(aside).getAllByRole('link').map((a) => a.getAttribute('href'))
    for (const er of ['/overzicht', '/toekomst', '/overzicht/tips', '/berichten', '/nieuws', '/rapportages', '/mijn']) {
      expect(hrefs, er).toContain(er)
    }
    expect(hrefs).not.toContain('/mijn/account')
    expect(within(aside).getByText('sync-knop')).toBeInTheDocument()
  })
})

describe('NavMenuSheet per product', () => {
  it('Krant-account: Mijn (+ Account, Notificaties) en de Krant — geen Vraag Fin, geen hefbomen', () => {
    render(withModules(KRANT, <NavMenuSheet open onClose={() => {}} />))
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(expect.arrayContaining(['/mijn/account', '/mijn/notificaties', '/nieuws']))
    expect(hrefs.every((h) => h === '/nieuws' || h === '/mijn/account' || h === '/mijn/notificaties')).toBe(true)
    expect(screen.queryByText('Vraag Fin')).not.toBeInTheDocument()
    expect(screen.queryByText('Home')).not.toBeInTheDocument()
    expect(screen.queryByText('De toekomst')).not.toBeInTheDocument()
  })

  it('Geheel-account: Home, De toekomst, Mijn en Vraag Fin zoals voorheen', () => {
    render(withModules([...ALL_MODULES], <NavMenuSheet open onClose={() => {}} />))
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('De toekomst')).toBeInTheDocument()
    expect(screen.getByText('Vraag Fin')).toBeInTheDocument()
    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/mijn')
    expect(hrefs).toContain('/rapportages')
  })
})

describe('/mijn-tabbalk (ModuleNav) per product', () => {
  it('Krant-account op /mijn/account: alleen Account en Notificaties', () => {
    nav.pathname = '/mijn/account'
    render(withModules(KRANT, <ModuleNav config={mijnNav} hideOnBasePath />))
    const labels = screen.getAllByRole('link').map((a) => a.textContent)
    expect(labels).toEqual(['Account', 'Notificaties'])
  })

  it('Geheel-account op /mijn/account: alle tabs', () => {
    nav.pathname = '/mijn/account'
    render(withModules([...ALL_MODULES], <ModuleNav config={mijnNav} hideOnBasePath />))
    expect(screen.getAllByRole('link')).toHaveLength(mijnNav.items.length)
  })
})
