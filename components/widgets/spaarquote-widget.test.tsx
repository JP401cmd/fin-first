import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { SpaarquoteWidget } from './spaarquote-widget'
import { MOCK_DASHBOARD_DATA } from '@/lib/mock-dashboard-data'
import type { DashboardData } from './widget-renderer'

// Stuurbaar perspectief — default personal.
const mockPerspective = { perspective: 'personal' as string, partnerName: null as string | null }
vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => mockPerspective,
}))

beforeEach(() => {
  mockPerspective.perspective = 'personal'
  mockPerspective.partnerName = null
})

// jsdom kent geen ResizeObserver; WidgetShell gebruikt 'm bij full-size.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

function makeData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    ...MOCK_DASHBOARD_DATA,
    // Deterministische historie in het verleden zodat de huidige maand nooit
    // gesnapshot is → de live 6m-quote wordt altijd als 'nu'-anker toegevoegd.
    savingsHistory: [
      { month: '2020-01', value: 20 },
      { month: '2020-02', value: 24 },
    ],
    monthlyIncome: 5200,
    monthlyExpenses: 3100,
    // De MÉTING (9,5 %) en het GETOONDE getal (27 %) staan bewust uit elkaar:
    // zou de widget terugvallen op `savingsRate6m`, dan valt dat luid om.
    savingsRate6m: 9.5,
    effectiveSavingsRatePct: 27,
    effectiveMonthlySavings: 1404, // 5200 × 27 % — NIET income−expenses (=2100)
    savingsRateIncomeBasis: 'budget',
    savingsRateExpensesBasis: 'budget',
    savingsRateIsEstimate: false,
    monthlySavingsBudgetSpent: 0,
    ...overrides,
  }
}

describe('SpaarquoteWidget — consumeert canonieke bundel-velden (geen inline herberekening)', () => {
  it('eigen perspectief (full): toont de EFFECTIEVE quote + het bijbehorende maandbedrag, niet de 6m-meting en niet income−expenses', () => {
    const { container } = render(<SpaarquoteWidget size="full" data={makeData()} />)
    // %-getal = data.effectiveSavingsRatePct (het app-brede spaarquote-getal)
    expect(container.textContent).toContain('27.0%')
    // …en nadrukkelijk NIET de rauwe 6-maands transactiemeting.
    expect(container.textContent).not.toContain('9.5%')
    // €-bedrag = data.effectiveMonthlySavings (zelfde grondslag als de quote),
    // niet 2.100 (income−expenses).
    expect(container.textContent).toContain('1.404')
    expect(container.textContent).not.toContain('2.100')
  })

  it('benoemt zijn grondslag op de kaart (ADR 0103), met dezelfde woorden als het instellingenblok', () => {
    const { container } = render(<SpaarquoteWidget size="full" data={makeData()} />)
    expect(container.textContent).toContain('uit je budgetten')
  })

  it('F3 — delta komt uit de snapshot-serie (laatste snapshot 24% → nu-anker 27% = +3,0%), niet uit prevMonth-inkomsten', () => {
    const { container } = render(<SpaarquoteWidget size="full" data={makeData()} />)
    expect(container.textContent).toContain('3.0% t.o.v. vorige maand')
  })

  it('F4 — markeert een geschatte quote alleen wanneer het getoonde getal ÉCHT de 6m-meting is', () => {
    // Beide grondslagen op transacties ⇒ de getoonde quote ÍS de meting ⇒ de
    // schattingsmarkering slaat op wat er staat.
    const opTransacties = {
      savingsRateIncomeBasis: 'transaction' as const,
      savingsRateExpensesBasis: 'transaction' as const,
    }
    const est = render(
      <SpaarquoteWidget size="full" data={makeData({ ...opTransacties, savingsRateIsEstimate: true })} />,
    )
    expect(est.container.textContent).toContain('geschat')

    const exact = render(
      <SpaarquoteWidget size="full" data={makeData({ ...opTransacties, savingsRateIsEstimate: false })} />,
    )
    expect(exact.container.textContent).not.toContain('geschat')
  })

  it('L5 — partner-perspectief draagt GEEN grondslag-label (ander persoon, andere bron)', () => {
    mockPerspective.perspective = 'partner'
    mockPerspective.partnerName = 'Sam'
    const data = makeData({
      partnerOverrides: {
        netWorth: 100_000, totalAssets: 120_000, totalDebts: 20_000,
        monthlyExpenses: 2000, monthlyIncome: 3000,
        savingsRate: 33.3, monthlySavings: 999,
      },
    })
    const { container } = render(<SpaarquoteWidget size="full" data={data} />)
    expect(container.textContent).toContain('33.3%')
    // Het getal komt uit de partner-RPC, niet uit ónze grondslagkeuze — een label
    // over onze grondslag zou daar misleiden.
    expect(container.textContent).not.toContain('uit je budgetten')
  })

  it('F4b — markeert NIET als geschat wanneer de quote uit de eigen grondslagkeuze komt', () => {
    // `savingsRateIsEstimate` gaat over de 6-maands MÉTING. Staat de gebruiker op
    // budgetten, dan is het getoonde getal zijn eigen keuze en zou "geschat" liegen.
    const { container } = render(
      <SpaarquoteWidget size="full" data={makeData({ savingsRateIsEstimate: true })} />,
    )
    expect(container.textContent).toContain('27.0%')
    expect(container.textContent).not.toContain('geschat')
  })

  it('F2 — huishoud-perspectief consumeert de override-spaarquote (41,5%), niet de eigen 27% of een inline (income−expenses)-formule', () => {
    mockPerspective.perspective = 'household'
    const data = makeData({
      householdOverrides: {
        netWorth: 500_000,
        totalAssets: 560_000,
        totalDebts: 60_000,
        monthlyExpenses: 5000,
        monthlyIncome: 8000,
        savingsRate: 41.5,      // canoniek via savingsRateFromAggregates
        monthlySavings: 3320,   // 8000 × 41,5% — dezelfde grondslag als de quote
      },
    })
    const { container } = render(<SpaarquoteWidget size="full" data={data} />)
    expect(container.textContent).toContain('41.5%')
    // Niet de eigen (persoonlijke) effectieve quote van 27%.
    expect(container.textContent).not.toContain('27.0%')
    // L5 — de huishoud-quote rust op DEZELFDE grondslagkeuze, dus het label hoort
    // er ook te staan (ADR 0121: elk oppervlak benoemt zijn grondslag).
    expect(container.textContent).toContain('uit je budgetten')
    // Consumeert het override-spaarbedrag, niet income−expenses (=3.000).
    expect(container.textContent).toContain('3.320')
    expect(container.textContent).not.toContain('3.000')
  })
})
