import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { mockDecryptField } = vi.hoisted(() => ({ mockDecryptField: vi.fn() }))

vi.mock('@/lib/crypto/field-encryption', () => ({
  blindIndex: (s: string) => `hash:${s}`,
  encryptField: (s: string | null) => (s === null || s === undefined ? null : `enc:${s}`),
  decryptField: mockDecryptField,
}))

import { ensureCashAssetForBankAccount } from './cash-asset-backfill'

/**
 * De cash-as-asset-backfill, losgetrokken uit de OAuth-callback (fase 5) omdat
 * het correctiemoment (`relink`) exact dezelfde stap nodig heeft. Landt een
 * koppeling op een rekening zónder cash-bezit, dan schrijft de saldo-sync alleen
 * `bank_accounts.balance` en blijft de rekening onzichtbaar in élk vermogens- en
 * cash-oppervlak — die lezen `assets`.
 *
 * Sinds fase 7 bewaakt deze suite óók SC-13: **élk pad dat een bestaand cash-bezit
 * hergebruikt zet `assets.is_active` op `true`.** Dat is het incident van de
 * eigenaar — een "verwijderde" rekening opnieuw koppelen leverde een werkende
 * koppeling met een kloppend saldo op een rij die `cash-overview` wegfiltert. De
 * twee grenzen van die invariant staan hieronder als eigen assertie, want ze zijn
 * de reden dat reactiveren géén "zet alles maar weer aan" is:
 * `has_budget_tracking` en `bank_accounts.is_active` blijven ongemoeid.
 */

type Queues = Record<string, Array<{ data: unknown; error?: unknown }>>

/**
 * De reactivatie-lezing die de hergebruik-tak sinds fase 7 op het bestaande
 * cash-bezit doet. `is_active: true` = niets te doen.
 */
function assetState(id: string, isActive: boolean) {
  return { data: { id, is_active: isActive } }
}

function makeStub(queues: Queues) {
  const calls: Array<{ table: string; op: 'insert' | 'update'; data: Record<string, unknown> }> = []
  const filters: Array<{ table: string; column: string; value: unknown }> = []

  function next(table: string) {
    const queue = queues[table]
    if (!queue || queue.length === 0) {
      throw new Error(`Geen canned response meer gequeued voor tabel "${table}"`)
    }
    return queue.shift()!
  }

  function makeBuilder(table: string): any {
    const builder: any = {
      select: () => builder,
      insert: (data: Record<string, unknown>) => {
        calls.push({ table, op: 'insert', data })
        return builder
      },
      update: (data: Record<string, unknown>) => {
        calls.push({ table, op: 'update', data })
        return builder
      },
      eq: (column: string, value: unknown) => {
        filters.push({ table, column, value })
        return builder
      },
      maybeSingle: () => Promise.resolve(next(table)),
      single: () => Promise.resolve(next(table)),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(next(table)).then(resolve, reject),
    }
    return builder
  }

  return {
    client: { from: (table: string) => makeBuilder(table) } as unknown as SupabaseClient,
    calls,
    filters,
  }
}

beforeEach(() => {
  mockDecryptField.mockReset()
})

describe('ensureCashAssetForBankAccount', () => {
  it('rekening heeft al een ACTIEF bezit → idempotent, geen insert en geen write', async () => {
    const { client, calls } = makeStub({
      bank_accounts: [
        { data: { id: 'ba-1', linked_asset_id: 'asset-1', iban_encrypted: null, account_type: 'checking' } },
      ],
      assets: [assetState('asset-1', true)],
    })

    const result = await ensureCashAssetForBankAccount(client, {
      userId: 'user-1',
      bankAccountId: 'ba-1',
      providerName: 'ING',
    })

    expect(result).toEqual({ assetId: 'asset-1', created: false, reactivated: false })
    expect(calls).toHaveLength(0)
  })

  it('rekening niet gevonden of niet van deze gebruiker → niets aangemaakt', async () => {
    const { client, calls } = makeStub({ bank_accounts: [{ data: null }] })

    const result = await ensureCashAssetForBankAccount(client, {
      userId: 'user-1',
      bankAccountId: 'ba-van-iemand-anders',
      providerName: 'ING',
    })

    expect(result).toEqual({ assetId: null, created: false, reactivated: false })
    expect(calls).toHaveLength(0)
  })

  it('filtert de lookup expliciet op user_id (RLS op bank_accounts is bréder dan eigen-rij)', async () => {
    const { client, filters } = makeStub({
      bank_accounts: [{ data: { id: 'ba-1', linked_asset_id: 'asset-1', iban_encrypted: null, account_type: null } }],
      assets: [assetState('asset-1', true)],
    })

    await ensureCashAssetForBankAccount(client, {
      userId: 'user-1',
      bankAccountId: 'ba-1',
      providerName: 'ING',
    })

    expect(filters).toEqual(
      expect.arrayContaining([{ table: 'bank_accounts', column: 'user_id', value: 'user-1' }]),
    )
  })

  it('spaarrekening: het subtype volgt account_type van de rekening, niet een hardgecodeerde checking', async () => {
    const { client, calls } = makeStub({
      bank_accounts: [
        { data: { id: 'ba-1', linked_asset_id: null, iban_encrypted: null, account_type: 'savings' } },
        { data: null }, // linked_asset_id-update
      ],
      assets: [{ data: { id: 'asset-nieuw' } }],
    })

    const result = await ensureCashAssetForBankAccount(client, {
      userId: 'user-1',
      bankAccountId: 'ba-1',
      providerName: 'ASN',
      providerIban: 'NL91ABNA0417164300',
    })

    expect(result).toEqual({ assetId: 'asset-nieuw', created: true, reactivated: false })

    const insert = calls.find((c) => c.table === 'assets' && c.op === 'insert')
    expect(insert?.data.subtype).toBe('savings_account')
    expect(insert?.data.asset_type).toBe('cash')
    expect(insert?.data.is_liquid).toBe(true)
    expect(insert?.data.name).toBe('ASN 4300')
    expect(insert?.data.current_value).toBe(0)

    // De binding wordt gelegd, niet genuld (invariant uit bank-account-companion).
    const update = calls.find((c) => c.table === 'bank_accounts' && c.op === 'update')
    expect(update?.data).toEqual({ linked_asset_id: 'asset-nieuw' })
  })

  it('geen provider-IBAN → naam uit de ontsleutelde iban_encrypted', async () => {
    mockDecryptField.mockReturnValue('NL91ABNA0417169999')

    const { client, calls } = makeStub({
      bank_accounts: [
        { data: { id: 'ba-1', linked_asset_id: null, iban_encrypted: 'v1:cipher', account_type: 'checking' } },
        { data: null },
      ],
      assets: [{ data: { id: 'asset-nieuw' } }],
    })

    await ensureCashAssetForBankAccount(client, {
      userId: 'user-1',
      bankAccountId: 'ba-1',
      providerName: 'ING',
    })

    expect(mockDecryptField).toHaveBeenCalledWith('v1:cipher')
    expect(calls.find((c) => c.table === 'assets')?.data.name).toBe('ING 9999')
  })

  it('niet-ontsleutelbare legacy-ciphertext → naam degradeert naar de providernaam, geen throw', async () => {
    mockDecryptField.mockImplementation(() => {
      throw new Error('[field-encryption] Ciphertext is missing the "v1:" version prefix.')
    })

    const { client, calls } = makeStub({
      bank_accounts: [
        { data: { id: 'ba-1', linked_asset_id: null, iban_encrypted: 'legacy', account_type: 'checking' } },
        { data: null },
      ],
      assets: [{ data: { id: 'asset-nieuw' } }],
    })

    await expect(
      ensureCashAssetForBankAccount(client, {
        userId: 'user-1',
        bankAccountId: 'ba-1',
        providerName: 'ING',
      }),
    ).resolves.toEqual({ assetId: 'asset-nieuw', created: true, reactivated: false })

    expect(calls.find((c) => c.table === 'assets')?.data.name).toBe('ING')
  })

  it('mislukte asset-insert → geen binding weggeschreven', async () => {
    const { client, calls } = makeStub({
      bank_accounts: [
        { data: { id: 'ba-1', linked_asset_id: null, iban_encrypted: null, account_type: 'checking' } },
      ],
      assets: [{ data: null }],
    })

    const result = await ensureCashAssetForBankAccount(client, {
      userId: 'user-1',
      bankAccountId: 'ba-1',
      providerName: 'ING',
    })

    expect(result).toEqual({ assetId: null, created: false, reactivated: false })
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0)
  })
})

/**
 * SC-13 — het incident: "verwijder" een rekening in de UI (functioneel
 * `assets.is_active = false` op het cash-bezit) en koppel opnieuw. De koppeling
 * werkt, het saldo klopt, en de rekening is onzichtbaar op cashflow, want
 * `cash-overview` filtert cash-bezittingen op `is_active !== false` vóórdat het de
 * koppelstatus bepaalt.
 */
describe('ensureCashAssetForBankAccount — SC-13: hergebruik is heractivatie', () => {
  function makeDeactivatedAssetStub(assetQueue: Array<{ data: unknown; error?: unknown }>) {
    return makeStub({
      bank_accounts: [
        // Bewust mét een bestaand bezit: dit is de HERGEBRUIK-tak, niet de aanmaak.
        { data: { id: 'ba-1', linked_asset_id: 'asset-1', iban_encrypted: null, account_type: 'checking' } },
      ],
      assets: assetQueue,
    })
  }

  it('gedeactiveerd bezit → is_active gaat op true, en niets anders', async () => {
    const { client, calls } = makeDeactivatedAssetStub([
      assetState('asset-1', false),
      { data: null }, // de reactivatie-update
    ])

    const result = await ensureCashAssetForBankAccount(client, {
      userId: 'user-1',
      bankAccountId: 'ba-1',
      providerName: 'ING',
    })

    expect(result).toEqual({ assetId: 'asset-1', created: false, reactivated: true })

    // Er komt géén tweede bezit bij — de rekening houdt haar eigen historie.
    expect(calls.filter((c) => c.op === 'insert')).toHaveLength(0)

    const updates = calls.filter((c) => c.op === 'update')
    expect(updates).toHaveLength(1)
    expect(updates[0].table).toBe('assets')
    // Exact één vlag. `toEqual` en niet `toMatchObject`: de hele waarde van deze
    // test zit in wat er NIET bij staat.
    expect(updates[0].data).toEqual({ is_active: true })
  })

  it('raakt has_budget_tracking niet aan — budgetteren is een eigen, zichtbare as (B2)', async () => {
    const { client, calls } = makeDeactivatedAssetStub([assetState('asset-1', false), { data: null }])

    await ensureCashAssetForBankAccount(client, {
      userId: 'user-1',
      bankAccountId: 'ba-1',
      providerName: 'ING',
    })

    for (const call of calls) {
      expect(call.data).not.toHaveProperty('has_budget_tracking')
    }
  })

  it('raakt bank_accounts.is_active niet aan — die vlag betekent "budgetteren staat uit"', async () => {
    const { client, calls } = makeDeactivatedAssetStub([assetState('asset-1', false), { data: null }])

    await ensureCashAssetForBankAccount(client, {
      userId: 'user-1',
      bankAccountId: 'ba-1',
      providerName: 'ING',
    })

    // Meeflippen zou budgetteren stil aanzetten (`syncBankAccountCompanion` leest
    // deze vlag), precies wat besluit B2 verbiedt.
    expect(calls.filter((c) => c.table === 'bank_accounts')).toHaveLength(0)
  })

  it('reactivatie filtert op user_id, ook op de update', async () => {
    const { client, filters } = makeDeactivatedAssetStub([assetState('asset-1', false), { data: null }])

    await ensureCashAssetForBankAccount(client, {
      userId: 'user-1',
      bankAccountId: 'ba-1',
      providerName: 'ING',
    })

    // Twee keer: de lezing én de write. De SELECT-policy op `assets` is bréder dan
    // eigen-rij (huishoud-gedeelde partnerrijen komen erdoor), dus dit is geen
    // dubbelop maar de eigenaarschapseis zelf.
    expect(filters.filter((f) => f.table === 'assets' && f.column === 'user_id')).toHaveLength(2)
  })

  it('gefaalde reactivatie-write wordt gelezen: reactivated blijft false, assetId blijft staan', async () => {
    const { client } = makeDeactivatedAssetStub([
      assetState('asset-1', false),
      { data: null, error: { message: 'permission denied for table assets' } },
    ])

    const result = await ensureCashAssetForBankAccount(client, {
      userId: 'user-1',
      bankAccountId: 'ba-1',
      providerName: 'ING',
    })

    // Niet geslikt en niet als succes gemeld: het bezit bestaat wél (dus `assetId`),
    // maar het is niet gereactiveerd (dus `reactivated: false`).
    expect(result).toEqual({ assetId: 'asset-1', created: false, reactivated: false })
  })

  it('leesfout op het bezit → geen write en geen valse melding, en de module gooit niet', async () => {
    const { client, calls } = makeDeactivatedAssetStub([
      { data: null, error: { message: 'relation "assets" does not exist' } },
    ])

    await expect(
      ensureCashAssetForBankAccount(client, {
        userId: 'user-1',
        bankAccountId: 'ba-1',
        providerName: 'ING',
      }),
    ).resolves.toEqual({ assetId: 'asset-1', created: false, reactivated: false })

    expect(calls).toHaveLength(0)
  })
})
