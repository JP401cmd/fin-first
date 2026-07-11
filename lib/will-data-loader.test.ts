import { describe, it, expect, vi } from 'vitest'

/**
 * Tests voor de parameter-doel-laag in `will-data-loader.ts` (ronde 4, stap 4):
 *   1. cap-splitsing (`splitActiveGoals`) — parameter-doelen buiten de max-5-slice,
 *      vooraan, index-gekoppeld;
 *   2. de pure actuele-waarde-computers per bron (spaarquote/salaris/rendement/
 *      vrijheidsleeftijd) inclusief de tolerante "ontbrekende bron"-degradatie;
 *   3. end-to-end via `loadWillData` met een fake-Supabase: cap-split-volgorde, de
 *      LAZY injectie-bedrading (geen queries zonder parameter-doelen) en metadata-
 *      loze (oude) rijen die niet crashen.
 *
 * `getCachedUser` wordt gemockt zodat de loader een vaste user krijgt; alle data
 * komt uit de fake-Supabase-client.
 */

vi.mock('@/lib/supabase/cached-user', () => ({
  getCachedUser: vi.fn(async () => ({ id: 'u1' })),
}))

import {
  loadWillData,
  isParameterGoal,
  splitActiveGoals,
  computeParameterSavingsRatePct,
  computeParameterEffectiveSalary,
  computeParameterWeightedReturnPct,
  pickLatestSnapshotFireAge,
  type GoalWithBudget,
} from './will-data-loader'
import type { Debt } from './debt-data'

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

// ── computeParameterSavingsRatePct ──────────────────────────────────────────

describe('computeParameterSavingsRatePct — canonieke spaarquote-grondslag', () => {
  const tx6m = [
    { amount: 30000, budget_id: null, date: '2026-03-01' }, // 6 × 5000 inkomen
    { amount: -18000, budget_id: null, date: '2026-03-01' }, // 6 × 3000 uitgaven
  ]

  it('basis: (inkomen − uitgaven) / inkomen', () => {
    expect(computeParameterSavingsRatePct(tx6m, [], [])).toBe(40) // (30000-18000)/30000
  })

  it('spaarbudget-uitgaven tellen als sparen (add-back)', () => {
    const budgets = [{ id: 'b-spaar', budget_type: 'savings', parent_id: null }]
    const tx = [
      { amount: 30000, budget_id: null, date: '2026-03-01' },
      { amount: -18000, budget_id: null, date: '2026-03-01' },
      { amount: -3000, budget_id: 'b-spaar', date: '2026-03-01' }, // 6 × 500 spaarbudget
    ]
    // uitgaven 21000, waarvan 3000 spaarbudget → (30000 − (21000−3000))/30000 = 40
    expect(computeParameterSavingsRatePct(tx, budgets, [])).toBe(40)
  })

  it('kind-budget erft savings-type van zijn parent', () => {
    const budgets = [
      { id: 'b-parent', budget_type: 'savings', parent_id: null },
      { id: 'b-child', budget_type: 'expense', parent_id: 'b-parent' },
    ]
    const tx = [
      { amount: 30000, budget_id: null, date: '2026-03-01' },
      { amount: -18000, budget_id: null, date: '2026-03-01' },
      { amount: -3000, budget_id: 'b-child', date: '2026-03-01' },
    ]
    expect(computeParameterSavingsRatePct(tx, budgets, [])).toBe(40)
  })

  it('schuldaflossing telt als sparen (via computeDebtAflossingMonthly)', () => {
    const debts = [
      {
        id: 'd1',
        is_active: true,
        include_aflossing_in_savings: true,
        custom_aflossing_amount: 200, // €200/mnd → 6m = 1200
        net_worth_inclusion_pct: 100,
        current_balance: 10000,
      } as unknown as Debt,
    ]
    // (30000 − 18000 + 1200)/30000 = 44
    expect(computeParameterSavingsRatePct(tx6m, [], debts)).toBe(44)
  })

  it('geen inkomen → undefined (tolerant: laat DB-waarde staan)', () => {
    expect(computeParameterSavingsRatePct([{ amount: -500, budget_id: null, date: '2026-03-01' }], [], [])).toBeUndefined()
    expect(computeParameterSavingsRatePct([], [], [])).toBeUndefined()
  })

  it('negatieve spaarquote blijft eerlijk behouden (geen clamp)', () => {
    const tx = [
      { amount: 12000, budget_id: null, date: '2026-03-01' },
      { amount: -18000, budget_id: null, date: '2026-03-01' },
    ]
    expect(computeParameterSavingsRatePct(tx, [], [])).toBe(-50)
  })

  it('rondt op 1 decimaal', () => {
    const tx = [
      { amount: 3000, budget_id: null, date: '2026-03-01' },
      { amount: -2000, budget_id: null, date: '2026-03-01' },
    ]
    // (3000-2000)/3000 = 33.333% → 33.3
    expect(computeParameterSavingsRatePct(tx, [], [])).toBe(33.3)
  })
})

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

// ── Fake-Supabase voor loadWillData-integratie ──────────────────────────────

interface SupaConfig {
  goals?: GoalWithBudget[]
  transactions?: { amount: number; budget_id: string | null; date: string }[]
  budgets?: { id: string; budget_type: string; parent_id: string | null }[]
  debts?: unknown[]
  assets?: unknown[]
  snapshots?: { fire_age: number | string | null }[]
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

// ── loadWillData — integratie ───────────────────────────────────────────────

describe('loadWillData — cap-split + lazy injectie (integratie)', () => {
  it('parameter-doelen komen vooraan; goalProgresses blijft index-gekoppeld', async () => {
    goalSeq = 0
    const goals = [
      goal({ goal_type: 'savings', name: 'Handmatig 1' }),
      paramGoal('salary', { name: 'Salaris-doel', target_value: 6000 }),
      goal({ goal_type: 'savings', name: 'Handmatig 2' }),
    ]
    const { supabase } = makeSupabase({ goals, profileFinancials: { net_monthly_income: 5000, income_source: 'manual' } })
    const data = await loadWillData(supabase)

    expect(data.goals[0].name).toBe('Salaris-doel')
    expect(data.goalProgresses).toHaveLength(3)
    // Salaris-doel: current geïnjecteerd = handmatig maandinkomen 5000.
    expect(data.goals[0].current_value).toBe(5000)
    expect(data.goalProgresses[0].current).toBe(5000)
  })

  it('LAZY: zonder parameter-doelen draaien de injectie-queries NIET', async () => {
    const goals = [goal({ goal_type: 'savings' }), goal({ goal_type: 'debt_payoff' })]
    const { supabase, called } = makeSupabase({ goals })
    await loadWillData(supabase)

    expect(called).not.toContain('transactions')
    expect(called).not.toContain('budgets')
    expect(called).not.toContain('net_worth_snapshots')
  })

  it('savings_rate-parameterdoel krijgt de canonieke 6m-spaarquote geïnjecteerd', async () => {
    goalSeq = 0
    const goals = [paramGoal('savings_rate', { target_value: 50, current_value: 0 })]
    const { supabase, called } = makeSupabase({
      goals,
      transactions: [
        { amount: 30000, budget_id: null, date: '2026-05-01' },
        { amount: -18000, budget_id: null, date: '2026-05-01' },
      ],
    })
    const data = await loadWillData(supabase)

    expect(called).toContain('transactions')
    expect(data.goals[0].current_value).toBe(40) // (30000-18000)/30000
    expect(data.goalProgresses[0].current).toBe(40)
  })

  it('ontbrekende bron: current_value blijft op de DB-waarde (geen kunstmatige 0)', async () => {
    goalSeq = 0
    const goals = [paramGoal('fire_age', { target_value: 55, current_value: 62 })]
    // Geen snapshots → tolerante degradatie.
    const { supabase } = makeSupabase({ goals, snapshots: [] })
    const data = await loadWillData(supabase)

    expect(data.goals[0].current_value).toBe(62) // DB-waarde behouden
  })

  it('metadata-loze (oude) rijen crashen niet en blijven handmatig', async () => {
    goalSeq = 0
    const goals = [
      goal({ goal_type: 'savings_rate', current_value: 33, metadata: undefined }), // handmatige spaarquote, geen tag
      goal({ goal_type: 'salary', current_value: 1234, metadata: null }),
    ]
    const { supabase, called } = makeSupabase({ goals })
    const data = await loadWillData(supabase)

    // Geen parameter-doelen → geen injectie-queries, handmatige current_value ongemoeid.
    expect(called).not.toContain('transactions')
    expect(data.goals.find(g => g.goal_type === 'savings_rate')?.current_value).toBe(33)
    expect(data.goals.find(g => g.goal_type === 'salary')?.current_value).toBe(1234)
  })
})
