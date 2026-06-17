import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { JaarruimteCard } from './jaarruimte-card'

describe('JaarruimteCard — render (default 2026)', () => {
  it('toont empty-CTA wanneer grossYearlyIncome = 0', () => {
    render(<JaarruimteCard grossYearlyIncome={0} />)
    expect(screen.getByText(/Vul je bruto-jaarinkomen aan/i)).toBeTruthy()
  })

  it('toont jaarruimte-bedrag bij modaal inkomen', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} />)
    // €9.248 onbenut (30% × (50000 − 19172), 2026-franchise). Verschijnt zowel
    // als headline als de default inleg-waarde van de slider → meerdere matches.
    expect(screen.getAllByText(/€\s*9\.248/).length).toBeGreaterThan(0)
    expect(screen.getByText(/onbenut/i)).toBeTruthy()
  })

  it('toont "€ 0 onbenut" bij ruimte = 0', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={10_000} />)
    // factor A €10.000 × 6,27 = 62.700 ≫ basis 9.248 → 0 ruimte
    expect(screen.getByText(/€ 0/)).toBeTruthy()
    expect(screen.getByText(/Je werkgever vult je pensioenaangroei volledig/i)).toBeTruthy()
  })

  it('toont besparings-schatting in de simulator wanneer marginaalTarief gegeven', () => {
    render(
      <JaarruimteCard
        grossYearlyIncome={50_000}
        marginaalTarief={0.3697}
      />,
    )
    // Simulator-inleg default = volledige jaarruimte €9.248.
    // 9248 × 0.3697 = 3418.99 → afgerond €3.419
    expect(screen.getByText(/€\s*3\.41[89]/)).toBeTruthy()
    expect(screen.getByText(/Belastingbesparing/i)).toBeTruthy()
  })

  it('toont formule-disclaimer met 2026-waarden in footer', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} />)
    expect(screen.getByText(/30%/)).toBeTruthy()
    expect(screen.getByText(/19\.172/)).toBeTruthy()
    expect(screen.getByText(/35\.589/)).toBeTruthy()
  })

  it('respecteert expliciet jaar 2025', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} year={2025} />)
    // €9.458 onbenut (30% × (50000 − 18475), 2025-franchise) — headline + slider.
    expect(screen.getAllByText(/€\s*9\.458/).length).toBeGreaterThan(0)
    expect(screen.getByText(/18\.475/)).toBeTruthy()
  })
})

describe('JaarruimteCard — lijfrente-simulator', () => {
  it('toont de inleg-slider wanneer er jaarruimte is', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} />)
    expect(screen.getByLabelText(/Lijfrente-inleg dit jaar/i)).toBeTruthy()
  })

  it('verlaagt de besparing wanneer de inleg-slider zakt', () => {
    render(
      <JaarruimteCard grossYearlyIncome={50_000} marginaalTarief={0.3697} />,
    )
    const slider = screen.getByLabelText(/Lijfrente-inleg dit jaar/i)
    fireEvent.change(slider, { target: { value: '2000' } })
    // 2000 × 0.3697 = 739.4 → afgerond €739
    expect(screen.getByText(/€\s*739/)).toBeTruthy()
  })

  it('toont géén slider wanneer er geen jaarruimte is', () => {
    render(
      <JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={10_000} />,
    )
    expect(screen.queryByLabelText(/Lijfrente-inleg dit jaar/i)).toBeNull()
  })
})

describe('JaarruimteCard — interactieve factor A', () => {
  it('toont input-veld voor factor A', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} />)
    expect(screen.getByLabelText(/Factor A/i)).toBeTruthy()
  })

  it('default factor A = 0 wanneer geen prop', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} />)
    const input = screen.getByLabelText(/Factor A/i) as HTMLInputElement
    expect(input.value).toBe('0')
  })

  it('default factor A = prop-waarde wanneer aanwezig', () => {
    render(
      <JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={500} />,
    )
    const input = screen.getByLabelText(/Factor A/i) as HTMLInputElement
    expect(input.value).toBe('500')
  })

  it('wijziging update de jaarruimte-berekening live (× 6,27)', () => {
    const { container } = render(<JaarruimteCard grossYearlyIncome={50_000} />)
    // €50k bruto, factor A 0 → ruimte €9.248 (2026)
    expect(container.textContent).toMatch(/€\s*9\.248/)
    const input = screen.getByLabelText(/Factor A/i)
    fireEvent.change(input, { target: { value: '500' } })
    // factor A €500 × 6,27 = 3135 → 9248 − 3135 = €6.113
    expect(container.textContent).toMatch(/€\s*6\.113/)
  })

  it('reset-knop verschijnt wanneer factor A > 0', () => {
    render(
      <JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={500} />,
    )
    expect(screen.getByLabelText('Reset naar 0')).toBeTruthy()
  })

  it('reset-knop zet factor A terug naar 0', () => {
    render(
      <JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={500} />,
    )
    fireEvent.click(screen.getByLabelText('Reset naar 0'))
    const input = screen.getByLabelText(/Factor A/i) as HTMLInputElement
    expect(input.value).toBe('0')
  })

  it('toont UPO-hint', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} />)
    expect(screen.getByText(/Mijnpensioenoverzicht/i)).toBeTruthy()
  })
})
