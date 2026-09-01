import { describe, it, expect, vi } from 'vitest'
import {
  autolinkGoalCurrentValues,
  computeLinkedCurrentValue,
  splitActiveGoals,
  syncActiveGoalValues,
  MAX_HANDMATIGE_DOELEN,
  type GoalLinkRow,
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

describe('syncActiveGoalValues — fire_age-doel volgt de canonieke kernel-run boven de snapshotkolom', () => {
  /**
   * `net_worth_snapshots.fire_age` wordt elke ochtend door de daily-open-sync met
   * de SCALAR-motor herschreven en pas bij een /toekomst-bezoek door de kernel
   * gepatcht — de doelkaart wisselde daardoor binnen één dag van motor (42,8 vs
   * 46,3 op een productie-account, 31 aug 2026). Norm: is de canonieke kernel-run
   * beschikbaar (dezelfde `loadVrijheidsgetalSnapshot`-thunk die het
   * vrijheidsgetal-doel al voedt), dan wint die; de snapshotkolom is alleen nog
   * de terugval wanneer de kernel geen uitkomst heeft.
   */
  const kernelSnapshot = {
    currentValue: 500_000,
    targetValue: 900_000,
    eta: 'mrt 2039',
    fireAgeFractional: 52.1,
  }

  it('kernel-run beschikbaar → fire_age-doel toont fireAgeFractional, niet de scalar-snapshotwaarde', async () => {
    const fireGoal = g({ goal_type: 'fire_age', target_value: 53, current_value: 0, metadata: { bron: 'parameter' } })
    const supabase = makeSupabase([{ fire_age: 42.8 }])
    const { goals } = await syncActiveGoalValues(supabase, [fireGoal], [], [], 'u1', async () => kernelSnapshot)
    expect(goals[0].current_value).toBe(52.1)
  })

  it('de fire-thunk draait óók zonder vrijheidsgetal-doel zodra er een fire_age-parameterdoel is', async () => {
    const fireGoal = g({ goal_type: 'fire_age', target_value: 53, current_value: 0, metadata: { bron: 'parameter' } })
    const supabase = makeSupabase([])
    let calls = 0
    await syncActiveGoalValues(supabase, [fireGoal], [], [], 'u1', async () => {
      calls++
      return kernelSnapshot
    })
    expect(calls).toBe(1)
  })

  it('kernel zonder uitkomst (fireAgeFractional null) → snapshotkolom blijft de terugval', async () => {
    const fireGoal = g({ goal_type: 'fire_age', target_value: 53, current_value: 0, metadata: { bron: 'parameter' } })
    const supabase = makeSupabase([{ fire_age: 42.8 }])
    const { goals } = await syncActiveGoalValues(supabase, [fireGoal], [], [], 'u1', async () => ({
      ...kernelSnapshot,
      fireAgeFractional: null,
    }))
    expect(goals[0].current_value).toBe(42.8)
  })

  it('zonder thunk (aanroeper zonder fire-bron) blijft het bestaande snapshotgedrag intact', async () => {
    const fireGoal = g({ goal_type: 'fire_age', target_value: 53, current_value: 0, metadata: { bron: 'parameter' } })
    const supabase = makeSupabase([{ fire_age: 42.8 }])
    const { goals } = await syncActiveGoalValues(supabase, [fireGoal], [], [], 'u1')
    expect(goals[0].current_value).toBe(42.8)
  })
})

// ── computeLinkedCurrentValue — de ENE huidige-waarde-formule voor `goal_links` ──

describe('computeLinkedCurrentValue', () => {
  it('alleen bezittingen: som van de gekoppelde waarden', () => {
    const v = computeLinkedCurrentValue(
      0,
      [{ current_value: 1000 }, { current_value: 2000 }],
      [],
    )
    expect(v).toBe(3000)
  })

  it('alleen schulden: doel min som van de saldi, geklemd op 0', () => {
    // Onder het doel: normale voortgang.
    expect(
      computeLinkedCurrentValue(10000, [], [{ current_balance: 3000 }, { current_balance: 2000 }]),
    ).toBe(5000)
    // Schuldsaldo groter dan het doel → geklemd op 0, niet negatief.
    expect(computeLinkedCurrentValue(1000, [], [{ current_balance: 5000 }])).toBe(0)
  })

  it('gemengd (bezittingen én schulden): netto, NIET geklemd op 0', () => {
    // €10.000 spaargeld tegenover €25.000 schuld → eerlijk −€15.000, geen clamp.
    const v = computeLinkedCurrentValue(
      0,
      [{ current_value: 10000 }],
      [{ current_balance: 25000 }],
    )
    expect(v).toBe(-15000)
  })

  it('lege koppelset: 0', () => {
    expect(computeLinkedCurrentValue(5000, [], [])).toBe(0)
  })

  it('niet-numerieke/null waarden tellen als 0, geen NaN-besmetting', () => {
    const v = computeLinkedCurrentValue(
      0,
      [{ current_value: 'abc' }, { current_value: null }, { current_value: '500' }],
      [],
    )
    expect(v).toBe(500)
    expect(Number.isNaN(v)).toBe(false)
  })
})

// ── autolinkGoalCurrentValues — routering via `goal_links` (meervoudige koppelingen) ──

describe('autolinkGoalCurrentValues — links-routering', () => {
  it('een link-rij die naar een onbekende/verwijderde bezitting wijst: geen enkele link oplosbaar → DB-waarde blijft staan', () => {
    const goals = [g({ goal_type: 'savings', current_value: 777, target_value: 20000 })]
    goals[0].id = 'g1'
    const links: GoalLinkRow[] = [{ goal_id: 'g1', asset_id: 'ghost-asset', debt_id: null }]
    autolinkGoalCurrentValues(goals, [], [], links)
    expect(goals[0].current_value).toBe(777)
  })

  it('doel met ZOWEL links als legacy-kolommen: de link-rij wint, de legacy-kolom wordt genegeerd', () => {
    const goals = [
      g({
        goal_type: 'savings',
        current_value: 0,
        target_value: 20000,
        linked_asset_id: 'legacy-asset',
      }),
    ]
    goals[0].id = 'g1'
    const links: GoalLinkRow[] = [{ goal_id: 'g1', asset_id: 'a1', debt_id: null }]
    autolinkGoalCurrentValues(
      goals,
      [
        { id: 'a1', current_value: 5000 },
        { id: 'legacy-asset', current_value: 9999 },
      ],
      [],
      links,
    )
    // De link-waarde (5000), niet de legacy-waarde (9999).
    expect(goals[0].current_value).toBe(5000)
  })

  it('meerdere link-rijen, gemengd: netto-som via computeLinkedCurrentValue', () => {
    const goals = [g({ goal_type: 'net_worth', current_value: 0, target_value: 100000 })]
    goals[0].id = 'g1'
    const links: GoalLinkRow[] = [
      { goal_id: 'g1', asset_id: 'a1', debt_id: null },
      { goal_id: 'g1', asset_id: 'a2', debt_id: null },
      { goal_id: 'g1', asset_id: null, debt_id: 'd1' },
    ]
    autolinkGoalCurrentValues(
      goals,
      [
        { id: 'a1', current_value: 30000 },
        { id: 'a2', current_value: 20000 },
      ],
      [{ id: 'd1', current_balance: 10000 }],
      links,
    )
    expect(goals[0].current_value).toBe(40000) // (30000+20000) - 10000
  })
})

// ── splitActiveGoals — auto-sync-doelen krijgen voorrang binnen de cap ──────

describe('splitActiveGoals — auto-sync-injectie en cap-voorrang', () => {
  it('een auto-sync-doel landt in de autoSyncGoals-subset (en dus in de injectie)', () => {
    const autoSync = g({ goal_type: 'net_worth', metadata: { sync: 'auto' } })
    const handmatig = g({ goal_type: 'savings' })
    const { autoSyncGoals, goals } = splitActiveGoals([handmatig, autoSync])
    expect(autoSyncGoals).toEqual([autoSync])
    expect(goals).toContain(autoSync)
  })

  it('auto-sync-doelen staan VOORAAN binnen de cap van 5 door de gebruiker aangemaakte doelen', () => {
    const autoSync = g({ goal_type: 'net_worth', metadata: { sync: 'auto' } })
    // 5 gewone handmatige doelen — samen met het auto-sync-doel 6 kandidaten
    // voor de cap van MAX_HANDMATIGE_DOELEN (5), dus één moet eruit vallen.
    const handmatig = Array.from({ length: 5 }, () => g({ goal_type: 'savings' }))
    const { goals, autoSyncGoals, parameterGoals } = splitActiveGoals([...handmatig, autoSync])

    // Geen parameter-doelen in deze fixture, dus `goals` IS de gecapte subset.
    expect(parameterGoals).toEqual([])
    expect(goals).toHaveLength(MAX_HANDMATIGE_DOELEN)
    expect(goals[0]).toBe(autoSync) // vooraan binnen de cap
    // Het laatste handmatige doel (index 4) is uit de cap gevallen — de eerste
    // vier bleven staan, in hun oorspronkelijke volgorde.
    expect(goals).not.toContain(handmatig[4])
    expect(goals.slice(1)).toEqual(handmatig.slice(0, 4))
    expect(autoSyncGoals).toEqual([autoSync])
  })
})

// ── Lazy gating: een metric-thunk draait alleen bij een actief doel van dat type ──

describe('syncActiveGoalValues — lazy per-type gating van metricSources', () => {
  it('draait GEEN enkele metric-thunk zonder een actief auto-sync-doel van dat type', async () => {
    const handmatig = g({ goal_type: 'savings', current_value: 100 })
    const supabase = makeSupabase([])
    const netWorth = vi.fn(async () => 500000)
    const passive = vi.fn(async () => 1000)
    const emergency = vi.fn(async () => 6)
    const tax = vi.fn(async () => 30)
    const debtFree = vi.fn(async () => ({ decimalYear: 2030, basis: { kind: 'user_set' as const } }))

    await syncActiveGoalValues(supabase, [handmatig], [], [], 'u1', undefined, undefined, {
      netWorth,
      passiveIncomeMonthly: passive,
      emergencyFundMonths: emergency,
      taxBurdenPct: tax,
      debtFreeDate: debtFree,
    })

    expect(netWorth).not.toHaveBeenCalled()
    expect(passive).not.toHaveBeenCalled()
    expect(emergency).not.toHaveBeenCalled()
    expect(tax).not.toHaveBeenCalled()
    expect(debtFree).not.toHaveBeenCalled()
  })

  it('draait UITSLUITEND de thunk van het type dat daadwerkelijk actief is (net_worth)', async () => {
    const netWorthGoal = g({ goal_type: 'net_worth', metadata: { sync: 'auto' }, current_value: 0 })
    const supabase = makeSupabase([])
    const netWorth = vi.fn(async () => 500000)
    const tax = vi.fn(async () => 30)

    const { goals } = await syncActiveGoalValues(supabase, [netWorthGoal], [], [], 'u1', undefined, undefined, {
      netWorth,
      taxBurdenPct: tax,
    })

    expect(netWorth).toHaveBeenCalledTimes(1)
    expect(tax).not.toHaveBeenCalled()
    expect(goals[0].current_value).toBe(500000)
  })
})

// ── Tolerante degradatie: 0 is een echte waarde, null/undefined/NaN zijn dat niet ──

describe('syncActiveGoalValues — tolerante degradatie op metric-waarden', () => {
  it('een bron die 0 levert overschrijft de DB-waarde (0% is een echte uitkomst)', async () => {
    const taxGoal = g({ goal_type: 'tax_burden', metadata: { sync: 'auto' }, current_value: 99, target_value: 30 })
    const supabase = makeSupabase([])
    const { goals } = await syncActiveGoalValues(supabase, [taxGoal], [], [], 'u1', undefined, undefined, {
      taxBurdenPct: async () => 0,
    })
    expect(goals[0].current_value).toBe(0)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['NaN', NaN],
  ] as const)('een bron die %s levert laat de DB-waarde staan', async (_label, value) => {
    const taxGoal = g({ goal_type: 'tax_burden', metadata: { sync: 'auto' }, current_value: 42, target_value: 30 })
    const supabase = makeSupabase([])
    const { goals } = await syncActiveGoalValues(supabase, [taxGoal], [], [], 'u1', undefined, undefined, {
      taxBurdenPct: async () => value,
    })
    expect(goals[0].current_value).toBe(42)
  })
})
