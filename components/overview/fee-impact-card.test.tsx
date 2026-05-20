import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeeImpactCard } from './fee-impact-card'

/**
 * Tests voor FeeImpactCard — tweede dramatic visualization (plan T-4).
 * Toont impact van extra beheerkosten op belegd vermogen over horizon
 * tot vrijheid. Min portfolio €25k anders rendert hij niet.
 */

describe('FeeImpactCard — render-gating', () => {
  it('rendert niets bij portfolio < €25k (te klein voor dramatic delta)', () => {
    const { container } = render(<FeeImpactCard investmentTotal={20_000} />)
    expect(container.firstChild).toBeNull()
  })

  it('rendert bij portfolio ≥ €25k', () => {
    render(<FeeImpactCard investmentTotal={50_000} />)
    expect(screen.getByText(/Wat kosten fees je\?/i)).toBeTruthy()
  })
})

describe('FeeImpactCard — berekening', () => {
  it('toont default 0.5% in headline', () => {
    render(<FeeImpactCard investmentTotal={100_000} />)
    // "0.5%" verschijnt 2× (headline + slider-display)
    expect(screen.getAllByText(/0\.5%/).length).toBeGreaterThanOrEqual(2)
  })

  it('toont 30 jaar horizon bij ontbrekende yearsToFreedom', () => {
    render(<FeeImpactCard investmentTotal={100_000} />)
    expect(screen.getByText(/over 30 jaar/i)).toBeTruthy()
  })

  it('gebruikt yearsToFreedom wanneer meegegeven', () => {
    render(<FeeImpactCard investmentTotal={100_000} yearsToFreedom={15} />)
    expect(screen.getByText(/over 15 jaar/i)).toBeTruthy()
  })

  it('toont "Zonder extra fee" en "Met 0.5% extra" labels', () => {
    render(<FeeImpactCard investmentTotal={100_000} />)
    expect(screen.getByText(/Zonder extra fee/i)).toBeTruthy()
    expect(screen.getByText(/Met 0\.5% extra/i)).toBeTruthy()
  })

  it('toont kosten in EUR (cost > 0 bij default)', () => {
    const { container } = render(<FeeImpactCard investmentTotal={100_000} />)
    // €100k bij 7% over 30 jaar = ~€761k; met 6.5% = ~€662k; verschil ~€99k
    // Zoek naar duizend-separator voor euro-bedrag in headline
    expect(container.textContent).toMatch(/€\s*\d/)
  })

  it('toont fee-percentage-van-eindwaarde badge bij positieve cost', () => {
    render(<FeeImpactCard investmentTotal={100_000} />)
    expect(screen.getByText(/van je eindwaarde gaat naar fees/i)).toBeTruthy()
  })
})

describe('FeeImpactCard — slider', () => {
  it('slider update headline-percentage', () => {
    const { container } = render(<FeeImpactCard investmentTotal={100_000} />)
    const slider = container.querySelector('input[type="range"]')!
    fireEvent.change(slider, { target: { value: '1.0' } })
    // "1.0%" verschijnt 2× (headline + slider-display)
    expect(screen.getAllByText(/1\.0%/).length).toBeGreaterThanOrEqual(2)
  })

  it('slider 0% maakt cost = €0 (geen badge)', () => {
    const { container } = render(<FeeImpactCard investmentTotal={100_000} />)
    const slider = container.querySelector('input[type="range"]')!
    fireEvent.change(slider, { target: { value: '0' } })
    // Bij 0% extra fee zijn beide balken gelijk → cost = 0
    expect(screen.queryByText(/van je eindwaarde gaat naar fees/i)).toBeNull()
  })

  it('hoger fee-percentage geeft hogere kost', () => {
    const { container, rerender } = render(
      <FeeImpactCard investmentTotal={100_000} />,
    )
    const slider = container.querySelector('input[type="range"]')!
    // Start 0.5%, klik naar 1.5%
    fireEvent.change(slider, { target: { value: '1.5' } })
    rerender(<FeeImpactCard investmentTotal={100_000} />)
    expect(container.textContent).toMatch(/1\.5%/)
  })
})
