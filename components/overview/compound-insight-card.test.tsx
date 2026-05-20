import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CompoundInsightCard } from './compound-insight-card'

describe('CompoundInsightCard — render', () => {
  it('rendert niets bij €0 liquidCash (geen dramatic-delta)', () => {
    const { container } = render(<CompoundInsightCard liquidCash={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('rendert card bij €15k cash (dramatic-delta > 5%)', () => {
    render(<CompoundInsightCard liquidCash={15_000} />)
    expect(screen.getByText(/samengestelde rente/i)).toBeTruthy()
  })

  it('toont conservative en ambitious bedragen', () => {
    const { container } = render(<CompoundInsightCard liquidCash={20_000} />)
    expect(container.textContent).toMatch(/Op spaarrekening/i)
    expect(container.textContent).toMatch(/Belegd/i)
    // 0.5% en 7%-labels
    expect(container.textContent).toMatch(/0\.5%/)
    expect(container.textContent).toMatch(/7%/)
  })

  it('toont het verschil prominent', () => {
    render(<CompoundInsightCard liquidCash={50_000} />)
    expect(screen.getByText(/Het verschil/i)).toBeTruthy()
  })

  it('linkt naar /overzicht/bezittingen', () => {
    const { container } = render(<CompoundInsightCard liquidCash={50_000} />)
    expect(container.querySelector('a[href="/overzicht/bezittingen"]')).toBeTruthy()
  })

  it('toont disclaimer over historische rendementen', () => {
    render(<CompoundInsightCard liquidCash={20_000} />)
    expect(
      screen.getByText(/historische resultaten zijn geen garantie/i),
    ).toBeTruthy()
  })

  it('rendert ook bij 0 cash + maandelijkse inleg (impact dramatic genoeg)', () => {
    // €500/mnd over 30 jaar levert ook een dramatisch verschil tussen
    // 0.5% en 7% — card toont hem dus.
    render(<CompoundInsightCard liquidCash={0} monthlyContribution={500} />)
    expect(screen.getByText(/samengestelde rente/i)).toBeTruthy()
  })
})
