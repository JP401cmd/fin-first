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
import { PageVerdictOpening, PageVerdictSentence } from './page-verdict-opening'

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

// De kop als ZIN (ADR 0174 D6) — bezittingen, schulden, budget, belasting en
// /toekomst. Andere contracten dan hierboven: één zin op álle breakpoints (geen
// desktop-only-naam, want de naam zit ín de zin), het cursieve deel in de
// stoplichtkleur, en de stromende variant die groeit vanaf het onderwerp.
describe('PageVerdictOpening — de kop als zin', () => {
  const ZIN = { voor: 'Je bezittingen zijn', oordeel: 'goed gespreid' }

  it('rendert één zin met een punt, op alle breakpoints gelijk', () => {
    render(<PageVerdictOpening pageName="Bezittingen" sentence={ZIN} tone="good" />)
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.textContent).toBe('Je bezittingen zijn goed gespreid.')
    // Geen breakpoint-afhankelijke wrapper en geen scheider: de zin is overal
    // dezelfde, en de paginanaam staat er niet los naast.
    expect(heading.querySelector('.hidden')).toBeNull()
    expect(heading.textContent).not.toContain('|')
    expect(heading.textContent).not.toContain('Bezittingen')
  })

  it.each([
    ['good', 'text-emerald-700'],
    ['warn', 'text-amber-700'],
    ['bad', 'text-red-700'],
    ['neutral', 'text-[var(--ink-3)]'],
  ] as const)('het oordeel is een <em>, cursief, in stoplichtkleur (%s → %s)', (tone, klasse) => {
    const { container } = render(
      <PageVerdictOpening pageName="Bezittingen" sentence={ZIN} tone={tone} />,
    )
    const em = screen.getByRole('heading', { level: 2 }).querySelector('em')
    expect(em).not.toBeNull()
    expect(em).toHaveTextContent('goed gespreid')
    expect(em!.className).toContain('italic')
    expect(em!.className).toContain('font-normal')
    expect(em!.className).toContain(klasse)
    // Alleen het oordeel draagt de kleur; nooit het module-accent.
    expect(container.innerHTML).not.toContain('--module-active')
  })

  it('zet de punt buiten de <em> en een staart (`na`) ná het oordeel', () => {
    render(
      <PageVerdictOpening
        pageName="Budget"
        sentence={{ voor: 'Je budget laat', oordeel: 'een tekort', na: 'zien' }}
        tone="bad"
      />,
    )
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.textContent).toBe('Je budget laat een tekort zien.')
    expect(heading.querySelector('em')!.textContent).toBe('een tekort')
  })

  it('wint van verdict — de zin is de kop, niet "Naam | oordeel"', () => {
    render(
      <PageVerdictOpening pageName="Bezittingen" sentence={ZIN} verdict="Goed gespreid" tone="good" />,
    )
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(
      'Je bezittingen zijn goed gespreid.',
    )
  })

  it('zonder zin (null) valt de kop terug op de kale paginanaam, ook op mobiel', () => {
    render(<PageVerdictOpening pageName="Toekomst" sentence={null} />)
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.textContent).toBe('Toekomst')
    expect(heading.querySelector('span.hidden.lg\\:inline')).toBeNull()
  })

  it('draagt nooit een h1 — die is van de shell (ADR 0110)', () => {
    render(<PageVerdictOpening pageName="Bezittingen" sentence={ZIN} tone="good" />)
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })
})

describe('PageVerdictOpening — de stromende zin', () => {
  it('toont vóór de data alleen het onderwerp, zonder punt', () => {
    render(
      <PageVerdictOpening
        pageName="Budget"
        sentenceSlot={{ subject: 'Je budget', rest: null }}
      />,
    )
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Je budget')
  })

  it('groeit na de data tot de volledige zin, met het onderwerp één keer', () => {
    const zin = { voor: 'Je budget is', oordeel: 'op koers met sparen' }
    render(
      <PageVerdictOpening
        pageName="Budget"
        sentenceSlot={{
          subject: 'Je budget',
          rest: <PageVerdictSentence sentence={zin} tone="good" subject="Je budget" />,
        }}
      />,
    )
    const heading = screen.getByRole('heading', { level: 2 })
    expect(heading.textContent).toBe('Je budget is op koers met sparen.')
    expect(heading.querySelector('em')!.className).toContain('text-emerald-700')
  })

  it('knipt ook een onderwerp zonder werkwoord netjes af', () => {
    // "Je schulden" + " vragen aandacht." — `voor` is hier gelijk aan het onderwerp.
    render(
      <PageVerdictOpening
        pageName="Schulden"
        sentenceSlot={{
          subject: 'Je schulden',
          rest: (
            <PageVerdictSentence
              sentence={{ voor: 'Je schulden', oordeel: 'vragen aandacht' }}
              tone="warn"
              subject="Je schulden"
            />
          ),
        }}
      />,
    )
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Je schulden vragen aandacht.')
  })
})
