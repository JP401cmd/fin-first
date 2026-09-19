import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { GrondslagEditor } from './grondslag-editor'
import { PLAN_REVIEW_EDITORS } from './editors'
import { CashflowGrondslagBody, useCashflowGrondslag } from '@/components/overview/cashflow-grondslag-body'
import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'
import type { PlanReviewEditorContext } from '@/lib/plan-review/editor-context'

/**
 * W-009 — ÉÉN BODY, TWEE HOSTS.
 *
 * Deze suite pint dat de wizard-stap "Waar je cijfers op rusten" géén tweede formulier
 * is: hij rendert dezelfde `CashflowGrondslagBody` met dezelfde velden en dezelfde
 * schrijfroute (`PUT /api/parameters`) als het instellingenblok op /overzicht. En dat
 * hij zijn KOPNIVEAU van de host krijgt — in de wizard hangt de body onder de stapnaam
 * (`h4`), dus `h5`; een `h2` daar zou een niveau overslaan (ADR 0110).
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))

const maand = (label: string) => ({ label, income: 4000, expenses: 3000 })

/**
 * Alleen de velden die de body leest; de rest van `CashflowSettingsData` raakt deze
 * body niet. Vandaar één bewuste cast in plaats van een tweede volledige fixture naast
 * die van `cashflow-instellingen-blok.test.tsx`.
 */
const BUNDEL = {
  estimatedAnnualIncome: 48000,
  incomeMonths: 12,
  netMonthlyIncome: 4000,
  estimatedMonthlyExpenses: 3000,
  computedMonthlyExpenses: 3000,
  effectiveSavingsRatePct: 25,
  savingsRate6m: 25,
  savingsRateMethod: 'transaction',
  savingsBudgetTotal6m: 0,
  debtAflossingTotal6m: 0,
  dailyExpenseRate: (3000 * 12) / 365,
  dailyExpenseRateSource: 'transactions',
  incomeSource: 'manual',
  expensesSource: 'manual',
  incomeBasis: 'manual',
  expensesBasis: 'manual',
  monthlyBreakdown: Array.from({ length: 12 }, (_, i) => maand(`maand ${i + 1}`)),
  budgetIncome: {
    annualTotal: 60000,
    monthlyTotal: 5000,
    entries: [
      {
        id: 'inc-1',
        name: 'Salaris',
        annualAmount: 60000,
        interval: 'monthly',
        excluded: false,
        source: 'realized',
        realizedMonths: 12,
        plannedAnnualAmount: 60000,
      },
    ],
    hasBudgets: true,
    allExcluded: false,
    realizedWindowMonths: 12,
    truncationSuspected: false,
  },
  budgetExpenses: {
    annualTotal: 24000,
    monthlyTotal: 2000,
    entries: [
      {
        id: 'exp-1',
        name: 'Vaste lasten',
        annualAmount: 24000,
        interval: 'monthly',
        excluded: false,
        source: 'realized',
        realizedMonths: 12,
        plannedAnnualAmount: 24000,
      },
    ],
    hasBudgets: true,
    allExcluded: false,
    realizedWindowMonths: 12,
    truncationSuspected: false,
  },
} as unknown as CashflowSettingsData

const LEGE_CONTEXT: PlanReviewEditorContext = {
  snapshot: null,
  firePlan: null,
  potRules: null,
  potBalances: null,
  woning: null,
  inkomsten: null,
  laag2: null,
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).startsWith('/api/overzicht/cashflow-settings')) {
      return { ok: true, json: async () => BUNDEL } as unknown as Response
    }
    return { ok: true, json: async () => ({ cashflow_basis_prefs: { v: 1 } }) } as unknown as Response
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('GrondslagEditor — de wizard-stap hergebruikt de bestaande body', () => {
  it('staat als editor van de stap "grondslag" geregistreerd', () => {
    expect(PLAN_REVIEW_EDITORS.grondslag).toBe(GrondslagEditor)
  })

  it('toont dezelfde drie blokken als het instellingenblok, met h5-koppen', async () => {
    const { container } = render(
      <GrondslagEditor context={LEGE_CONTEXT} onActionsChange={() => {}} onSaved={() => {}} />,
    )

    await screen.findByText('Waar komt je inkomen vandaan?')
    expect(screen.getByText('Waar komen je uitgaven vandaan?')).toBeInTheDocument()
    expect(screen.getByText('Wat je overhoudt aan vrijheid')).toBeInTheDocument()

    // Kopniveau komt van de host: onder de stapnaam (h4) hoort h5, nooit h2.
    expect(container.querySelectorAll('h5')).toHaveLength(3)
    expect(container.querySelector('h2')).toBeNull()
  })

  it('een grondslagkeuze schrijft via dezelfde route als het bestaande scherm', async () => {
    const { container } = render(
      <GrondslagEditor context={LEGE_CONTEXT} onActionsChange={() => {}} onSaved={() => {}} />,
    )
    await screen.findByText('Waar komt je inkomen vandaan?')
    // Eerste radio van de inkomen-groep = "Uit je budgetten" (de inputs zijn sr-only).
    const radio = container.querySelectorAll<HTMLInputElement>('input[type="radio"]')[0]

    fireEvent.click(radio)

    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([url]) => url === '/api/parameters')
      expect(put).toBeTruthy()
      expect(JSON.parse(String((put![1] as RequestInit).body))).toMatchObject({ income_source: 'budget' })
    })
  })

  it('publiceert changed:false — er valt niets op te slaan, de pane toont "Bevestigen"', async () => {
    const acties = vi.fn()
    render(<GrondslagEditor context={LEGE_CONTEXT} onActionsChange={acties} onSaved={() => {}} />)
    await screen.findByText('Waar komt je inkomen vandaan?')
    await waitFor(() => expect(acties).toHaveBeenCalled())
    const laatste = acties.mock.calls.at(-1)![0]
    expect(laatste.changed).toBe(false)
    expect(laatste.canSave).toBe(false)
  })
})

describe('CashflowGrondslagBody — hetzelfde op een andere host', () => {
  function Host({ kop }: { kop: 'h2' | 'h5' }) {
    const ctrl = useCashflowGrondslag(BUNDEL)
    return <CashflowGrondslagBody ctrl={ctrl} kop={kop} />
  }

  it('dezelfde velden, alleen een ander kopniveau', () => {
    const a = render(<Host kop="h2" />)
    const h2Koppen = [...a.container.querySelectorAll('h2')].map((el) => el.textContent)
    const a2Radios = a.container.querySelectorAll('input[type="radio"]').length
    a.unmount()

    const b = render(<Host kop="h5" />)
    const h5Koppen = [...b.container.querySelectorAll('h5')].map((el) => el.textContent)

    expect(h5Koppen).toEqual(h2Koppen)
    expect(b.container.querySelectorAll('input[type="radio"]').length).toBe(a2Radios)
  })
})
