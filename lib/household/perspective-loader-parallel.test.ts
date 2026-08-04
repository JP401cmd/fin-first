/**
 * `loadPerspectiveContext` — huishoud-lezing en member-profiles naast elkaar (T3.4 · deel B).
 *
 * Deze context-keten staat vóór ÁLLE domein-queries van een render: elke
 * roundtrip erin telt twee keer. Twee stappen stonden puur door schrijfvolgorde
 * achter elkaar terwijl geen van beide van de ander afhangt — de `households`-
 * rij heeft alleen het `householdId` uit de members-read nodig, de RPC
 * `household_member_profiles` neemt helemaal geen argument.
 *
 * WAT DEZE TEST BEWIJST is de VOLGORDE, niet de snelheid: dat de tweede stap
 * begint vóórdat de eerste klaar is. Een uitkomst-assertie zou hier niets
 * zeggen — die is per definitie gelijk, en dat is juist het punt. De
 * gedragsgelijkheid zelf blijft bewaakt door perspective-loader-user.test.ts
 * (server- en client-pad deep-equal, inclusief `mySharePct`/`partnerPrivacy`).
 *
 * De income-budgetten blijven BEWUST serieel: die query is conditioneel op
 * `split_mode === 'income_ratio'`, en dat veld komt pas uit `households`.
 * Hieronder een expliciete test dat een niet-income_ratio-huishouden 'm
 * helemaal niet draait — anders zou "parallelliseren" stilletjes betekenen dat
 * iedereen een extra, speculatieve budget-read krijgt.
 */

import { describe, it, expect } from 'vitest'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { loadPerspectiveContext } from './perspective-loader'

const USER: User = { id: 'u1' } as User

const MEMBERS = [
  { user_id: 'u1', role: 'owner', privacy_settings: null, household_id: 'h1' },
  { user_id: 'u2', role: 'member', privacy_settings: null, household_id: 'h1' },
]

const HOUSEHOLD_ROW = {
  name: 'Thuis',
  split_mode: 'equal',
  custom_split_pct: null,
  primary_payer_id: null,
  budget_model: 'separate',
}

const MEMBER_PROFILES = [
  { id: 'u1', full_name: 'Ik' },
  { id: 'u2', full_name: 'Partner' },
]

/**
 * Mock-Supabase die per operatie een `start:`- en `end:`-gebeurtenis logt, met
 * een echte macrotask ertussen. Zo is aan de gebeurtenissenreeks af te lezen of
 * twee operaties overlappen (`start:b` vóór `end:a`) of elkaar afwachten.
 *
 * `start:` wordt synchroon gelogd bij aanroep — de code vóór de eerste `await`
 * in een async functie draait synchroon — zodat de reeks de aanroepvolgorde
 * weergeeft en niet de resolutievolgorde.
 */
function makeTimedSupabase(splitMode: string = 'equal') {
  const events: string[] = []

  const op = async <T>(name: string, data: T) => {
    events.push(`start:${name}`)
    await new Promise((resolve) => setTimeout(resolve, 0))
    events.push(`end:${name}`)
    return { data, error: null }
  }

  const builder = (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: () => b,
      maybeSingle: () => op(table, { ...HOUSEHOLD_ROW, split_mode: splitMode }),
      then: (resolve: (v: unknown) => unknown) =>
        op(table, table === 'household_members' ? MEMBERS : []).then(resolve),
    }
    return b
  }

  const supabase = {
    auth: { getUser: async () => ({ data: { user: USER }, error: null }) },
    from: (table: string) => builder(table),
    rpc: (fn: string) => op(fn, MEMBER_PROFILES),
  } as unknown as SupabaseClient

  return { supabase, events }
}

describe('loadPerspectiveContext — households en member-profiles overlappen', () => {
  it('start de member-profiles-RPC vóórdat de huishoud-lezing klaar is', async () => {
    const { supabase, events } = makeTimedSupabase()
    await loadPerspectiveContext(supabase, USER)

    const rpcStart = events.indexOf('start:household_member_profiles')
    const householdEnd = events.indexOf('end:households')
    expect(rpcStart).toBeGreaterThanOrEqual(0)
    expect(householdEnd).toBeGreaterThanOrEqual(0)
    // Serieel zou zijn: end:households … dán start:household_member_profiles.
    expect(rpcStart).toBeLessThan(householdEnd)
  })

  it('wacht wél op de members-read — daar komt het householdId vandaan', async () => {
    const { supabase, events } = makeTimedSupabase()
    await loadPerspectiveContext(supabase, USER)

    const membersEnd = events.indexOf('end:household_members')
    const householdStart = events.indexOf('start:households')
    expect(membersEnd).toBeGreaterThanOrEqual(0)
    expect(householdStart).toBeGreaterThan(membersEnd)
  })

  it('draait geen income-budget-query bij een niet-income_ratio-huishouden', async () => {
    const { supabase, events } = makeTimedSupabase('equal')
    await loadPerspectiveContext(supabase, USER)
    expect(events.filter((e) => e.startsWith('start:budgets'))).toEqual([])
  })

  it('draait de income-budget-query pas ná de huishoud-lezing (split_mode komt daaruit)', async () => {
    const { supabase, events } = makeTimedSupabase('income_ratio')
    await loadPerspectiveContext(supabase, USER)

    const budgetsStart = events.indexOf('start:budgets')
    const householdEnd = events.indexOf('end:households')
    expect(budgetsStart).toBeGreaterThan(householdEnd)
  })
})
