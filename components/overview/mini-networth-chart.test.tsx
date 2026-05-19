import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MiniNetWorthChart } from './mini-networth-chart'

/**
 * Tests voor MiniNetWorthChart — compacte projectie-chart naast Health
 * Score. Gebruikt nu simRows uit `runUnifiedProjection` (dezelfde bron
 * als /toekomst) zodat de curve 1:1 matcht. Tests valideren render-
 * states + simRows-injectie + Vrijheid-marker.
 */

function buildHistory(values: number[]): { month: string; value: number }[] {
  return values.map((value, i) => {
    const d = new Date(2025, i, 1)
    return { month: d.toISOString().slice(0, 7), value }
  })
}

function buildSimRows(
  startAge: number,
  fireAge: number,
  startValue: number,
  growthRate = 0.07,
): { age: number; endPortfolio: number }[] {
  const rows: { age: number; endPortfolio: number }[] = []
  let value = startValue
  for (let age = startAge; age <= fireAge; age++) {
    value = value * (1 + growthRate)
    rows.push({ age, endPortfolio: Math.round(value) })
  }
  return rows
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

  it('toont empty-state placeholder zonder simRows zelfs met fireAge', () => {
    // simRows-null = simulatie mislukt server-side → empty-state, niet
    // een eigen lineaire benadering. Garandeert dat /overzicht nooit
    // afwijkt van /toekomst.
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simRows={null}
      />,
    )
    expect(screen.getByText(/Vul je profiel aan/)).toBeTruthy()
  })

  it('toont "pensioen"-label in empty-state bij isPensioenMode=true', () => {
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

describe('MiniNetWorthChart — projectie-render met simRows', () => {
  it('rendert chart-header "Netto vermogen door de tijd"', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000, 105_000, 110_000])}
        currentNetWorth={110_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simRows={buildSimRows(35, 52, 110_000)}
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
        fireAge={52}
        endAge={67}
        simRows={buildSimRows(35, 52, 187_400)}
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
        simRows={buildSimRows(35, 52, 100_000)}
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
        simRows={buildSimRows(35, 67, 100_000)}
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
        fireAge={52}
        endAge={67}
        simRows={buildSimRows(42, 52, 100_000)}
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

  it('toont GEEN "Benadering"-disclaimer (gebruikt nu echte simRows)', () => {
    const { container } = render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simRows={buildSimRows(35, 52, 100_000)}
      />,
    )
    // Voorheen: "Benadering met X%/jaar groei". Sinds we de echte
    // unifiedProjection-rows gebruiken (zelfde data als /toekomst) is
    // dat geen benadering meer en is de disclaimer weg.
    expect(container.textContent).not.toMatch(/Benadering/)
  })

  it('gebruikt simRequiredPortfolio als eindwaarde-bedrag', () => {
    const { container } = render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simRows={buildSimRows(35, 52, 100_000)}
        simRequiredPortfolio={915_600}
      />,
    )
    // Bedrag bij vrijheid moet uit simRequiredPortfolio komen, niet uit
    // de simRows-eindwaarde. €915.600 zoals door /toekomst getoond.
    expect(container.textContent).toContain('915')
  })

  it('historische curve render als stippellijn (strokeDasharray)', () => {
    const { container } = render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([90_000, 95_000, 100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simRows={buildSimRows(35, 52, 100_000)}
      />,
    )
    // Zoek paths met stroke-dasharray (history is dashed, projectie niet)
    const paths = container.querySelectorAll('path[stroke-dasharray]')
    expect(paths.length).toBeGreaterThan(0)
  })
})
