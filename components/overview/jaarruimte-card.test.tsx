import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { JaarruimteCard } from './jaarruimte-card'

describe('JaarruimteCard — render', () => {
  it('toont empty-CTA wanneer grossYearlyIncome = 0', () => {
    render(<JaarruimteCard grossYearlyIncome={0} />)
    expect(screen.getByText(/Vul je bruto-jaarinkomen aan/i)).toBeTruthy()
  })

  it('toont jaarruimte-bedrag bij modaal inkomen', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} />)
    // €4.317 onbenut
    expect(screen.getByText(/€\s*4\.317/)).toBeTruthy()
    expect(screen.getByText(/onbenut/i)).toBeTruthy()
  })

  it('toont "€ 0 onbenut" bij ruimte = 0', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={10_000} />)
    // pensioenAangroei > basis = 0 ruimte
    expect(screen.getByText(/€ 0/)).toBeTruthy()
    expect(screen.getByText(/Je werkgever vult je pensioenaangroei volledig/i)).toBeTruthy()
  })

  it('toont besparings-schatting wanneer marginaalTarief gegeven', () => {
    render(
      <JaarruimteCard
        grossYearlyIncome={50_000}
        marginaalTarief={0.3697}
      />,
    )
    // 4317 × 0.3697 = 1596 (afgerond)
    expect(screen.getByText(/€\s*1\.59[567]/)).toBeTruthy()
    expect(screen.getByText(/belasting-besparing/i)).toBeTruthy()
  })

  it('linkt naar /core/belasting voor volledige Box 1-berekening', () => {
    const { container } = render(
      <JaarruimteCard grossYearlyIncome={50_000} />,
    )
    const link = container.querySelector('a[href="/core/belasting"]')
    expect(link).toBeTruthy()
  })

  it('toont formule-disclaimer in footer', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} />)
    expect(screen.getByText(/13.3%/)).toBeTruthy()
    expect(screen.getByText(/17\.545/)).toBeTruthy()
    expect(screen.getByText(/34\.310/)).toBeTruthy()
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
    // €50k bruto, aangroei 0 → ruimte ≈ €4.317
    expect(container.textContent).toMatch(/€\s*4\.317/)
    const input = screen.getByLabelText(/Pensioenaangroei werkgever/i)
    fireEvent.change(input, { target: { value: '2000' } })
    // Met €2000 aangroei → ruimte ≈ €2.317
    expect(container.textContent).toMatch(/€\s*2\.317/)
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
