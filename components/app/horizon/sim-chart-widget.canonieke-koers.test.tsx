/**
 * Bijt-proef op eigenaarsbesluit C bij UR3-08: de "Onder de motorkap"-Kassabon
 * rekent zijn euro's naar vrijheidstijd om met het CANONIEKE dagtarief uit de
 * bundel, niet met een eigen som over de projectie-uitgave.
 *
 * De bevinding: hier stond `dailyExpenseRate(yearlyExpenses / 12)`.
 * `yearlyExpenses` is `effectiveInput.yearlyMustExpenses` — FIRE-projectie-invoer
 * op de must-grondslag, in wat-als bovendien scenario-aangepast. Als weergave-KOERS
 * gaf datzelfde bedrag daardoor in deze uitleg een ander aantal "jaren vrijheid"
 * dan élk ander tijdgetal op /toekomst, die al op `canonicalDailyRate`
 * (`HorizonPageData.dailyExpenseRate`, 12-mnd rolling consumptie) staan. Precies
 * het KRUIS-20-patroon dat horizon-client zelf al gedicht had.
 *
 * WAAROM DEZE TEST BIJT: `yearlyExpenses` blíjft een prop — hij hoort als BEDRAG
 * in de kassabon ("Jaarlijkse uitgaven (pensioen)"). De verleiding om er weer een
 * koers uit af te leiden blijft dus bestaan. De fixture zet de twee grondslagen
 * expres ver uit elkaar (€ 30.000/jaar → ~€ 82/dag oud, versus € 105/dag canoniek),
 * zodat een terugval naar de eigen som een ándere vrijheidstijd rendert.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import type { SimResult, SimRow } from '@/lib/fire-simulation'
import { formatWithFreedom, dailyExpenseRate } from '@/lib/format'
import { SimChartModal } from './sim-chart-widget'

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

const START_PORTFOLIO = 100_000
const YEARLY_EXPENSES = 30_000
const CANONIEK_DAGTARIEF = 105

function makeRow(partial: Partial<SimRow> = {}): SimRow {
  return {
    age: 40,
    phase: 'accumulation',
    startPortfolio: START_PORTFOLIO,
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

function renderMotorkap(canonicalDailyRate: number) {
  render(
    <SimChartModal
      open
      onClose={vi.fn()}
      simResult={makeSimResult()}
      cashflows={[]}
      currentAge={40}
      retirementExpenseMethod={null}
      yearlyExpenses={YEARLY_EXPENSES}
      grossReturn={0.06}
      canonicalDailyRate={canonicalDailyRate}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /onder de motorkap/i }))
}

/** De vrijheidstijd-subregel zoals de Kassabon 'm bij een gegeven koers zou tonen. */
function subregel(amount: number, dailyRate: number): string {
  return (
    formatWithFreedom(amount, dailyRate, { includeCurrency: false, format: 'short' }) + ' vrijheid'
  )
}

describe('SimChartModal — de vrijheidstijd volgt het canonieke dagtarief (UR3-08, besluit C)', () => {
  it('rekent "Huidig netto vermogen" om met de doorgegeven koers, niet met yearlyExpenses/12', () => {
    renderMotorkap(CANONIEK_DAGTARIEF)

    const verwacht = subregel(START_PORTFOLIO, CANONIEK_DAGTARIEF)
    // De oude, zelf-afgeleide koers: yearlyExpenses → maand → ×12/365.
    const oud = subregel(START_PORTFOLIO, dailyExpenseRate(YEARLY_EXPENSES / 12))

    expect(
      verwacht,
      'fixture stuk: beide koersen geven dezelfde tekst, dan bewijst deze test niets',
    ).not.toBe(oud)
    expect(screen.getByText(verwacht)).toBeTruthy()
    expect(screen.queryByText(oud)).toBeNull()
  })

  it('beweegt mee met de koers terwijl yearlyExpenses gelijk blijft', () => {
    renderMotorkap(CANONIEK_DAGTARIEF)
    expect(screen.getByText(subregel(START_PORTFOLIO, CANONIEK_DAGTARIEF))).toBeTruthy()
    cleanup()

    renderMotorkap(CANONIEK_DAGTARIEF * 2)
    expect(screen.getByText(subregel(START_PORTFOLIO, CANONIEK_DAGTARIEF * 2))).toBeTruthy()
  })
})
