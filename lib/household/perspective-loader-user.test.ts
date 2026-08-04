/**
 * `loadPerspectiveContext` — de optionele `preloadedUser`-parameter (T1.2).
 *
 * De server-wrapper (`getCachedPerspectiveContext`) geeft de request-gecachte
 * gebruiker mee zodat de blokkerende `/auth/v1/user`-roundtrip vóór álle queries
 * van deze loader gedeeld wordt met de rest van de render. Dit bestand is echter
 * DUAL-USE: het draait óók in de browser (budgets-client, cash-overview, …), waar
 * React `cache()` niet bestaat en de functie zónder tweede argument wordt
 * aangeroepen.
 *
 * Deze suite pint daarom drie dingen vast:
 *   1. CLIENT-PAD-REGRESSIE — zonder `preloadedUser` resolvet de functie de
 *      gebruiker nog steeds zelf (één `auth.getUser()`), precies als voorheen.
 *   2. DE INJECTIE SLAAT DE ROUNDTRIP OVER — mét `preloadedUser` nul auth-calls.
 *   3. GEEN GEDRAGSWIJZIGING — de context die het server-pad oplevert is
 *      deep-equal aan die van het client-pad, óók in een huishouden met een
 *      partner. Dat is de privacy-kritische uitkomst (`partnerPrivacy`,
 *      `mySharePct`, `partnerId`) die deze taak niet mag verschuiven.
 */

import { describe, it, expect } from 'vitest'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { loadPerspectiveContext } from './perspective-loader'
import { getCachedPerspectiveContext } from './perspective-loader-server'

const USER: User = { id: 'u1' } as User

interface Tables {
  household_members?: unknown[]
  households?: unknown[]
  budgets?: unknown[]
  household_member_profiles?: unknown[]
}

/**
 * Chainbare mock die `auth.getUser()`-aanroepen telt. De query-keten eindigt óf
 * thenable (lijstresultaat) óf op `.maybeSingle()` (één rij) — beide vormen komen
 * in `loadPerspectiveContext` voor.
 */
function makeSupabase(tables: Tables = {}, user: User | null = USER) {
  const counts = { getUser: 0 }
  const rows = (t: keyof Tables): unknown[] => tables[t] ?? []
  const builder = (data: unknown[]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      eq: () => b,
      maybeSingle: () => Promise.resolve({ data: data[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data, error: null }),
    }
    return b
  }
  const supabase = {
    auth: {
      getUser: async () => {
        counts.getUser += 1
        return { data: { user }, error: null }
      },
    },
    from: (table: string) => builder(rows(table as keyof Tables)),
    rpc: (fn: string) => Promise.resolve({ data: rows(fn as keyof Tables), error: null }),
  } as unknown as SupabaseClient
  return { supabase, counts }
}

/**
 * Huishouden met partner: split 'custom' 60/40 (u1 is de primaire betaler) en een
 * partner-privacy die op twee assen AFWIJKT van DEFAULT_PRIVACY_SETTINGS, zodat de
 * assertie hieronder niet toevallig al door de defaults waar is.
 */
const HOUSEHOLD_TABLES: Tables = {
  household_members: [
    { user_id: 'u1', role: 'owner', privacy_settings: null, household_id: 'h1' },
    {
      user_id: 'u2',
      role: 'member',
      privacy_settings: { assets: 'full', debts: 'hidden' },
      household_id: 'h1',
    },
  ],
  households: [
    {
      name: 'Thuis',
      split_mode: 'custom',
      custom_split_pct: 60,
      primary_payer_id: 'u1',
      budget_model: 'household',
    },
  ],
  household_member_profiles: [
    { id: 'u1', full_name: 'Ik' },
    { id: 'u2', full_name: 'Partner' },
  ],
}

describe('loadPerspectiveContext — client-pad (zonder preloadedUser)', () => {
  it('resolvet de gebruiker nog steeds zelf', async () => {
    const { supabase, counts } = makeSupabase()
    const ctx = await loadPerspectiveContext(supabase)
    expect(counts.getUser).toBe(1)
    expect(ctx.userId).toBe('u1')
    expect(ctx.hasHousehold).toBe(false)
  })

  it('gooit "Not authenticated" als er geen sessie is', async () => {
    const { supabase, counts } = makeSupabase({}, null)
    await expect(loadPerspectiveContext(supabase)).rejects.toThrow('Not authenticated')
    expect(counts.getUser).toBe(1)
  })
})

describe('loadPerspectiveContext — server-pad (mét preloadedUser)', () => {
  it('slaat de auth-roundtrip over', async () => {
    const { supabase, counts } = makeSupabase()
    const ctx = await loadPerspectiveContext(supabase, USER)
    expect(counts.getUser).toBe(0)
    expect(ctx.userId).toBe('u1')
  })

  it('een expliciete null betekent "geen sessie" — geen extra roundtrip', async () => {
    const { supabase, counts } = makeSupabase()
    await expect(loadPerspectiveContext(supabase, null)).rejects.toThrow('Not authenticated')
    expect(counts.getUser).toBe(0)
  })
})

describe('loadPerspectiveContext — server- en client-pad leveren dezelfde context', () => {
  it('solo-gebruiker', async () => {
    const client = await loadPerspectiveContext(makeSupabase().supabase)
    const server = await getCachedPerspectiveContext(makeSupabase().supabase)
    expect(server).toEqual(client)
  })

  it('huishouden met partner: aandeel én partner-privacy blijven identiek', async () => {
    const client = await loadPerspectiveContext(makeSupabase(HOUSEHOLD_TABLES).supabase)
    const server = await getCachedPerspectiveContext(makeSupabase(HOUSEHOLD_TABLES).supabase)

    expect(server).toEqual(client)
    // Expliciet, zodat een stille verschuiving van de privacy-/split-uitkomst
    // niet alleen "gelijk aan elkaar" maar ook "gelijk aan de bedoeling" faalt.
    expect(client.partnerId).toBe('u2')
    expect(client.partnerName).toBe('Partner')
    expect(client.mySharePct).toBe(60)
    expect(client.budgetModel).toBe('household')
    expect(client.partnerPrivacy).toMatchObject({ assets: 'full', debts: 'hidden' })
  })
})
