import { describe, it, expect } from 'vitest'
import { ASSET_CLIENT_COLUMNS } from '@/lib/asset-data'
import { loadPerspectiveData, type PerspectiveContext } from './perspective-loader'
import { buildHouseholdProjectionInput } from '@/lib/household-projection'

/**
 * Bewijst — via een DOORGEGEVEN query-observatie, niet door de broncode te
 * lezen — dat de twee GEDEELDE loaders die vanuit de browser worden aangeroepen
 * de `assets`-tabel met een expliciete kolomlijst bevragen en nooit met
 * `select('*')`.
 *
 * Waarom juist deze twee: allebei zijn het gewone lib-modules ZONDER
 * `'use client'`-directive, dus `scripts/check-client-data-reads.mjs` opent ze
 * nooit — die gate scant alleen bestanden mét die directive. Maar ze draaien
 * wél in de browser:
 *   • `loadPerspectiveData` uit assets-client, cash-overview,
 *     debt-category-page, box3-detail en debts-client;
 *   • `buildHouseholdProjectionInput` uit horizon-client en
 *     household-fire-section.
 * `public.assets` heeft een huishoud-gedeelde SELECT-policy, dus een
 * `select('*')` levert bij een gedeelde bezitting `account_number` (plaintext
 * IBAN), `account_number_encrypted` (ciphertext) en `account_number_hash`
 * (blind index onder een server-only sleutel = stabiele correlatiesleutel) van
 * de PARTNER aan de browser.
 *
 * Harness gespiegeld op components/core/deepenings/verhuurrendement-tab.test.tsx:
 * een chainbare Proxy-mock die elke query-methode + argumenten per tabel logt.
 */

type QueryCall = { table: string; method: string; args: unknown[] }

function makeSupabase(rowsByTable: Record<string, unknown[]> = {}) {
  const queryLog: QueryCall[] = []

  function builder(table: string): Record<string, unknown> {
    const rows = rowsByTable[table] ?? []
    const target: Record<string, unknown> = {
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve(resolve({ data: rows, error: null })),
      // Terminals: leveren één rij i.p.v. een chainbare builder.
      single: async () => ({ data: rows[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    }
    return new Proxy(target, {
      get(t, prop: string) {
        if (prop in t) return (t as Record<string, unknown>)[prop]
        return (...args: unknown[]) => {
          queryLog.push({ table, method: prop, args })
          return builder(table)
        }
      },
    })
  }

  const supabase = {
    from: (table: string) => builder(table),
    rpc: async () => ({ data: [], error: null }),
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  }
  return { supabase: supabase as never, queryLog }
}

const SOLO_CONTEXT: PerspectiveContext = {
  userId: 'u1',
  hasHousehold: false,
  householdId: null,
  partnerId: null,
  partnerName: null,
  splitMode: 'equal',
  customSplitPct: null,
  primaryPayerId: null,
  mySharePct: 100,
  partnerPrivacy: null,
  budgetModel: 'separate',
}

/**
 * De drie namen los toetsen en niet met `toContain` op de hele string:
 * 'account_number' zit letterlijk als substring in 'account_number_hash' en
 * 'account_number_encrypted', dus een substring-assertie zou drie keer
 * hetzelfde meten en bij de plaintext-kolom vals-groen kunnen zijn.
 */
function expectGeenRekeningnummerKolom(select: string) {
  const requested = select.split(', ')
  expect(requested).not.toContain('account_number')
  expect(requested).not.toContain('account_number_encrypted')
  expect(requested).not.toContain('account_number_hash')
}

describe('gedeelde huishoud-loaders — assets-kolomcontract', () => {
  it('loadPerspectiveData bevraagt assets met ASSET_CLIENT_COLUMNS, nooit select(\'*\')', async () => {
    const { supabase, queryLog } = makeSupabase()

    await loadPerspectiveData(supabase, 'personal', SOLO_CONTEXT)

    const assetSelects = queryLog.filter((q) => q.table === 'assets' && q.method === 'select')
    expect(assetSelects.length).toBe(1)
    expect(assetSelects[0].args[0]).toBe(ASSET_CLIENT_COLUMNS)
    expectGeenRekeningnummerKolom(String(assetSelects[0].args[0]))
  })

  it('buildHouseholdProjectionInput bevraagt assets met ASSET_CLIENT_COLUMNS, nooit select(\'*\')', async () => {
    // Minimale huishoud-vorm zodat de loader niet vóór de assets-query op de
    // solo-tak uitstapt: een membership + twee leden.
    const { supabase, queryLog } = makeSupabase({
      household_members: [{ household_id: 'h1', user_id: 'u1' }, { user_id: 'u2' }],
      households: [{ name: 'Huis', split_mode: 'equal' }],
    })

    // De projectie zelf mag met deze lege mock-data best afhaken; we meten de
    // QUERY die eraan voorafgaat, niet de uitkomst.
    await buildHouseholdProjectionInput(supabase).catch(() => undefined)

    const assetSelects = queryLog.filter((q) => q.table === 'assets' && q.method === 'select')
    expect(assetSelects.length).toBeGreaterThan(0)
    for (const call of assetSelects) {
      expect(call.args[0]).not.toBe('*')
      expectGeenRekeningnummerKolom(String(call.args[0]))
    }
    expect(assetSelects.some((q) => q.args[0] === ASSET_CLIENT_COLUMNS)).toBe(true)
  })
})
