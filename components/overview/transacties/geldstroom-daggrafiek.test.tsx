/**
 * UR3-28 fase 2b — de daggrafiek op de transactiepagina.
 *
 * Runtime-assertie op de getóónde cijfers: de footer-KPI's worden gepind tegen
 * `summarizeFlow` over dezelfde input, en de staven tegen `summarizeFlow` per
 * dag. Zo is weergave-drift (verkeerd veld, verkeerde grondslag, transfers die
 * alsnog meetellen) zichtbaar in de suite in plaats van pas op het scherm.
 *
 * Verder vastgelegd:
 *  · de maandlimiet onder "Uitgaven" telt alleen BLADEREN (een parent met
 *    kinderen zou dubbeltellen);
 *  · de y-as-labels lopen door de privacy-maskering — op de cashflow-hub stond
 *    daar een kale `formatCurrency` die dwars door de privacy-modus heen las.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { PrivacyProvider, useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { MASKED_AMOUNT_PLACEHOLDER, formatCurrencyDecimals } from '@/lib/format'
import { summarizeFlow, type AnalysisTransaction } from '@/lib/transaction-insights'
import type { Budget } from '@/lib/budget-data'
import { GeldstroomDaggrafiek } from './geldstroom-daggrafiek'

afterEach(cleanup)

function tx(id: string, date: string, amount: number, type: string | null = null): AnalysisTransaction {
  return {
    id,
    date,
    amount,
    description: 'Boeking',
    counterparty_name: null,
    counterparty_iban: null,
    budget_id: null,
    category: null,
    account_id: 'acc-1',
    account_name: 'Betaalrekening',
    is_income: amount > 0,
    transaction_type: type,
    bank_code: null,
    running_balance: null,
    creditor_id: null,
    fx_amount: null,
    fx_currency: null,
    fx_rate: null,
  }
}

function budget(over: Partial<Budget> & { id: string; name: string }): Budget {
  return {
    user_id: 'u1',
    parent_id: null,
    slug: null,
    icon: '',
    description: null,
    default_limit: 0,
    budget_type: 'expense',
    interval: 'monthly',
    rollover_type: 'reset',
    limit_type: 'soft',
    alert_threshold: 0,
    max_single_transaction_amount: 0,
    is_essential: false,
    priority_score: 0,
    is_inflation_indexed: false,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ownership: 'personal',
    household_id: null,
    goal_type: null,
    ...over,
  } as Budget
}

// Juni 2026, een AFGESLOTEN maand gezien vanaf `NOW` — dan is de forecast
// 'actual' en toont de footer de netto eindstand in plaats van een prognose.
const NOW = new Date(2026, 7, 12) // 12 augustus 2026
const MONTH_START = '2026-06-01'

const TXNS: AnalysisTransaction[] = [
  tx('t1', '2026-06-01', 2400),
  tx('t2', '2026-06-03', -900),
  tx('t3', '2026-06-03', -120),
  tx('t4', '2026-06-17', -240),
  tx('t5', '2026-06-28', -60),
  tx('t6', '2026-06-05', -5000, 'transfer'), // telt in geen enkel cijfer mee
  tx('t7', '2026-06-09', -4000, 'joint_transfer'), // C6-grens: telt hier WEL mee
]

// Parent mét kinderen (mag niet dubbeltellen) + één blad.
const BUDGETS = [
  budget({ id: 'b-parent', name: 'Boodschappen', default_limit: 999 }),
  budget({ id: 'b-child', name: 'Supermarkt', parent_id: 'b-parent', default_limit: 300 }),
  budget({ id: 'b-wonen', name: 'Wonen', default_limit: 900 }),
  budget({ id: 'b-spaar', name: 'Sparen', budget_type: 'savings', default_limit: 500 }),
]

const SUMMARY = summarizeFlow(TXNS)

function renderChart(extra?: React.ReactNode) {
  return render(
    <PrivacyProvider>
      {extra}
      <GeldstroomDaggrafiek
        transactions={TXNS}
        priorTransactions={[]}
        budgets={BUDGETS}
        summary={SUMMARY}
        monthStart={MONTH_START}
        monthLabel="juni 2026"
        now={NOW}
      />
    </PrivacyProvider>,
  )
}

describe('GeldstroomDaggrafiek — footer-KPI\'s', () => {
  it('toont exact summarizeFlow(...).income / .expense / .net', () => {
    const { container } = renderChart()
    const text = container.textContent ?? ''

    expect(text).toContain(formatCurrencyDecimals(SUMMARY.income))
    expect(text).toContain(formatCurrencyDecimals(SUMMARY.expense))
    // Afgesloten maand → 'Netto', niet 'Prognose'.
    expect(screen.getByText('Netto')).toBeTruthy()
    expect(screen.queryByText('Prognose')).toBeNull()
    expect(SUMMARY.net).toBeLessThan(0) // negatief → geen '+'-prefix
    expect(text).toContain(formatCurrencyDecimals(SUMMARY.net))
  })

  it('telt alleen blad-budgetten mee in de maandlimiet', () => {
    const { container } = renderChart()
    // Blad-expense-budgetten: Supermarkt (300) + Wonen (900) = 1.200.
    // De parent (999) telt niet mee, het savings-budget (500) evenmin.
    expect(container.textContent).toContain(formatCurrencyDecimals(1200))
    expect(container.textContent).not.toContain(formatCurrencyDecimals(2199))
  })

  it('sluit `transfer` uit, zoals de periode-samenvatting', () => {
    const { container } = renderChart()
    expect(container.textContent).not.toContain(formatCurrencyDecimals(5000))
  })
})

describe('GeldstroomDaggrafiek — staven per dag', () => {
  it('tekent één staaf per dag met beweging, met dezelfde dagtotalen als summarizeFlow', () => {
    const { container } = renderChart()
    const svg = container.querySelector('svg')!
    const rects = Array.from(svg.querySelectorAll('rect'))

    const dagenMetInkomen = new Set(
      TXNS.filter((t) => summarizeFlow([t]).income > 0).map((t) => t.date),
    )
    const dagenMetUitgave = new Set(
      TXNS.filter((t) => summarizeFlow([t]).expense > 0).map((t) => t.date),
    )

    expect(rects.filter((r) => r.getAttribute('fill') === 'var(--positive)')).toHaveLength(
      dagenMetInkomen.size,
    )
    expect(rects.filter((r) => r.getAttribute('fill') === 'var(--negative)')).toHaveLength(
      dagenMetUitgave.size,
    )

    // 3 juni draagt twee uitgaven; die horen op één staaf te staan.
    expect(dagenMetUitgave.has('2026-06-03')).toBe(true)
    expect(summarizeFlow(TXNS.filter((t) => t.date === '2026-06-03')).expense).toBe(1020)
  })

  it('rendert 30 x-as-slots voor juni (maand-vormig)', () => {
    const { container } = renderChart()
    // Dag-labels: 1, 5, 10, 15, 20, 25, 30 (30 valt samen met de laatste dag).
    const labels = Array.from(container.querySelectorAll('svg text'))
      .map((t) => t.textContent)
      .filter((t) => t && /^\d+$/.test(t))
    expect(labels).toEqual(['1', '5', '10', '15', '20', '25', '30'])
  })
})

describe('GeldstroomDaggrafiek — privacy', () => {
  function MaskToggle() {
    const { setMasked } = useMaskedAmounts()
    return (
      <button type="button" data-testid="mask-on" onClick={() => setMasked(true)}>
        masker
      </button>
    )
  }

  it('maskeert ook de y-as-labels in de privacy-modus', () => {
    const { container } = renderChart(<MaskToggle />)
    const axisBefore = Array.from(container.querySelectorAll('svg text'))
      .map((t) => t.textContent ?? '')
      .filter((t) => t.includes('€'))
    expect(axisBefore.length).toBeGreaterThan(0)

    fireEvent.click(screen.getByTestId('mask-on'))

    const axisAfter = Array.from(container.querySelectorAll('svg text'))
      .map((t) => t.textContent ?? '')
      .filter((t) => t.trim().length > 0 && !/^\d+$/.test(t.trim()))
    expect(axisAfter.every((t) => t.includes(MASKED_AMOUNT_PLACEHOLDER))).toBe(true)
    expect(container.textContent).not.toContain(formatCurrencyDecimals(SUMMARY.income))
  })
})
