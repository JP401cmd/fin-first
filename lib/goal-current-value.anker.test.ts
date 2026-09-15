import { describe, it, expect } from 'vitest'
import { syncActiveGoalValues, type SyncableGoal } from './goal-current-value'
import { computeGoalProgress, type GoalType } from './goal-data'
import { buildVrijheidsgetalSnapshot } from './goals/vrijheidsgetal-goal'

/**
 * ADR 0129 F3a (E) — het `fire_age`-doel onder een VAST stop-anker heeft geen
 * uitkomst: de kernel-"vrijheidsleeftijd" ís het anker. Vóór F3a stond het doel onder
 * `now` meteen op "behaald" (fireAge = huidige leeftijd ≤ elk streefgetal). Nu: geen
 * waarde (0 ⇒ "nog geen meting") + `notApplicableReason`, en `computeGoalProgress`
 * geeft dan geen voortgang. Het vrijheidsgetal-doel wordt onder een vast anker NIET
 * gesynchroniseerd (geen doelvermogen, D4).
 */
function g(overrides: Partial<SyncableGoal> & { goal_type: GoalType }): SyncableGoal {
  return { current_value: 0, target_value: 100, is_completed: false, metadata: null, linked_asset_id: null, linked_debt_id: null, ...overrides }
}

function makeSupabase(snapshots: { fire_age: number | string | null }[]) {
  const chain = (table: string): Record<string, unknown> => {
    const q: Record<string, unknown> = {
      select: () => q, eq: () => q, not: () => q, gte: () => q, lt: () => q, order: () => q, limit: () => q,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: table === 'net_worth_snapshots' ? snapshots : [], error: null as null }).then(resolve),
    }
    return q
  }
  return { from: (table: string) => chain(table) } as never
}

const basis = {
  homeExcludedFromFire: false,
  netWorthInclHome: 500_000,
  fireEligibleNetWorth: 500_000,
  requiredNetWorthInclHome: 900_000,
  requiredPortfolioExclHome: 900_000,
  currentAge: 42,
}

describe('buildVrijheidsgetalSnapshot — onder een vast anker geen leeftijd en geen doelwaarde', () => {
  it('now: fireAgeFractional en targetValue null, anker + stopAge + endAge reizen mee', () => {
    const snap = buildVrijheidsgetalSnapshot({ ...basis, fireAgeFractional: 42, stopAnchor: 'now', stopAge: 42, endAge: 90 })
    expect(snap.fireAgeFractional).toBeNull()
    expect(snap.targetValue).toBeNull()
    expect(snap.eta).toBeNull()
    expect(snap.stopAnchor).toBe('now')
    expect(snap.endAge).toBe(90)
  })
  it('age 58,5: het stopmoment blijft fractioneel', () => {
    const snap = buildVrijheidsgetalSnapshot({ ...basis, fireAgeFractional: 58.5, stopAnchor: 'age', stopAge: 58.5, endAge: 90 })
    expect(snap.stopAge).toBe(58.5)
    expect(snap.fireAgeFractional).toBeNull()
  })
  it('solved (weggelaten): ongewijzigd gedrag', () => {
    const snap = buildVrijheidsgetalSnapshot({ ...basis, fireAgeFractional: 52.1 })
    expect(snap.fireAgeFractional).toBe(52.1)
    expect(snap.targetValue).toBe(900_000)
    expect(snap.stopAnchor).toBe('solved')
  })
})

describe('syncActiveGoalValues — fire_age-doel onder een vast anker', () => {
  const ankerSnapshot = { currentValue: 500_000, targetValue: null, eta: null, fireAgeFractional: null, stopAnchor: 'now' as const, stopAge: 42, endAge: 90 }

  it("now: het doel leest NIET 'behaald' — geen waarde, wél de notitie; computeGoalProgress geeft geen voortgang", async () => {
    const fireGoal = g({ goal_type: 'fire_age', target_value: 53, current_value: 0, metadata: { bron: 'parameter' } })
    // De snapshotkolom draagt een scalar-leeftijd die het doel zou laten "behalen" (42,8 ≤ 53).
    const { goals } = await syncActiveGoalValues(makeSupabase([{ fire_age: 42.8 }]), [fireGoal], [], [], 'u1', async () => ankerSnapshot)
    expect(goals[0].current_value).toBe(0)
    expect(goals[0].notApplicableReason).toMatch(/^Je rekent alsof je nu stopt/)
    const progress = computeGoalProgress({ ...goals[0], target_date: null })
    expect(progress.pct).toBe(0)
    // ADR 0145 — n.v.t. is géén oordeel: onTrack waar + paceSkipped, zodat /overzicht
    // het doel niet als "vraagt aandacht" telt.
    expect(progress.onTrack).toBe(true)
    expect(progress.paceSkipped).toBe(true)
    expect(progress.measured).toBe(false)
    expect(progress.notApplicableReason).toBe(goals[0].notApplicableReason)
  })

  it('age 62: de notitie noemt het stopmoment en het plan-einde', async () => {
    const fireGoal = g({ goal_type: 'fire_age', target_value: 53, current_value: 0, metadata: { bron: 'parameter' } })
    const { goals } = await syncActiveGoalValues(makeSupabase([]), [fireGoal], [], [], 'u1', async () => ({ ...ankerSnapshot, stopAnchor: 'age' as const, stopAge: 62 }))
    expect(goals[0].notApplicableReason).toBe(
      'Je stopmoment ligt vast op 62, dus dit doel heeft geen uitkomst om naar te kijken. Wat telt, is of je plan tot je 90e reikt.',
    )
  })

  it('solved: ongewijzigd — de kernel-leeftijd wint en er is geen notitie', async () => {
    const fireGoal = g({ goal_type: 'fire_age', target_value: 53, current_value: 0, metadata: { bron: 'parameter' } })
    const { goals } = await syncActiveGoalValues(makeSupabase([{ fire_age: 42.8 }]), [fireGoal], [], [], 'u1', async () => ({
      currentValue: 500_000, targetValue: 900_000, eta: 'mrt 2039', fireAgeFractional: 52.1, stopAnchor: 'solved' as const,
    }))
    expect(goals[0].current_value).toBe(52.1)
    expect(goals[0].notApplicableReason).toBeUndefined()
  })

  it('het vrijheidsgetal-doel houdt onder een vast anker zijn opgeslagen waarden (alles-of-niets) én krijgt de reden (ADR 0145)', async () => {
    const vg = g({ goal_type: 'net_worth', target_value: 700_000, current_value: 123, metadata: { standaardDoel: 'vrijheidsgetal' } })
    const { goals, vrijheidsgetalSynced } = await syncActiveGoalValues(makeSupabase([]), [vg], [], [], 'u1', async () => ({ ...ankerSnapshot, stopAnchor: 'age' as const, stopAge: 62 }))
    expect(vrijheidsgetalSynced).toBe(0)
    expect(goals[0].current_value).toBe(123)
    expect(goals[0].target_value).toBe(700_000)
    // Vóór ADR 0145 viel dit doel stil terug op de opgeslagen waarde, zonder notitie.
    expect(goals[0].notApplicableReason).toBe(
      'Je stopmoment ligt vast op 62, dus er is geen doelvermogen om naartoe te sparen. Wat telt, is of je plan tot je 90e reikt.',
    )
    expect(computeGoalProgress({ ...goals[0], target_date: null }).measured).toBe(false)
  })

  it('het vrijheidsgetal-doel onder solved: geen reden (ongewijzigd)', async () => {
    const vg = g({ goal_type: 'net_worth', target_value: 700_000, current_value: 123, metadata: { standaardDoel: 'vrijheidsgetal' } })
    const { goals } = await syncActiveGoalValues(makeSupabase([]), [vg], [], [], 'u1', async () => ({
      currentValue: 500_000, targetValue: 900_000, eta: 'mrt 2039', fireAgeFractional: 52.1, stopAnchor: 'solved' as const,
    }))
    expect(goals[0].notApplicableReason).toBeUndefined()
    expect(goals[0].current_value).toBe(500_000)
  })
})

describe('syncActiveGoalValues — plan_coverage ("Plan gedekt", ADR 0145)', () => {
  const dekkingGoal = () => g({ goal_type: 'plan_coverage', target_value: 100, current_value: 12, metadata: { bron: 'parameter', eindleeftijd: 90, stopAnker: 'age', stopLeeftijd: 58 } })

  it('vast anker: current_value = de dekking uit de bundel (planCoveragePct), geen notitie', async () => {
    const { goals } = await syncActiveGoalValues(makeSupabase([]), [dekkingGoal()], [], [], 'u1', async () => ({
      currentValue: 500_000, targetValue: null, eta: null, fireAgeFractional: null, stopAnchor: 'age' as const, stopAge: 58, endAge: 90, planCoveragePct: 78.4,
    }))
    expect(goals[0].current_value).toBe(78.4)
    expect(goals[0].notApplicableReason).toBeUndefined()
    const p = computeGoalProgress({ ...goals[0], target_date: null })
    expect(p.pct).toBe(78)
    expect(p.measured).toBe(true)
  })

  it('vast anker zonder dekkingsuitspraak (null/undefined): de opgeslagen waarde blijft staan', async () => {
    const { goals } = await syncActiveGoalValues(makeSupabase([]), [dekkingGoal()], [], [], 'u1', async () => ({
      currentValue: 500_000, targetValue: null, eta: null, fireAgeFractional: null, stopAnchor: 'aow' as const, stopAge: 67, endAge: 90, planCoveragePct: null,
    }))
    expect(goals[0].current_value).toBe(12)
    expect(goals[0].notApplicableReason).toBeUndefined()
  })

  it('solved: geen uitkomst — waarde 0 + de reden; computeGoalProgress meet niets', async () => {
    const { goals } = await syncActiveGoalValues(makeSupabase([]), [dekkingGoal()], [], [], 'u1', async () => ({
      currentValue: 500_000, targetValue: 900_000, eta: 'mrt 2039', fireAgeFractional: 52.1, stopAnchor: 'solved' as const,
    }))
    expect(goals[0].current_value).toBe(0)
    expect(goals[0].notApplicableReason).toBe(
      'De app zoekt je stopmoment zelf, dus dit doel heeft geen uitkomst om naar te kijken. Wat telt, is vanaf welke leeftijd werken een keuze wordt.',
    )
    expect(computeGoalProgress({ ...goals[0], target_date: null })).toMatchObject({ pct: 0, measured: false, onTrack: true, paceSkipped: true })
  })

  it('de lazy fire-thunk draait óók wanneer alleen een plan_coverage-doel actief is', async () => {
    let aangeroepen = 0
    await syncActiveGoalValues(makeSupabase([]), [dekkingGoal()], [], [], 'u1', async () => {
      aangeroepen += 1
      return { currentValue: 0, targetValue: null, eta: null, fireAgeFractional: null, stopAnchor: 'age' as const, stopAge: 58, endAge: 90, planCoveragePct: 50 }
    })
    expect(aangeroepen).toBe(1)
  })

  it('zonder FIRE-doel blijft de thunk ongebruikt (regressie: geen kernel-run voor niets)', async () => {
    let aangeroepen = 0
    await syncActiveGoalValues(makeSupabase([]), [g({ goal_type: 'savings', target_value: 1000 })], [], [], 'u1', async () => {
      aangeroepen += 1
      return null
    })
    expect(aangeroepen).toBe(0)
  })
})

describe('syncActiveGoalValues — eindvermogen uit het lab (end_balance, ADR 0145 D12)', () => {
  const labEindGoal = () =>
    g({ goal_type: 'end_balance', target_value: 250_000, current_value: 0, metadata: { bron: 'parameter', oorsprong: 'lab', eindleeftijd: 90, stopAnker: 'age', stopLeeftijd: 60 } })

  it('vast anker: het lab-doel meet live het eindsaldo uit de kernel-run — geen notitie', async () => {
    const { goals } = await syncActiveGoalValues(makeSupabase([]), [labEindGoal()], [], [], 'u1', async () => ({
      currentValue: 500_000, targetValue: null, eta: null, fireAgeFractional: null, stopAnchor: 'age' as const, stopAge: 60, endAge: 90, endBalanceAtEndAge: 180_000,
    }))
    expect(goals[0].current_value).toBe(180_000)
    expect(goals[0].notApplicableReason).toBeUndefined()
    expect(computeGoalProgress({ ...goals[0], target_date: null }).pct).toBe(72)
  })

  it('solved: blijft meten (een eindvermogen heeft onder élk anker een uitkomst) — geen n.v.t.', async () => {
    const { goals } = await syncActiveGoalValues(makeSupabase([]), [labEindGoal()], [], [], 'u1', async () => ({
      currentValue: 500_000, targetValue: 900_000, eta: 'mrt 2039', fireAgeFractional: 52.1, stopAnchor: 'solved' as const, endBalanceAtEndAge: 90_000,
    }))
    expect(goals[0].current_value).toBe(90_000)
    expect(goals[0].notApplicableReason).toBeUndefined()
  })
})

describe('buildVrijheidsgetalSnapshot — planCoveragePct reist alleen onder een vast anker mee', () => {
  it('vast anker: doorgegeven; solved: null (freedomPct is daar een kapitaalratio)', () => {
    expect(buildVrijheidsgetalSnapshot({ ...basis, fireAgeFractional: 58, stopAnchor: 'age', stopAge: 58, endAge: 90, planCoveragePct: 64.2 }).planCoveragePct).toBe(64.2)
    expect(buildVrijheidsgetalSnapshot({ ...basis, fireAgeFractional: 52.1, stopAnchor: 'solved', planCoveragePct: 64.2 }).planCoveragePct).toBeNull()
    expect(buildVrijheidsgetalSnapshot({ ...basis, fireAgeFractional: 52.1, planCoveragePct: 64.2 }).planCoveragePct).toBeNull()
    expect(buildVrijheidsgetalSnapshot({ ...basis, fireAgeFractional: 58, stopAnchor: 'aow', stopAge: 67, endAge: 90 }).planCoveragePct).toBeNull()
  })
})
