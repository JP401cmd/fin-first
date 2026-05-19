import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AtomicCards } from './atomic-cards'

/**
 * Tests voor AtomicCards — drie categoriseerde mini-cards onder /overzicht
 * hero. Validatie render, lege-staten, href-binding.
 */

describe('AtomicCards — basis-render', () => {
  it('rendert altijd 3 categorieën, ook bij ontbrekende data', () => {
    render(<AtomicCards observation={null} tip={null} upcoming={null} />)
    // Categorieën blijven zichtbaar zodat user leert welke insights komen.
    expect(screen.getByText('Wat valt op')).toBeTruthy()
    expect(screen.getByText('Een tip')).toBeTruthy()
    expect(screen.getByText('Komende maand')).toBeTruthy()
  })

  it('toont placeholder-tekst bij ontbrekende entry', () => {
    render(<AtomicCards observation={null} tip={null} upcoming={null} />)
    // Placeholders zijn italics met dimmed-state; specifieke teksten uit
    // de implementatie controleren dat de fallback effectief is.
    expect(
      screen.getByText(/Nog onvoldoende data/i),
    ).toBeTruthy()
    expect(screen.getByText(/Geen tips deze week/i)).toBeTruthy()
    expect(screen.getByText(/Geen afschrijvingen/i)).toBeTruthy()
  })

  it('rendert alle drie cards met labels', () => {
    render(
      <AtomicCards
        observation={{ text: 'Vermogen +1.2%' }}
        tip={{ text: 'Verschuif €3k' }}
        upcoming={{ text: 'Autoverz. €87' }}
      />,
    )
    expect(screen.getByText('Wat valt op')).toBeTruthy()
    expect(screen.getByText('Een tip')).toBeTruthy()
    expect(screen.getByText('Komende maand')).toBeTruthy()
  })

  it('rendert body-tekst per card', () => {
    render(
      <AtomicCards
        observation={{ text: 'Vermogen +1.2%' }}
        tip={{ text: 'Verschuif €3k' }}
        upcoming={{ text: 'Autoverz. €87' }}
      />,
    )
    expect(screen.getByText('Vermogen +1.2%')).toBeTruthy()
    expect(screen.getByText('Verschuif €3k')).toBeTruthy()
    expect(screen.getByText('Autoverz. €87')).toBeTruthy()
  })

  it('lege card naast gevulde card behoudt categorie', () => {
    render(
      <AtomicCards
        observation={{ text: 'Alleen observatie' }}
        tip={null}
        upcoming={null}
      />,
    )
    expect(screen.getByText('Wat valt op')).toBeTruthy()
    expect(screen.getByText('Alleen observatie')).toBeTruthy()
    // Tip en Upcoming labels nog steeds zichtbaar — placeholder vult.
    expect(screen.getByText('Een tip')).toBeTruthy()
    expect(screen.getByText('Komende maand')).toBeTruthy()
  })
})

describe('AtomicCards — href-binding', () => {
  it('rendert card als Link wanneer href aanwezig', () => {
    const { container } = render(
      <AtomicCards
        observation={{ text: 'Klik mij', href: '/overzicht/bezittingen' }}
        tip={null}
        upcoming={null}
      />,
    )
    const link = container.querySelector('a[href="/overzicht/bezittingen"]')
    expect(link).toBeTruthy()
  })

  it('rendert card als article zonder href (niet klikbaar)', () => {
    const { container } = render(
      <AtomicCards
        observation={{ text: 'Niet klikbaar' }}
        tip={null}
        upcoming={null}
      />,
    )
    // observation = article (geen href), tip + upcoming = articles (placeholder)
    expect(container.querySelectorAll('article').length).toBeGreaterThan(0)
    expect(container.querySelector('a')).toBeNull()
  })

  it('elke card heeft eigen dot-kleur per categorie', () => {
    const { container } = render(
      <AtomicCards
        observation={{ text: 'A' }}
        tip={{ text: 'B' }}
        upcoming={{ text: 'C' }}
      />,
    )
    // Observation = emerald, Tip = violet, Upcoming = sky
    expect(container.querySelector('.bg-emerald-500')).toBeTruthy()
    expect(container.querySelector('.bg-violet-500')).toBeTruthy()
    expect(container.querySelector('.bg-sky-500')).toBeTruthy()
  })
})
