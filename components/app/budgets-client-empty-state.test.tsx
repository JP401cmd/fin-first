/**
 * Regressietest — first-use lege staat rendert daadwerkelijk ("Nog geen
 * budgetten" + CTA "Maak je eerste budget") wanneer `initialData.budgets`
 * leeg is.
 *
 * Achtergrond: het client-side seedpad is verwijderd uit `loadBudgets()`
 * (zie `budgets-client-no-seed.test.ts`). De aanname was dat de bestaande
 * first-use lege staat (`initialLoadDone && budgets.length === 0 &&
 * partnerBudgets.length === 0`) dat vangt. Die aanname
 * klopte maar half: `initialLoadDone` stond op `useState(false)` en werd
 * alleen gezet in de `finally` van `loadBudgets()`. `skipInitialFetch`
 * slaat die fetch echter over zodra `initialData` bestaat
 * — en BEIDE routes (`app/(app)/core/budgets/page.tsx` en
 * `app/(app)/overzicht/budget/page.tsx`) geven `initialData` altijd
 * mee. Gevolg: op het pad dat de app daadwerkelijk gebruikt bleef
 * `initialLoadDone` op `false` staan, viel de lege-staat-tak nooit in, en
 * rendert er onder de toolbar niets (alle type-secties zijn
 * `.length > 0`-gated) — een stille, lege pagina voor een nieuwe gebruiker.
 *
 * De fix: `useState(!!initialData)` i.p.v. `useState(false)`. Deze test is
 * een ECHTE render (geen bron-scan) — hij pint het daadwerkelijk zichtbare
 * DOM-resultaat voor een gebruiker met 0 budgetten op het server-gehydrateerde
 * pad, en zou rood zijn geweest vóór de fix (zie de bijt-proef in de
 * PR-beschrijving / sessie-log).
 *
 * `budgets-client.tsx` is >5000 regels met zware Supabase-effects
 * (`budgets-client.test.tsx` documenteert al dat volledig mounten in jsdom
 * onevenredig is voor de meeste gedragingen). Met een LEGE `initialData` is
 * de rendered boom echter klein genoeg: `BudgetHub` rendert `null` (geen
 * KPI's, geen aandachtspunten bij nul budgetten/nul inkomen), en geen enkele
 * budget-rij/detail-pane/edit-form mount (die zitten allemaal achter
 * `budgets.length > 0` of een geselecteerde id). Dit bestand mockt daarom
 * alleen wat nodig is om de component te laten mounten — zelfde aanpak als
 * `cash-account-view.test.tsx`: een chainbare Supabase-stub, `next/navigation`,
 * en de context-hooks die zonder Provider een harde `throw` geven
 * (`useChatContext`, `useToast`). `usePerspective`/`useHouseholdStatus`
 * hebben zelf al veilige defaults buiten hun Provider en hoeven niet gemockt.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

// ── Chainbare Supabase-stub — genoeg om de mount-effects (profiles/
//    bank_accounts/auth.getUser/transactions/household_members) te voeden
//    zonder te crashen. Precieze waarden zijn hier niet relevant: het gaat
//    om de synchrone eerste render, die uitsluitend op `initialData` leunt. ──
function makeSupabase() {
  const dataFor = (table: string): unknown => {
    switch (table) {
      case 'profiles':
        return { budgeting_active: true }
      default:
        return []
    }
  }
  function builder(table: string, isSingle = false): Record<string, unknown> {
    const target: Record<string, unknown> = {
      single: () => builder(table, true),
      maybeSingle: () => builder(table, true),
      then: (resolve: (v: { data: unknown; error: null; count: number }) => unknown) => {
        let data = dataFor(table)
        if (isSingle && Array.isArray(data)) data = data[0] ?? null
        const count = Array.isArray(data) ? data.length : 0
        return Promise.resolve(resolve({ data, error: null, count }))
      },
    }
    return new Proxy(target, {
      get(t, prop: string) {
        if (prop in t) return (t as Record<string, unknown>)[prop]
        return (..._args: unknown[]) => builder(table, isSingle)
      },
    })
  }
  return {
    from: (table: string) => builder(table),
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  }
}

vi.mock('@/lib/supabase/client', () => ({ createClient: () => makeSupabase() }))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/core/budgets',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

// Context-hooks die buiten hun Provider een harde throw geven (geen fallback
// zoals usePerspective/useHouseholdStatus/useMaskedAmounts/useFeatureAccess
// die al veilig zijn — zie hun createContext-defaults).
vi.mock('@/components/app/chat/chat-provider', () => ({
  useChatContext: () => ({ openWithMessage: vi.fn() }),
}))
vi.mock('@/components/app/toast-provider', () => ({
  useToast: () => ({ addToast: vi.fn() }),
}))

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
)

import BudgetsPage from './budgets-client'
import type { BudgetsPageData } from '@/lib/budgets-data-loader'

const EMPTY_INITIAL_DATA: BudgetsPageData = {
  budgets: [],
  spending: {},
  transactions: [],
  rollovers: [],
  budgetAmounts: [],
  goals: [],
  uncategorizedCount: 0,
  uncategorizedTotal: 0,
  currentPeriod: '2026-08',
  monthStart: '2026-08-01',
  monthEnd: '2026-09-01',
  monthlyAverages: {},
}

afterEach(() => {
  cleanup()
})

describe('BudgetsPage — first-use lege staat (regressie: initialLoadDone bij server-gehydrateerd pad)', () => {
  it('toont "Nog geen budgetten" + CTA "Maak je eerste budget" wanneer initialData.budgets leeg is', async () => {
    render(<BudgetsPage initialData={EMPTY_INITIAL_DATA} />)

    // BEWUST asserten op de EERSTE render, vóór enige client-fetch resolvet.
    // Dát is de regressie: server-gehydrateerd moet de lege staat er meteen
    // staan. Wikkel je de `render` zelf in `act(async …)`, dan flushen de
    // mount-effects, verandert `loadBudgets` van identiteit (zijn useCallback
    // hangt o.a. aan `partnerPrivacy`, dat ná een fetch binnenkomt), draait de
    // effect-hook alsnog en zet diens `finally` `initialLoadDone` op true —
    // waarna de test ook ZONDER de fix groen is. Dat is precies gebeurd tijdens
    // het opschonen van de act-waarschuwingen; de bijt-proef ving het.
    expect(screen.getByText('Nog geen budgetten')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Maak je eerste budget' }),
    ).toBeInTheDocument()

    // Pas ná de asserties de openstaande mount-effects (profiles,
    // bank_accounts, auth.getUser, transactions, household_members via de
    // Proxy-stub) laten uitlopen. Zonder deze flush landen hun state-updates
    // rond `cleanup` en logt React 15× "An update to BudgetsPage inside a test
    // was not wrapped in act(...)" — ~7 kB stderr die een échte waarschuwing
    // in dit bestand onvindbaar maakt.
    await act(async () => {
      await Promise.resolve()
    })
  })
})
