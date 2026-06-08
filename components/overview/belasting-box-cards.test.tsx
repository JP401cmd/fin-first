import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BelastingBoxCards, type BelastingBoxCard } from './belasting-box-cards'

function makeCards(
  overrides: Partial<Record<'1' | '2' | '3', Partial<BelastingBoxCard>>> = {},
): BelastingBoxCard[] {
  const base: BelastingBoxCard[] = [
    {
      number: '1',
      label: 'Werk + woning',
      href: '/overzicht/belasting/box1',
      tax: 12000,
      status: 'warn',
      statusText: 'Onbenutte jaarruimte',
      subtitle: 'Loon, ondernemerswinst en eigen huis.',
    },
    {
      number: '2',
      label: 'Aanmerkelijk belang',
      href: '/overzicht/belasting/box2',
      tax: null,
      status: 'neutral',
      statusText: 'Geen aanmerkelijk belang',
      subtitle: 'DGA / aandeelhouder ≥ 5%.',
    },
    {
      number: '3',
      label: 'Sparen + beleggen',
      href: '/overzicht/belasting/box3',
      tax: 3500,
      status: 'good',
      statusText: 'Geen actie nodig',
      subtitle: 'Cash, beleggingen en crypto — forfaitair.',
    },
  ]
  return base.map((c) => ({ ...c, ...(overrides[c.number as '1' | '2' | '3'] ?? {}) }))
}

describe('BelastingBoxCards — render', () => {
  it('rendert drie box-kaarten (Box 1 / 2 / 3)', () => {
    render(<BelastingBoxCards cards={makeCards()} />)
    expect(screen.getByText('Box 1')).toBeTruthy()
    expect(screen.getByText('Box 2')).toBeTruthy()
    expect(screen.getByText('Box 3')).toBeTruthy()
  })

  it('toont label per box', () => {
    render(<BelastingBoxCards cards={makeCards()} />)
    expect(screen.getByText('Werk + woning')).toBeTruthy()
    expect(screen.getByText('Aanmerkelijk belang')).toBeTruthy()
    expect(screen.getByText('Sparen + beleggen')).toBeTruthy()
  })

  it('toont KPI-waarde wanneer beschikbaar', () => {
    render(<BelastingBoxCards cards={makeCards()} />)
    expect(screen.getAllByText(/€\s*12\.000.*\/jr/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/€\s*3\.500.*\/jr/).length).toBeGreaterThan(0)
  })

  it('toont placeholder "—" bij null of 0', () => {
    render(
      <BelastingBoxCards
        cards={makeCards({ '1': { tax: null }, '2': { tax: 0 }, '3': { tax: null } })}
      />,
    )
    expect(screen.getAllByText('—').length).toBe(3)
  })

  it('toont de kicker "De drie boxen" en géén dubbel jaartotaal in de kaart-header', () => {
    render(<BelastingBoxCards cards={makeCards()} />)
    expect(screen.getByText('De drie boxen')).toBeTruthy()
    // Het jaartotaal is bewust verplaatst naar Sectie I (HubTotaleDruk); de
    // kaart-header dupliceert het niet langer (was "Geschatte druk €15.500/jr").
    expect(screen.queryByText('Geschatte druk')).toBeNull()
    expect(screen.queryByText(/€\s*15\.500/)).toBeNull()
  })

  it('toont status-substext per box', () => {
    render(<BelastingBoxCards cards={makeCards()} />)
    expect(screen.getByText('Onbenutte jaarruimte')).toBeTruthy()
    expect(screen.getByText('Geen aanmerkelijk belang')).toBeTruthy()
    expect(screen.getByText('Geen actie nodig')).toBeTruthy()
  })

  it('linkt elke kaart naar de eigen box-subpagina', () => {
    const { container } = render(<BelastingBoxCards cards={makeCards()} />)
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toContain('/overzicht/belasting/box1')
    expect(hrefs).toContain('/overzicht/belasting/box2')
    expect(hrefs).toContain('/overzicht/belasting/box3')
  })
})
