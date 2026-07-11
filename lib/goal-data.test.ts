/**
 * Unit-tests voor `lib/goal-data.ts` — de doel-metadata en de voortgangsmotor
 * `computeGoalProgress`.
 *
 * Focus:
 *  1. REGRESSIE — de bestaande (up-)doel-types moeten zich exact hetzelfde
 *     blijven gedragen na de introductie van richting-bewuste voortgang.
 *  2. Twee nieuwe lab-gegenereerde types (`expected_return`, `fire_age`):
 *     meta-velden, `formatGoalValue`, `goalValueLabels` en — voor `fire_age` —
 *     de `direction: 'down'`-tak (lager-is-beter).
 */

import { describe, it, expect } from 'vitest'
import {
  computeGoalProgress,
  formatGoalValue,
  goalValueLabels,
  GOAL_TYPE_META,
  GOAL_TYPE_LABELS,
  GOAL_TYPE_ICONS,
  type Goal,
  type GoalType,
} from './goal-data'

/** Minimale, volledig getypeerde Goal-fixture — alleen de velden die
 *  computeGoalProgress leest hoeven per test te worden overschreven. */
function makeGoal(overrides: Partial<Goal>): Goal {
  return {
    id: 'test-goal', user_id: 'test-user', name: 'Doel', description: null,
    goal_type: 'savings', target_value: 5000, current_value: 0, target_date: null,
    linked_asset_id: null, linked_debt_id: null, budget_id: null, custom_unit: null,
    icon: 'PiggyBank', color: 'emerald', is_completed: false, completed_at: null,
    sort_order: 0, ownership: 'personal', household_id: null,
    created_at: '2026-01-01', updated_at: '2026-01-01',
    ...overrides,
  }
}

// ── 1. Regressie: bestaande 'up'-types byte-identiek ───────────────────────

describe('computeGoalProgress — bestaande up-types (regressie)', () => {
  it('savings: 3000/5000 = 60%, zonder datum onTrack=true, eta=null', () => {
    const p = computeGoalProgress(makeGoal({ goal_type: 'savings', current_value: 3000, target_value: 5000 }))
    expect(p).toEqual({ current: 3000, target: 5000, pct: 60, onTrack: true, eta: null })
  })

  it('savings: current > target → pct geclampt op 100', () => {
    const p = computeGoalProgress(makeGoal({ current_value: 9000, target_value: 5000 }))
    expect(p.pct).toBe(100)
  })

  it('target <= 0 → pct 0, onTrack false, eta null', () => {
    const p = computeGoalProgress(makeGoal({ current_value: 100, target_value: 0 }))
    expect(p).toEqual({ current: 100, target: 0, pct: 0, onTrack: false, eta: null })
  })

  it('debt_payoff: 4000 afgelost van 10000 = 40%', () => {
    const p = computeGoalProgress(makeGoal({ goal_type: 'debt_payoff', current_value: 4000, target_value: 10000 }))
    expect(p.pct).toBe(40)
    expect(p.onTrack).toBe(true)
  })

  it('savings_rate blijft up-richting (hoger is beter): 20/40 = 50%', () => {
    const p = computeGoalProgress(makeGoal({ goal_type: 'savings_rate', current_value: 20, target_value: 40 }))
    expect(p.pct).toBe(50)
    expect(p.onTrack).toBe(true)
  })

  it('met target_date: ruim vóór op schema → onTrack true + eta gezet', () => {
    // created_at 100 dagen terug, target_date 100 dagen vooruit → expectedPct ~50%.
    const now = Date.now()
    const created = new Date(now - 100 * 86400_000).toISOString()
    const target = new Date(now + 100 * 86400_000).toISOString()
    const p = computeGoalProgress(makeGoal({
      current_value: 3000, target_value: 5000, // 60%
      created_at: created, target_date: target,
    }))
    expect(p.pct).toBe(60)
    expect(p.onTrack).toBe(true) // 60 >= 50*0.9 = 45
    expect(p.eta).not.toBeNull()
  })

  it('met target_date: achter op schema → onTrack false', () => {
    const now = Date.now()
    const created = new Date(now - 100 * 86400_000).toISOString()
    const target = new Date(now + 100 * 86400_000).toISOString()
    const p = computeGoalProgress(makeGoal({
      current_value: 500, target_value: 5000, // 10%
      created_at: created, target_date: target,
    }))
    expect(p.pct).toBe(10)
    expect(p.onTrack).toBe(false) // 10 < 45
    expect(p.eta).not.toBeNull()
  })
})

// ── 2. Nieuwe richting: 'down' (fire_age, lager-is-beter) ──────────────────

describe('computeGoalProgress — down-richting (fire_age)', () => {
  it('op koers: huidige leeftijd == doel → 100% en onTrack', () => {
    const p = computeGoalProgress(makeGoal({ goal_type: 'fire_age', current_value: 58, target_value: 58 }))
    expect(p.pct).toBe(100)
    expect(p.onTrack).toBe(true)
    expect(p.eta).toBeNull()
  })

  it('niet op koers: huidige leeftijd ver boven doel → <100% en niet onTrack', () => {
    // 58/62 = 0,935 → 94%; 62 > 58 + 0,25 → niet op koers.
    const p = computeGoalProgress(makeGoal({ goal_type: 'fire_age', current_value: 62, target_value: 58 }))
    expect(p.pct).toBe(94)
    expect(p.onTrack).toBe(false)
  })

  it('current 0 (of null → 0): 0% en niet onTrack', () => {
    const p = computeGoalProgress(makeGoal({ goal_type: 'fire_age', current_value: 0, target_value: 58 }))
    expect(p).toEqual({ current: 0, target: 58, pct: 0, onTrack: false, eta: null })
  })

  it('doel bereikt met overshoot (current < target) → pct geclampt op 100 + onTrack', () => {
    // Eerder vrij dan gepland: 58/55 = 105% → clamp 100; 55 <= 58,25 → op koers.
    const p = computeGoalProgress(makeGoal({ goal_type: 'fire_age', current_value: 55, target_value: 58 }))
    expect(p.pct).toBe(100)
    expect(p.onTrack).toBe(true)
  })

  it('tolerantie-grens: current == target + 0,25 → nog net op koers', () => {
    const p = computeGoalProgress(makeGoal({ goal_type: 'fire_age', current_value: 58.25, target_value: 58 }))
    expect(p.onTrack).toBe(true)
  })

  it('tolerantie-grens: current net boven target + 0,25 → niet op koers', () => {
    const p = computeGoalProgress(makeGoal({ goal_type: 'fire_age', current_value: 58.5, target_value: 58 }))
    expect(p.onTrack).toBe(false)
  })

  it('target <= 0 (ongeldig) → 0% en niet onTrack', () => {
    const p = computeGoalProgress(makeGoal({ goal_type: 'fire_age', current_value: 60, target_value: 0 }))
    expect(p).toEqual({ current: 60, target: 0, pct: 0, onTrack: false, eta: null })
  })

  it('down-tak negeert target_date (geen eta, geen tijdlijn-onTrack)', () => {
    const now = Date.now()
    const target = new Date(now + 100 * 86400_000).toISOString()
    const p = computeGoalProgress(makeGoal({
      goal_type: 'fire_age', current_value: 62, target_value: 58, target_date: target,
    }))
    expect(p.eta).toBeNull()
    expect(p.onTrack).toBe(false)
  })
})

// ── 3. Meta-velden ─────────────────────────────────────────────────────────

describe('GOAL_TYPE_META — nieuwe types', () => {
  it('expected_return: %/0.1/0–20, up (default), viaLab', () => {
    const m = GOAL_TYPE_META.expected_return
    expect(m.unit).toBe('%')
    expect(m.step).toBe('0.1')
    expect(m.min).toBe(0)
    expect(m.max).toBe(20)
    expect(m.direction).toBeUndefined() // default 'up'
    expect(m.viaLab).toBe(true)
    expect(m.group).toBe('Financieel')
    expect(m.freedomTimeRelevant).toBe(false)
  })

  it('fire_age: jaar/0.5/18–100, direction down, viaLab', () => {
    const m = GOAL_TYPE_META.fire_age
    expect(m.unit).toBe('jaar')
    expect(m.step).toBe('0.5')
    expect(m.min).toBe(18)
    expect(m.max).toBe(100)
    expect(m.direction).toBe('down')
    expect(m.viaLab).toBe(true)
    expect(m.group).toBe('Financieel')
    expect(m.freedomTimeRelevant).toBe(false)
  })

  it('labels en iconen aanwezig voor beide nieuwe types', () => {
    expect(GOAL_TYPE_LABELS.expected_return).toBe('Verwacht rendement')
    expect(GOAL_TYPE_LABELS.fire_age).toBe('Vrijheidsleeftijd')
    expect(GOAL_TYPE_ICONS.expected_return).toBe('Coins')
    expect(GOAL_TYPE_ICONS.fire_age).toBe('Hourglass')
  })
})

describe('GOAL_TYPE_META — vlaggen op bestaande types (regressie)', () => {
  it('alleen fire_age heeft direction "down"; alle andere zijn up (undefined)', () => {
    for (const type of Object.keys(GOAL_TYPE_META) as GoalType[]) {
      if (type === 'fire_age') {
        expect(GOAL_TYPE_META[type].direction).toBe('down')
      } else {
        expect(GOAL_TYPE_META[type].direction).toBeUndefined()
      }
    }
  })

  it('viaLab alleen op de twee lab-types; savings_rate/salary blijven vrij aanmaakbaar', () => {
    const labTypes: GoalType[] = ['expected_return', 'fire_age']
    for (const type of Object.keys(GOAL_TYPE_META) as GoalType[]) {
      const expected = labTypes.includes(type)
      expect(Boolean(GOAL_TYPE_META[type].viaLab)).toBe(expected)
    }
    // Expliciet: de instelbare parameter-achtige types blijven handmatig.
    expect(GOAL_TYPE_META.savings_rate.viaLab).toBeFalsy()
    expect(GOAL_TYPE_META.salary.viaLab).toBeFalsy()
  })
})

// ── 4. formatGoalValue + goalValueLabels voor de nieuwe types ──────────────

describe('formatGoalValue — nieuwe types', () => {
  it('expected_return: % met 1 decimaal (nl-NL)', () => {
    expect(formatGoalValue(6, 'expected_return')).toBe('6,0%')
    expect(formatGoalValue(7.5, 'expected_return')).toBe('7,5%')
  })

  it('fire_age: hele jaren zonder decimaal, halve jaren met komma', () => {
    expect(formatGoalValue(58, 'fire_age')).toBe('58 jaar')
    expect(formatGoalValue(58.5, 'fire_age')).toBe('58,5 jaar')
  })

  it('regressie: bestaande EUR/% formattering ongewijzigd', () => {
    expect(formatGoalValue(5000, 'savings')).toBe('€5.000')
    expect(formatGoalValue(40, 'savings_rate')).toBe('40,0%')
  })
})

describe('goalValueLabels — nieuwe types', () => {
  it('expected_return', () => {
    expect(goalValueLabels('expected_return')).toEqual({
      target: 'Doelrendement (%)', current: 'Huidig rendement (%)',
    })
  })

  it('fire_age', () => {
    expect(goalValueLabels('fire_age')).toEqual({
      target: 'Doel-vrijheidsleeftijd', current: 'Huidige vrijheidsleeftijd',
    })
  })
})
