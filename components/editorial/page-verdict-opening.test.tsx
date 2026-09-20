// components/editorial/page-verdict-opening.test.tsx
//
// De aanhef die het oordeel uitspreekt. Drie dingen zijn hier de moeite van het
// vastpinnen waard, omdat ze alle drie stil kunnen breken:
//
//  1. De paginanaam is CSS-verborgen op mobiel, niet weggelaten. Zou iemand daar
//     een JS-breakpoint-branch van maken, dan levert server- en client-render
//     verschillende HTML op — wat de shell expliciet verbiedt.
//  2. Het oordeel draagt de STOPLICHT-kleur, nooit het module-accent. Status is
//     semantiek en volgt de instelbare accentkeuze niet (kleurconventie).
//  3. Zonder oordeel is de titel de kale paginanaam, zichtbaar op BEIDE
//     breakpoints — anders is de titel op mobiel leeg.

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageVerdictOpening } from './page-verdict-opening'

describe('PageVerdictOpening', () => {
  it('toont naam én oordeel, met de naam alleen op desktop', () => {
    render(<PageVerdictOpening pageName="Transacties" verdict="Krap deze maand" tone="warn" />)

    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('Transacties')
    expect(heading).toHaveTextContent('Krap deze maand')

    // De naam zit in een span die op mobiel `display:none` is. Bewust een
    // class-assertie: dit IS het contract — een JS-branch zou hier slagen en in
    // productie een hydratie-mismatch geven.
    const naam = heading.querySelector('span.hidden.lg\\:inline')
    expect(naam).not.toBeNull()
    expect(naam).toHaveTextContent('Transacties')
  })

  it('kleurt het oordeel met de stoplichtkleur, niet met het module-accent', () => {
    const { container } = render(
      <PageVerdictOpening pageName="Transacties" verdict="Tekort deze maand" tone="bad" />,
    )
    const oordeel = screen.getByText('Tekort deze maand')
    expect(oordeel.className).toContain('text-red-700')
    // Geen module-accent in de kop: dat zou de status laten meebewegen met de
    // accentkleur die de gebruiker zelf kiest.
    expect(container.innerHTML).not.toContain('--module-active')
  })

  it.each([
    ['good', 'text-emerald-700'],
    ['warn', 'text-amber-700'],
    ['bad', 'text-red-700'],
  ] as const)('stand %s krijgt %s', (tone, klasse) => {
    render(<PageVerdictOpening pageName="Transacties" verdict="Oordeel" tone={tone} />)
    expect(screen.getByText('Oordeel').className).toContain(klasse)
  })

  it('zonder oordeel is de titel de kale paginanaam, ook op mobiel', () => {
    render(<PageVerdictOpening pageName="Transacties" verdict={null} />)

    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading).toHaveTextContent('Transacties')
    // Geen desktop-only-wrapper: anders zou de titel op mobiel leeg zijn.
    expect(heading.querySelector('span.hidden.lg\\:inline')).toBeNull()
  })

  it('draagt nooit een h1 — die is van de shell (ADR 0110)', () => {
    render(<PageVerdictOpening pageName="Transacties" verdict="Krap deze maand" tone="warn" />)
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('de scheider tussen naam en oordeel wordt niet voorgelezen', () => {
    const { container } = render(
      <PageVerdictOpening pageName="Transacties" verdict="Krap deze maand" tone="warn" />,
    )
    const scheider = container.querySelector('span[aria-hidden="true"]')
    expect(scheider).not.toBeNull()
    expect(scheider).toHaveTextContent('|')
  })
})
