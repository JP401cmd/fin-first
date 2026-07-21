import { describe, it, expect } from 'vitest'
import {
  autolinkGoalCurrentValues,
  splitActiveGoals,
  syncActiveGoalValues,
  type SyncableGoal,
} from './goal-current-value'
import { computeGoalProgress, type GoalType } from './goal-data'

/**
 * Regressie voor de databron-mismatch die de Doelen-widget "0%" liet tonen terwijl
 * het doelen-scherm (fin-data-loader) bv. 94%/42,3% liet zien: parameter-doelen
 * staan bewust met `current_value: 0` in de DB en het scherm injecteert de LIVE
 * waarde vóór `computeGoalProgress`. Sinds beide loaders `syncActiveGoalValues`
 * consumeren mag de widget nooit meer een andere current_value/volgorde krijgen.
 */

function g(overrides: Partial<SyncableGoal> & { goal_type: GoalType }): SyncableGoal {
  return {
    current_value: 0,
    target_value: 100,
    is_completed: false,
    metadata: null,
    linked_asset_id: null,
    linked_debt_id: null,
    ...overrides,
  }
}

// Minimale fake-Supabase: alleen de net_worth_snapshots-query (fire_age-injectie)
// hoeft data terug te geven; alle andere tabellen leveren [].
function makeSupabase(snapshots: { fire_age: number | string | null }[]) {
  const chain = (table: string): Record<string, unknown> => {
    const q: Record<string, unknown> = {
      select: () => q,
      eq: () => q,
      not: () => q,
      gte: () => q,
      lt: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({
          data: table === 'net_worth_snapshots' ? snapshots : [],
          error: null as null,
        }).then(resolve),
    }
    return q
  }
  return { from: (table: string) => chain(table) } as never
}

describe('autolinkGoalCurrentValues', () => {
  it('asset-gekoppeld doel neemt de live asset-waarde over', () => {
    const goals = [g({ goal_type: 'savings', linked_asset_id: 'a1', current_value: 0, target_value: 20000 })]
    autolinkGoalCurrentValues(goals, [{ id: 'a1', current_value: 12345 }], [])
    expect(goals[0].current_value).toBe(12345)
  })

  it('debt-gekoppeld doel = doel − resterende schuld (geflodderd op 0)', () => {
    const goals = [g({ goal_type: 'debt_payoff', linked_debt_id: 'd1', target_value: 10000, current_value: 0 })]
    autolinkGoalCurrentValues(goals, [], [{ id: 'd1', current_balance: 3000 }])
    expect(goals[0].current_value).toBe(7000)
  })

  it('niet-gekoppeld doel blijft ongemoeid', () => {
    const goals = [g({ goal_type: 'savings', current_value: 500, target_value: 1000 })]
    autolinkGoalCurrentValues(goals, [{ id: 'a1', current_value: 9999 }], [])
    expect(goals[0].current_value).toBe(500)
  })
})

describe('splitActiveGoals — canonieke volgorde (parameter-doelen eerst)', () => {
  it('zet een parameter-doel vooraan ongeacht sort_order', () => {
    const handmatig = g({ goal_type: 'savings' })
    const param = g({ goal_type: 'fire_age', metadata: { bron: 'parameter' } })
    const { goals } = splitActiveGoals([handmatig, param])
    expect(goals[0]).toBe(param)
    expect(goals[1]).toBe(handmatig)
  })
})

describe('syncActiveGoalValues — widget consumeert dezelfde live-waarde als het scherm', () => {
  it('fire_age-parameterdoel met opgeslagen current_value=0 → live fire_age uit snapshot, niet 0%', async () => {
    // Reproductie van de gebruikersmelding: opgeslagen 0, snapshot fire_age = 62,
    // streefleeftijd 58 (direction 'down'). Verwacht: current_value 62, pct 94%.
    const fireGoal = g({ goal_type: 'fire_age', target_value: 58, current_value: 0, metadata: { bron: 'parameter' } })
    const supabase = makeSupabase([{ fire_age: 62 }])

    const { goals } = await syncActiveGoalValues(supabase, [fireGoal], [], [], 'u1')

    expect(goals[0].current_value).toBe(62)
    const pct = computeGoalProgress({
      goal_type: goals[0].goal_type,
      current_value: goals[0].current_value,
      target_value: goals[0].target_value,
      target_date: null,
    }).pct
    expect(pct).toBe(94) // 58/62 → 93,5 → 94; NIET 0% (oude widget-bug)
    expect(pct).toBeGreaterThan(0)
  })

  it('ontbrekende snapshot → current_value blijft op DB-waarde (tolerante degradatie, geen crash)', async () => {
    const fireGoal = g({ goal_type: 'fire_age', target_value: 58, current_value: 60, metadata: { bron: 'parameter' } })
    const supabase = makeSupabase([])
    const { goals } = await syncActiveGoalValues(supabase, [fireGoal], [], [], 'u1')
    expect(goals[0].current_value).toBe(60)
  })

  it('behoudt de scherm-volgorde: parameter-doel vooraan in de top-3', async () => {
    const handmatig = g({ goal_type: 'savings', current_value: 50, target_value: 100 })
    const fireGoal = g({ goal_type: 'fire_age', target_value: 58, current_value: 0, metadata: { bron: 'parameter' } })
    const supabase = makeSupabase([{ fire_age: 62 }])
    const { goals } = await syncActiveGoalValues(supabase, [handmatig, fireGoal], [], [], 'u1')
    expect(goals[0]).toBe(fireGoal)
  })
})
