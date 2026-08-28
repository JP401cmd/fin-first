/**
 * Bevinding M14 — één naam per concept, één ingang per functie.
 *
 * De desktop-zijbalk onderhoudt een eigen nav-array (`MODULES` / `OVERIGE_BASE`)
 * náást `lib/nav-config.ts`. Dat is precies de constructie waarin drift ontstaat:
 * de zijbalk noemde `/nieuws` "Nieuws" terwijl de canonieke nav-config én de
 * pagina zelf "Krant" zeggen. Deze suite pint de afspraak dat de zijbalk de
 * nav-config volgt — de assertie leest het verwachte label uit `globalNav`, dus
 * hernoemt iemand de route daar, dan valt de zijbalk mee om (en niet stil uit).
 *
 * Daarnaast: de Account-ingang in de zijbalk-footer. Die is de desktop-
 * tegenhanger van de mobiele nav-pill (`lg:hidden`) en is de voorwaarde
 * waaronder de Account-kaart uit het /mijn-grid mocht verdwijnen.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Sidebar } from './sidebar'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { globalNav } from '@/lib/nav-config'

vi.mock('next/navigation', () => ({
  usePathname: () => '/overzicht',
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
}))

// Zelfde chrome-mocks als sidebar.eenvoudig.test.tsx — deze suite gaat over de
// labels en de footer-links, niet over de randen eromheen.
vi.mock('@/components/app/command-palette-provider', () => ({
  useCommandPalette: () => ({ open: () => {}, close: () => {}, isOpen: false }),
}))
vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => ({ isHousehold: false, loading: false }),
}))
vi.mock('@/components/app/perspective-switcher', () => ({
  PerspectiveSwitcher: () => null,
}))
vi.mock('@/lib/hooks/use-euro-view', () => ({
  useEuroView: () => ({ view: 'nominaal', setView: () => {}, loading: false }),
}))
vi.mock('@/components/app/notifications/notification-provider', () => ({
  useNotifications: () => ({ unreadCount: 0, openModal: () => {} }),
}))
vi.mock('@/components/app/cashflow-status-provider', () => ({
  useCashflowStatusContext: () => ({}),
}))
vi.mock('@/components/sync/global-sync-button', () => ({
  GlobalSyncButton: () => null,
}))
vi.mock('@/components/sync/sync-report-modal', () => ({
  SyncReportModal: () => null,
}))

function renderSidebar() {
  return render(
    <DisplayModeProvider initialMode="full">
      <Sidebar netWorth={1_100_000} actionCount={0} userInitials="JP" userName="JP" />
    </DisplayModeProvider>,
  )
}

describe('Sidebar — naamgeving en ingangen (M14)', () => {
  afterEach(cleanup)

  it('noemt /nieuws zoals de canonieke nav-config dat doet', () => {
    const canoniek = globalNav.find((item) => item.href === '/nieuws')
    expect(canoniek, '/nieuws hoort in globalNav te staan').toBeDefined()

    const { container } = renderSidebar()
    const link = container.querySelector('a[href="/nieuws"]')
    expect(link, 'de zijbalk hoort een /nieuws-ingang te hebben').not.toBeNull()
    expect(link!.textContent).toContain(canoniek!.label)
  })

  it('gebruikt niet langer het afwijkende label "Nieuws"', () => {
    renderSidebar()
    expect(screen.queryByText('Nieuws')).toBeNull()
    expect(screen.getByText('Krant')).toBeTruthy()
  })

  it('houdt een Account-ingang in de footer (desktop-tegenhanger van de nav-pill)', () => {
    const { container } = renderSidebar()
    expect(container.querySelector('a[href="/mijn/account"]')).not.toBeNull()
  })
})
