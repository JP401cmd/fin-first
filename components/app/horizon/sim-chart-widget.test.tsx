/**
 * Regressietest voor SimChartModal / SimChartWidget — de "Onder de motorkap"-
 * Kassabon toont het BRUTO PROFIELRENDEMENT (prop `grossReturn`), niet meer een
 * hardcoded 7% (`DEFAULT_RETURN`).
 *
 * Bug (Notion 394f9e8d…): de uitleg-regel las een module-scope constante i.p.v.
 * het rendement waarmee de projectie al is doorgerekend. Willem-profiel (6%) en
 * Marijke-profiel (5%) toonden beide 7%. Deze test pint de weergegeven waarde
 * tegen de prop, zodat display-drift zichtbaar wordt.
 *
 * Heavy children (ShellOverlay/SimChart/ZoomableChartContainer/walkthrough)
 * worden gestubt — de test focust op de Kassabon-onderbouwingsregel.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { SimResult, SimRow } from '@/lib/fire-simulation'
import { SimChartModal, SimChartWidget } from './sim-chart-widget'

// ── Mocks: stub de zware, hier-niet-relevante subcomponenten ────────────────
vi.mock('@/components/app/shell/shell-overlay', () => ({
  ShellOverlay: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="shell-overlay">{children}</div> : null,
}))
vi.mock('@/components/app/horizon/sim-chart', () => ({
  SimChart: () => <div data-testid="sim-chart" />,
}))
vi.mock('@/components/app/horizon/zoomable-chart-container', () => ({
  ZoomableChartContainer: ({
    children,
  }: {
    children: (min: number, max: number) => React.ReactNode
  }) => <>{children(30, 90)}</>,
}))
vi.mock('@/components/app/horizon/grafiek-uitleg/grafiek-uitleg-walkthrough', () => ({
  GrafiekUitlegWalkthrough: () => <div data-testid="walkthrough" />,
}))

// ── Fixtures ────────────────────────────────────────────────────────────────
function makeRow(partial: Partial<SimRow> = {}): SimRow {
  return {
    age: 40,
    phase: 'accumulation',
    startPortfolio: 100_000,
    growth: 5_000,
    savings: 12_000,
    withdrawal: 0,
    cashflowNet: 0,
    oneTimeNet: 0,
    endPortfolio: 117_000,
    grossIncome: 0,
    grossExpenses: 0,
    flowIn: 0,
    flowOut: 0,
    ...partial,
  }
}

function makeSimResult(): SimResult {
  return {
    rows: [makeRow(), makeRow({ age: 65, phase: 'retirement', savings: 0, withdrawal: 30_000 })],
    fireAge: 65,
    fireAgeFractional: 65.0,
    firePortfolioAtFire: 800_000,
    requiredFirePortfolio: 750_000,
    fireReachable: true,
    implicitWithdrawalRate: 0.04,
    classic25xTarget: 750_000,
    strategy: 'deplete',
    targetEndPortfolio: 0,
    displayEndAge: 90,
  }
}

function openMotorkap() {
  fireEvent.click(screen.getByRole('button', { name: /onder de motorkap/i }))
}

// ── Tests ───────────────────────────────────────────────────────────────────
describe('SimChartModal — bruto rendement volgt profielprop (geen hardcoded 7%)', () => {
  it('toont Willem-profiel 6% (grossReturn 0.06), niet 7%', () => {
    render(
      <SimChartModal
        open
        onClose={vi.fn()}
        simResult={makeSimResult()}
        cashflows={[]}
        currentAge={40}
        retirementExpenseMethod={null}
        yearlyExpenses={30_000}
        grossReturn={0.06}
      />,
    )
    openMotorkap()
    expect(screen.getByText('6% per jaar')).toBeTruthy()
    expect(screen.queryByText('7% per jaar')).toBeNull()
  })

  it('toont Marijke-profiel 5% (grossReturn 0.05), niet 7%', () => {
    render(
      <SimChartModal
        open
        onClose={vi.fn()}
        simResult={makeSimResult()}
        cashflows={[]}
        currentAge={40}
        retirementExpenseMethod={null}
        yearlyExpenses={30_000}
        grossReturn={0.05}
      />,
    )
    openMotorkap()
    expect(screen.getByText('5% per jaar')).toBeTruthy()
    expect(screen.queryByText('7% per jaar')).toBeNull()
  })
})

describe('SimChartWidget — geeft grossReturn door aan de interne modal', () => {
  it('opent de modal en toont het doorgegeven profielrendement (6%)', () => {
    render(
      <SimChartWidget
        simResult={makeSimResult()}
        cashflows={[]}
        currentAge={40}
        retirementExpenseMethod={null}
        yearlyExpenses={30_000}
        grossReturn={0.06}
      />,
    )
    // Open de detail-modal via de klikbare card.
    fireEvent.click(screen.getByRole('button', { name: /bekijk simulatie prognose details/i }))
    openMotorkap()
    expect(screen.getByText('6% per jaar')).toBeTruthy()
    expect(screen.queryByText('7% per jaar')).toBeNull()
  })
})
