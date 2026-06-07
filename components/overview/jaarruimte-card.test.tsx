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
    // €4.100 onbenut (2026-franchise €19.172). Verschijnt zowel als headline
    // als de default inleg-waarde van de slider → meerdere matches.
    expect(screen.getAllByText(/€\s*4\.100/).length).toBeGreaterThan(0)
    expect(screen.getByText(/onbenut/i)).toBeTruthy()
  })

  it('toont "€ 0 onbenut" bij ruimte = 0', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={10_000} />)
    // pensioenAangroei > basis = 0 ruimte
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
    // Simulator-inleg default = volledige jaarruimte €4.100.
    // 4100 × 0.3697 = 1515.77 → afgerond €1.516
    expect(screen.getByText(/€\s*1\.51[567]/)).toBeTruthy()
    expect(screen.getByText(/Belastingbesparing/i)).toBeTruthy()
  })

  it('toont formule-disclaimer met 2026-waarden in footer', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} />)
    expect(screen.getByText(/13.3%/)).toBeTruthy()
    expect(screen.getByText(/19\.172/)).toBeTruthy()
    expect(screen.getByText(/35\.589/)).toBeTruthy()
  })

  it('respecteert expliciet jaar 2025', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} year={2025} />)
    // €4.317 onbenut (2025-franchise €17.545) — headline + slider-default.
    expect(screen.getAllByText(/€\s*4\.317/).length).toBeGreaterThan(0)
    expect(screen.getByText(/17\.545/)).toBeTruthy()
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

describe('JaarruimteCard — interactieve pensioen-aangroei', () => {
  it('toont input-veld voor pensioenaangroei', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} />)
    expect(screen.getByLabelText(/Pensioenaangroei werkgever/i)).toBeTruthy()
  })

  it('default aangroei = 0 wanneer geen prop', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} />)
    const input = screen.getByLabelText(
      /Pensioenaangroei werkgever/i,
    ) as HTMLInputElement
    expect(input.value).toBe('0')
  })

  it('default aangroei = prop-waarde wanneer aanwezig', () => {
    render(
      <JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={3000} />,
    )
    const input = screen.getByLabelText(
      /Pensioenaangroei werkgever/i,
    ) as HTMLInputElement
    expect(input.value).toBe('3000')
  })

  it('wijziging update de jaarruimte-berekening live', () => {
    const { container } = render(<JaarruimteCard grossYearlyIncome={50_000} />)
    // €50k bruto, aangroei 0 → ruimte ≈ €4.100 (2026)
    expect(container.textContent).toMatch(/€\s*4\.100/)
    const input = screen.getByLabelText(/Pensioenaangroei werkgever/i)
    fireEvent.change(input, { target: { value: '2000' } })
    // Met €2000 aangroei → ruimte ≈ €2.100
    expect(container.textContent).toMatch(/€\s*2\.100/)
  })

  it('reset-knop verschijnt wanneer aangroei > 0', () => {
    render(
      <JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={3000} />,
    )
    expect(screen.getByLabelText('Reset naar 0')).toBeTruthy()
  })

  it('reset-knop zet aangroei terug naar 0', () => {
    render(
      <JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={3000} />,
    )
    fireEvent.click(screen.getByLabelText('Reset naar 0'))
    const input = screen.getByLabelText(
      /Pensioenaangroei werkgever/i,
    ) as HTMLInputElement
    expect(input.value).toBe('0')
  })

  it('toont UPO-hint', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} />)
    expect(screen.getByText(/Mijnpensioenoverzicht/i)).toBeTruthy()
  })
})
