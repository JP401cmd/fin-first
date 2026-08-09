/**
 * KoppelRekeningBanner — de conditie, niet de opmaak.
 *
 * TXN-1 (faseplan "Eenvoudige weergave"): de banner is een UITNODIGING en hoort
 * dus alleen te verschijnen zolang er nog geen rekening is. De bevestigings-
 * strip "X rekeningen gekoppeld" stond permanent bovenaan /overzicht/cashflow/
 * transacties en meldde iedereen mét rekeningen elke keer opnieuw iets wat ze al
 * wisten. Deze suite pint dat de banner bij ≥ 1 rekening niets meer rendert —
 * in BEIDE weergavemodi, want dit is een conditie-fix en geen diepte-reductie.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KoppelRekeningBanner } from './koppel-rekening-banner'

describe('KoppelRekeningBanner', () => {
  it('nodigt uit zolang er geen enkele rekening is', () => {
    render(<KoppelRekeningBanner accountCount={0} />)
    expect(screen.getByRole('heading', { name: /Koppel je bank in 2 minuten/i })).toBeInTheDocument()
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links).toContain('/core/cash/connect')
    expect(links).toContain('/core/cash/import')
  })

  it('rendert niets zodra er één rekening is', () => {
    const { container } = render(<KoppelRekeningBanner accountCount={1} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('rendert niets bij meerdere rekeningen — geen "X rekeningen gekoppeld"-strip', () => {
    const { container } = render(<KoppelRekeningBanner accountCount={4} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByText(/rekeningen gekoppeld/i)).not.toBeInTheDocument()
  })
})
