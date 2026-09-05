import { describe, it, expect, vi } from 'vitest'
import { render as rtlRender, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MiniNetWorthChart } from './mini-networth-chart'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

/**
 * ADR 0129 F3b (bevinding 1) — de minigrafiek onder een VAST stopmoment: de knip
 * ligt op het stopmoment ("Vermogen bij stop"), en "bereikt" staat er alleen bij
 * framing 'free' — nooit omdat de kernel-`fireAge` (= het anker) ≤ de huidige
 * leeftijd is. Vóór F3b las een nu-stoppen-gebruiker hier "Vrijheid bereikt".
 */
function render(ui: ReactElement, mode: DisplayMode = 'full') {
  return rtlRender(<DisplayModeProvider initialMode={mode}>{ui}</DisplayModeProvider>)
}

function buildHistory(values: number[]): { month: string; value: number }[] {
  return values.map((value, i) => {
    const d = new Date(2025, i, 1)
    return { month: d.toISOString().slice(0, 7), value }
  })
}

function buildSimRows(startAge: number, endAge: number, startValue: number): { age: number; netWorth: number }[] {
  const rows: { age: number; netWorth: number }[] = []
  let value = startValue
  for (let age = startAge; age <= endAge; age++) {
    value = value * 1.05
    rows.push({ age, netWorth: Math.round(value) })
  }
  return rows
}

describe('MiniNetWorthChart — vast stopmoment', () => {
  it('nu-anker (fireAge = huidige leeftijd), niet gedekt: geen "bereikt", wel "Vermogen bij stop"', () => {
    const { container } = render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([90_000, 95_000, 100_000])}
        currentNetWorth={100_000}
        currentAge={47}
        fireAge={47}
        endAge={90}
        stopAnchorFixed
        stopAge={47}
        framing="anchored"
        simNetWorthRows={buildSimRows(47, 90, 100_000)}
      />,
    )
    expect(container.textContent).not.toMatch(/bereikt/i)
    expect(screen.getByText(/Vermogen bij stop/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/Vrijheid \d/)
  })

  it('age-anker 58: de knip ligt op het stopmoment ("Stop 58"), niet op de kernel-fireAge', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([90_000, 95_000, 100_000])}
        currentNetWorth={100_000}
        currentAge={45}
        fireAge={58}
        endAge={90}
        stopAnchorFixed
        stopAge={58}
        framing="anchored"
        simNetWorthRows={buildSimRows(45, 90, 100_000)}
      />,
    )
    expect(screen.getAllByText(/Stop 58/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Vrijheid 58/)).toBeNull()
  })

  it('anker bereikt ∧ gedekt (framing free): "Plan gedekt", geen "Vrijheid bereikt"', () => {
    const { container } = render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([90_000, 95_000, 100_000])}
        currentNetWorth={100_000}
        currentAge={68}
        fireAge={67}
        endAge={90}
        stopAnchorFixed
        stopAge={67}
        framing="free"
        simNetWorthRows={buildSimRows(68, 90, 100_000)}
      />,
    )
    expect(screen.getByText(/Plan gedekt/)).toBeTruthy()
    expect(container.textContent).not.toMatch(/Vrijheid bereikt/i)
  })

  it('solved blijft ongewijzigd: "Vrijheid 52"', () => {
    render(
      <MiniNetWorthChart
        netWorthHistory={buildHistory([90_000, 95_000, 100_000])}
        currentNetWorth={100_000}
        currentAge={35}
        fireAge={52}
        endAge={67}
        simNetWorthRows={buildSimRows(35, 52, 100_000)}
      />,
    )
    expect(screen.getAllByText(/Vrijheid 52/).length).toBeGreaterThan(0)
  })
})
