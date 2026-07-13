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

  it('toont besparings-schatting in de simulator (marginaal-correct via jaarruimteBesparing)', () => {
    render(
      <JaarruimteCard
        grossYearlyIncome={50_000}
      />,
    )
    // Simulator-inleg default = volledige jaarruimte €9.248.
    // Marginaal-correct via jaarruimteBesparing(50000, 9248, 2026) =
    // computeBox1Tax(50000).tax − computeBox1Tax(50000 − 9248).tax = €4.258
    // (ADR 0040/0041 — vervangt de oude vlakke inleg × marginaal-benadering).
    expect(screen.getByText(/€\s*4\.258/)).toBeTruthy()
    expect(screen.getByText(/Belastingbesparing/i)).toBeTruthy()
    // 4258 / 9248 ≈ 46% effectief
    expect(screen.getByText(/≈ 46% effectief/)).toBeTruthy()
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
      <JaarruimteCard grossYearlyIncome={50_000} />,
    )
    const slider = screen.getByLabelText(/Lijfrente-inleg dit jaar/i)
    fireEvent.change(slider, { target: { value: '2000' } })
    // Marginaal-correct via jaarruimteBesparing(50000, 2000, 2026) =
    // computeBox1Tax(50000).tax − computeBox1Tax(48000).tax = €1.009
    expect(screen.getByText(/€\s*1\.009/)).toBeTruthy()
  })

  it('toont géén slider wanneer er geen jaarruimte is', () => {
    render(
      <JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={10_000} />,
    )
    expect(screen.queryByLabelText(/Lijfrente-inleg dit jaar/i)).toBeNull()
  })
})

describe('JaarruimteCard — factor A via prop (geen lokale invoer meer)', () => {
  it('rendert géén factor-A-invoerveld meer (bewerken bij pensioen-strategie)', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={500} />)
    expect(screen.queryByLabelText(/Factor A/i)).toBeNull()
    expect(screen.queryByLabelText('Reset naar 0')).toBeNull()
  })

  it('rekent met de opgeslagen factor A uit de prop (× 6,27)', () => {
    const { container } = render(
      <JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={500} />,
    )
    // factor A €500 × 6,27 = 3135 → 9248 − 3135 = €6.113 onbenut (2026)
    expect(container.textContent).toMatch(/€\s*6\.113/)
    // Toont de toegepaste factor A ter transparantie
    expect(screen.getByText(/opgeslagen factor A/i)).toBeTruthy()
  })

  it('verwijst naar de pensioen-strategie als énige bewerkplek', () => {
    render(<JaarruimteCard grossYearlyIncome={50_000} />)
    const link = screen.getByRole('link', { name: /pensioen-strategie/i })
    expect(link.getAttribute('href')).toBe(
      '/toekomst/gebeurtenissen?strategie=pensioen',
    )
  })

  it('toont géén eigen-pensioen-strategie-link op de partnerkaart (factorAEditable=false)', () => {
    // Partnerkaart in de huishoud-view: pensioenAangroei bewust 0, geen eigen
    // factor-A-bron → de footer mag NIET naar de eigen pensioen-strategie
    // verwijzen (privacy-guardrail, ADR 0036). Neutrale tekst i.p.v. link.
    render(
      <JaarruimteCard grossYearlyIncome={50_000} pensioenAangroei={0} factorAEditable={false} />,
    )
    expect(screen.queryByRole('link', { name: /pensioen-strategie/i })).toBeNull()
    expect(screen.getByText(/zonder factor A/i)).toBeTruthy()
  })
})
