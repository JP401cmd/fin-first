import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisplayModeProvider } from '@/lib/hooks/use-display-mode'
import { SwapInSimple } from './swap-in-simple'

/**
 * S14 — `SwapInSimple` is het derde lid van de weergavemodus-familie naast
 * `HideInSimple` (hard weg) en `DepthSection` (ingeklapt-maar-bereikbaar).
 * Deze suite pint de drie eigenschappen waar de call-sites op rekenen:
 * de juiste tak per modus, een fragment zonder wrapper-node, en de bewuste
 * 'simple'-fallback buiten een provider (ADR 0026).
 */
describe('SwapInSimple', () => {
  it('rendert de simple-tak in Eenvoudig', () => {
    render(
      <DisplayModeProvider initialMode="simple">
        <SwapInSimple simple={<span>eenvoudig</span>}>
          <span>volledig</span>
        </SwapInSimple>
      </DisplayModeProvider>,
    )
    expect(screen.getByText('eenvoudig')).toBeTruthy()
    expect(screen.queryByText('volledig')).toBeNull()
  })

  it('rendert de children in Volledig', () => {
    render(
      <DisplayModeProvider initialMode="full">
        <SwapInSimple simple={<span>eenvoudig</span>}>
          <span>volledig</span>
        </SwapInSimple>
      </DisplayModeProvider>,
    )
    expect(screen.getByText('volledig')).toBeTruthy()
    expect(screen.queryByText('eenvoudig')).toBeNull()
  })

  it('voegt geen wrapper-node toe (fragment — zero layout-impact)', () => {
    const { container } = render(
      <DisplayModeProvider initialMode="full">
        <div data-testid="grid">
          <SwapInSimple simple={<span>eenvoudig</span>}>
            <span>volledig</span>
          </SwapInSimple>
        </div>
      </DisplayModeProvider>,
    )
    const grid = container.querySelector('[data-testid="grid"]')!
    expect(grid.children).toHaveLength(1)
    expect(grid.children[0].tagName).toBe('SPAN')
  })

  it('valt buiten een provider terug op Eenvoudig (ADR 0026)', () => {
    // Bewust vastgelegd: een test die de provider vergeet, test ongemerkt de
    // andere tak. Deze assertie maakt dat expliciet in plaats van verrassend.
    render(
      <SwapInSimple simple={<span>eenvoudig</span>}>
        <span>volledig</span>
      </SwapInSimple>,
    )
    expect(screen.getByText('eenvoudig')).toBeTruthy()
  })
})
