/**
 * Tests voor de weergavemodus-bewuste `GlossaryTerm` (bevinding S17).
 *
 * De norm: in **Eenvoudig** vervangt het inline-veilige `simpleLabel` uit
 * lib/glossary-data.ts het zichtbare jargon, en verhuist de vakterm naar de kop
 * van de popover. In **Volledig** verandert er niets — dat is een hard
 * acceptatiecriterium van het weergavemodus-faseplan ("Volledig blijft exact
 * zoals het was"), en het wordt hier byte-voor-byte vastgelegd.
 *
 * Dekt:
 *  1. Eenvoudig toont `simpleLabel`, Volledig het oorspronkelijke woord.
 *  2. De vakterm blijft in beide modi in de popover-kop staan.
 *  3. Entries ZONDER `simpleLabel` (wettelijke termen) renderen in beide modi
 *     identiek — de uitleg doet daar het werk.
 *  4. De hoofdletter van het oorspronkelijke woord wordt overgenomen.
 *  5. Een ReactNode-kind (eigen opmaak) wordt nooit weggegooid.
 *  6. Onbekende term / eigen `explanation` blijven werken.
 */
import { describe, it, expect } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import { GLOSSARY_ENTRIES } from '@/lib/glossary-data'
import { GlossaryTerm } from './glossary-term'

function renderTerm(mode: DisplayMode, node: ReactNode) {
  return render(<DisplayModeProvider initialMode={mode}>{node}</DisplayModeProvider>)
}

/** De zichtbare tekst van de trigger — niet die van de (altijd gemounte) popover. */
function triggerText(container: HTMLElement): string {
  return container.querySelector('button')?.textContent ?? ''
}

describe('GlossaryTerm — Eenvoudig vervangt het jargon', () => {
  it('toont simpleLabel in Eenvoudig en het vakwoord in Volledig', () => {
    const simple = renderTerm('simple', <GlossaryTerm term="swr">SWR</GlossaryTerm>)
    expect(triggerText(simple.container)).toBe('opnamepercentage')

    const full = renderTerm('full', <GlossaryTerm term="swr">SWR</GlossaryTerm>)
    expect(triggerText(full.container)).toBe('SWR')
  })

  it('houdt de vakterm in beide modi in de popover-kop', () => {
    for (const mode of ['simple', 'full'] as const) {
      const { container, unmount } = renderTerm(
        mode,
        <GlossaryTerm term="swr">SWR</GlossaryTerm>,
      )
      const popover = container.querySelector('#glossary-swr')
      expect(popover?.textContent, mode).toContain('SWR')
      expect(popover?.textContent, mode).toContain('Safe Withdrawal Rate')
      unmount()
    }
  })

  it('vertaalt FIRE naar "volledige vrijheid" in Eenvoudig', () => {
    const { container } = renderTerm('simple', <GlossaryTerm term="fire">FIRE</GlossaryTerm>)
    expect(triggerText(container)).toBe('volledige vrijheid')
  })

  it('neemt de hoofdletter van een gewoon woord over, maar niet van een afkorting', () => {
    const klein = renderTerm('simple', <GlossaryTerm term="fire">fire</GlossaryTerm>)
    expect(triggerText(klein.container)).toBe('volledige vrijheid')

    // "Opnamerate" is een gewoon woord met een kop-hoofdletter → overnemen.
    const groot = renderTerm('simple', <GlossaryTerm term="swr">Opnamerate</GlossaryTerm>)
    expect(triggerText(groot.container)).toBe('Opnamepercentage')

    // "SWR"/"FIRE" staan in kapitalen omdát het afkortingen zijn, niet vanwege
    // hun plek in de zin — dan zou "Klassiek Opnamepercentage" ontstaan.
    const acroniem = renderTerm('simple', <GlossaryTerm term="swr">SWR</GlossaryTerm>)
    expect(triggerText(acroniem.container)).toBe('opnamepercentage')
  })
})

describe('GlossaryTerm — wat NIET verandert', () => {
  it('laat een wettelijke term (geen simpleLabel) in beide modi staan', () => {
    // Kaartregel: "wettelijke termen mógen — mét ene-zin-uitleg ter plekke."
    expect(GLOSSARY_ENTRIES.box_3?.simpleLabel).toBeUndefined()

    const simple = renderTerm('simple', <GlossaryTerm term="box_3">Box 3</GlossaryTerm>)
    const full = renderTerm('full', <GlossaryTerm term="box_3">Box 3</GlossaryTerm>)
    expect(triggerText(simple.container)).toBe('Box 3')
    expect(triggerText(full.container)).toBe('Box 3')
  })

  it('rendert Volledig byte-identiek aan een render zonder simpleLabel-tak', () => {
    // Regressiebescherming op "Volledig blijft exact zoals het was".
    const met = renderTerm('full', <GlossaryTerm term="schuldgraad">schuldgraad</GlossaryTerm>)
    const zonder = renderTerm('full', <GlossaryTerm term="tegenbewijs">tegenbewijs</GlossaryTerm>)
    const normaliseer = (html: string) =>
      html.replace(/schuldgraad|tegenbewijs|Schuldgraad|Tegenbewijs/g, 'X')
    // Structuur (klassen, aria, popover-opbouw) is identiek; alleen de teksten
    // verschillen — die zijn hierboven genormaliseerd.
    const stripTekst = (html: string) => normaliseer(html).replace(/>[^<]*</g, '><')
    expect(stripTekst(met.container.innerHTML)).toBe(stripTekst(zonder.container.innerHTML))
  })

  it('laat een ReactNode-kind met eigen opmaak ongemoeid', () => {
    // <em>marktcheck</em> is al de begrijpelijke variant én draagt opmaak.
    const { container } = renderTerm(
      'simple',
      <GlossaryTerm term="Monte_Carlo">
        <em>marktcheck</em>
      </GlossaryTerm>,
    )
    expect(container.querySelector('button em')?.textContent).toBe('marktcheck')
  })

  it('valt bij een onbekende term terug op platte tekst zonder tooltip', () => {
    const { container } = renderTerm('simple', <GlossaryTerm term="bestaat_niet">xyz</GlossaryTerm>)
    expect(container.querySelector('button')).toBeNull()
    expect(container.textContent).toBe('xyz')
  })

  it('respecteert een expliciete explanation-override', () => {
    renderTerm(
      'simple',
      <GlossaryTerm term="eigen_term" explanation="Eigen uitleg hier">
        eigen term
      </GlossaryTerm>,
    )
    expect(screen.getByText('Eigen uitleg hier')).toBeTruthy()
  })
})
