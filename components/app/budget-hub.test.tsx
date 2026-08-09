import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { BudgetHub } from './budgets-client'

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/overzicht/cashflow/budget',
}))

afterEach(() => {
  vi.restoreAllMocks()
})

type HubAlert = { id: string; name: string; spent: number; limit: number; pct: number; severity: 'over' | 'bijna' }

function makeAlerts(count: number): HubAlert[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `alert-${i}`,
    name: `Budget ${i + 1}`,
    spent: 120,
    limit: 100,
    pct: 120,
    severity: 'over' as const,
  }))
}

function renderHub(alerts: HubAlert[]) {
  const utils = render(
    <BudgetHub
      hubAlerts={alerts}
      dekkingsgraad={80}
      opSchemaCount={2}
      parentBudgetsCount={7}
      formatCurrency={(n: number) => `€ ${n}`}
      openWithMessage={vi.fn()}
      totalIncome={5000}
      teVerdelen={0}
      periodMode="maand"
      onOpenPlanEditor={vi.fn()}
      onOpenBudget={vi.fn()}
      uncategorizedCount={0}
      uncategorizedTotal={0}
      onUncategorizedClick={vi.fn()}
      coverageRatio={1}
      totalIncomeActual={5000}
      budgetingActive
    />,
  )
  // Hub start ingeklapt — open de Budgetanalyse-header
  fireEvent.click(utils.getByText('Budgetanalyse'))
  return utils
}

/**
 * BUD-3 — de ingeklapte hub-samenvatting.
 *
 * In Eenvoudig knijpen we de preview-regel terug tot maximaal twee fragmenten
 * ("1 bijna vol, € 2.540 te verdelen"); alles daarachter (KPI's incl.
 * dekkingsgraad, de aandachtslijst met alerts en de Fin-analyse) zit achter
 * dezelfde disclosure-klik. In Volledig blijft het op drie fragmenten.
 */
describe('BudgetHub — ingeklapte samenvatting Eenvoudig vs Volledig', () => {
  function renderCollapsed(simple: boolean) {
    return render(
      <BudgetHub
        hubAlerts={[
          { id: 'a1', name: 'Boodschappen', spent: 90, limit: 100, pct: 90, severity: 'bijna' },
        ]}
        dekkingsgraad={80}
        opSchemaCount={2}
        parentBudgetsCount={7}
        formatCurrency={(n: number) => `€ ${n}`}
        openWithMessage={vi.fn()}
        totalIncome={5000}
        teVerdelen={2540}
        periodMode="maand"
        simple={simple}
        onOpenPlanEditor={vi.fn()}
        onOpenBudget={vi.fn()}
        uncategorizedCount={3}
        uncategorizedTotal={120}
        onUncategorizedClick={vi.fn()}
        coverageRatio={1}
        totalIncomeActual={5000}
        budgetingActive
      />,
    )
  }

  it('simple: één regel met max 2 fragmenten — het derde valt weg', () => {
    const { getByText, queryByText } = renderCollapsed(true)
    expect(getByText('1 bijna vol')).toBeTruthy()
    expect(getByText(/€ 2540 te verdelen/)).toBeTruthy()
    expect(queryByText(/3 ongecategoriseerd/)).toBeNull()
  })

  it('simple: de hub-blokken zelf zitten achter de klik, niet in de samenvatting', () => {
    const { queryByText, getByText } = renderCollapsed(true)
    // Ingeklapt: geen dekkingsgraad-KPI, geen aandachtslijst, geen Fin-analyse.
    expect(queryByText('Dekking')).toBeNull()
    expect(queryByText('Aandacht')).toBeNull()
    expect(queryByText(/Vraag Fin/)).toBeNull()
    // Na één klik staat alles er wél — de inhoud verdwijnt niet, hij verhuist.
    fireEvent.click(getByText('Budgetanalyse'))
    expect(getByText('Dekking')).toBeTruthy()
    expect(getByText('Aandacht')).toBeTruthy()
    expect(getByText(/Vraag Fin/)).toBeTruthy()
  })

  it('full: ongewijzigd — 3 fragmenten in de samenvatting', () => {
    const { getByText } = renderCollapsed(false)
    expect(getByText('1 bijna vol')).toBeTruthy()
    expect(getByText(/€ 2540 te verdelen/)).toBeTruthy()
    expect(getByText(/3 ongecategoriseerd/)).toBeTruthy()
  })
})

describe('BudgetHub — alert-lijst toon meer/minder', () => {
  it('toont maximaal 5 alerts ingeklapt met een "toon meer"-knop', () => {
    const { getByText, queryByText } = renderHub(makeAlerts(8))

    expect(getByText('Budget 5')).toBeTruthy()
    expect(queryByText('Budget 6')).toBeNull()
    expect(getByText('Toon 3 meer meldingen…')).toBeTruthy()
  })

  it('klapt uit naar alle alerts en weer in', () => {
    const { getByText, queryByText } = renderHub(makeAlerts(8))

    fireEvent.click(getByText('Toon 3 meer meldingen…'))
    expect(getByText('Budget 8')).toBeTruthy()

    fireEvent.click(getByText('Toon minder'))
    expect(queryByText('Budget 8')).toBeNull()
    expect(getByText('Toon 3 meer meldingen…')).toBeTruthy()
  })

  it('gebruikt enkelvoud bij precies één extra melding', () => {
    const { getByText } = renderHub(makeAlerts(6))
    expect(getByText('Toon 1 meer melding…')).toBeTruthy()
  })

  it('toont geen toggle bij 5 of minder alerts', () => {
    const { getByText, queryByText } = renderHub(makeAlerts(5))
    expect(getByText('Budget 5')).toBeTruthy()
    expect(queryByText(/Toon .* meer/)).toBeNull()
    expect(queryByText('Toon minder')).toBeNull()
  })
})
