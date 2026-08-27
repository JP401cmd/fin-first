import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Tests voor de €→vrijheidstijd-NOEMER van de Box 3-keten (kaart M22).
 *
 * De heffing zelf (`calculateBox3.tax`) is hier niet in het geding — die is
 * onafhankelijk van `dailyExpenses`. Wat wél in het geding was: `loadPerspectiveBox3`
 * leidde het dagtarief af uit de som van budget-LIMIETEN gedeeld door 30, met
 * een hardgecodeerde terugval van €100/dag. Twee afwijkingen tegelijk van de
 * canonieke keten (`lib/expense-rate.ts`: 12-mnd rolling GEREALISEERDE uitgaven
 * ×12/365), waardoor dezelfde heffing op /overzicht/belasting/box3 een ander
 * aantal vrijheidsdagen droeg dan op de hub, de widget en de optimizer.
 *
 * We mocken de twee DB-randen (`loadPerspectiveData` + `getRecentDailyExpenseRate`)
 * en laten de ECHTE `calculateBox3` draaien, zodat we toetsen wat er werkelijk
 * de motor in gaat.
 */

import type { PerspectiveBox3Data } from './household-tax'

const loadPerspectiveDataMock = vi.fn()
const getRecentDailyExpenseRateMock = vi.fn()

vi.mock('./household/perspective-loader', () => ({
  loadPerspectiveData: (...args: unknown[]) => loadPerspectiveDataMock(...args),
}))
vi.mock('./expense-rate', () => ({
  getRecentDailyExpenseRate: (...args: unknown[]) => getRecentDailyExpenseRateMock(...args),
}))

const { loadPerspectiveBox3 } = await import('./household-tax')

/** Minimale supabase-dubbel: alleen wat `resolveCanonicalDailyExpenses` raakt. */
function makeSupabase(estimatedMonthlyExpenses: number | null = null) {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { estimated_monthly_expenses: estimatedMonthlyExpenses },
          }),
        }),
      }),
    }),
  } as never
}

/** Eén spaarrekening ruim boven de vrijstelling → een positieve heffing. */
const ASSETS = [
  {
    id: 'a1',
    asset_type: 'savings',
    current_value: 250_000,
    is_active: true,
    ownership: 'personal',
    _provenance: 'eigen',
    _myShareFraction: 1,
  },
]

/**
 * Budget-LIMIETEN die de OUDE afleiding zou hebben gebruikt: €5.300/mnd → €176,67
 * per dag. Ze staan hier bewust ver van het canonieke tarief zodat een terugval
 * op de oude keten meteen zichtbaar zou zijn.
 */
const BUDGETS = [
  {
    id: 'b1',
    budget_type: 'expense',
    default_limit: 5_300,
    ownership: 'personal',
    _provenance: 'eigen',
    _myShareFraction: 1,
  },
]

const SOLO_CONTEXT = {
  userId: 'u1',
  hasHousehold: false,
  householdId: null,
  partnerName: null,
  partnerPrivacy: null,
}

function primeLoader(overrides: Record<string, unknown> = {}) {
  loadPerspectiveDataMock.mockResolvedValue({
    perspective: 'personal',
    context: SOLO_CONTEXT,
    assets: ASSETS,
    debts: [],
    budgets: BUDGETS,
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadPerspectiveBox3 — canonieke dagtarief-noemer (M22)', () => {
  it('voedt calculateBox3 het CANONIEKE dagtarief, niet de budget-limieten ÷ 30', async () => {
    // 12-mnd rolling gerealiseerde uitgaven van €993/mnd → €32,64/dag.
    getRecentDailyExpenseRateMock.mockResolvedValue({
      dailyRate: 32.64,
      monthlyExpenses: 993,
      dataMonths: 12,
      source: 'transactions',
    })
    primeLoader()

    const data: PerspectiveBox3Data = await loadPerspectiveBox3(
      makeSupabase(),
      'personal',
      2026,
    )

    expect(data.dailyExpenses).toBeCloseTo(32.64, 10)
    // De oude noemer zou 5300/30 = 176,67 zijn geweest — ruim 5× zo hoog.
    expect(data.dailyExpenses).not.toBeCloseTo(5300 / 30, 2)
    // Het tarief reist ONVERANDERD door naar de motor en dus naar het resultaat.
    expect(data.personal.dailyExpenses).toBeCloseTo(32.64, 10)
  })

  it('markeert het tarief als persoonlijk, ook in huishoud-weergave', async () => {
    getRecentDailyExpenseRateMock.mockResolvedValue({
      dailyRate: 100,
      monthlyExpenses: 3041.67,
      dataMonths: 12,
      source: 'transactions',
    })
    primeLoader()

    const data = await loadPerspectiveBox3(makeSupabase(), 'household', 2026)

    // Zonder partner-transacties is er geen eerlijk huishoud-dagtarief; de grens
    // wordt BENOEMD in plaats van stil overschreden (ADR 0107-patroon).
    expect(data.dailyExpensesPerspective).toBe('personal')
    expect(data.dailyExpensesSource).toBe('transactions')
  })

  it('geen transacties én geen schatting → tarief 0, GEEN verzonnen €100/dag', async () => {
    getRecentDailyExpenseRateMock.mockResolvedValue({
      dailyRate: 0,
      monthlyExpenses: 0,
      dataMonths: 0,
      source: 'none',
    })
    primeLoader()

    const data = await loadPerspectiveBox3(makeSupabase(), 'personal', 2026)

    expect(data.dailyExpenses).toBe(0)
    expect(data.dailyExpensesSource).toBe('none')
    // De heffing blijft gewoon staan; alleen de TIJDregel valt weg.
    expect(data.personal.tax).toBeGreaterThan(0)
    expect(data.personal.freedomDays).toBe(0)
  })

  it('geen transacties maar wél een profielschatting → die schatting voedt het tarief', async () => {
    getRecentDailyExpenseRateMock.mockResolvedValue({
      dailyRate: (2400 * 12) / 365,
      monthlyExpenses: 2400,
      dataMonths: 0,
      source: 'estimate',
    })
    primeLoader()

    const data = await loadPerspectiveBox3(makeSupabase(2400), 'personal', 2026)

    expect(data.dailyExpensesSource).toBe('estimate')
    expect(data.dailyExpenses).toBeCloseTo((2400 * 12) / 365, 10)
    // De profielschatting wordt als TERUGVAL doorgegeven aan de canonieke bron —
    // niet zelf omgerekend (dat zou een tweede conversie zijn).
    expect(getRecentDailyExpenseRateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Date),
      2400,
    )
  })

  it('een meegegeven tarief wint: geen tweede query op hetzelfde venster', async () => {
    primeLoader()

    const data = await loadPerspectiveBox3(makeSupabase(), 'personal', 2026, 'Jij', {
      dailyRate: 88.5,
      monthlyExpenses: 2692.19,
      dataMonths: 12,
      source: 'transactions',
    })

    expect(data.dailyExpenses).toBeCloseTo(88.5, 10)
    expect(getRecentDailyExpenseRateMock).not.toHaveBeenCalled()
  })

  it('budgetten spelen GEEN rol meer in het dagtarief', async () => {
    getRecentDailyExpenseRateMock.mockResolvedValue({
      dailyRate: 50,
      monthlyExpenses: 1520.83,
      dataMonths: 12,
      source: 'transactions',
    })

    primeLoader({ budgets: [] })
    const zonderBudgetten = await loadPerspectiveBox3(makeSupabase(), 'personal', 2026)

    primeLoader()
    const metBudgetten = await loadPerspectiveBox3(makeSupabase(), 'personal', 2026)

    expect(zonderBudgetten.dailyExpenses).toBe(metBudgetten.dailyExpenses)
    expect(zonderBudgetten.personal.freedomDays).toBe(metBudgetten.personal.freedomDays)
  })
})
