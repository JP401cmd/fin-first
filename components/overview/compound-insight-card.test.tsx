import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactElement } from 'react'
import { CompoundInsightCard } from './compound-insight-card'
import { PrivacyProvider, PRIVACY_MASKED_STORAGE_KEY } from '@/lib/hooks/use-privacy'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'

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

describe('CompoundInsightCard — interactieve slider', () => {
  it('toont slider met label "Extra €/maand inleggen"', () => {
    render(<CompoundInsightCard liquidCash={20_000} />)
    expect(screen.getByText(/Extra €\/maand inleggen/i)).toBeTruthy()
    expect(screen.getByRole('slider')).toBeTruthy()
  })

  it('slider default = 0 wanneer monthlyContribution niet meegegeven', () => {
    render(<CompoundInsightCard liquidCash={20_000} />)
    const slider = screen.getByRole('slider') as HTMLInputElement
    expect(slider.value).toBe('0')
  })

  it('slider default = monthlyContribution prop wanneer aanwezig', () => {
    render(<CompoundInsightCard liquidCash={20_000} monthlyContribution={250} />)
    const slider = screen.getByRole('slider') as HTMLInputElement
    expect(slider.value).toBe('250')
  })

  it('wijziging via slider update bedrag-display', () => {
    const { container } = render(<CompoundInsightCard liquidCash={20_000} />)
    const slider = screen.getByRole('slider')
    fireEvent.change(slider, { target: { value: '500' } })
    // Display "€500/mnd" verschijnt direct
    expect(container.textContent).toMatch(/€\s*500.*\/mnd/)
  })

  it('slider heeft range 0-1000 met step=25', () => {
    render(<CompoundInsightCard liquidCash={20_000} />)
    const slider = screen.getByRole('slider')
    expect(slider.getAttribute('min')).toBe('0')
    expect(slider.getAttribute('max')).toBe('1000')
    expect(slider.getAttribute('step')).toBe('25')
  })
})

describe('CompoundInsightCard — privacy-masking voor saldi', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  function renderMasked(ui: ReactElement) {
    window.localStorage.setItem(PRIVACY_MASKED_STORAGE_KEY, 'true')
    return render(<PrivacyProvider>{ui}</PrivacyProvider>)
  }

  it('toont het liquide-cash-saldo zichtbaar wanneer NIET gemaskeerd', () => {
    const { container } = render(<CompoundInsightCard liquidCash={45_000} />)
    expect(container.textContent).toContain('45.000')
  })

  it('maskeert het liquide-cash-saldo wanneer privacy aan', () => {
    const { container } = renderMasked(<CompoundInsightCard liquidCash={45_000} />)
    expect(container.textContent).toContain(MASKED_AMOUNT_PLACEHOLDER)
    expect(container.textContent).not.toContain('45.000')
  })

  it('maskeert ook de afgeleide projectie-bedragen (geen magnitude-lek)', () => {
    const { container } = renderMasked(<CompoundInsightCard liquidCash={45_000} />)
    // liquidCash + conservative + ambitious + difference = 4 saldo-achtige
    // bedragen die allemaal de bullet-placeholder krijgen.
    const hits = container.textContent?.match(/••••••/g) ?? []
    expect(hits.length).toBeGreaterThanOrEqual(4)
  })

  it('maskeert ook het slider-label — één kaart, één maskeer-belofte (sweep A6)', () => {
    // Was eerder bewust zichtbaar ("eigen keuze, geen saldo"), maar de
    // masking-sweep (werkqueue "Privacy-modus dekt álle bedragen") koos voor
    // consistentie: deels zichtbare bedragen op één kaart breken de belofte.
    const { container } = renderMasked(
      <CompoundInsightCard liquidCash={45_000} monthlyContribution={250} />,
    )
    expect(container.textContent).not.toMatch(/250.*\/mnd/)
    expect(container.textContent).toContain(`${MASKED_AMOUNT_PLACEHOLDER}/mnd`)
  })

  it('minimaliseer-knop verbergt de card en schrijft id naar localStorage', () => {
    window.localStorage.clear()
    const { container } = render(<CompoundInsightCard liquidCash={20_000} />)
    fireEvent.click(screen.getByRole('button', { name: /minimaliseren/i }))
    expect(container.querySelector('article')).toBeNull()
    const stored = JSON.parse(window.localStorage.getItem('tf-insight-hidden') ?? '[]')
    expect(stored).toContain('compound-insight')
  })
})
