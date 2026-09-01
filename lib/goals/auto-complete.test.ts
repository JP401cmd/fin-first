/**
 * Tests voor het auto-afsluiten van live meelopende doelen
 * (lib/goals/auto-complete.ts).
 *
 * De drie eigenschappen die hier hard vastliggen, en waarom:
 *
 *  1. RICHTING-BEWUSTHEID. `is_completed` is in de praktijk lastig terug te
 *     draaien en de mijlpalenlog is append-only. Een kale `current >= target`
 *     zou een belastingdruk-doel METEEN als behaald afsluiten en een
 *     vrijheidsleeftijd-doel NOOIT (ADR 0125). Beide richtingen staan hieronder.
 *  2. HANDMATIGE DOELEN BLIJVEN VAN DE GEBRUIKER. Een doel waarvan de waarde
 *     niet door een motor of koppeling wordt bijgehouden mag de server niet
 *     aanraken — ook niet als het bereikt is.
 *  3. IDEMPOTENTIE + ZUINIGHEID. Niets te sluiten ⇒ geen enkele query; een
 *     tweede aanroep sluit niets opnieuw af.
 */

import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  AUTO_COMPLETED_NOTICE_WINDOW_DAYS,
  isMachineTrackedGoal,
  linkedGoalIdSet,
  reconcileAutoCompletedGoals,
  selectAutoCompletedNotices,
  selectReachedAutoGoals,
  type ReconcilableGoal,
} from './auto-complete'

const USER = 'user-1'
const PARTNER = 'user-2'

function goal(over: Partial<ReconcilableGoal> & { id: string }): ReconcilableGoal {
  return {
    user_id: USER,
    name: `Doel ${over.id}`,
    goal_type: 'net_worth',
    current_value: 0,
    target_value: 100,
    is_completed: false,
    completed_at: null,
    metadata: { sync: 'auto' },
    linked_asset_id: null,
    linked_debt_id: null,
    ...over,
  }
}

/**
 * Minimale Supabase-dubbel voor precies de keten die de reconcile draait:
 * `.from().update().in().eq().eq().select()`. Legt vast wat er gevraagd werd,
 * zodat de tests ook kunnen bewijzen dát er niets gevraagd werd.
 */
function fakeSupabase(result: { data?: unknown[] | null; error?: unknown } = { data: [] }) {
  const rec = {
    fromCalls: [] as string[],
    patch: null as unknown,
    ids: [] as string[],
    eqs: [] as [string, unknown][],
  }
  const builder = {
    update(patch: unknown) {
      rec.patch = patch
      return builder
    },
    in(_col: string, vals: string[]) {
      rec.ids = vals
      return builder
    },
    eq(col: string, val: unknown) {
      rec.eqs.push([col, val])
      return builder
    },
    select(_cols: string) {
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
    },
  }
  const client = {
    from(table: string) {
      rec.fromCalls.push(table)
      return builder
    },
  }
  return { supabase: client as unknown as SupabaseClient, rec }
}

// ── linkedGoalIdSet ─────────────────────────────────────────────────────────

describe('linkedGoalIdSet', () => {
  it('neemt alleen rijen met precies één verwijzing', () => {
    const set = linkedGoalIdSet([
      { goal_id: 'a', asset_id: 'asset-1', debt_id: null },
      { goal_id: 'b', asset_id: null, debt_id: 'debt-1' },
      // Onbruikbaar: twee verwijzingen (CHECK-schending) resp. geen enkele.
      { goal_id: 'c', asset_id: 'asset-2', debt_id: 'debt-2' },
      { goal_id: 'd', asset_id: null, debt_id: null },
    ])
    expect([...set].sort()).toEqual(['a', 'b'])
  })

  it('is leeg zonder koppelingen', () => {
    expect(linkedGoalIdSet(undefined).size).toBe(0)
  })
})

// ── isMachineTrackedGoal ────────────────────────────────────────────────────

describe('isMachineTrackedGoal', () => {
  const geen = new Set<string>()

  it('herkent een auto-sync metric-doel', () => {
    expect(isMachineTrackedGoal(goal({ id: 'g' }), geen)).toBe(true)
  })

  it('herkent een doel met een goal_links-koppeling', () => {
    const g = goal({ id: 'g', metadata: null })
    expect(isMachineTrackedGoal(g, new Set(['g']))).toBe(true)
  })

  it('herkent de legacy-koppelkolommen', () => {
    expect(
      isMachineTrackedGoal(goal({ id: 'g', metadata: null, linked_asset_id: 'a1' }), geen),
    ).toBe(true)
    expect(
      isMachineTrackedGoal(goal({ id: 'g', metadata: null, linked_debt_id: 'd1' }), geen),
    ).toBe(true)
  })

  it('sluit een handmatig bijgehouden doel uit', () => {
    expect(isMachineTrackedGoal(goal({ id: 'g', metadata: null }), geen)).toBe(false)
    expect(isMachineTrackedGoal(goal({ id: 'g', metadata: {} }), geen)).toBe(false)
    expect(isMachineTrackedGoal(goal({ id: 'g', metadata: undefined }), geen)).toBe(false)
  })

  it('sluit een lab-parameterdoel uit, ook mét koppeling', () => {
    const g = goal({ id: 'g', metadata: { bron: 'parameter' } })
    expect(isMachineTrackedGoal(g, new Set(['g']))).toBe(false)
  })
})

// ── selectReachedAutoGoals — richting-bewustheid ────────────────────────────

describe('selectReachedAutoGoals', () => {
  const geen = new Set<string>()
  const ids = (gs: ReconcilableGoal[]) => gs.map((g) => g.id)

  it('sluit een OMHOOG-doel pas op of boven de doelwaarde', () => {
    const onder = goal({ id: 'onder', goal_type: 'net_worth', current_value: 99, target_value: 100 })
    const gelijk = goal({ id: 'gelijk', goal_type: 'net_worth', current_value: 100, target_value: 100 })
    const boven = goal({ id: 'boven', goal_type: 'net_worth', current_value: 101, target_value: 100 })
    expect(ids(selectReachedAutoGoals([onder, gelijk, boven], USER, geen))).toEqual([
      'gelijk',
      'boven',
    ])
  })

  it('keert de toets om bij een OMLAAG-doel (belastingdruk)', () => {
    // 35 % druk tegen een doel van 30 % is NIET behaald — een kale `>=` zou het
    // meteen afsluiten en vieren voor een doel dat mislukt.
    const mislukt = goal({ id: 'mislukt', goal_type: 'tax_burden', current_value: 35, target_value: 30 })
    const gehaald = goal({ id: 'gehaald', goal_type: 'tax_burden', current_value: 28, target_value: 30 })
    expect(ids(selectReachedAutoGoals([mislukt, gehaald], USER, geen))).toEqual(['gehaald'])
  })

  it('herkent een gehaalde vrijheidsleeftijd (omlaag) die een kale >= zou missen', () => {
    // 46 >= 55 is onwaar, terwijl het doel ruim gehaald is.
    const g = goal({ id: 'fire', goal_type: 'fire_age', current_value: 46, target_value: 55 })
    expect(ids(selectReachedAutoGoals([g], USER, geen))).toEqual(['fire'])
  })

  it('behandelt een schuldenvrij-datum als omlaag-doel', () => {
    const eerder = goal({
      id: 'eerder',
      goal_type: 'debt_free_date',
      current_value: 2029.5,
      target_value: 2031,
    })
    const later = goal({
      id: 'later',
      goal_type: 'debt_free_date',
      current_value: 2035,
      target_value: 2031,
    })
    expect(ids(selectReachedAutoGoals([eerder, later], USER, geen))).toEqual(['eerder'])
  })

  it('raakt een HANDMATIG bijgehouden doel nooit aan, ook niet als het bereikt is', () => {
    const handmatig = goal({
      id: 'handmatig',
      metadata: null,
      current_value: 500,
      target_value: 100,
    })
    expect(selectReachedAutoGoals([handmatig], USER, geen)).toEqual([])
  })

  it('slaat partner-doelen over, ook als ze bereikt zijn', () => {
    const vanPartner = goal({ id: 'partner', user_id: PARTNER, current_value: 500 })
    expect(selectReachedAutoGoals([vanPartner], USER, geen)).toEqual([])
  })

  it('slaat al voltooide doelen over', () => {
    const klaar = goal({ id: 'klaar', current_value: 500, is_completed: true })
    expect(selectReachedAutoGoals([klaar], USER, geen)).toEqual([])
  })

  it('telt een doelwaarde van 0 of lager als "geen doel gesteld"', () => {
    const geenDoel = goal({ id: 'nul', current_value: 500, target_value: 0 })
    expect(selectReachedAutoGoals([geenDoel], USER, geen)).toEqual([])
  })
})

// ── reconcileAutoCompletedGoals — IO ────────────────────────────────────────

describe('reconcileAutoCompletedGoals', () => {
  it('doet GEEN enkele query wanneer er niets te sluiten valt', async () => {
    const { supabase, rec } = fakeSupabase()
    const result = await reconcileAutoCompletedGoals(supabase, USER, [
      goal({ id: 'a', current_value: 10, target_value: 100 }),
      goal({ id: 'b', metadata: null, current_value: 500 }),
    ])
    expect(result).toEqual([])
    expect(rec.fromCalls).toEqual([])
  })

  it('doet niets zonder ingelogde gebruiker', async () => {
    const { supabase, rec } = fakeSupabase()
    expect(await reconcileAutoCompletedGoals(supabase, null, [goal({ id: 'a', current_value: 500 })]))
      .toEqual([])
    expect(rec.fromCalls).toEqual([])
  })

  it('schrijft één update met own-row- én race-guard en geeft de gesloten doelen terug', async () => {
    const now = new Date('2026-09-01T10:00:00.000Z')
    const { supabase, rec } = fakeSupabase({
      data: [
        { id: 'a', name: 'Netto vermogen', goal_type: 'net_worth', completed_at: now.toISOString() },
      ],
    })
    const bereikt = goal({ id: 'a', name: 'Netto vermogen', current_value: 120 })
    const result = await reconcileAutoCompletedGoals(
      supabase,
      USER,
      [bereikt, goal({ id: 'b', current_value: 1 })],
      new Set(),
      now,
    )

    expect(rec.fromCalls).toEqual(['goals'])
    expect(rec.ids).toEqual(['a'])
    expect(rec.patch).toEqual({ is_completed: true, completed_at: now.toISOString() })
    expect(rec.eqs).toEqual([
      ['user_id', USER],
      ['is_completed', false],
    ])
    expect(result).toEqual([
      {
        id: 'a',
        name: 'Netto vermogen',
        goalType: 'net_worth',
        completedAt: now.toISOString(),
      },
    ])
    // In-place gemarkeerd, zodat de lopende render het doel niet nog als actief
    // behandelt (en er dus geen checkpoint meer op kan vallen).
    expect(bereikt.is_completed).toBe(true)
    expect(bereikt.completed_at).toBe(now.toISOString())
  })

  it('is idempotent: een tweede ronde over dezelfde doelen sluit niets opnieuw', async () => {
    const now = new Date('2026-09-01T10:00:00.000Z')
    const first = fakeSupabase({
      data: [{ id: 'a', name: 'A', goal_type: 'net_worth', completed_at: now.toISOString() }],
    })
    const goals = [goal({ id: 'a', name: 'A', current_value: 120 })]
    expect(await reconcileAutoCompletedGoals(first.supabase, USER, goals, new Set(), now)).toHaveLength(1)

    const second = fakeSupabase()
    expect(await reconcileAutoCompletedGoals(second.supabase, USER, goals, new Set(), now)).toEqual([])
    expect(second.rec.fromCalls).toEqual([])
  })

  it('rapporteert alleen de rijen die de UPDATE daadwerkelijk raakte (parallelle render)', async () => {
    // Race-scenario: twee renders vinden allebei twee bereikte doelen, maar de
    // `is_completed = false`-filter laat er hier maar één door.
    const { supabase } = fakeSupabase({
      data: [{ id: 'a', name: 'A', goal_type: 'net_worth', completed_at: '2026-09-01T10:00:00.000Z' }],
    })
    const a = goal({ id: 'a', name: 'A', current_value: 120 })
    const b = goal({ id: 'b', name: 'B', current_value: 120 })
    const result = await reconcileAutoCompletedGoals(supabase, USER, [a, b])
    expect(result.map((r) => r.id)).toEqual(['a'])
    expect(a.is_completed).toBe(true)
    // Verloren race: niet gemarkeerd, dus ook geen tweede mijlpaal of viering.
    expect(b.is_completed).toBe(false)
  })

  it('faalt zacht op een DB-fout: geen exception, niets gemarkeerd', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { supabase } = fakeSupabase({ data: null, error: { message: 'boem' } })
    const g = goal({ id: 'a', current_value: 120 })
    await expect(reconcileAutoCompletedGoals(supabase, USER, [g])).resolves.toEqual([])
    expect(g.is_completed).toBe(false)
    spy.mockRestore()
  })
})

// ── selectAutoCompletedNotices — de viering ─────────────────────────────────

describe('selectAutoCompletedNotices', () => {
  const now = new Date('2026-09-01T12:00:00.000Z')
  const dagenGeleden = (d: number) =>
    new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString()

  it('levert recent auto-afgesloten doelen, nieuwste eerst', () => {
    const oud = goal({ id: 'oud', is_completed: true, completed_at: dagenGeleden(5) })
    const vers = goal({ id: 'vers', is_completed: true, completed_at: dagenGeleden(1) })
    const notices = selectAutoCompletedNotices([oud, vers], USER, new Set(), now)
    expect(notices.map((n) => n.id)).toEqual(['vers', 'oud'])
    expect(notices[0]).toMatchObject({ name: 'Doel vers', goalType: 'net_worth' })
  })

  it('laat een doel buiten het venster vallen', () => {
    const teOud = goal({
      id: 'teOud',
      is_completed: true,
      completed_at: dagenGeleden(AUTO_COMPLETED_NOTICE_WINDOW_DAYS + 1),
    })
    expect(selectAutoCompletedNotices([teOud], USER, new Set(), now)).toEqual([])
  })

  it('viert nooit een handmatig bijgehouden of een partner-doel', () => {
    const handmatig = goal({
      id: 'handmatig',
      metadata: null,
      is_completed: true,
      completed_at: dagenGeleden(1),
    })
    const partner = goal({
      id: 'partner',
      user_id: PARTNER,
      is_completed: true,
      completed_at: dagenGeleden(1),
    })
    expect(selectAutoCompletedNotices([handmatig, partner], USER, new Set(), now)).toEqual([])
  })

  it('viert niets zonder ingelogde gebruiker of zonder afsluitdatum', () => {
    const zonderDatum = goal({ id: 'z', is_completed: true, completed_at: null })
    expect(selectAutoCompletedNotices([zonderDatum], USER, new Set(), now)).toEqual([])
    expect(selectAutoCompletedNotices([zonderDatum], null, new Set(), now)).toEqual([])
  })

  it('negeert nog actieve doelen', () => {
    const actief = goal({ id: 'a', is_completed: false, completed_at: dagenGeleden(1) })
    expect(selectAutoCompletedNotices([actief], USER, new Set(), now)).toEqual([])
  })
})
