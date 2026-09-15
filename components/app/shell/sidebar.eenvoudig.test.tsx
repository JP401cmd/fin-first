/**
 * NAV-2 + NAV-5 — de sidebar in Eenvoudig-weergave, plus het platte menu.
 *
 *  - NAV-5: geen netto-vermogen-badge naast Home (wél in Volledig).
 *  - NAV-2: alleen de subpagina's van de ACTIEVE hoofdpagina staan uitgeklapt;
 *    de andere hoofdpagina's blijven één regel.
 *  - Plat menu (15 sep 2026): Home, Bezittingen, Schulden, Budget, Belasting en
 *    De toekomst op één niveau — geen kop "Twee modules", geen "Tijdas".
 *  - Uitklappen zonder navigeren: de chevron naast een hoofdpagina klapt die
 *    tak open of dicht zonder de pagina te openen.
 *
 * Bron: docs/eenvoudige-weergave-audit.md §6 (fase 4).
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { Sidebar } from './sidebar'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'

const nav = vi.hoisted(() => ({ pathname: '/overzicht' }))

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
}))

// De chrome-randen van de sidebar hangen aan eigen providers (command-palette,
// meldingen, perspectief, euro-weergave, cashflow-status). Deze test gaat over
// de MENU-sectie; die randen mocken we weg i.p.v. vijf providers op te tuigen.
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

function renderSidebar(mode: DisplayMode, pathname = '/overzicht') {
  nav.pathname = pathname
  return render(
    <DisplayModeProvider initialMode={mode}>
      <Sidebar netWorth={1_100_000} actionCount={0} userInitials="JP" userName="JP" />
    </DisplayModeProvider>,
  )
}

describe('Sidebar — Eenvoudige weergave (NAV-2 / NAV-5)', () => {
  afterEach(cleanup)

  it("toont in 'full' het netto vermogen naast Home", () => {
    renderSidebar('full')
    // formatNetWorthShort → korte notatie; we matchen op het euroteken + cijfer
    // i.p.v. de exacte string (nbsp-valkuil, zie ui-ux quality-checklist).
    expect(screen.getByText(/€.*1[.,]1/)).toBeInTheDocument()
  })

  it("toont in 'simple' geen bedrag-badge naast Home (NAV-5)", () => {
    renderSidebar('simple')
    expect(screen.queryByText(/€.*1[.,]1/)).not.toBeInTheDocument()
  })

  it.each<DisplayMode>(['simple', 'full'])(
    "klapt in '%s' alleen de subpagina's van de actieve hoofdpagina uit (NAV-2)",
    (mode) => {
      renderSidebar(mode, '/overzicht/belasting')
      // Actief = Belasting → zijn subpagina's staan er.
      expect(screen.getByText('Box 1 · Werk + woning')).toBeInTheDocument()
      // Budget en De toekomst zijn niet actief → alleen hun eigen regel.
      expect(screen.queryByText('Transacties')).not.toBeInTheDocument()
      expect(screen.queryByText('Doelen')).not.toBeInTheDocument()
    },
  )
})

describe('Sidebar — plat menu', () => {
  afterEach(cleanup)

  it('toont de hoofdpagina’s op één niveau, in vaste volgorde', () => {
    const { container } = renderSidebar('full')
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    const volgorde = [
      '/overzicht',
      '/overzicht/bezittingen',
      '/overzicht/schulden',
      '/overzicht/budget',
      '/overzicht/belasting',
      '/toekomst',
    ].map((href) => hrefs.indexOf(href))
    expect(volgorde.every((i) => i >= 0)).toBe(true)
    expect([...volgorde].sort((a, b) => a - b)).toEqual(volgorde)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('De toekomst')).toBeInTheDocument()
  })

  it('heeft geen groepskop "Twee modules" en geen dubbele Tijdas-ingang meer', () => {
    renderSidebar('full', '/toekomst')
    expect(screen.queryByText('Twee modules')).not.toBeInTheDocument()
    expect(screen.queryByText('Tijdas')).not.toBeInTheDocument()
    // De toekomst is actief → zijn subpagina's staan eronder.
    expect(screen.getByText('Doelen')).toBeInTheDocument()
  })

  it('markeert Home niet als actief op een hefboompagina', () => {
    const { container } = renderSidebar('full', '/overzicht/bezittingen')
    expect(container.querySelector('a[href="/overzicht"]')).not.toHaveAttribute('aria-current')
    expect(container.querySelector('a[href="/overzicht/bezittingen"]')).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})

describe('Sidebar — uitklappen zonder de pagina te openen', () => {
  afterEach(cleanup)

  it('klapt een niet-actieve tak open met de chevron — een knop, geen link', () => {
    renderSidebar('full', '/overzicht')
    expect(screen.queryByText('Transacties')).not.toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: /Toon de onderdelen van Budget/i })
    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)

    expect(screen.getByText('Transacties')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Verberg de onderdelen van Budget/i }),
    ).toHaveAttribute('aria-expanded', 'true')
  })

  it('klapt de actieve tak dicht — de chevron werkt beide kanten op', () => {
    renderSidebar('full', '/toekomst')
    expect(screen.getByText('Doelen')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Verberg de onderdelen van De toekomst/i }))
    expect(screen.queryByText('Doelen')).not.toBeInTheDocument()
  })

  it('geeft Home geen chevron — daar hangt niets onder', () => {
    renderSidebar('full')
    expect(screen.queryByRole('button', { name: /onderdelen van Home/i })).not.toBeInTheDocument()
  })
})
