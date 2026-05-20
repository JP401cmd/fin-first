import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AfbouwOverzichtCard } from './afbouw-overzicht-card'

describe('AfbouwOverzichtCard — render-states', () => {
  it('rendert niets bij fireAge=null', () => {
    const { container } = render(
      <AfbouwOverzichtCard
        fireAge={null}
        endAge={90}
        fireAgeBalance={500_000}
        endBalance={100_000}
        strategy="deplete"
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('rendert niets bij fireAgeBalance=null', () => {
    const { container } = render(
      <AfbouwOverzichtCard
        fireAge={52}
        endAge={90}
        fireAgeBalance={null}
        endBalance={100_000}
        strategy="deplete"
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('rendert niets bij endBalance=null', () => {
    const { container } = render(
      <AfbouwOverzichtCard
        fireAge={52}
        endAge={90}
        fireAgeBalance={500_000}
        endBalance={null}
        strategy="deplete"
      />,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('AfbouwOverzichtCard — render-content', () => {
  it('toont 3 tegels: Bij vrijheid / Verbruik / Bij eindleeftijd', () => {
    render(
      <AfbouwOverzichtCard
        fireAge={52}
        endAge={90}
        fireAgeBalance={500_000}
        endBalance={100_000}
        strategy="deplete"
      />,
    )
    expect(screen.getByText(/Bij vrijheid · 52/i)).toBeTruthy()
    expect(screen.getByText(/Verbruik · 38 jaar/i)).toBeTruthy()
    expect(screen.getByText(/Bij eindleeftijd/i)).toBeTruthy()
  })

  it('berekent verbruik = fireAgeBalance − endBalance', () => {
    render(
      <AfbouwOverzichtCard
        fireAge={52}
        endAge={90}
        fireAgeBalance={500_000}
        endBalance={100_000}
        strategy="deplete"
      />,
    )
    // 500k - 100k = 400k verbruik
    expect(screen.getByText(/−€\s*400\.000|-€\s*400\.000/)).toBeTruthy()
  })

  it('toont strategie-naam in header', () => {
    render(
      <AfbouwOverzichtCard
        fireAge={52}
        endAge={90}
        fireAgeBalance={500_000}
        endBalance={100_000}
        strategy="legacy"
      />,
    )
    // STRATEGY_LABELS.legacy.name = "Nalatenschap"
    expect(screen.getByText(/Nalatenschap/)).toBeTruthy()
  })

  it('toont "volledig opgemaakt" bij deplete + endBalance=0', () => {
    render(
      <AfbouwOverzichtCard
        fireAge={52}
        endAge={90}
        fireAgeBalance={500_000}
        endBalance={0}
        strategy="deplete"
      />,
    )
    // Match komt voor in subtitle EN in STRATEGY_LABELS.deplete.subtitle
    expect(screen.getAllByText(/volledig opgemaakt/i).length).toBeGreaterThan(0)
  })

  it('toont "Restant — nalatenschap" bij endBalance > 0', () => {
    render(
      <AfbouwOverzichtCard
        fireAge={52}
        endAge={90}
        fireAgeBalance={500_000}
        endBalance={250_000}
        strategy="legacy"
      />,
    )
    expect(screen.getByText(/Restant — nalatenschap/i)).toBeTruthy()
  })

  it('linkt naar /toekomst voor volledige tijdas', () => {
    const { container } = render(
      <AfbouwOverzichtCard
        fireAge={52}
        endAge={90}
        fireAgeBalance={500_000}
        endBalance={100_000}
        strategy="deplete"
      />,
    )
    expect(container.querySelector('a[href="/toekomst"]')).toBeTruthy()
  })
})
