import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AnkerDrieslag } from './anker-drieslag'
import type { HeroAnkerView } from '@/lib/horizon/hero-fire-age'
import { ankerVrijZin } from '@/lib/horizon/anker-copy'

/**
 * ADR 0129 D7/B9 — de drieslag onder een vast anker. De gerenderde tekst wordt
 * gepind tegen de canonieke kopij (`ankerVrijZin`) voor dezelfde invoer, per
 * anker × gedekt/tekort — niet "er staat een getal".
 */

function anker(over: Partial<HeroAnkerView>): HeroAnkerView {
  return {
    soort: 'leeftijd',
    stopAge: 58.5,
    solvedFireAge: 55.2,
    reachesAge: 90,
    reach: { kind: 'gedekt', endAge: 90 },
    gedekt: true,
    ...over,
  }
}

describe('AnkerDrieslag — age-anker', () => {
  it('gedekt: VRIJ MOGELIJK VANAF 55 · JOUW STOPMOMENT 58,5, met de bijlage-zin; geen Reikt-tot-tegel', () => {
    const a = anker({})
    render(<AnkerDrieslag anker={a} currentAge={45} planEndAge={90} />)
    expect(screen.getByTestId('anker-tegel-vrij')).toHaveTextContent('Vrij mogelijk vanaf')
    expect(screen.getByTestId('anker-tegel-vrij')).toHaveTextContent('55')
    expect(screen.getByTestId('anker-tegel-vrij')).toHaveTextContent('als je de app had laten rekenen')
    expect(screen.getByTestId('anker-tegel-stop')).toHaveTextContent('58,5')
    expect(screen.getByTestId('anker-tegel-stop')).toHaveTextContent('jouw instelling')
    // Eigenaarsbesluit 26 sep: "Reikt tot" staat in KPI 1, niet nog eens in de drieslag.
    expect(screen.queryByTestId('anker-tegel-reikt')).toBeNull()
    expect(screen.getByTestId('anker-vrij-zin')).toHaveTextContent(
      ankerVrijZin({ solvedFireAge: 55.2, currentAge: 45, stop: { kind: 'age', stopAge: 58.5 }, gedekt: true }),
    )
    expect(screen.getByTestId('anker-vrij-zin')).toHaveTextContent(
      'Vrij was al mogelijk vanaf je 55e; de jaren die je langer werkt komen bovenop je plan.',
    )
  })

  it('tekort: geen Reikt-tot-tegel (KPI 1 draagt hem); geen "je kunt stoppen"', () => {
    const a = anker({ reach: { kind: 'reikt-tot', age: 83.4, endAge: 90 }, reachesAge: 83.4, gedekt: false, solvedFireAge: null })
    const { container } = render(<AnkerDrieslag anker={a} currentAge={45} planEndAge={90} />)
    expect(screen.queryByTestId('anker-tegel-reikt')).toBeNull()
    expect(container.textContent).not.toContain('Reikt tot')
    expect(screen.getByTestId('anker-tegel-vrij')).toHaveTextContent('—')
    expect(screen.getByTestId('anker-vrij-zin')).toHaveTextContent(
      'De app vindt binnen dit plan nog geen leeftijd waarop je vermogen het zelf draagt.',
    )
    expect(container.textContent).not.toMatch(/je kunt (nu )?(al )?stoppen/i)
    expect(container.textContent).not.toMatch(/oneindig|voorgoed/i)
  })
})

describe('AnkerDrieslag — rekenstand van de tweede run (lab-haalbaarheid Task 0)', () => {
  it('pending + nog geen leeftijd: "…" met "wordt berekend", niet de onbereikbaar-kopij', () => {
    const a = anker({ solvedFireAge: null })
    const { container } = render(<AnkerDrieslag anker={a} currentAge={45} planEndAge={90} solvedPending />)
    expect(screen.getByTestId('anker-tegel-vrij')).toHaveTextContent('…')
    expect(screen.getByTestId('anker-tegel-vrij')).toHaveTextContent('wordt berekend')
    expect(screen.getByTestId('anker-tegel-vrij')).not.toHaveTextContent('—')
    expect(container.textContent).not.toContain('nog geen leeftijd gevonden binnen dit plan')
    // De bijlage-zin zou anders "De app vindt binnen dit plan nog geen leeftijd…" zeggen.
    expect(screen.queryByTestId('anker-vrij-zin')).toBeNull()
  })

  it('niet pending + geen leeftijd: de bestaande kopij "nog geen leeftijd gevonden binnen dit plan"', () => {
    const a = anker({ solvedFireAge: null })
    render(<AnkerDrieslag anker={a} currentAge={45} planEndAge={90} />)
    expect(screen.getByTestId('anker-tegel-vrij')).toHaveTextContent('—')
    expect(screen.getByTestId('anker-tegel-vrij')).toHaveTextContent('nog geen leeftijd gevonden binnen dit plan')
    expect(screen.getByTestId('anker-vrij-zin')).toBeInTheDocument()
  })

  it('pending maar de leeftijd is er al: het getal wint', () => {
    render(<AnkerDrieslag anker={anker({})} currentAge={45} planEndAge={90} solvedPending />)
    expect(screen.getByTestId('anker-tegel-vrij')).toHaveTextContent('55')
    expect(screen.getByTestId('anker-tegel-vrij')).not.toHaveTextContent('wordt berekend')
  })
})

describe('AnkerDrieslag — aow-anker', () => {
  it('caption van het stopmoment is "je AOW-leeftijd"; gemigreerde pensioen-rij krijgt "tot 100" bij de tweede run', () => {
    const a = anker({ soort: 'aow', stopAge: 67.25, reach: { kind: 'gedekt', endAge: 100 }, reachesAge: 100 })
    render(<AnkerDrieslag anker={a} currentAge={45} solvedFireEndAge={100} planEndAge={90} />)
    expect(screen.getByTestId('anker-tegel-stop')).toHaveTextContent('67,3')
    expect(screen.getByTestId('anker-tegel-stop')).toHaveTextContent('je AOW-leeftijd')
    expect(screen.getByTestId('anker-tegel-vrij')).toHaveTextContent('tot 100')
  })
})

describe('AnkerDrieslag — nu-anker', () => {
  it('tegel 2 en de reikt-tegel vallen weg; tegel 1 in de verleden tijd als vrij al vóór de huidige leeftijd lag', () => {
    const a = anker({ soort: 'nu', stopAge: 47, solvedFireAge: 42.6, reach: { kind: 'reikt-tot', age: 78, endAge: 90 }, reachesAge: 78, gedekt: false })
    render(<AnkerDrieslag anker={a} currentAge={47} planEndAge={90} />)
    expect(screen.queryByTestId('anker-tegel-stop')).toBeNull()
    expect(screen.getByTestId('anker-tegel-vrij')).toHaveTextContent('Vrij was mogelijk vanaf')
    expect(screen.getByTestId('anker-tegel-vrij')).toHaveTextContent('43')
    expect(screen.getByTestId('anker-vrij-zin')).toHaveTextContent('Vrij was mogelijk vanaf je 43e.')
    expect(screen.queryByTestId('anker-tegel-reikt')).toBeNull()
  })
})
