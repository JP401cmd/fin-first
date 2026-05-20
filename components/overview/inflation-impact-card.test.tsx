import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InflationImpactCard } from './inflation-impact-card'

describe('InflationImpactCard — render-gating', () => {
  it('rendert niets bij maandbedrag < €500', () => {
    const { container } = render(<InflationImpactCard monthlyExpenses={400} />)
    expect(container.firstChild).toBeNull()
  })

  it('rendert bij maandbedrag ≥ €500', () => {
    render(<InflationImpactCard monthlyExpenses={1500} />)
    expect(screen.getByText(/Inflatie & koopkracht/i)).toBeTruthy()
  })
})

describe('InflationImpactCard — berekening', () => {
  it('toont default 2.5% inflatie', () => {
    render(<InflationImpactCard monthlyExpenses={2000} />)
    expect(screen.getAllByText(/2\.5%/).length).toBeGreaterThanOrEqual(1)
  })

  it('toont 3 horizon-tiles (10/20/30 jaar)', () => {
    render(<InflationImpactCard monthlyExpenses={2000} />)
    // "Over 30 jaar" verschijnt 2× (headline + tile-label) — gebruik
    // getAllByText voor robuustheid
    expect(screen.getByText(/Over 10 jaar/i)).toBeTruthy()
    expect(screen.getByText(/Over 20 jaar/i)).toBeTruthy()
    expect(screen.getAllByText(/Over 30 jaar/i).length).toBeGreaterThanOrEqual(1)
  })

  it('over 30 jr bij 2.5% inflatie ≈ huidig × 2.1', () => {
    const { container } = render(<InflationImpactCard monthlyExpenses={2000} />)
    // €2000 × (1.025)^30 ≈ €4196
    expect(container.textContent).toMatch(/€\s*4\.1[89]/)
  })

  it('toont +nominaal-percentage-badge', () => {
    render(<InflationImpactCard monthlyExpenses={2000} />)
    expect(screen.getByText(/% nominaal nodig over 30 jaar/i)).toBeTruthy()
  })
})

describe('InflationImpactCard — slider', () => {
  it('slider update inflatie-percentage', () => {
    const { container } = render(<InflationImpactCard monthlyExpenses={2000} />)
    const slider = container.querySelector('input[type="range"]')!
    fireEvent.change(slider, { target: { value: '4.0' } })
    expect(screen.getAllByText(/4\.0%/).length).toBeGreaterThanOrEqual(1)
  })

  it('lager inflatie → kleiner verschil', () => {
    const { container, rerender } = render(
      <InflationImpactCard monthlyExpenses={2000} />,
    )
    const slider = container.querySelector('input[type="range"]')!
    fireEvent.change(slider, { target: { value: '1.0' } })
    rerender(<InflationImpactCard monthlyExpenses={2000} />)
    // €2000 × (1.01)^30 ≈ €2695 → 35% delta
    expect(container.textContent).toMatch(/\+3[0-9]% nominaal/)
  })
})
