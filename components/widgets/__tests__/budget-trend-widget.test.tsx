import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { BudgetTrendWidget } from '../budget-trend-widget'
import type { DashboardData } from '../widget-renderer'

/**
 * Regressie voor de widgetreview Uitgaventrend (trend_uitgaven), 2026-07-17.
 *
 * - F1 (HOOG): de MoM-indicator kleurde vroeger `↑ = groen` voor ÁLLE types.
 *   Voor uitgaven/schuld is stíjgen slecht → hoort rood. De kleur volgt nu
 *   `TYPE_CONFIGS.goodWhenUp`; de pijl blijft de feitelijke richting.
 * - F2 (HOOG): mojibake "‰ˆ" i.p.v. "≈" vóór de vrijheidstijd-regel.
 * - XL-variant (Double): 12-maands staafhistogram met budgetband + cijferstrip.
 */

type History = { month: string; value: number }[]

function makeData(
  type: 'income' | 'expense' | 'savings' | 'debt',
  history: History,
  limit = 0,
): DashboardData {
  const empty = { month: '2026-06', value: 0 }
  return {
    dailyExpenseRate: 50,
    monthlyExpenses: 1500,
    budgetTypeHistory: {
      income: type === 'income' ? history : [empty],
      expense: type === 'expense' ? history : [empty],
      savings: type === 'savings' ? history : [empty],
      debt: type === 'debt' ? history : [empty],
    },
    budgetTotals: {
      income: { limit: type === 'income' ? limit : 0, spent: 0 },
      expense: { limit: type === 'expense' ? limit : 0, spent: 0 },
      savings: { limit: type === 'savings' ? limit : 0, spent: 0 },
      debt: { limit: type === 'debt' ? limit : 0, spent: 0 },
    },
  } as unknown as DashboardData
}

const rising: History = [
  { month: '2026-05', value: 1000 },
  { month: '2026-06', value: 1200 },
]

describe('BudgetTrendWidget — trendkleur volgt betekenis (F1)', () => {
  it('uitgaven die STIJGEN tonen rood (text-negative), niet groen', () => {
    const { container } = render(
      <BudgetTrendWidget budgetType="expense" size="half" data={makeData('expense', rising)} />,
    )
    const neg = container.querySelector('.text-negative')
    expect(neg?.textContent).toContain('20%')
    // Geen groene "verbetering" bij méér uitgeven.
    expect(container.querySelector('.text-positive')).toBeNull()
  })

  it('inkomen dat STIJGT toont groen (text-positive)', () => {
    const { container } = render(
      <BudgetTrendWidget budgetType="income" size="half" data={makeData('income', rising)} />,
    )
    const pos = container.querySelector('.text-positive')
    expect(pos?.textContent).toContain('20%')
    expect(container.querySelector('.text-negative')).toBeNull()
  })

  it('sparen dat STIJGT toont groen (text-positive)', () => {
    const { container } = render(
      <BudgetTrendWidget budgetType="savings" size="half" data={makeData('savings', rising)} />,
    )
    expect(container.querySelector('.text-positive')?.textContent).toContain('20%')
  })
})

describe('BudgetTrendWidget — vrijheidstijd-regel (F2)', () => {
  it('full-size toont "≈" en geen mojibake "‰ˆ"', () => {
    const { container } = render(
      <BudgetTrendWidget budgetType="expense" size="full" data={makeData('expense', rising)} />,
    )
    expect(container.textContent).toContain('≈')
    expect(container.textContent).not.toContain('‰ˆ')
  })
})

describe('BudgetTrendWidget — XL-variant (histogram + budgetband)', () => {
  const twelve: History = Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    value: 900 + i * 20, // 900..1120
  }))

  it('toont de cijferstrip met "Binnen budget X/12"', () => {
    const { container } = render(
      <BudgetTrendWidget budgetType="expense" size="xl" data={makeData('expense', twelve, 1000)} />,
    )
    expect(container.textContent).toContain('Binnen budget')
    // limit 1000: waarden <=1000 zijn maanden 0..5 (900..1000) => 6 van 12
    expect(container.textContent).toContain('6')
    expect(container.textContent).toContain('/12 mnd')
  })

  it('rendert een toegankelijk histogram (role=img met budgetlijn-label)', () => {
    const { container } = render(
      <BudgetTrendWidget budgetType="expense" size="xl" data={makeData('expense', twelve, 1000)} />,
    )
    const svg = container.querySelector('svg[role="img"]')
    expect(svg).toBeTruthy()
    expect(svg?.getAttribute('aria-label')).toContain('budgetlijn')
    // Eén staaf per maand.
    expect(container.querySelectorAll('rect').length).toBe(12)
  })
})

/**
 * Regressie voor de widgetreview Inkomentrend (trend_inkomen), 2026-07-17.
 * XL (dubbele breedte) voor inkomen: tot 24 maanden waar de bundel historie
 * levert, maandlabels, streeflijn en een richting-correcte "Boven streven"-telling.
 */
describe('BudgetTrendWidget — inkomen-XL (24 mnd + streven)', () => {
  const make = (months: number): History =>
    Array.from({ length: months }, (_, i) => ({
      month: `20${25 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`,
      value: 1500 + i * 50,
    }))

  it('toont tot 24 maandstaven wanneer de bundel 24 mnd levert', () => {
    const { container } = render(
      <BudgetTrendWidget budgetType="income" size="xl" data={makeData('income', make(24), 2000)} />,
    )
    // Eén staaf per maand, gecapt op het 24-mnd venster.
    expect(container.querySelectorAll('rect').length).toBe(24)
    expect(container.textContent).toContain('/24 mnd')
  })

  it('degradeert netjes naar de beschikbare historie (12 mnd)', () => {
    const { container } = render(
      <BudgetTrendWidget budgetType="income" size="xl" data={makeData('income', make(12), 2000)} />,
    )
    expect(container.querySelectorAll('rect').length).toBe(12)
    expect(container.textContent).toContain('/12 mnd')
  })

  it('gebruikt inkomen-labels ("streven", "Boven streven"), niet "budget"', () => {
    const { container } = render(
      <BudgetTrendWidget budgetType="income" size="xl" data={makeData('income', make(24), 2000)} />,
    )
    // Streven van 2000: waarden >= 2000 zijn i>=10 => 14 van 24 maanden.
    expect(container.textContent).toContain('Boven streven')
    expect(container.textContent).toContain('14')
    expect(container.textContent).not.toContain('Binnen budget')
    const svg = container.querySelector('svg[role="img"]')
    expect(svg?.getAttribute('aria-label')).toContain('strevenlijn')
  })

  it('zonder streven toont "Gem./maand" en geen telling', () => {
    const { container } = render(
      <BudgetTrendWidget budgetType="income" size="xl" data={makeData('income', make(24))} />,
    )
    expect(container.textContent).toContain('Gem./maand')
    // Geen streeflijn in de aria-tekst.
    const svg = container.querySelector('svg[role="img"]')
    expect(svg?.getAttribute('aria-label')).not.toContain('strevenlijn')
  })
})

/**
 * Regressie voor de widgetreview Spaartrend (trend_sparen), 2026-07-17.
 * XL (dubbele breedte) voor sparen: staafhistogram met per-maand waarde-labels
 * boven de staven ("sparen = vrijheid opbouwen") + doel-referentielijn. De
 * waarde-labels zijn opt-in (prop showValueLabels) zodat de andere trend-
 * varianten ongewijzigd blijven.
 */
describe('BudgetTrendWidget — sparen-XL (waarde-labels per maand)', () => {
  const twelve: History = Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    value: 900 + i * 20, // 900..1120
  }))

  it('XL is beschikbaar voor sparen en toont per-maand waarde-labels in het histogram', () => {
    const { container } = render(
      <BudgetTrendWidget budgetType="savings" size="xl" data={makeData('savings', twelve, 1000)} />,
    )
    const svg = container.querySelector('svg[role="img"]')
    expect(svg).toBeTruthy()
    // Eén staaf per maand.
    expect(container.querySelectorAll('rect').length).toBe(12)
    // Compacte waarde-labels (bv. maand 11 = 1100 → "1.1k") staan in de SVG.
    expect(svg?.textContent).toContain('1.1k')
    // Sparen-labels ("Boven doel"), niet "budget".
    expect(container.textContent).toContain('Boven doel')
    expect(container.textContent).not.toContain('Binnen budget')
  })

  it('de andere trend-varianten krijgen GÉÉN waarde-labels (opt-in prop)', () => {
    const { container } = render(
      <BudgetTrendWidget budgetType="expense" size="xl" data={makeData('expense', twelve, 1000)} />,
    )
    const svg = container.querySelector('svg[role="img"]')
    // Zonder showValueLabels verschijnen de compacte bedragen niet in de SVG.
    expect(svg?.textContent).not.toContain('1.1k')
  })
})
