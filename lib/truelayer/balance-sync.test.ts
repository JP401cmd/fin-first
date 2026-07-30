import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { syncAccountBalance } from './balance-sync'
import { parseBankSyncPrevious } from './balance-valuation'
import { VALUATIONS_CONFLICT_KEY } from '@/lib/valuations'

// ── Minimale Supabase-stub ──────────────────────────────────────────────────
// syncAccountBalance krijgt zijn client als argument (dependency injection),
// dus een inline stub-object is voldoende — geen vi.mock() nodig. We tracken
// elke schrijf- en leesronde zodat we kunnen asserten WELKE tabel/rij geraakt
// werd, in plaats van alleen het eindresultaat.
//
// Sinds fase 8 kent de helper drie vormen in plaats van één:
//   `.select().eq().eq().maybeSingle()`           — drager + de "van"-waarde
//   `.update().eq().eq().select().maybeSingle()`  — bank_accounts en assets
//   `.upsert(data, { onConflict })`               — valuations + balance_snapshots
//
// `.eq()` is chainable: élke lees- en schrijfronde is sinds de security-review
// óók op `user_id` gescoped, dus een stub die maar één filter aankan zou de
// productiecode niet meer weerspiegelen.

type UpdateCall = { table: string; op: 'update'; data: Record<string, unknown>; eqs: Array<[string, unknown]> }
type SelectCall = { table: string; op: 'select'; cols: string; eqs: Array<[string, unknown]> }
type UpsertCall = { table: string; op: 'upsert'; data: Record<string, unknown>; onConflict?: string }
type Call = UpdateCall | SelectCall | UpsertCall

/** De `assets`-rij zoals syncAccountBalance hem vóór het schrijven leest. */
const ASSET_ROW = {
  id: 'asset-1',
  name: 'ING Betaalrekening 4300',
  asset_type: 'cash',
  current_value: 1000,
  net_worth_inclusion_pct: 100,
}

function makeSupabaseStub(
  opts: {
    linkedAssetId?: string | null
    /** De rij die `.select().eq().maybeSingle()` per tabel teruggeeft. */
    selectRows?: Partial<Record<string, unknown>>
    /**
     * Tabel → fout die de `.update().eq().select().maybeSingle()`-aanroep op
     * die tabel teruggeeft. Ontbreekt de tabel hier, dan blijft het happy path
     * (`{ error: null }`) ongewijzigd.
     */
    updateErrors?: Partial<Record<string, { message: string }>>
    /** Tabel → fout die de `.upsert()` op die tabel teruggeeft. */
    upsertErrors?: Partial<Record<string, { message: string }>>
    /**
     * Tabellen waarvan de update-`.maybeSingle()` succesvol (geen error)
     * teruggeeft maar met `data: null` — precies de PostgREST-RLS-blinde vlek
     * (nul rijen geraakt, geen error) die de null-checks in syncAccountBalance
     * dekken.
     */
    nullRowResults?: Partial<Record<string, true>>
  } = {},
) {
  const calls: Call[] = []
  const linkedAssetId = opts.linkedAssetId ?? null
  const selectRows = opts.selectRows ?? {}
  const updateErrors = opts.updateErrors ?? {}
  const upsertErrors = opts.upsertErrors ?? {}
  const nullRowResults = opts.nullRowResults ?? {}

  /** Wat `.select().eq()…maybeSingle()` per tabel oplevert. */
  function readRow(table: string): unknown {
    if (table in selectRows) return selectRows[table]
    if (table === 'bank_accounts') return { linked_asset_id: linkedAssetId }
    if (table === 'assets') return ASSET_ROW
    return null
  }

  const client = {
    from(table: string) {
      return {
        update(data: Record<string, unknown>) {
          const eqs: Array<[string, unknown]> = []
          const builder = {
            eq(col: string, val: unknown) {
              eqs.push([col, val])
              return builder
            },
            select(_cols: string) {
              return {
                maybeSingle() {
                  calls.push({ table, op: 'update', data, eqs: [...eqs] })
                  const error = updateErrors[table] ?? null
                  if (error) {
                    return Promise.resolve({ data: null, error })
                  }
                  if (nullRowResults[table]) {
                    return Promise.resolve({ data: null, error: null })
                  }
                  return Promise.resolve({ data: { id: eqs[0]?.[1] ?? null }, error: null })
                },
              }
            },
          }
          return builder
        },
        select(cols: string) {
          const eqs: Array<[string, unknown]> = []
          const builder = {
            eq(col: string, val: unknown) {
              eqs.push([col, val])
              return builder
            },
            maybeSingle() {
              calls.push({ table, op: 'select', cols, eqs: [...eqs] })
              return Promise.resolve({ data: readRow(table), error: null })
            },
          }
          return builder
        },
        upsert(data: Record<string, unknown>, options?: { onConflict?: string }) {
          calls.push({ table, op: 'upsert', data, onConflict: options?.onConflict })
          return Promise.resolve({ data: null, error: upsertErrors[table] ?? null })
        },
      }
    },
  }

  return { client: client as unknown as SupabaseClient, calls }
}

function stubFetchBalances(balances: Array<{ current: number; available: number; currency: string }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        results: balances.map((b) => ({ ...b, update_timestamp: '2026-07-29T00:00:00Z' })),
      }),
    })),
  )
}

/** Vaste opties; alleen wat een test echt varieert staat in de test zelf. */
const OPTS = {
  accessToken: 'tok',
  dataUrl: 'https://api.truelayer.com',
  externalAccountId: 'acc-1',
  bankAccountId: 'ba-1',
  userId: 'user-1',
}

function upserts(calls: Call[], table: string): UpsertCall[] {
  return calls.filter((c): c is UpsertCall => c.op === 'upsert' && c.table === table)
}

describe('syncAccountBalance', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('schrijft bank_accounts.balance én de gekoppelde asset current_value (cash-as-asset) wanneer linked_asset_id bestaat', async () => {
    stubFetchBalances([{ current: 2543.67, available: 2500, currency: 'EUR' }])
    const { client, calls } = makeSupabaseStub({ linkedAssetId: 'asset-1' })

    const result = await syncAccountBalance(client, OPTS)

    expect(result.synced).toEqual({ balance: 2543.67, currency: 'EUR', previous: 1000, revalued: true })

    const bankUpdate = calls.find((c) => c.table === 'bank_accounts' && c.op === 'update')
    expect(bankUpdate).toBeDefined()
    expect((bankUpdate as UpdateCall).data.balance).toBe(2543.67)
    expect((bankUpdate as UpdateCall).eqs).toContainEqual(['id', 'ba-1'])

    const assetUpdate = calls.find((c) => c.table === 'assets' && c.op === 'update')
    expect(assetUpdate).toBeDefined()
    expect((assetUpdate as UpdateCall).data.current_value).toBe(2543.67)
    expect((assetUpdate as UpdateCall).eqs).toContainEqual(['id', 'asset-1'])
  })

  it('scope\'t ELKE lees- en schrijfronde op user_id (RLS is hier geen vangnet)', async () => {
    // De SELECT-policy op `bank_accounts`, `assets` én `valuations` is bréder dan
    // eigen-rij: huishoud-gedeelde partnerrijen komen erdoor. En RLS scope't de
    // RÍJ, niet de WAARDE van `bank_accounts.linked_asset_id` daarop — zonder deze
    // filter zou een naar een partnerbezitting gezette FK een valuations- en
    // snapshot-rij onder de verkeerde eigenaar hangen, vóórdat de update faalt.
    stubFetchBalances([{ current: 2543.67, available: 2500, currency: 'EUR' }])
    const { client, calls } = makeSupabaseStub({ linkedAssetId: 'asset-1' })

    await syncAccountBalance(client, OPTS)

    const scoped = calls.filter((c): c is SelectCall | UpdateCall => c.op === 'select' || c.op === 'update')
    expect(scoped.length).toBeGreaterThan(0)
    for (const call of scoped) {
      expect(call.eqs, `${call.table}.${call.op} is niet op user_id gescoped`).toContainEqual(['user_id', 'user-1'])
    }
  })

  it('de bankrekening wordt pas als LAATSTE geschreven, ná grootboek en bezitting', async () => {
    // Anders draagt `bank_accounts` het nieuwe saldo terwijl `assets` op het oude
    // blijft staan zodra een schrijfactie ertussenin gooit — precies de drift die
    // deze helper hoort te voorkomen.
    stubFetchBalances([{ current: 2543.67, available: 2500, currency: 'EUR' }])
    const { client, calls } = makeSupabaseStub({ linkedAssetId: 'asset-1' })

    await syncAccountBalance(client, OPTS)

    const writes = calls
      .filter((c) => c.op !== 'select')
      .map((c) => `${c.table}:${c.op}`)
    expect(writes).toEqual([
      'valuations:upsert',
      'balance_snapshots:upsert',
      'assets:update',
      'bank_accounts:update',
    ])
  })

  it('gebruikt het boekhoudkundige "current" saldo, niet "available"', async () => {
    stubFetchBalances([{ current: 100, available: 42, currency: 'EUR' }])
    const { client } = makeSupabaseStub({ linkedAssetId: null })

    const result = await syncAccountBalance(client, OPTS)

    expect(result.synced?.balance).toBe(100)
  })

  it('maybeSingle-pad zonder gekoppelde asset (linked_asset_id null) gooit niet en laat de asset-tabel ongemoeid', async () => {
    stubFetchBalances([{ current: 500, available: 500, currency: 'EUR' }])
    const { client, calls } = makeSupabaseStub({ linkedAssetId: null })

    const result = await syncAccountBalance(client, OPTS)

    // Geen bezitting = geen vermogenswaarde die verspringt, dus ook geen
    // "vorige waarde" om over te melden.
    expect(result.synced).toEqual({ balance: 500, currency: 'EUR', previous: null, revalued: false })
    expect(calls.some((c) => c.table === 'assets')).toBe(false)
    expect(calls.some((c) => c.table === 'valuations')).toBe(false)
  })

  it('zonder bankAccountId: geen db-schrijven, synced=null, ruwe balances blijven beschikbaar', async () => {
    stubFetchBalances([{ current: 500, available: 500, currency: 'EUR' }])
    const { client, calls } = makeSupabaseStub()

    const result = await syncAccountBalance(client, { ...OPTS, bankAccountId: null })

    expect(result.synced).toBeNull()
    expect(result.balances).toHaveLength(1)
    expect(calls).toHaveLength(0)
  })

  // ── H2 (bug-fix): een falende write mag NOOIT als `synced` verschijnen ──
  // De docstring van BalanceSyncResult.synced belooft "gevuld zodra het saldo
  // daadwerkelijk is weggeschreven": syncAccountBalance() maakt dat waar door
  // te gooien zodra een .update()-call een `error` teruggeeft, in plaats van
  // stil een gevuld `synced` terug te geven. De (niet-fatale) callers vangen
  // die throw op, in plaats van een saldo te tonen dat nooit is weggeschreven.

  it('H2: gooit wanneer de bank_accounts.balance-write faalt, i.p.v. een gevulde synced terug te geven', async () => {
    stubFetchBalances([{ current: 2543.67, available: 2500, currency: 'EUR' }])
    const { client } = makeSupabaseStub({
      linkedAssetId: 'asset-1',
      updateErrors: { bank_accounts: { message: 'permission denied for table bank_accounts' } },
    })

    await expect(syncAccountBalance(client, OPTS)).rejects.toThrow()
  })

  it('H2: gooit wanneer de assets.current_value-write faalt, i.p.v. een gevulde synced terug te geven', async () => {
    stubFetchBalances([{ current: 2543.67, available: 2500, currency: 'EUR' }])
    const { client } = makeSupabaseStub({
      linkedAssetId: 'asset-1',
      updateErrors: { assets: { message: 'permission denied for table assets' } },
    })

    await expect(syncAccountBalance(client, OPTS)).rejects.toThrow()
  })

  // ── RLS-blinde vlek: update slaagt (geen error) maar raakt 0 rijen ──────
  // Precies de bevinding uit de review: PostgREST meldt géén error wanneer een
  // update-filter niets matcht (RLS-onzichtbare rij of een niet-bestaand id).
  // syncAccountBalance moet dat detecteren via `.select().maybeSingle()` en
  // gooien i.p.v. stil een gevulde `synced` terug te geven.

  it('gooit wanneer de bankrekening niet leesbaar is, vóórdat er iets is weggeschreven', async () => {
    stubFetchBalances([{ current: 500, available: 500, currency: 'EUR' }])
    const { client, calls } = makeSupabaseStub({ selectRows: { bank_accounts: null } })

    await expect(
      syncAccountBalance(client, { ...OPTS, bankAccountId: 'ba-missing' }),
    ).rejects.toThrow(/niet gevonden of niet zichtbaar/)
    expect(calls.filter((c) => c.op !== 'select')).toHaveLength(0)
  })

  it('gooit wanneer de bank_accounts-update succesvol nul rijen raakt (RLS-onzichtbaar of onbestaand id)', async () => {
    stubFetchBalances([{ current: 500, available: 500, currency: 'EUR' }])
    const { client } = makeSupabaseStub({ nullRowResults: { bank_accounts: true } })

    await expect(
      syncAccountBalance(client, { ...OPTS, bankAccountId: 'ba-missing' }),
    ).rejects.toThrow(/niet gevonden of niet zichtbaar/)
  })

  it('gooit wanneer de gekoppelde asset niet van deze gebruiker is (of niet bestaat)', async () => {
    stubFetchBalances([{ current: 500, available: 500, currency: 'EUR' }])
    const { client } = makeSupabaseStub({ linkedAssetId: 'asset-1', selectRows: { assets: null } })

    await expect(syncAccountBalance(client, OPTS)).rejects.toThrow(/niet gevonden of niet van deze gebruiker/)
  })

  it('gooit wanneer de assets-update succesvol nul rijen raakt (RLS-onzichtbaar of onbestaand id)', async () => {
    stubFetchBalances([{ current: 500, available: 500, currency: 'EUR' }])
    const { client } = makeSupabaseStub({ linkedAssetId: 'asset-1', nullRowResults: { assets: true } })

    await expect(syncAccountBalance(client, OPTS)).rejects.toThrow(/niet gevonden of niet zichtbaar/)
  })

  it('lege balances-lijst van TrueLayer: synced=null, geen db-schrijven', async () => {
    stubFetchBalances([])
    const { client, calls } = makeSupabaseStub({ linkedAssetId: 'asset-1' })

    const result = await syncAccountBalance(client, OPTS)

    expect(result.synced).toBeNull()
    expect(result.balances).toHaveLength(0)
    expect(calls).toHaveLength(0)
  })

  // ── Fase 8: het saldo landt via het canonieke herwaarderingspad ─────────
  // Vóór deze fase overschreef de sync `assets.current_value` zonder spoor: het
  // netto vermogen versprong en de verloop-banden (die uitsluitend
  // `balance_snapshots` lezen, ADR 0046) wisten niet waarom.

  it('fase 8: een saldowijziging levert precies één valuations-rij én één snapshot-upsert', async () => {
    stubFetchBalances([{ current: 2543.67, available: 2500, currency: 'EUR' }])
    const { client, calls } = makeSupabaseStub({ linkedAssetId: 'asset-1' })

    await syncAccountBalance(client, OPTS)

    const valuations = upserts(calls, 'valuations')
    expect(valuations).toHaveLength(1)
    expect(valuations[0].data).toMatchObject({
      user_id: 'user-1',
      entity_type: 'asset',
      entity_id: 'asset-1',
      value: 2543.67,
    })
    // Dezelfde conflictsleutel als de handmatige herwaardering: één waarde per
    // entiteit per dag, laatste van de dag wint — en sinds
    // `20260730072804_add_valuations_user_scoped_unique.sql` mét `user_id`, zodat
    // een botsende `entity_id` van een ándere gebruiker niet de conflict-target is.
    // Bewust tegen de gedeelde constante en niet tegen een tweede letterlijke
    // string: een test die zijn eigen sleutel meeschrijft bewijst niet dat élke
    // schrijver dezelfde gebruikt.
    expect(valuations[0].onConflict).toBe(VALUATIONS_CONFLICT_KEY)
    expect(VALUATIONS_CONFLICT_KEY).toContain('user_id')

    const snapshots = upserts(calls, 'balance_snapshots')
    expect(snapshots).toHaveLength(1)
    expect(snapshots[0].data).toMatchObject({
      user_id: 'user-1',
      entity_type: 'asset',
      entity_id: 'asset-1',
      entity_name: ASSET_ROW.name,
      entity_subtype: ASSET_ROW.asset_type,
      balance: 2543.67,
      net_worth_inclusion_pct: 100,
    })
    // Waarderingsdatum en snapshotdatum zijn dezelfde dag — anders staat de
    // herwaardering op een andere plek in de tijd dan de verloop-band.
    expect(snapshots[0].data.snapshot_date).toBe(valuations[0].data.valuation_date)
  })

  it('fase 8: de waardering draagt de vorige waarde, zodat het correctiemoment kan compenseren', async () => {
    stubFetchBalances([{ current: 2543.67, available: 2500, currency: 'EUR' }])
    const { client, calls } = makeSupabaseStub({ linkedAssetId: 'asset-1' })

    await syncAccountBalance(client, OPTS)

    const [valuation] = upserts(calls, 'valuations')
    expect(parseBankSyncPrevious(valuation.data.notes as string)).toBe(1000)
  })

  it('fase 8: een sync die het saldo NIET wijzigt schrijft geen waardering en raakt de bezitting niet aan', async () => {
    // Gelijk saldo (op de cent) — anders vervuilt elke routine-sync de
    // herwaarderingshistorie met een rij die niets zegt.
    stubFetchBalances([{ current: 1000, available: 900, currency: 'EUR' }])
    const { client, calls } = makeSupabaseStub({ linkedAssetId: 'asset-1' })

    const result = await syncAccountBalance(client, OPTS)

    expect(result.synced).toEqual({ balance: 1000, currency: 'EUR', previous: 1000, revalued: false })
    expect(upserts(calls, 'valuations')).toHaveLength(0)
    expect(upserts(calls, 'balance_snapshots')).toHaveLength(0)
    // Ook geen `updated_at`-tik: "bijgewerkt" zonder wijziging is een onwaarheid.
    expect(calls.some((c) => c.table === 'assets' && c.op === 'update')).toBe(false)
  })

  it('fase 8: een gefaalde valuations-write gooit en laat de bezitting op haar oude waarde staan', async () => {
    stubFetchBalances([{ current: 2543.67, available: 2500, currency: 'EUR' }])
    const { client, calls } = makeSupabaseStub({
      linkedAssetId: 'asset-1',
      upsertErrors: { valuations: { message: 'permission denied for table valuations' } },
    })

    await expect(syncAccountBalance(client, OPTS)).rejects.toThrow(/Herwaardering/)
    // Grootboek vóór de afgeleide waarde: er is niets half toegepast.
    expect(calls.some((c) => c.table === 'assets' && c.op === 'update')).toBe(false)
  })

  it('fase 8: een gefaalde snapshot-mirror is niet fataal — de herwaardering staat er', async () => {
    stubFetchBalances([{ current: 2543.67, available: 2500, currency: 'EUR' }])
    const { client, calls } = makeSupabaseStub({
      linkedAssetId: 'asset-1',
      upsertErrors: { balance_snapshots: { message: 'relation does not exist' } },
    })

    const result = await syncAccountBalance(client, OPTS)

    expect(result.synced?.revalued).toBe(true)
    expect(calls.some((c) => c.table === 'assets' && c.op === 'update')).toBe(true)
  })
})
