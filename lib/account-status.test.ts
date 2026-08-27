/**
 * lib/account-status.test.ts
 *
 * De gedeelde accountstatus (kaart M1) heeft twee taken die elkaar kunnen
 * bijten, en deze suite vergrendelt ze allebei:
 *
 *  1. PARITEIT — `toCoachDataGaps` moet exact hetzelfde opleveren als de
 *     inline-berekening die tot M1 in `app/(app)/layout.tsx` stond. De
 *     ontdubbeling mag NIETS zichtbaars veranderen aan de coach-bubble; de
 *     oude formule staat hieronder woordelijk als spec.
 *  2. STRENGERE DEFINITIES VOOR DE GIDS — de checklist mag juist NIET dezelfde
 *     lezingen gebruiken: eigen-account in plaats van RLS-breed (anders vinkt
 *     de gids af wat je partner invulde), `goals` in plaats van `actions`, en
 *     levensgebeurtenissen exclusief de afgeleide `aow`.
 *
 * React `cache()` is buiten een RSC-render een passthrough; hier wordt hij —
 * net als in lib/server-data/base.test.ts — vervangen door een echte memoizer,
 * zodat een niet-gewrapte loader zichtbaar wordt in de query-teller.
 */

import { describe, it, expect, vi } from 'vitest'

// Memoizer op ARGUMENT-IDENTITEIT (geneste Maps), zodat elke test met zijn
// eigen mock-client een eigen cache-entry krijgt en er geen resultaten tussen
// tests lekken.
vi.mock('react', () => ({
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
    const root = new Map<unknown, unknown>()
    return (...args: A): R => {
      let node = root
      for (const arg of args.slice(0, -1)) {
        if (!node.has(arg)) node.set(arg, new Map())
        node = node.get(arg) as Map<unknown, unknown>
      }
      const last = args[args.length - 1]
      if (!node.has(last)) node.set(last, fn(...args))
      return node.get(last) as R
    }
  },
}))

vi.mock('@/lib/supabase/cached-user', () => ({
  getCachedUser: async () => ({ id: 'user-1' }),
}))

import { loadAccountStatus, loadAccountStatusCore, toCoachDataGaps } from './account-status'
import { deriveGuideStates, DEFAULT_WELCOME_GUIDE } from './welcome-guide'
import type { CoachDataGaps } from './coach-suggestions'

const USER = 'user-1'
const PARTNER = 'user-2'

// ── Mock-client ─────────────────────────────────────────────────────────────

interface QuerySpec {
  table: string
  select?: string
  options?: Record<string, unknown>
  filters: Array<[string, ...unknown[]]>
}

interface TableFixture {
  rows?: unknown[]
  count?: number
}

function makeSupabase(fixtures: Record<string, TableFixture>) {
  const queries: QuerySpec[] = []

  function from(table: string) {
    const spec: QuerySpec = { table, filters: [] }
    queries.push(spec)
    const fixture = () => fixtures[table] ?? {}
    const result = () => ({
      data: fixture().rows ?? [],
      count: fixture().count ?? null,
      error: null,
    })

    const record =
      (method: string) =>
      (...args: unknown[]) => {
        spec.filters.push([method, ...args])
        return q
      }

    const q: Record<string, unknown> = {
      select: (s: string, options?: Record<string, unknown>) => {
        spec.select = s
        spec.options = options
        return q
      },
      eq: record('eq'),
      is: record('is'),
      in: record('in'),
      order: record('order'),
      limit: record('limit'),
      single: () => Promise.resolve({ data: fixture().rows?.[0] ?? null, error: null }),
      maybeSingle: () => Promise.resolve({ data: fixture().rows?.[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve, reject),
    }
    return q
  }

  return { supabase: { from } as never, queries }
}

/** Een account met van alles erin — alle signalen op de EIGEN gebruiker. */
function gevuldAccount(overrides: Record<string, TableFixture> = {}) {
  return {
    assets: { rows: [{ user_id: USER, asset_type: 'cash' }, { user_id: USER, asset_type: 'investment' }] },
    debts: { rows: [{ user_id: USER }] },
    profiles: {
      rows: [
        {
          expected_return: 0.07,
          inflation_rate: 0.02,
          retirement_expense_method: 'custom_amount',
          toekomst_scenario_prefs: { stopAge: 60 },
        },
      ],
    },
    budgets: { count: 8 },
    transactions: { rows: [{ id: 't1' }] },
    investment_holdings: { rows: [{ id: 'h1', isin: 'NL0000000001' }] },
    life_events: { rows: [{ id: 'e1', event_type: 'huis_kopen' }] },
    goals: { count: 2 },
    bank_connections: { rows: [{ id: 'bc1' }] },
    user_feature_visits: {
      rows: [{ feature_slug: 'horizon_setup_completed' }, { feature_slug: 'guide_nieuws' }],
    },
    ...overrides,
  }
}

// ── 1. Pariteit met de oude inline-berekening in layout.tsx ─────────────────

/**
 * WOORDELIJKE SPEC van de coach-data-gaps zoals `app/(app)/layout.tsx` ze tot
 * M1 berekende. Wijzigt de helper hier iets aan, dan valt deze test om — precies
 * de bedoeling: het rechttrekken van deze (deels scheve) definities is een eigen
 * wijziging met eigen bewijs, geen bijvangst van een ontdubbeling.
 */
function legacyCoachDataGaps(input: {
  assetRows: Array<{ asset_type?: string | null }>
  debtRows: unknown[]
  budgetCount: number
  actionCount: number
  txRows: unknown[]
  holdings: Array<{ isin: string | null }>
  lifeEvents: Array<{ event_type: string }>
  profile: { expected_return: number | null; inflation_rate: number | null }
  hasTransactionsModule: boolean
  hasHoldingsModule: boolean
  hasFireModule: boolean
}): CoachDataGaps {
  const coachLifeEvents = input.lifeEvents.filter((e) => e.event_type !== 'aow')
  return {
    hasBank: input.assetRows.some((a) => a.asset_type === 'cash'),
    hasAssets: input.assetRows.length > 0,
    hasBudgets: input.budgetCount > 0,
    hasGoals: input.actionCount > 0,
    hasDebts: input.debtRows.length > 0,
    hasTransactions: input.hasTransactionsModule ? input.txRows.length > 0 : true,
    hasHoldings: input.hasHoldingsModule ? input.holdings.length > 0 : true,
    hasHoldingsWithIsin: input.hasHoldingsModule
      ? input.holdings.some((h) => h.isin !== null && h.isin !== '')
      : true,
    hasFireParams: input.hasFireModule
      ? input.profile.expected_return != null || input.profile.inflation_rate != null
      : true,
    hasLifeEvents: input.hasFireModule ? coachLifeEvents.length > 0 : true,
  }
}

describe('toCoachDataGaps — pariteit met de inline-berekening van vóór M1', () => {
  it('gevuld account: veld voor veld identiek', async () => {
    const assetRows = [
      { user_id: USER, asset_type: 'cash' },
      { user_id: PARTNER, asset_type: 'real_estate' },
    ]
    const debtRows = [{ user_id: USER }]
    const holdings = [{ id: 'h1', isin: 'NL0000000001' }]
    const lifeEvents = [{ id: 'e1', event_type: 'aow' }, { id: 'e2', event_type: 'huis_kopen' }]

    const { supabase } = makeSupabase({
      assets: { rows: assetRows },
      debts: { rows: debtRows },
      profiles: { rows: [{ expected_return: 0.07, inflation_rate: null }] },
      budgets: { count: 3 },
      transactions: { rows: [{ id: 't1' }] },
      investment_holdings: { rows: holdings },
      life_events: { rows: lifeEvents },
    })

    const core = await loadAccountStatusCore(supabase, USER)
    const gaps = toCoachDataGaps(core, {
      hasOpenActions: true,
      hasTransactionsModule: true,
      hasHoldingsModule: true,
      hasFireModule: true,
    })

    expect(gaps).toEqual(
      legacyCoachDataGaps({
        assetRows,
        debtRows,
        budgetCount: 3,
        actionCount: 1,
        txRows: [{ id: 't1' }],
        holdings,
        lifeEvents,
        profile: { expected_return: 0.07, inflation_rate: null },
        hasTransactionsModule: true,
        hasHoldingsModule: true,
        hasFireModule: true,
      }),
    )
  })

  it('leeg account: veld voor veld identiek', async () => {
    const { supabase } = makeSupabase({
      assets: { rows: [] },
      debts: { rows: [] },
      profiles: { rows: [{ expected_return: null, inflation_rate: null }] },
      budgets: { count: 0 },
      transactions: { rows: [] },
      investment_holdings: { rows: [] },
      life_events: { rows: [] },
    })

    const core = await loadAccountStatusCore(supabase, USER)
    const gaps = toCoachDataGaps(core, {
      hasOpenActions: false,
      hasTransactionsModule: true,
      hasHoldingsModule: true,
      hasFireModule: true,
    })

    expect(gaps).toEqual(
      legacyCoachDataGaps({
        assetRows: [],
        debtRows: [],
        budgetCount: 0,
        actionCount: 0,
        txRows: [],
        holdings: [],
        lifeEvents: [],
        profile: { expected_return: null, inflation_rate: null },
        hasTransactionsModule: true,
        hasHoldingsModule: true,
        hasFireModule: true,
      }),
    )
  })

  it('alleen huishoud-gedeelde rijen: de coach blijft RLS-breed rekenen', async () => {
    // Dit is het geval waar de twee lezingen UIT ELKAAR lopen: de bezittingen
    // staan op naam van de partner. De coach zag ze altijd al (RLS-breed) en
    // moet ze blijven zien; de gids mag ze juist niet meetellen.
    const assetRows = [{ user_id: PARTNER, asset_type: 'cash' }]
    const debtRows = [{ user_id: PARTNER }]
    const { supabase } = makeSupabase({
      assets: { rows: assetRows },
      debts: { rows: debtRows },
      profiles: { rows: [{ expected_return: null, inflation_rate: null }] },
      budgets: { count: 0 },
      transactions: { rows: [] },
      investment_holdings: { rows: [] },
      life_events: { rows: [] },
    })

    const core = await loadAccountStatusCore(supabase, USER)
    const gaps = toCoachDataGaps(core, {
      hasOpenActions: false,
      hasTransactionsModule: true,
      hasHoldingsModule: true,
      hasFireModule: true,
    })

    expect(gaps).toEqual(
      legacyCoachDataGaps({
        assetRows,
        debtRows,
        budgetCount: 0,
        actionCount: 0,
        txRows: [],
        holdings: [],
        lifeEvents: [],
        profile: { expected_return: null, inflation_rate: null },
        hasTransactionsModule: true,
        hasHoldingsModule: true,
        hasFireModule: true,
      }),
    )
    // …en dat is nadrukkelijk iets anders dan de eigen-account-lezing.
    expect(gaps.hasAssets).toBe(true)
    expect(core.hasAssets).toBe(false)
  })

  it('module uit → signaal `true` (gap vuurt niet), nooit een gids-vinkje', async () => {
    const { supabase } = makeSupabase({
      assets: { rows: [] },
      debts: { rows: [] },
      profiles: { rows: [{ expected_return: null, inflation_rate: null }] },
      budgets: { count: 0 },
      transactions: { rows: [] },
      investment_holdings: { rows: [] },
      life_events: { rows: [] },
    })
    const core = await loadAccountStatusCore(supabase, USER)
    const gaps = toCoachDataGaps(core, {
      hasOpenActions: false,
      hasTransactionsModule: false,
      hasHoldingsModule: false,
      hasFireModule: false,
    })
    expect(gaps.hasTransactions).toBe(true)
    expect(gaps.hasHoldings).toBe(true)
    expect(gaps.hasFireParams).toBe(true)
    expect(gaps.hasLifeEvents).toBe(true)
    // De accountstatus zelf blijft de FEITEN dragen — module-gating is een
    // coach-eigenaardigheid en mag nooit als "gedaan" in de gids landen.
    expect(core.hasTransactions).toBe(false)
    expect(core.hasLifeEvents).toBe(false)
  })
})

// ── 2. Definities voor de gids ──────────────────────────────────────────────

describe('loadAccountStatus — expliciete definities', () => {
  it('EIGEN-ACCOUNT-GESCOPED: bezittingen van de partner tellen niet mee', async () => {
    const { supabase } = makeSupabase(
      gevuldAccount({
        assets: { rows: [{ user_id: PARTNER, asset_type: 'cash' }] },
        debts: { rows: [{ user_id: PARTNER }] },
      }),
    )
    const status = await loadAccountStatus(supabase, USER)
    expect(status.hasAssets).toBe(false)
    expect(status.hasCashAsset).toBe(false)
    expect(status.hasDebts).toBe(false)
    // …maar de RLS-brede lezing (die de coach altijd al gebruikte) ziet ze wél.
    expect(status.rlsScoped.hasAssets).toBe(true)
    expect(status.rlsScoped.hasCashAsset).toBe(true)
    expect(status.rlsScoped.hasDebts).toBe(true)

    // En de gids vinkt dus niet af wat de partner invulde.
    const derived = deriveGuideStates(DEFAULT_WELCOME_GUIDE, status)
    expect(derived['s1-bezittingen']).toBe('open')
    expect(derived['s1-schulden']).toBe('open')
  })

  it("levensgebeurtenissen: 'aow' telt niet als zelf gepland", async () => {
    const { supabase } = makeSupabase(
      gevuldAccount({ life_events: { rows: [{ id: 'e1', event_type: 'aow' }] } }),
    )
    const status = await loadAccountStatus(supabase, USER)
    expect(status.hasLifeEvents).toBe(false)
    expect(deriveGuideStates(DEFAULT_WELCOME_GUIDE, status)['s2-gebeurtenissen']).toBe('open')
  })

  it('budgetten: alleen top-level (parent_id is null)', async () => {
    const { supabase, queries } = makeSupabase(gevuldAccount())
    await loadAccountStatus(supabase, USER)
    const budgets = queries.find((q) => q.table === 'budgets')!
    expect(budgets.filters).toContainEqual(['is', 'parent_id', null])
    expect(budgets.options).toEqual({ count: 'exact', head: true })
  })

  it('doelen komen uit `goals`, niet uit `actions`', async () => {
    const { supabase, queries } = makeSupabase(gevuldAccount({ goals: { count: 0 } }))
    const status = await loadAccountStatus(supabase, USER)
    expect(status.hasGoals).toBe(false)
    expect(queries.some((q) => q.table === 'actions')).toBe(false)
    const goals = queries.find((q) => q.table === 'goals')!
    expect(goals.filters).toContainEqual(['eq', 'is_completed', false])
  })

  it('uitgave-na-pensioen: de DB-default bewijst geen keuze', async () => {
    const { supabase } = makeSupabase(
      gevuldAccount({
        profiles: { rows: [{ retirement_expense_method: 'essential_budgets' }] },
      }),
    )
    const status = await loadAccountStatus(supabase, USER)
    expect(status.hasRetirementExpenseChoice).toBe(false)
    expect(deriveGuideStates(DEFAULT_WELCOME_GUIDE, status)['s2-uitgaven']).toBe('open')
  })

  it('bezoekregister: alleen gids-slugs + de horizon-setup-marker', async () => {
    const { supabase, queries } = makeSupabase(gevuldAccount())
    const status = await loadAccountStatus(supabase, USER)
    expect(status.hasHorizonSetup).toBe(true)
    expect(status.visitedSlugs).toContain('guide_nieuws')
    const visits = queries.find((q) => q.table === 'user_feature_visits')!
    const inFilter = visits.filters.find((f) => f[0] === 'in')!
    expect(inFilter[1]).toBe('feature_slug')
    expect(inFilter[2]).toContain('horizon_setup_completed')
  })

  it('ontbrekend bezoekregister → lege lijst, geen crash (gids blijft handmatig)', async () => {
    const { supabase } = makeSupabase(gevuldAccount({ user_feature_visits: { rows: [] } }))
    const status = await loadAccountStatus(supabase, USER)
    expect(status.visitedSlugs).toEqual([])
    expect(status.hasHorizonSetup).toBe(false)
    expect(deriveGuideStates(DEFAULT_WELCOME_GUIDE, status)['s3-nieuws']).toBe('open')
  })

  it('gevuld account: de vier stappen van scherm 1 worden afgeleid', async () => {
    const { supabase } = makeSupabase(gevuldAccount())
    const status = await loadAccountStatus(supabase, USER)
    const derived = deriveGuideStates(DEFAULT_WELCOME_GUIDE, status)
    expect(derived['s1-bezittingen']).toBe('done')
    expect(derived['s1-schulden']).toBe('done')
    expect(derived['s1-budget']).toBe('done')
    expect(derived['s1-rekening']).toBe('done')
  })
})
