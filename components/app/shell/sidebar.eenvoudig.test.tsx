/**
 * NAV-2 + NAV-5 — de sidebar in Eenvoudig-weergave.
 *
 *  - NAV-5: geen netto-vermogen-badge naast "Het Overzicht" (wél in Volledig).
 *  - NAV-2: alleen de sub-items van de ACTIEVE hoofdpagina staan uitgeklapt;
 *    de andere module blijft één regel. Dat gold structureel al (`isActive &&
 *    isEnabled` gate op de SubTagStrip) — deze test legt het vast zodat het
 *    niet stilzwijgend terugkan.
 *
 * Bron: docs/eenvoudige-weergave-audit.md §6 (fase 4).
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Sidebar } from './sidebar'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'

vi.mock('next/navigation', () => ({
  usePathname: () => '/overzicht',
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
}))

// De chrome-randen van de sidebar hangen aan eigen providers (command-palette,
// meldingen, perspectief, euro-weergave, cashflow-status). Deze test gaat over
// de MODULE-sectie; die randen mocken we weg i.p.v. vijf providers op te tuigen.
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

function renderSidebar(mode: DisplayMode) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <Sidebar netWorth={1_100_000} actionCount={0} userInitials="JP" userName="JP" />
    </DisplayModeProvider>,
  )
}

describe('Sidebar — Eenvoudige weergave (NAV-2 / NAV-5)', () => {
  afterEach(cleanup)

  it("toont in 'full' het netto vermogen naast Het Overzicht", () => {
    renderSidebar('full')
    // formatNetWorthShort → korte notatie; we matchen op het euroteken + cijfer
    // i.p.v. de exacte string (nbsp-valkuil, zie ui-ux quality-checklist).
    expect(screen.getByText(/€.*1[.,]1/)).toBeInTheDocument()
  })

  it("toont in 'simple' geen bedrag-badge naast Het Overzicht (NAV-5)", () => {
    renderSidebar('simple')
    expect(screen.queryByText(/€.*1[.,]1/)).not.toBeInTheDocument()
  })

  it.each<DisplayMode>(['simple', 'full'])(
    "klapt in '%s' alleen de sub-items van de actieve module uit (NAV-2)",
    (mode) => {
      renderSidebar(mode)
      // Actief = Het Overzicht (pathname /overzicht) → zijn sub-items staan er.
      expect(screen.getByText('Bezittingen')).toBeInTheDocument()
      expect(screen.getByText('Schulden')).toBeInTheDocument()
      // De Toekomst is niet actief → géén sub-items, alleen de module-regel.
      expect(screen.queryByText('Tijdas')).not.toBeInTheDocument()
      expect(screen.queryByText('Doelen')).not.toBeInTheDocument()
    },
  )
})
