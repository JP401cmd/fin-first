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
