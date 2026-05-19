import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MiniNetWorthChart } from './mini-networth-chart'

/**
 * Tests voor MiniNetWorthChart — compacte projectie-chart naast Health
 * Score. Validatie render-states + projectie-clamping + markers.
 */

function buildHistory(values: number[]): { month: string; value: number }[] {
  return values.map((value, i) => {
    const d = new Date(2025, i, 1)
    return { month: d.toISOString().slice(0, 7), value }
  })
}

describe('MiniNetWorthChart — render-states', () => {
  it('toont empty-state placeholder bij currentAge=null', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={[]}
        currentNetWorth={0}
        currentAge={null}
        fireAge={null}
        endAge={null}
      />,
    )
    expect(screen.getByText(/Vul je profiel aan/)).toBeTruthy()
  })

  it('toont empty-state placeholder bij endAge=null', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={[]}
        currentNetWorth={0}
        currentAge={35}
        fireAge={null}
        endAge={null}
      />,
    )
    expect(screen.getByText(/Vul je profiel aan/)).toBeTruthy()
  })

  it('toont empty-state placeholder bij endAge ≤ currentAge', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={[]}
        currentNetWorth={0}
        currentAge={70}
        fireAge={null}
        endAge={65}
      />,
    )
    expect(screen.getByText(/Vul je profiel aan/)).toBeTruthy()
  })

  it('toont "pensioen"-label bij isPensioenMode=true', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={[]}
        currentNetWorth={0}
        currentAge={null}
        fireAge={null}
        endAge={null}
        isPensioenMode={true}
      />,
    )
    expect(screen.getByText(/pensioen/)).toBeTruthy()
  })
})

describe('MiniNetWorthChart — projectie-render', () => {
  it('rendert chart-header "Netto vermogen door de tijd"', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000, 105_000, 110_000])}
        currentNetWorth={110_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
      />,
    )
    expect(screen.getByText('Netto vermogen door de tijd')).toBeTruthy()
  })

  it('rendert huidig bedrag in serif-font', () => {
    const { container } = render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={187_400}
        currentAge={35}
        fireAge={null}
        endAge={67}
      />,
    )
    expect(container.textContent).toContain('€')
    expect(container.textContent).toContain('187')
  })

  it('rendert vrijheid-marker label "Vrijheid X" wanneer fireAge in range', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        isPensioenMode={false}
      />,
    )
    expect(screen.getByText(/Vrijheid 52/)).toBeTruthy()
  })

  it('rendert pensioen-marker bij isPensioenMode', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={67}
        endAge={67}
        isPensioenMode={true}
      />,
    )
    expect(screen.getByText(/Pensioen 67/)).toBeTruthy()
  })

  it('toont vandaag-leeftijd-label', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={100_000}
        currentAge={42}
        fireAge={null}
        endAge={67}
      />,
    )
    expect(screen.getByText(/Vandaag.*42/)).toBeTruthy()
  })

  it('Link wijst naar /toekomst voor verdieping', () => {
    const { container } = render(
      <MiniNetWorthChart
        netWorthHistory={[]}
        currentNetWorth={0}
        currentAge={null}
        fireAge={null}
        endAge={null}
      />,
    )
    const link = container.querySelector('a[href="/toekomst"]')
    expect(link).toBeTruthy()
  })

  it('toont "Benadering"-disclaimer met groei-percentage', () => {
    const { container } = render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000, 102_000, 104_000])}
        currentNetWorth={104_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
      />,
    )
    expect(container.textContent).toMatch(/Benadering met.*%\/jaar/)
  })
})
