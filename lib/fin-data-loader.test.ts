import { describe, it, expect, vi } from 'vitest'

/**
 * Tests voor de parameter-doel-laag in `fin-data-loader.ts` (ronde 4, stap 4):
 *   1. cap-splitsing (`splitActiveGoals`) — parameter-doelen buiten de max-5-slice,
 *      vooraan, index-gekoppeld;
 *   2. de pure actuele-waarde-computers per bron (spaarquote/salaris/rendement/
 *      vrijheidsleeftijd) inclusief de tolerante "ontbrekende bron"-degradatie;
 *   3. end-to-end via `loadFinData` met een fake-Supabase: cap-split-volgorde, de
 *      LAZY injectie-bedrading (geen queries zonder parameter-doelen) en metadata-
 *      loze (oude) rijen die niet crashen.
 *
 * `getCachedUser` wordt gemockt zodat de loader een vaste user krijgt; alle data
 * komt uit de fake-Supabase-client.
 */

vi.mock('@/lib/supabase/cached-user', () => ({
  getCachedUser: vi.fn(async () => ({ id: 'u1' })),
}))

/**
 * Het spaarquote-parameterdoel CONSUMEERT sinds 31 aug 2026 de gedeelde
 * forecast-laag (`loadForecastSectionData`) in plaats van een eigen kopie van de
 * loader-formule te draaien. Hier stubben we precies die ene functie — partieel,
 * zodat de rest van de module echt blijft — en meten we de BEDRADING: krijgt het
 * doel het getal dat de canonieke laag zegt? De rekenkundige gelijkheid tussen
 * doel, widget, forecast-kaart en bundel wordt end-to-end (zonder stubs) bewezen
 * in lib/spaarquote-eenduidige-grondslag.test.tsx.
 */
const { STUB_EFFECTIEVE_SPAARQUOTE, STUB_FORECAST_SCALARS } = vi.hoisted(() => {
  const pct = 30.0
  return {
    STUB_EFFECTIEVE_SPAARQUOTE: pct,
    STUB_FORECAST_SCALARS: {
      monthlyIncome: 6000,
      monthlyExpenses: 4200,
      savingsRate6m: 9.5,
      effectiveSavingsRatePct: pct,
      savingsRateIncomeBasis: 'budget' as const,
      savingsRateExpensesBasis: 'budget' as const,
      savingsRateIsEstimate: false,
      savingsHistory: [],
      expenseHistory: [],
    },
  }
})

vi.mock('@/lib/cashflow-kpis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/cashflow-kpis')>()
  return {
    ...actual,
    loadForecastSectionData: vi.fn(async () => STUB_FORECAST_SCALARS),
  }
})

import {
  loadFinData,
  isParameterGoal,
  splitActiveGoals,
  computeParameterEffectiveSalary,
  computeParameterWeightedReturnPct,
  pickLatestSnapshotFireAge,
  type GoalWithBudget,
} from './fin-data-loader'

// ── Fixtures ──────────────────────────────────────────────────────────────

let goalSeq = 0
function goal(overrides: Partial<GoalWithBudget>): GoalWithBudget {
  goalSeq += 1
  return {
    id: `g${goalSeq}`,
    user_id: 'u1',
    name: 'Doel',
    description: null,
    goal_type: 'savings',
    target_value: 100,
    current_value: 0,
    target_date: null,
    linked_asset_id: null,
    linked_debt_id: null,
    icon: 'Target',
    color: 'teal',
    is_completed: false,
    completed_at: null,
    sort_order: goalSeq,
    ownership: 'personal',
    household_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as GoalWithBudget
}

function paramGoal(goalType: GoalWithBudget['goal_type'], overrides: Partial<GoalWithBudget> = {}) {
  return goal({ goal_type: goalType, metadata: { bron: 'parameter', oorsprong: 'lab' }, ...overrides })
}

// ── isParameterGoal — defensief ─────────────────────────────────────────────

describe('isParameterGoal', () => {
  it('true alleen bij metadata.bron === "parameter"', () => {
    expect(isParameterGoal({ metadata: { bron: 'parameter' } })).toBe(true)
  })
  it('false bij ontbrekende / null / lege metadata (oude rijen)', () => {
    expect(isParameterGoal({})).toBe(false)
    expect(isParameterGoal({ metadata: null })).toBe(false)
    expect(isParameterGoal({ metadata: {} })).toBe(false)
  })
  it('false bij een andere bron-tag (handmatig doel blijft ongemoeid)', () => {
    expect(isParameterGoal({ metadata: { bron: 'handmatig' } })).toBe(false)
  })
})

// ── splitActiveGoals — cap-splitsing ────────────────────────────────────────

describe('splitActiveGoals — parameter-doelen buiten de max-5-slice', () => {
  it('3 parameter + 7 handmatig → 3 + 5 (parameter eerst), rest afgekapt', () => {
    goalSeq = 0
    const params = [
      paramGoal('savings_rate'),
      paramGoal('salary'),
      paramGoal('expected_return'),
    ]
    const handmatig = Array.from({ length: 7 }, () => goal({ goal_type: 'savings' }))
    const { goals, parameterGoals } = splitActiveGoals([...handmatig, ...params])

    expect(parameterGoals).toHaveLength(3)
    expect(goals).toHaveLength(8) // 3 parameter + 5 handmatig
    // Parameter-doelen staan vooraan, in de volgorde waarin ze binnenkwamen.
    expect(goals.slice(0, 3).map(g => g.goal_type)).toEqual(['savings_rate', 'salary', 'expected_return'])
    expect(goals.slice(3).every(isParameterGoal)).toBe(false)
  })

  it('voltooide doelen tellen niet mee', () => {
    const { goals } = splitActiveGoals([
      goal({ is_completed: true }),
      paramGoal('fire_age'),
      goal({ goal_type: 'savings' }),
    ])
    expect(goals).toHaveLength(2)
    expect(goals[0].goal_type).toBe('fire_age')
  })

  it('zonder parameter-doelen: gewoon de eerste 5 handmatige', () => {
    const { goals, parameterGoals } = splitActiveGoals(
      Array.from({ length: 8 }, () => goal({ goal_type: 'savings' })),
    )
    expect(parameterGoals).toHaveLength(0)
    expect(goals).toHaveLength(5)
  })
})

/*
 * computeParameterSavingsRatePct — VERWIJDERD (31 aug 2026), met zijn zeven
 * unit-tests.
 *
 * Die tests bewezen dat de KOPIE intern klopte, niet dat ze hetzelfde getal gaf
 * als de rest van de app — en dat was precies het defect: op productie stond
 * 5,8 % op de doelkaart naast 9,5 % op de spaarquote-widget en 30 % in het
 * instellingenblok. Het spaarquote-doel consumeert nu
 * `loadForecastSectionData(...).effectiveSavingsRatePct`; de vergrendeling van
 * dat gedrag staat in lib/spaarquote-eenduidige-grondslag.test.tsx, die de
 * doelwaarde end-to-end naast de bundel- en forecast-waarde legt.
 */

// ── computeParameterEffectiveSalary ─────────────────────────────────────────

describe('computeParameterEffectiveSalary — effectief maandinkomen', () => {
  const monthStart = '2026-07-01'

  it('handmatige bron wint over transacties', () => {
    const profile = { net_monthly_income: 4200, income_source: 'manual' }
    const tx = [{ amount: 9999, budget_id: null, date: '2026-07-15' }]
    expect(computeParameterEffectiveSalary(profile, tx, monthStart)).toBe(4200)
  })

  it('auto-bron: huidige-maand transactie-inkomen', () => {
    const profile = { net_monthly_income: 4200, income_source: 'auto' }
    const tx = [
      { amount: 5000, budget_id: null, date: '2026-07-05' },
      { amount: -1200, budget_id: null, date: '2026-07-06' },
    ]
    expect(computeParameterEffectiveSalary(profile, tx, monthStart)).toBe(5000)
  })

  it('alleen de lopende maand telt (oudere tx worden genegeerd)', () => {
    const profile = { net_monthly_income: 0, income_source: 'auto' }
    const tx = [
      { amount: 5000, budget_id: null, date: '2026-06-30' }, // vorige maand → uit
      { amount: 3000, budget_id: null, date: '2026-07-10' }, // deze maand → in
    ]
    expect(computeParameterEffectiveSalary(profile, tx, monthStart)).toBe(3000)
  })

  it('geen inkomen (geen tx, geen handmatig) → undefined', () => {
    const profile = { net_monthly_income: 0, income_source: 'auto' }
    expect(computeParameterEffectiveSalary(profile, [], monthStart)).toBeUndefined()
    expect(computeParameterEffectiveSalary(null, [], monthStart)).toBeUndefined()
  })

  it('rondt op hele euro', () => {
    const profile = { net_monthly_income: 3333.75, income_source: 'manual' }
    expect(computeParameterEffectiveSalary(profile, [], monthStart)).toBe(3334)
  })
})

// ── computeParameterWeightedReturnPct ───────────────────────────────────────

describe('computeParameterWeightedReturnPct — gewogen verwacht rendement', () => {
  it('inclusion-gewogen gemiddelde over actieve assets', () => {
    const assets = [
      { current_value: 100000, expected_return: 6, net_worth_inclusion_pct: 100, asset_type: 'investment', is_active: true },
      { current_value: 100000, expected_return: 2, net_worth_inclusion_pct: 100, asset_type: 'savings', is_active: true },
    ]
    expect(computeParameterWeightedReturnPct(assets)).toBe(4) // (6+2)/2
  })

  it('weegt met net_worth_inclusion_pct', () => {
    const assets = [
      { current_value: 100000, expected_return: 8, net_worth_inclusion_pct: 50, asset_type: 'investment', is_active: true },
      { current_value: 100000, expected_return: 2, net_worth_inclusion_pct: 100, asset_type: 'savings', is_active: true },
    ]
    // waarden: 50000 @ 8% en 100000 @ 2% → (50000*8 + 100000*2)/150000 = 4
    expect(computeParameterWeightedReturnPct(assets)).toBe(4)
  })

  it('inactieve of nul-waarde assets tellen niet mee', () => {
    const assets = [
      { current_value: 100000, expected_return: 5, net_worth_inclusion_pct: 100, asset_type: 'investment', is_active: true },
      { current_value: 999999, expected_return: 20, net_worth_inclusion_pct: 100, asset_type: 'x', is_active: false },
      { current_value: 0, expected_return: 20, net_worth_inclusion_pct: 100, asset_type: 'y', is_active: true },
    ]
    expect(computeParameterWeightedReturnPct(assets)).toBe(5)
  })

  it('string-waarden (MCP/Postgres NUMERIC) worden gecast', () => {
    const assets = [
      { current_value: '100000', expected_return: '6', net_worth_inclusion_pct: '100', asset_type: 'investment', is_active: true },
    ]
    expect(computeParameterWeightedReturnPct(assets)).toBe(6)
  })

  it('geen assets / geen waarde → undefined (tolerant)', () => {
    expect(computeParameterWeightedReturnPct([])).toBeUndefined()
    expect(computeParameterWeightedReturnPct([
      { current_value: 0, expected_return: 5, net_worth_inclusion_pct: 100, asset_type: 'x', is_active: true },
    ])).toBeUndefined()
  })

  it('rondt op 1 decimaal', () => {
    const assets = [
      { current_value: 100000, expected_return: 5.55, net_worth_inclusion_pct: 100, asset_type: 'investment', is_active: true },
    ]
    expect(computeParameterWeightedReturnPct(assets)).toBe(5.6)
  })
})

// ── pickLatestSnapshotFireAge ───────────────────────────────────────────────

describe('pickLatestSnapshotFireAge', () => {
  it('meest recente niet-NULL fire_age (fractioneel toegestaan)', () => {
    expect(pickLatestSnapshotFireAge([{ fire_age: 58.5 }])).toBe(58.5)
  })
  it('string (Postgres NUMERIC) wordt gecast', () => {
    expect(pickLatestSnapshotFireAge([{ fire_age: '61.25' }])).toBe(61.25)
  })
  it('geen snapshot / niet-positief / null → undefined (tolerant)', () => {
    expect(pickLatestSnapshotFireAge([])).toBeUndefined()
    expect(pickLatestSnapshotFireAge([{ fire_age: null }])).toBeUndefined()
    expect(pickLatestSnapshotFireAge([{ fire_age: 0 }])).toBeUndefined()
  })
})

// ── Fake-Supabase voor loadFinData-integratie ──────────────────────────────

interface SupaConfig {
  goals?: GoalWithBudget[]
  transactions?: { amount: number; budget_id: string | null; date: string }[]
  budgets?: { id: string; budget_type: string; parent_id: string | null }[]
  debts?: unknown[]
  assets?: unknown[]
  snapshots?: { fire_age: number | string | null }[]
  actions?: unknown[]
  profileFinancials?: unknown
  fullName?: string | null
}

function makeSupabase(cfg: SupaConfig): { supabase: never; called: string[] } {
  const called: string[] = []
  const dataFor = (table: string): unknown[] => {
    switch (table) {
      case 'goals': return cfg.goals ?? []
      case 'transactions': return cfg.transactions ?? []
      case 'budgets': return cfg.budgets ?? []
      case 'debts': return cfg.debts ?? []
      case 'assets': return cfg.assets ?? []
      case 'net_worth_snapshots': return cfg.snapshots ?? []
      case 'actions': return cfg.actions ?? []
      default: return []
    }
  }
  function makeChain(table: string) {
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      or: () => q,
      in: () => q,
      not: () => q,
      gte: () => q,
      lt: () => q,
      order: () => q,
      limit: () => q,
      single: () =>
        table === 'profiles'
          ? Promise.resolve({ data: { full_name: cfg.fullName ?? null }, error: null })
          : Promise.resolve({ data: dataFor(table)[0] ?? null, error: null }),
      maybeSingle: () =>
        table === 'profiles'
          ? Promise.resolve({ data: cfg.profileFinancials ?? null, error: null })
          : Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: dataFor(table), error: null as null }).then(resolve, reject),
    }
    return q
  }
  const supabase = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => {
      called.push(table)
      return makeChain(table)
    },
  }
  return { supabase: supabase as never, called }
}

// ── loadFinData — integratie ───────────────────────────────────────────────

describe('loadFinData — cap-split + lazy injectie (integratie)', () => {
  it('parameter-doelen komen vooraan; goalProgresses blijft index-gekoppeld', async () => {
    goalSeq = 0
    const goals = [
      goal({ goal_type: 'savings', name: 'Handmatig 1' }),
      paramGoal('salary', { name: 'Salaris-doel', target_value: 6000 }),
      goal({ goal_type: 'savings', name: 'Handmatig 2' }),
    ]
    const { supabase } = makeSupabase({ goals, profileFinancials: { net_monthly_income: 5000, income_source: 'manual' } })
    const data = await loadFinData(supabase)

    expect(data.goals[0].name).toBe('Salaris-doel')
    expect(data.goalProgresses).toHaveLength(3)
    // Salaris-doel: current geïnjecteerd = handmatig maandinkomen 5000.
    expect(data.goals[0].current_value).toBe(5000)
    expect(data.goalProgresses[0].current).toBe(5000)
  })

  it('LAZY: zonder parameter-doelen draaien de injectie-queries NIET', async () => {
    const goals = [goal({ goal_type: 'savings' }), goal({ goal_type: 'debt_payoff' })]
    const { supabase, called } = makeSupabase({ goals })
    await loadFinData(supabase)

    expect(called).not.toContain('transactions')
    expect(called).not.toContain('budgets')
    expect(called).not.toContain('net_worth_snapshots')
  })

  it('savings_rate-parameterdoel consumeert de EFFECTIEVE spaarquote uit de gedeelde laag', async () => {
    goalSeq = 0
    const goals = [paramGoal('savings_rate', { target_value: 50, current_value: 0 })]
    // De transacties staan er bewust in: zou het doel nog een eigen rij-lus
    // draaien, dan kwam er 40 % uit ((30000−18000)/30000) i.p.v. de 30 % die de
    // canonieke laag zegt — en dan valt deze assertie luid om.
    const { supabase } = makeSupabase({
      goals,
      transactions: [
        { amount: 30000, budget_id: null, date: '2026-05-01' },
        { amount: -18000, budget_id: null, date: '2026-05-01' },
      ],
    })
    const data = await loadFinData(supabase)

    expect(data.goals[0].current_value).toBe(STUB_EFFECTIEVE_SPAARQUOTE)
    expect(data.goalProgresses[0].current).toBe(STUB_EFFECTIEVE_SPAARQUOTE)
  })

  it('ontbrekende bron: current_value blijft op de DB-waarde (geen kunstmatige 0)', async () => {
    goalSeq = 0
    const goals = [paramGoal('fire_age', { target_value: 55, current_value: 62 })]
    // Geen snapshots → tolerante degradatie.
    const { supabase } = makeSupabase({ goals, snapshots: [] })
    const data = await loadFinData(supabase)

    expect(data.goals[0].current_value).toBe(62) // DB-waarde behouden
  })

  it('metadata-loze (oude) rijen crashen niet en blijven handmatig', async () => {
    goalSeq = 0
    const goals = [
      goal({ goal_type: 'savings_rate', current_value: 33, metadata: undefined }), // handmatige spaarquote, geen tag
      goal({ goal_type: 'salary', current_value: 1234, metadata: null }),
    ]
    const { supabase, called } = makeSupabase({ goals })
    const data = await loadFinData(supabase)

    // Geen parameter-doelen → geen injectie-queries, handmatige current_value ongemoeid.
    expect(called).not.toContain('transactions')
    expect(data.goals.find(g => g.goal_type === 'savings_rate')?.current_value).toBe(33)
    expect(data.goals.find(g => g.goal_type === 'salary')?.current_value).toBe(1234)
  })
})

// ── actions-KPI-totalen: geen kunstmatige afkap onder de cap (Task 2.5) ─────────

describe('loadFinData — actions-KPI-totalen kappen niet af onder de PostgREST-cap', () => {
  it('sommeert over ALLE teruggegeven actie-rijen (fixture > cap van 1000)', async () => {
    // 1200 acties > max_rows (config.toml = 1000). De fake-client negeert `.limit()`,
    // dus alle 1200 komen door — dit bewijst dat de loader-JS zelf GEEN kunstmatige
    // cap legt: elke completed-rij telt mee in de KPI-afleiding.
    const COMPLETED = 800
    const OPEN = 400
    const actions = [
      ...Array.from({ length: COMPLETED }, (_, i) => ({
        id: `c${i}`, status: 'completed', freedom_days_impact: 2,
        source: 'manual', completed_at: '2026-05-01T00:00:00.000Z',
        due_date: null, created_at: '2026-01-01T00:00:00.000Z', recommendation: null,
      })),
      ...Array.from({ length: OPEN }, (_, i) => ({
        id: `o${i}`, status: 'open', freedom_days_impact: 5,
        source: 'manual', completed_at: null, due_date: null,
        created_at: '2026-01-01T00:00:00.000Z', recommendation: null,
      })),
    ]
    const { supabase } = makeSupabase({ actions })
    const data = await loadFinData(supabase)

    // Geen afkap: alle 1200 rijen aanwezig, splitsing per status compleet.
    expect(data.kpiData.allActions).toHaveLength(COMPLETED + OPEN)
    expect(data.kpiData.completedActions).toHaveLength(COMPLETED)
    expect(data.kpiData.openActions).toHaveLength(OPEN)
    // Totaal sommeert over álle 800 completed-rijen (niet afgekapt).
    const totalCompletedFreedomDays = data.kpiData.completedActions.reduce(
      (s, a) => s + a.freedom_days_impact, 0,
    )
    expect(totalCompletedFreedomDays).toBe(COMPLETED * 2)
  })
})
