/**
 * Regressietest — bevinding C7: "Budgetpagina laadt niet".
 *
 * Symptoom uit het UX-testpanel: `/overzicht/budget` toont eerst de
 * (server-gehydrateerde) budgetten en klapt kort daarna om naar één rood blok
 * "Kon budgetten niet laden"; retry verandert niets, en de rest van de pagina
 * (NIBUD-kaart, doelen, rollovers) verdwijnt mee.
 *
 * Oorzaak: `BudgetsClient` krijgt van BEIDE routes altijd `initialData` mee,
 * maar draait daarna alsnog een client-side `loadBudgets()` zodra een dep
 * verandert — o.a. wanneer de huishoud-context binnenkomt of wanneer
 * `PerspectiveProvider` ná mount van 'personal' naar de opgeslagen
 * huishoud-/partnervoorkeur wisselt. Faalde die her-fetch, dan zette de oude
 * code onvoorwaardelijk `error`, en een full-page early-return wiste de al
 * correcte render.
 *
 * De invariant die deze test pint: **een fout mag reeds-correcte server-data
 * nooit overschrijven.** Een gefaalde her-fetch degradeert naar een
 * niet-blokkerende melding; de budgetten blijven staan.
 *
 * Waarom dit bijt: vóór de fix rendert `BudgetsPage` na de gefaalde her-fetch
 * uitsluitend het blokkerende foutscherm — de assert op de budgetnaam faalt
 * dan. (Bijt-proef gedraaid: catch teruggezet op het onvoorwaardelijke
 * `setError(...)` → deze test rood op exact die assert; daarna teruggedraaid.)
 *
 * Harnas-aanpak = die van `budgets-client-empty-state.test.tsx`: `budgets-client.tsx`
 * is >5000 regels met zware Supabase-effects, dus we mocken alleen wat nodig is
 * om te mounten. De her-fetch wordt deterministisch getriggerd door
 * `loadPerspectiveContext` een huishoud-context te laten teruggeven: dat zet
 * `partnerPrivacy`/`householdShare`, waardoor `loadBudgets` van identiteit
 * verandert en de effect-hook écht gaat fetchen (zie ook de act-notitie in de
 * empty-state-test).
 *
 * Dekt beide routes tegelijk: `/overzicht/budget` en `/core/budgets`
 * renderen dezelfde `BudgetsClient` met dezelfde `initialData`-vorm.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'

/** Zet de eerstvolgende `budgets`-select op falen (PostgREST-achtige fout). */
const BUDGETS_ERROR = { message: 'permission denied for table budgets', code: '42501' }

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
      then: (
        resolve: (v: { data: unknown; error: unknown; count: number }) => unknown,
      ) => {
        // De client-side her-fetch van budgets faalt — precies het scenario
        // uit de bevinding. Alle andere tabellen gedragen zich normaal.
        if (table === 'budgets') {
          return Promise.resolve(resolve({ data: null, error: BUDGETS_ERROR, count: 0 }))
        }
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
    rpc: async () => ({ data: [], error: null }),
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  }
}

vi.mock('@/lib/supabase/client', () => ({ createClient: () => makeSupabase() }))

// Huishoud-context: dit is de trigger die ná mount `loadBudgets` opnieuw laat
// draaien (partnerPrivacy + mySharePct + budgetModel zitten in zijn deps).
vi.mock('@/lib/household/perspective-loader', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    loadPerspectiveContext: async () => ({
      userId: 'u1',
      hasHousehold: true,
      householdId: 'h1',
      partnerId: 'u2',
      partnerName: 'Partner',
      splitMode: 'evenredig',
      customSplitPct: null,
      primaryPayerId: null,
      mySharePct: 60,
      partnerPrivacy: {
        assets: 'visible',
        debts: 'visible',
        budgets: 'visible',
        transactions: 'visible',
        income: 'visible',
      },
      budgetModel: 'separate',
    }),
  }
})

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/overzicht/budget',
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

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

const BUDGET_NAME = 'Boodschappen'

/** Server-gehydrateerde data: precies wat beide routes via `loadBudgetsData` meegeven. */
const INITIAL_DATA: BudgetsPageData = {
  budgets: [
    {
      id: 'b1',
      user_id: 'u1',
      name: BUDGET_NAME,
      slug: 'boodschappen',
      budget_type: 'expense',
      monthly_limit: 400,
      icon: 'shopping-cart',
      color: null,
      sort_order: 0,
      parent_id: null,
      is_archived: false,
      ownership: 'personal',
      household_id: null,
      rollover_enabled: false,
      children: [],
    },
  ] as unknown as BudgetsPageData['budgets'],
  spending: { b1: 120 },
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

beforeEach(() => {
  // De catch logt bewust met console.error; dat hoort bij het scenario en
  // moet de testoutput niet vervuilen.
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('BudgetsPage — degraded rendering bij gefaalde her-fetch (C7)', () => {
  it('behoudt de server-gerenderde budgetten en toont een niet-blokkerende melding', async () => {
    render(<BudgetsPage initialData={INITIAL_DATA} />)

    // Laat de mount-effects uitlopen: de huishoud-context komt binnen,
    // `loadBudgets` verandert van identiteit en de client-her-fetch draait —
    // en faalt.
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    // 1. DE KERN VAN DE BEVINDING: de al correcte render is er nog.
    expect(screen.getAllByText(BUDGET_NAME).length).toBeGreaterThan(0)

    // 2. Het blokkerende foutscherm is NIET verschenen.
    expect(screen.queryByText(/Kon budgetten niet laden/)).not.toBeInTheDocument()

    // 3. De fout wordt wel eerlijk gemeld — niet-blokkerend, met een route.
    //    (Niet via getByRole('status'): de pagina heeft meer live-regio's.)
    const message = screen.getByText(/Kon de budgetten niet verversen/)
    expect(message.closest('[role="status"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Opnieuw proberen' })).toBeInTheDocument()
  })
})
