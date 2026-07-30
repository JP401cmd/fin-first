import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const { mockDecryptField, mockSetBudgetTracking } = vi.hoisted(() => ({
  mockDecryptField: vi.fn(),
  mockSetBudgetTracking: vi.fn(),
}))

vi.mock('@/lib/crypto/field-encryption', () => ({
  blindIndex: (s: string) => `hash:${s}`,
  encryptField: (s: string | null) => (s === null || s === undefined ? null : `enc:${s}`),
  decryptField: mockDecryptField,
}))

/**
 * `setBudgetTracking` is hier bewust GEMOCKT, en dat is de assertie zelf: het
 * herstel mag de budget-as niet met de hand schrijven maar hoort te delegeren aan
 * de ENE schrijver van dat drieluik (`assets.has_budget_tracking` → companion-rij
 * → de module-gate `profiles.budgeting_active`). Het drieluik zelf heeft eigen
 * dekking (`app/api/assets/toggle-budget/route.test.ts`); hier nabouwen zou die
 * regels verdubbelen én de canned-response-queues onleesbaar maken.
 */
vi.mock('@/lib/budget-tracking', () => ({ setBudgetTracking: mockSetBudgetTracking }))

import { ensureCashAssetForBankAccount } from './cash-asset-backfill'

/**
 * De cash-as-asset-backfill, losgetrokken uit de OAuth-callback (fase 5) omdat
 * het correctiemoment (`relink`) exact dezelfde stap nodig heeft. Landt een
 * koppeling op een rekening zónder cash-bezit, dan schrijft de saldo-sync alleen
 * `bank_accounts.balance` en blijft de rekening onzichtbaar in élk vermogens- en
 * cash-oppervlak — die lezen `assets`.
 *
 * Sinds fase 7 bewaakt deze suite óók SC-13: **élk pad dat een bestaand cash-bezit
 * hergebruikt herstelt dat bezit.** Dat is het incident van de eigenaar — een
 * "verwijderde" rekening opnieuw koppelen leverde een werkende koppeling met een
 * kloppend saldo op een rij die `cash-overview` wegfiltert.
 *
 * Sinds het eigenaarsbesluit van 30 juli omvat dat herstel BEIDE assen:
 * zichtbaarheid (`assets.is_active`) én budgettracking. Fase 7 liet de tweede
 * bewust staan; in de praktijk las dat als half hersteld — zichtbare rekening,
 * binnenkomende transacties, en toch in geen enkel budget. De assertie is daarom
 * omgedraaid: `has_budget_tracking` MOET meebewegen, maar uitsluitend via
 * `setBudgetTracking`, en de VOLGORDE (zichtbaarheid eerst) staat er als eigen
 * test bij.
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
  mockSetBudgetTracking.mockReset()
  mockSetBudgetTracking.mockResolvedValue({
    ok: true,
    asset: { id: 'asset-1', has_budget_tracking: true, name: 'ING 4300' },
    budgetingActive: true,
  })
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

  it('gedeactiveerd bezit → is_active op true én budgettracking terug', async () => {
    const { client, calls } = makeDeactivatedAssetStub([
      assetState('asset-1', false),
      { data: null }, // de zichtbaarheids-update
    ])

    const result = await ensureCashAssetForBankAccount(client, {
      userId: 'user-1',
      bankAccountId: 'ba-1',
      providerName: 'ING',
    })

    expect(result).toEqual({ assetId: 'asset-1', created: false, reactivated: true })

    // Er komt géén tweede bezit bij — de rekening houdt haar eigen historie.
    expect(calls.filter((c) => c.op === 'insert')).toHaveLength(0)

    // As 1 — zichtbaarheid. Deze module schrijft zélf uitsluitend deze ene vlag.
    const updates = calls.filter((c) => c.op === 'update')
    expect(updates).toHaveLength(1)
    expect(updates[0].table).toBe('assets')
    expect(updates[0].data).toEqual({ is_active: true })

    // As 2 — budgettracking, via de ENE schrijver, aan (`true`) en op dit bezit.
    expect(mockSetBudgetTracking).toHaveBeenCalledTimes(1)
    expect(mockSetBudgetTracking).toHaveBeenCalledWith(client, 'user-1', 'asset-1', true)
  })

  it('schrijft has_budget_tracking nooit met de hand — altijd via setBudgetTracking', async () => {
    const { client, calls } = makeDeactivatedAssetStub([assetState('asset-1', false), { data: null }])

    await ensureCashAssetForBankAccount(client, {
      userId: 'user-1',
      bankAccountId: 'ba-1',
      providerName: 'ING',
    })

    // De vlag hier zelf zetten zou de companion-rij én de module-gate laten
    // achterlopen — precies hoe die vlaggen eerder uiteen zijn gelopen.
    for (const call of calls) {
      expect(call.data).not.toHaveProperty('has_budget_tracking')
    }
    expect(mockSetBudgetTracking).toHaveBeenCalledOnce()
  })

  it('zichtbaarheid eerst, budget-as daarna — nooit omgekeerd', async () => {
    // De volgorde is geen detail: faalt de budget-write, dan is de rekening in het
    // ergste geval zichtbaar zonder budgettering (zelf-herstelbaar via de bestaande
    // toggle). Omgekeerd zou budgetteren aanstaan op een bezitting die nergens te
    // zien is.
    const order: string[] = []
    const { client } = makeStub({
      bank_accounts: [
        { data: { id: 'ba-1', linked_asset_id: 'asset-1', iban_encrypted: null, account_type: 'checking' } },
      ],
      assets: [assetState('asset-1', false), { data: null }],
    })
    mockSetBudgetTracking.mockImplementation(async () => {
      order.push('budget-as')
      return { ok: true, asset: { id: 'asset-1', has_budget_tracking: true, name: 'ING' }, budgetingActive: true }
    })

    const spied = {
      from: (table: string) => {
        const builder = (client as unknown as { from: (t: string) => any }).from(table)
        const originalUpdate = builder.update
        builder.update = (data: Record<string, unknown>) => {
          if (table === 'assets' && 'is_active' in data) order.push('zichtbaarheid')
          return originalUpdate(data)
        }
        return builder
      },
    } as unknown as SupabaseClient

    await ensureCashAssetForBankAccount(spied, {
      userId: 'user-1',
      bankAccountId: 'ba-1',
      providerName: 'ING',
    })

    expect(order).toEqual(['zichtbaarheid', 'budget-as'])
  })

  it('herstel filtert op user_id, ook op de zichtbaarheids-update', async () => {
    const { client, filters } = makeDeactivatedAssetStub([assetState('asset-1', false), { data: null }])

    await ensureCashAssetForBankAccount(client, {
      userId: 'user-1',
      bankAccountId: 'ba-1',
      providerName: 'ING',
    })

    // Twee keer: de lezing én de write. De SELECT-policy op `assets` is bréder dan
    // eigen-rij (huishoud-gedeelde partnerrijen komen erdoor), dus dit is geen
    // dubbelop maar de eigenaarschapseis zelf. `setBudgetTracking` doet zijn eigen
    // `user_id`-filter (eigen dekking).
    expect(filters.filter((f) => f.table === 'assets' && f.column === 'user_id')).toHaveLength(2)
  })

  it('gefaalde zichtbaarheids-write: reactivated blijft false, en de budget-as wordt niet aangeraakt', async () => {
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
    // maar het is niet hersteld (dus `reactivated: false`).
    expect(result).toEqual({ assetId: 'asset-1', created: false, reactivated: false })
    // En budgetteren gaat niet aan op een bezitting die onzichtbaar bleef.
    expect(mockSetBudgetTracking).not.toHaveBeenCalled()
  })

  it('gefaalde budget-write: het herstel geldt nog steeds (de rekening is zichtbaar)', async () => {
    const { client } = makeDeactivatedAssetStub([assetState('asset-1', false), { data: null }])
    mockSetBudgetTracking.mockResolvedValue({ ok: false, error: { message: 'permission denied' } })

    const result = await ensureCashAssetForBankAccount(client, {
      userId: 'user-1',
      bankAccountId: 'ba-1',
      providerName: 'ING',
    })

    // De zichtbaarheid — het incident van SC-13 — is wél gerepareerd, dus dat mag
    // niet als mislukt gelden. De rest is zichtbaar en zelf-herstelbaar via de
    // bestaande budget-toggle.
    expect(result).toEqual({ assetId: 'asset-1', created: false, reactivated: true })
  })

  it('actief bezit → geen herstel, dus ook geen budget-write', async () => {
    // De budget-as terugzetten is een HERSTEL-actie, geen "zet altijd maar aan":
    // een rekening waarvan de gebruiker budgetteren bewust uitzette terwijl het
    // bezit gewoon bestaat, mag door een herkoppeling niet stil aangezet worden.
    const { client, calls } = makeDeactivatedAssetStub([assetState('asset-1', true)])

    const result = await ensureCashAssetForBankAccount(client, {
      userId: 'user-1',
      bankAccountId: 'ba-1',
      providerName: 'ING',
    })

    expect(result).toEqual({ assetId: 'asset-1', created: false, reactivated: false })
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0)
    expect(mockSetBudgetTracking).not.toHaveBeenCalled()
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
