import { describe, it, expect, vi, beforeEach } from 'vitest'
import { localMonthStartMonthsAgo } from '@/lib/month-range'

/**
 * /api/uitgaven-na-pensioen/context — grondslag-pariteit met de SSR-loader.
 *
 * Given een profiel op de handmatige inkomensgrondslag (income_source 'manual',
 *   net_monthly_income €5.000) met methode 'current_income', en €82.907 aan
 *   positieve transacties over 12 afgesloten maanden,
 * When de uitgaven-na-pensioen-sheet zijn context ophaalt,
 * Then volgen `yearlyIncome` en `currentRetirementExpense` de GEKOZEN
 *   inkomensgrondslag (ADR 0103): €60.000 — identiek aan de "Na pensioen"-KPI
 *   op /toekomst (SSR-loader geeft `effectiveAnnualIncome` door aan
 *   `deriveRetirementExpenseBasis`). Het rauwe transactie-jaarinkomen
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
 *
 * HISTORIEBASIS (ADR 0138): het transactie-jaarinkomen komt uit het
 * realisatievenster (`tx_month_aggregate`, twaalf afgesloten maanden), niet
 * meer uit een eigen transactiequery. De rpc-dubbel hieronder filtert daarom —
 * net als de echte RPC — op `[p_from, p_to)`; de €82.907 staat in de OUDSTE
 * maand van het venster, zodat `historyMonths` = 12 en de som de identiteit is.
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

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    rpc: async (_fn: string, args: Record<string, unknown>) => {
      const oudsteMaand = localMonthStartMonthsAgo(new Date(), 12).slice(0, 7)
      const rows = [
        { month: oudsteMaand, budget_id: null, transaction_type: 'income', sum_positief: 82907, sum_negatief: 0, count: 1 },
      ].filter((r) => `${r.month}-01` >= String(args.p_from) && `${r.month}-01` < String(args.p_to))
      return { data: rows, error: null }
    },
    from(table: string) {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: profileRow, error: null }) }),
          }),
        }
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
    // Het rauwe transactie-jaarinkomen blijft beschikbaar als máátstaf, nooit als uitkomst.
    expect(body.yearlyIncome).not.toBe(82907)
  })

  it('volgt bij income_source=auto zonder budget-inkomen het transactie-jaarinkomen uit het realisatievenster (via de echte loadBudgetBasis)', async () => {
    profileRow = { ...BASE_PROFILE, income_source: null }
    const { GET } = await import('./route')
    const res = await GET()
    const body = await res.json()

    expect(body.yearlyIncome).toBe(82907)
    expect(body.currentRetirementExpense).toBe(82907)
  })
})
