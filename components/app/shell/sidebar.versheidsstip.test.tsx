/**
 * Vangrail op de freshness-dots in de zijbalk-sectie "overige".
 *
 * AANLEIDING: de dot van de Krant-rij was drie weken dood. Op 28 aug (6c49f5cbc)
 * werd het label 'Nieuws' → 'Krant' hernoemd, maar de dot-dispatch matchte nog
 * op de letterlijke tekst 'Nieuws'. `useNewsUnread` bleef gewoon fetchen, het
 * resultaat werd weggegooid en het aria-label bleef leeg. Niets faalde: een
 * if-tak die niet matcht is stil.
 *
 * TWEE ASSERTIES, en de tweede is de eigenlijke vangrail:
 *  1. GEDRAG — staat er ongelezen nieuws, dan is de dot op de /nieuws-rij actief
 *     én draagt hij een niet-lege toegankelijke tekst. Dit is de regressietest
 *     op het defect zelf.
 *  2. BRON — nergens in `sidebar.tsx` hangt gedrag aan een vergelijking op een
 *     zichtbaar label (`entry.label === '…'`). Assertie 1 alleen zou groen
 *     blijven zodra iemand de vergelijking terugzet met de nieuwe copy erin —
 *     tot de vólgende hernoeming, en dan zwijgt hij weer. Assertie 2 verbiedt
 *     de constructie, niet één instantie ervan.
 *     (Precedent voor een bron-grendel: `horizon-client.euro-view.test.ts`.)
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Sidebar } from './sidebar'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'

vi.mock('next/navigation', () => ({
  usePathname: () => '/overzicht',
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
}))

// De bron van de Krant-versheid. Server-side onthouden (`/api/news/read`), dus
// cross-device — hier vervangen door een vaste "er is ongelezen nieuws".
vi.mock('@/lib/hooks/use-news-unread', () => ({
  useNewsUnread: () => true,
}))

// Zelfde chrome-mocks als sidebar.naamgeving.test.tsx — deze suite gaat over de
// dots, niet over de randen eromheen.
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

describe('Sidebar — versheidsstip op de "overige"-rijen', () => {
  afterEach(cleanup)

  it('zet de stip van de Krant-rij aan bij ongelezen nieuws', () => {
    const { container } = renderSidebar()
    const rij = container.querySelector('a[href="/nieuws"]')
    expect(rij, 'de zijbalk hoort een /nieuws-ingang te hebben').not.toBeNull()

    const stip = rij!.querySelector('[aria-label]:not([href])')
    expect(stip, 'de Krant-rij hoort een freshness-stip te hebben').not.toBeNull()

    const tekst = stip!.getAttribute('aria-label') ?? ''
    // Leeg = de dode stip: de dispatch matchte niet en liet alles op de
    // default-waarden staan.
    expect(tekst, 'de stip hoort een toegankelijke tekst te dragen').not.toBe('')
    expect(tekst.toLowerCase()).toContain('ongelezen')
  })

  it('hangt geen gedrag aan een zichtbaar label (dispatch op een sleutel)', () => {
    const bron = readFileSync(join(process.cwd(), 'components/app/shell/sidebar.tsx'), 'utf8')
    const treffers = bron.match(/\.label\s*===/g) ?? []
    expect(
      treffers,
      'Dispatch op `entry.label === "…"` breekt stil bij elke hernoeming van de copy — ' +
        'gebruik de stabiele sleutel op de entry (`entry.signal`) of de href.',
    ).toEqual([])
  })
})
