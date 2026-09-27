/**
 * Eigenaar-scoping van de `fire_age`-terugval in `injectParameterGoalCurrentValues`.
 *
 * Security-review 27 sep 2026, live geverifieerd: de SELECT-policy op
 * `net_worth_snapshots` is huishoud-gedeeld
 * (`auth.uid() = user_id OR (ownership = 'shared' AND household_id = user_household_id())`),
 * en `ownership`/`household_id` zijn door de gebruiker zelf schrijfbaar. Een partner
 * kan dus een eigen rij op 'shared' zetten. De query "laatste fire_age" filterde
 * niet op `user_id`, dus een recentere gedeelde partnerrij won van de eigen rij:
 * het fire_age-doel toonde de FIRE-leeftijd van de partner.
 *
 * De simulatie past de filters werkelijk toe en laat RLS weg, zodat de partnerrij
 * zichtbaar is zolang de query zelf niet scoopt.
 */
import { describe, it, expect } from 'vitest'
import { injectParameterGoalCurrentValues } from './goal-current-value'
import type { GoalType } from './goal-data'
import { hasEq, makePostgrestSim } from '@/lib/test-utils/postgrest-sim'

const SNAPSHOTS = [
  { user_id: 'ik', snapshot_date: '2026-09-20', fire_age: 62, ownership: 'personal' },
  // Recenter én gedeeld: de huishoud-policy laat deze rij door.
  { user_id: 'partner', snapshot_date: '2026-09-26', fire_age: 41, ownership: 'shared' },
]

function fireGoal(): { goal_type: GoalType; current_value: number } {
  return { goal_type: 'fire_age', current_value: 0 }
}

describe('injectParameterGoalCurrentValues — fire_age uit de EIGEN snapshot', () => {
  it('Given een recentere gedeelde partnersnapshot, When het fire_age-doel ververst, Then telt alleen de eigen rij en draagt de query .eq(user_id)', async () => {
    const sim = makePostgrestSim({ net_worth_snapshots: SNAPSHOTS })
    const goals = [fireGoal()]

    await injectParameterGoalCurrentValues(sim.client, goals, 'ik')

    expect(goals[0].current_value).toBe(62)
    const [call] = sim.callsTo('net_worth_snapshots')
    expect(call).toBeDefined()
    expect(hasEq(call, 'user_id', 'ik')).toBe(true)
  })

  it('Given geen eigen id, When het fire_age-doel ververst, Then draait er geen snapshotquery en blijft de DB-waarde staan (fail-closed)', async () => {
    const sim = makePostgrestSim({ net_worth_snapshots: SNAPSHOTS }, null)
    const goals = [{ goal_type: 'fire_age' as GoalType, current_value: 58 }]

    await injectParameterGoalCurrentValues(sim.client, goals, null)

    expect(sim.callsTo('net_worth_snapshots')).toHaveLength(0)
    expect(goals[0].current_value).toBe(58)
  })
})
