import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { NavMenuSheet } from './nav-menu-sheet'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'

// NavMenuSheet leunt op next/navigation (usePathname) en de responsive-shell
// context-hooks (useLeverScores/useActiveAppKeys). Beide context-hooks hebben
// veilige defaults buiten een provider, dus we hoeven alleen next/navigation te
// mocken. Geen echte router nodig.
vi.mock('next/navigation', () => ({
  usePathname: () => '/toekomst',
}))

function renderSheet(mode: DisplayMode) {
  return render(
    <DisplayModeProvider initialMode={mode}>
      <NavMenuSheet open onClose={() => {}} />
    </DisplayModeProvider>,
  )
}

describe('NavMenuSheet — Eenvoudig-weergave verbergt Rekenhulp/Wat-Als', () => {
  afterEach(cleanup)

  it("toont in 'full' wél Rekenhulp en Wat-Als", () => {
    renderSheet('full')
    expect(screen.getByText('Rekenhulp')).toBeInTheDocument()
    expect(screen.getByText('Wat-Als')).toBeInTheDocument()
  })

  it("verbergt in 'simple' Rekenhulp en Wat-Als (overige toekomst-ingangen blijven)", () => {
    renderSheet('simple')
    expect(screen.queryByText('Rekenhulp')).not.toBeInTheDocument()
    expect(screen.queryByText('Wat-Als')).not.toBeInTheDocument()
    // Overige Toekomst-subroutes blijven zichtbaar — alleen de twee aangewezen
    // ingangen worden verborgen.
    expect(screen.getByText('Doelen')).toBeInTheDocument()
    expect(screen.getByText('Gebeurtenissen')).toBeInTheDocument()
  })
})

/**
 * NAV-2 — in Eenvoudig klapt alleen de ACTIEVE hoofdpagina zijn sub-items uit;
 * de andere hoofdpagina's blijven één regel. In Volledig blijft de hele boom in
 * beeld. Actieve route in deze suite: /toekomst.
 */
describe('NavMenuSheet — NAV-2: alleen de actieve tak klapt uit', () => {
  afterEach(cleanup)

  it("toont in 'full' óók de sub-items van niet-actieve hoofdpagina's", () => {
    renderSheet('full')
    expect(screen.getByText('Bezittingen')).toBeInTheDocument()
    expect(screen.getByText('Schulden')).toBeInTheDocument()
  })

  it("verbergt in 'simple' de sub-items van niet-actieve hoofdpagina's", () => {
    renderSheet('simple')
    expect(screen.queryByText('Bezittingen')).not.toBeInTheDocument()
    expect(screen.queryByText('Schulden')).not.toBeInTheDocument()
    // De hoofdpagina zelf blijft één regel — bereikbaar, niet uitgeklapt.
    expect(screen.getByText('Overzicht')).toBeInTheDocument()
    // De actieve tak (/toekomst) houdt zijn sub-items.
    expect(screen.getByText('Doelen')).toBeInTheDocument()
  })
})
