/**
 * Vrijheidskaart — de Weinig-variant (privacyLevel 'anonymous').
 *
 * De belofte van de stand Weinig is smal en hard: "alleen je vrijheidstijd,
 * geen naam, geen cijfers". Die belofte staat of valt bij wat er daadwerkelijk
 * op de kaart terechtkomt — en juist dáár lekt zoiets makkelijk terug binnen,
 * bijvoorbeeld via een narratieve kop die het percentage leent als er nog geen
 * jaren/maanden zijn. Deze suite pint de grens op de gerenderde kaart, niet op
 * de intentie.
 *
 * De canvas-variant deelt zijn afgeleiden (`deriveCardStats`) en zijn kop
 * (`buildFreedomNarrative`) met deze preview; jsdom kan geen canvas tekenen, dus
 * de preview is hier de toetsbare tweelingsvorm.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { FreedomCardVisual, type FreedomCardData } from './freedom-card'

function maakKaart(overrides: Partial<FreedomCardData> = {}): FreedomCardData {
  return {
    privacyLevel: 'anonymous',
    freedomPercentage: 24.2,
    freedomDaysWon: 120,
    freedomDaysWonThisMonth: 5,
    fireCountdown: { years: 12, months: 3, days: 0, label: 'mrt 2038' },
    freedomTime: { years: 2, months: 9 },
    savingsRate: 31,
    generatedAt: '2026-08-31T10:00:00.000Z',
    displayName: 'Jan',
    netWorth: 84000,
    fireTarget: 620000,
    ...overrides,
  }
}

describe('Vrijheidskaart — stand Weinig toont alleen vrijheidstijd', () => {
  afterEach(cleanup)

  it('toont de vrijheidstijd als hoofdcijfer', () => {
    const { container } = render(<FreedomCardVisual data={maakKaart()} />)
    expect(container.textContent).toContain('2 jaar')
    expect(container.textContent).toContain('9 maanden')
    expect(container.textContent).toMatch(/vrijheid opgebouwd/i)
  })

  it('toont geen percentage — ook niet via de kop', () => {
    const { container } = render(<FreedomCardVisual data={maakKaart()} />)
    expect(container.textContent).not.toContain('%')
  })

  it('leent ook zonder vrijheidsjaren geen percentage voor de kop', () => {
    // Het randgeval dat de belofte eerder brak: geen jaren/maanden, wél een
    // percentage — de narratieve kop viel dan terug op "Ik ben 24,2% onderweg".
    const { container } = render(
      <FreedomCardVisual data={maakKaart({ freedomTime: { years: 0, months: 0 } })} />,
    )
    expect(container.textContent).not.toContain('%')
    expect(container.textContent).toMatch(/vrijheid/i)
  })

  it('toont geen bedragen', () => {
    const { container } = render(<FreedomCardVisual data={maakKaart()} />)
    expect(container.textContent).not.toContain('€')
  })

  it('toont geen spaarquote, geen countdown en geen maanddagen-strip', () => {
    const { container } = render(<FreedomCardVisual data={maakKaart()} />)
    expect(container.textContent).not.toMatch(/spaarquote/i)
    expect(container.textContent).not.toMatch(/volledige vrijheid/i)
    expect(container.textContent).not.toMatch(/deze maand/i)
    expect(container.textContent).not.toContain('12j 3m')
  })

  it('toont geen naam, ook niet als de data er per ongeluk een draagt', () => {
    const { container } = render(<FreedomCardVisual data={maakKaart()} />)
    expect(container.textContent).not.toContain('Jan')
  })

  it('draagt de uitnodiging naar de publieke check in het colofon', () => {
    const { container } = render(<FreedomCardVisual data={maakKaart()} />)
    expect(container.textContent).toMatch(/Bereken je eigen vrijheid/i)
    expect(container.textContent).toContain('/check')
  })
})

describe('Vrijheidskaart — Gemiddeld/Veel blijven ongewijzigd', () => {
  afterEach(cleanup)

  it('Gemiddeld toont wél percentage, spaarquote en naam', () => {
    const { container } = render(
      <FreedomCardVisual data={maakKaart({ privacyLevel: 'named' })} />,
    )
    expect(container.textContent).toContain('24.2%')
    expect(container.textContent).toMatch(/spaarquote/i)
    expect(container.textContent).toContain('Jan')
    expect(container.textContent).not.toContain('€')
  })

  it('Veel toont daarbovenop het netto vermogen', () => {
    const { container } = render(
      <FreedomCardVisual data={maakKaart({ privacyLevel: 'full' })} />,
    )
    expect(container.textContent).toMatch(/netto vermogen/i)
    expect(container.textContent).toContain('€')
  })

  it('draagt de uitnodiging in élke stand', () => {
    const { container } = render(
      <FreedomCardVisual data={maakKaart({ privacyLevel: 'full' })} />,
    )
    expect(container.textContent).toMatch(/Bereken je eigen vrijheid/i)
  })
})
