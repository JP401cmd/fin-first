import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * /api/uitgaven-na-pensioen/context — grondslag-pariteit met de SSR-loader.
 *
 * Given een profiel op de handmatige inkomensgrondslag (income_source 'manual',
 *   net_monthly_income €5.000) met methode 'current_income', en €82.907 aan
 *   positieve transacties over 12+ maanden,
 * When de uitgaven-na-pensioen-sheet zijn context ophaalt,
 * Then volgen `yearlyIncome` en `currentRetirementExpense` de GEKOZEN
 *   inkomensgrondslag (ADR 0103): €60.000 — identiek aan de "Na pensioen"-KPI
 *   op /toekomst (SSR-loader geeft `effectiveAnnualIncome` door aan
 *   `deriveRetirementExpenseBasis`). De rauwe transactie-extrapolatie
 *   (€82.907) mag de sheet niet laten divergeren van de pagina.
 *
 * Aanleiding: testgebruikersmelding 29-08-2026 — sheet toonde €82.907/jaar
 * ("Behoud van inkomen") terwijl de Toekomst-KPI €60.000 toonde. Zusterbug
 * van WF-TOEK-02-bug2 (zelfde route, toen het deler-anker, nu de grondslag).
 *
 * `loadBudgetBasis` draait hier bewust ONGemockt (review 29-08-2026): de
 * eerste versie van deze test mockte 'm weg en miste zo dat de route-eigen
 * kolomlijsten (`cashflow_basis_prefs`, `created_at`) achterliepen op de
 * canonieke `BUDGET_BASIS_COLUMNS` — precies de drift die deze suite moet
 * vangen.
 */

let profileRow: Record<string, unknown>

const BASE_PROFILE = {
  retirement_expense_method: 'current_income',
  retirement_expense_custom_amount: null,
  net_monthly_income: 5000,
  estimated_monthly_expenses: 3500,
  budgeting_active: true,
  feature_preferences: null,
  income_source: 'manual',
  cashflow_basis_prefs: null,
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => makeClient(),
  getAuthClaims: async () => ({ sub: 'u1' }),
}))

vi.mock('@/lib/server-data/base', () => ({
  // All-time vroegste inkomstendatum, ruim >12 maanden terug → extrapolatie
  // is de identiteit (last12Income blijft €82.907).
  getEarliestIncomeDate: async () => ({ data: { date: '2023-01-01' } }),
}))

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    rpc: async () => ({ data: [], error: null }),
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: profileRow, error: null }) }),
          }),
        }
      }
      if (table === 'transactions') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = {
          select: () => b,
          gt: () => b,
          gte: () => b,
          lt: () => Promise.resolve({ data: [{ amount: 82907, date: '2026-08-01' }], error: null }),
        }
        return b
      }
      // budgets + eventuele household-lookups uit loadBudgetBasis: leeg maar
      // geldig, op elke keten-vorm (select().eq()… of direct thenable).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {
        then: (resolve: (v: { data: unknown[]; error: null; count: number }) => unknown) =>
          Promise.resolve(resolve({ data: [], error: null, count: 0 })),
      }
      return new Proxy(b, {
        get(t, prop: string) {
          if (prop in t) return t[prop]
          return () => new Proxy(b, this as ProxyHandler<typeof b>)
        },
      })
    },
  }
}

describe('GET /api/uitgaven-na-pensioen/context — inkomensgrondslag (ADR 0103)', () => {
  beforeEach(() => {
    vi.resetModules()
    profileRow = { ...BASE_PROFILE }
  })

  it('volgt bij income_source=manual de handmatige grondslag, niet de transactie-extrapolatie', async () => {
    const { GET } = await import('./route')
    const res = await GET()
    const body = await res.json()

    // De sheet en de Toekomst-KPI moeten hetzelfde getal dragen: €60.000.
    expect(body.yearlyIncome).toBe(60000)
    expect(body.currentRetirementExpense).toBe(60000)
    // De rauwe extrapolatie blijft beschikbaar als máátstaf, nooit als uitkomst.
    expect(body.yearlyIncome).not.toBe(82907)
  })

  it('volgt bij income_source=auto zonder budget-inkomen de transactie-extrapolatie (via de echte loadBudgetBasis)', async () => {
    profileRow = { ...BASE_PROFILE, income_source: null }
    const { GET } = await import('./route')
    const res = await GET()
    const body = await res.json()

    expect(body.yearlyIncome).toBe(82907)
    expect(body.currentRetirementExpense).toBe(82907)
  })
})
