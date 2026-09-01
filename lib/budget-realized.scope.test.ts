/**
 * Tests voor de GESCOOPTE realisatie-ophaal (`fetchRealizedBudgetAmounts` +
 * `fetchTxMonthAggregate`), toegevoegd bij migratie 20260811180000.
 *
 * Deze suite bewaakt vier dingen die elders alleen als redenering bestaan:
 *
 *   1. HET CONTRACT MET DE RPC — een ongescoopte aanroep stuurt exact dezelfde
 *      argumentenset als vóór de migratie (drie sleutels, géén p_user_id /
 *      p_household_id). Dat is wat de dertien bestaande grondslag-oppervlakken
 *      ongemoeid laat; een extra sleutel zou PostgREST's functie-resolutie en de
 *      bestaande verwachtingen raken.
 *   2. DE SCOPE KOMT VOLLEDIG MEE — een gescoopte aanroep stuurt userId ÉN
 *      householdId, in alle drie de chunks. Alleen de userId meesturen zou de
 *      gedeelde boekingen van de partner wegsnijden en de cron-snapshot laten
 *      driften met /overzicht.
 *   3. FAIL-CLOSED OP EEN ONGELDIG ID — een scope met een niet-uuid user-id doet
 *      GEEN enkele RPC en levert het lege venster, zodat elke post zichtbaar op
 *      de geplande limiet terugvalt.
 *   4. DE LEK-CHECK — een aanroeper die een VREEMD user-id meegeeft krijgt 0
 *      rijen en géén fout. Dat is hier per constructie zo, want in SQL is het een
 *      AND-filter bovenop de RLS-policy; deze test pint het gedrag van de
 *      TS-kant vast (lege set → leeg venster → planning, nooit een throw).
 *
 * De echte RLS-eigenschap zelf is niet in vitest te bewijzen — die is tegen de
 * live database gemeten (zie het rapport bij deze wijziging en de kop van de
 * migratie). Wat hier wordt vastgelegd is dat de applicatiekant een lege set
 * behandelt als "geen realisatie" en niet als een fout.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('react', () => ({
  cache: <A extends unknown[], R>(fn: (...args: A) => R) => fn,
}))

import { fetchRealizedBudgetAmounts } from './budget-realized'
import { fetchTxMonthAggregate } from '@/lib/server-data/tx-aggregates'

const USER = '11111111-1111-4111-8111-111111111111'
const HOUSEHOLD = '22222222-2222-4222-8222-222222222222'
const VREEMDE = '33333333-3333-4333-8333-333333333333'

function makeSupabase(rowsPerCall: Array<unknown[]> = [[], [], []]) {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []
  let i = 0
  const supabase = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args })
      const rows = rowsPerCall[i] ?? []
      i += 1
      return Promise.resolve({ data: rows, error: null })
    },
  } as never
  return { supabase, rpcCalls }
}

function aggRow(month: string, budgetId: string, neg: number) {
  return { month, budget_id: budgetId, transaction_type: 'expense', sum_positief: 0, sum_negatief: neg, count: 1 }
}

describe('fetchTxMonthAggregate — de scope-sleutels zijn opt-in', () => {
  it('ZONDER scope: exact de drie oude argumenten, géén p_user_id/p_household_id', async () => {
    const { supabase, rpcCalls } = makeSupabase([[]])
    await fetchTxMonthAggregate(supabase, { from: '2025-09-01', to: '2026-01-01' })

    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].fn).toBe('tx_month_aggregate')
    // toEqual (niet toMatchObject): de afwezigheid van de sleutels is de assertie.
    expect(rpcCalls[0].args).toEqual({
      p_from: '2025-09-01',
      p_to: '2026-01-01',
      p_own_only: false,
    })
  })

  it('MET scope: user-id én household-id gaan mee', async () => {
    const { supabase, rpcCalls } = makeSupabase([[]])
    await fetchTxMonthAggregate(supabase, {
      from: '2025-09-01',
      to: '2026-01-01',
      scope: { userId: USER, householdId: HOUSEHOLD },
    })

    expect(rpcCalls[0].args).toEqual({
      p_from: '2025-09-01',
      p_to: '2026-01-01',
      p_own_only: false,
      p_user_id: USER,
      p_household_id: HOUSEHOLD,
    })
  })

  it('scope zonder huishouden stuurt p_household_id expliciet als null', async () => {
    // Belangrijk dat dit NULL is en niet ontbreekt: in SQL valt de gedeelde tak
    // dan weg (t.household_id = null is nooit waar) en blijft alleen de
    // eigen-rijen-tak over — precies de bedoeling voor een solo-gebruiker.
    const { supabase, rpcCalls } = makeSupabase([[]])
    await fetchTxMonthAggregate(supabase, {
      from: '2025-09-01',
      to: '2026-01-01',
      scope: { userId: USER, householdId: null },
    })

    expect(rpcCalls[0].args.p_user_id).toBe(USER)
    expect(rpcCalls[0].args.p_household_id).toBeNull()
  })
})

describe('fetchRealizedBudgetAmounts — het gescoopte cron-pad', () => {
  it('geeft de scope door aan ALLE drie de chunks', async () => {
    const { supabase, rpcCalls } = makeSupabase([[], [], []])
    await fetchRealizedBudgetAmounts(supabase, { userId: USER, householdId: HOUSEHOLD })

    expect(rpcCalls).toHaveLength(3)
    for (const call of rpcCalls) {
      expect(call.args.p_user_id).toBe(USER)
      expect(call.args.p_household_id).toBe(HOUSEHOLD)
      expect(call.args.p_own_only).toBe(false)
    }
    // De drie vensters sluiten op elkaar aan (chunk n eindigt waar n+1 begint).
    expect(rpcCalls[0].args.p_to).toBe(rpcCalls[1].args.p_from)
    expect(rpcCalls[1].args.p_to).toBe(rpcCalls[2].args.p_from)
  })

  it('ZONDER scope blijft het sessie-pad byte-identiek (drie argumenten)', async () => {
    const { supabase, rpcCalls } = makeSupabase([[], [], []])
    await fetchRealizedBudgetAmounts(supabase)

    expect(rpcCalls).toHaveLength(3)
    for (const call of rpcCalls) {
      expect(Object.keys(call.args).sort()).toEqual(['p_from', 'p_own_only', 'p_to'])
    }
  })

  it('reduceert de gescoopte rijen tot realisatie per budget', async () => {
    // Maandsleutels RELATIEF aan vandaag: het 12-maandsvenster schuift elke
    // maandwissel op, en hardgecodeerde maanden ('2025-09') vielen er op
    // 1 sep 2026 precies uit — de test werd rood door de kalender, niet door
    // de code (release-poort 1 sep 2026).
    const maandTerug = (n: number) => {
      const d = new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth() - n, 1))
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    }
    const { supabase } = makeSupabase([
      [aggRow(maandTerug(11), 'b1', -100)],
      [aggRow(maandTerug(7), 'b1', -200)],
      [aggRow(maandTerug(1), 'b2', -50)],
    ])
    const out = await fetchRealizedBudgetAmounts(supabase, { userId: USER, householdId: HOUSEHOLD })

    expect(out.byBudgetId.b1?.outgoing).toBe(300)
    expect(out.byBudgetId.b2?.outgoing).toBe(50)
    expect(out.truncationSuspected).toBe(false)
  })
})

describe('fetchRealizedBudgetAmounts — fail-closed op een onbruikbare scope', () => {
  it('een niet-uuid user-id doet GEEN RPC en levert het lege venster', async () => {
    const { supabase, rpcCalls } = makeSupabase([[], [], []])
    const out = await fetchRealizedBudgetAmounts(supabase, { userId: 'niet-een-uuid' })

    expect(rpcCalls).toHaveLength(0)
    expect(out.byBudgetId).toEqual({})
    expect(out.windowMonths).toBe(12)
    // Het venster-anker blijft gevuld: de terugval is "geen realisatie",
    // niet "geen venster" — de UI moet 'planned' kunnen tonen.
    expect(out.windowEndMonth).not.toBe('')
  })

  it('een lege user-id-string glijdt er niet doorheen als "geen scope"', async () => {
    // Zonder de uuid-guard zou een lege string als scope-object wél truthy zijn
    // en dus p_user_id = '' naar de RPC sturen: een type-fout op de DB, en op een
    // service-role-client een aanroep waarvan de afbakening niet vaststaat.
    const { supabase, rpcCalls } = makeSupabase([[], [], []])
    const out = await fetchRealizedBudgetAmounts(supabase, { userId: '' })

    expect(rpcCalls).toHaveLength(0)
    expect(out.byBudgetId).toEqual({})
  })
})

describe('LEK-CHECK — een vreemd user-id levert niets op', () => {
  it('een lege set (wat RLS voor een vreemd id teruggeeft) wordt planning, geen fout', async () => {
    // De database geeft hier 0 rijen terug omdat het scope-filter met AND op de
    // RLS-policy staat: de doorsnede van "mijn zichtbare rijen" en "de rijen van
    // een vreemde" is leeg. Géén error — dat is de conventie, en het voorkomt dat
    // het verschil tussen "bestaat niet" en "mag niet" waarneembaar wordt.
    const { supabase, rpcCalls } = makeSupabase([[], [], []])
    const out = await fetchRealizedBudgetAmounts(supabase, { userId: VREEMDE, householdId: null })

    expect(rpcCalls).toHaveLength(3)
    for (const call of rpcCalls) expect(call.args.p_user_id).toBe(VREEMDE)

    // Geen throw, geen halve waarheid: elke post valt zichtbaar terug op 'planned'.
    expect(out.byBudgetId).toEqual({})
    expect(out.truncationSuspected).toBe(false)
  })

  it('een permission-fout van de RPC trekt de aanroeper niet om', async () => {
    // Zou een rolset-regressie de RPC laten falen i.p.v. leeg teruggeven, dan mag
    // dat een snapshot-schrijfronde niet omvertrekken: de ronde valt terug op de
    // planning.
    const supabase = {
      rpc: () => Promise.resolve({ data: null, error: { code: '42501', message: 'permission denied' } }),
    } as never
    const out = await fetchRealizedBudgetAmounts(supabase, { userId: USER })
    expect(out.byBudgetId).toEqual({})
  })
})
