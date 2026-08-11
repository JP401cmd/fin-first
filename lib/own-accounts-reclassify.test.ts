import { describe, it, expect } from 'vitest'
import { reclassifyOwnAccountTransfers } from './own-accounts-reclassify'
import type { OwnAccountIdentifiers } from './own-accounts'

/**
 * `reclassifyOwnAccountTransfers` — de gedeelde omzetlus achter zowel
 * `POST /api/own-accounts/reclassify` als `POST /api/own-accounts/rules`.
 *
 * Wat deze tests bewaken, in volgorde van belang:
 *
 *  1. Rijen die al `transfer`/`joint_transfer` zijn blijven ongemoeid
 *     (idempotentie + handmatige koppelingen met rust laten).
 *  2. Paginering over de 1000-cap heen, batchen per 200.
 *  3. Een lege identifier-set doet GEEN enkele query.
 *  4. Het trio `{transaction_type, category_source, budget_id}` wordt geschreven.
 *
 * Gebruikt een inline stub-client (geen `vi.mock`) — deterministisch en zonder
 * module-resolutie, zoals de dependency-injected `supabase`-parameter bedoelt.
 */

type Tx = { id: string; counterparty_iban: string | null; counterparty_name: string | null; transaction_type: string | null }

function buildClient(transactions: Tx[]) {
  let fromCallCount = 0
  let rangeCallCount = 0
  let selectUserIdFilter: string | null = null
  let updateUserIdFilter = false
  const updates: { ids: string[]; patch: Record<string, unknown> }[] = []

  const client = {
    from(table: string) {
      fromCallCount++
      if (table !== 'transactions') throw new Error(`onverwachte tabel: ${table}`)
      const chain = {
        select: () => chain,
        eq(col: string, val: string) {
          if (col === 'user_id') selectUserIdFilter = val
          return chain
        },
        range: (from: number) => {
          rangeCallCount++
          return Promise.resolve({ data: transactions.slice(from, from + 1000), error: null })
        },
        // De UPDATE eindigt op `.in(ids).eq('user_id', …).select('id')`. Beide
        // staarten zijn betekenisvol en worden hier vastgepind:
        //  - `.eq('user_id')` is de eigenaarscontrole op de SCHRIJF (de docblock
        //    van de helper belooft 'm; tot 11 aug stond hij er niet);
        //  - `.select('id')` maakt de teller eerlijk — een UPDATE die door RLS 0
        //    rijen raakt geeft géén error, dus optellen van `batchIds.length` kon
        //    "N omgezet" melden terwijl er niets geschreven was.
        // De stub geeft daarom terug wat hij "schreef".
        update: (patch: Record<string, unknown>) => ({
          in: (_col: string, ids: string[]) => {
            updates.push({ ids, patch })
            const updateChain = {
              eq: (col: string) => {
                if (col === 'user_id') updateUserIdFilter = true
                return updateChain
              },
              select: () => Promise.resolve({ data: ids.map((id) => ({ id })), error: null }),
            }
            return updateChain
          },
        }),
      }
      return chain
    },
  }

  return {
    client,
    updates,
    get fromCallCount() {
      return fromCallCount
    },
    get rangeCallCount() {
      return rangeCallCount
    },
    get selectUserIdFilter() {
      return selectUserIdFilter
    },
    get updateUserIdFilter() {
      return updateUserIdFilter
    },
  }
}

const OWN_IBAN = 'NL91ABNA0417164300'
const BUDGET_ID = 'budget-eigen-rekening'

describe('reclassifyOwnAccountTransfers', () => {
  it('slaat rijen over die al transfer of joint_transfer zijn', async () => {
    const { client, updates } = buildClient([
      { id: 't1', counterparty_iban: OWN_IBAN, counterparty_name: null, transaction_type: 'transfer' },
      { id: 't2', counterparty_iban: OWN_IBAN, counterparty_name: null, transaction_type: 'joint_transfer' },
      { id: 't3', counterparty_iban: OWN_IBAN, counterparty_name: null, transaction_type: 'expense' },
    ])
    const ids: OwnAccountIdentifiers = { ibans: new Set([OWN_IBAN]), namePatterns: [] }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await reclassifyOwnAccountTransfers(client as any, 'user-1', ids, BUDGET_ID)

    expect(result.reclassified).toBe(1)
    expect(updates).toHaveLength(1)
    expect(updates[0].ids).toEqual(['t3'])
  })

  it('pagineert over de 1000-cap heen en batcht updates per 200', async () => {
    // 1200 kandidaten: paginering (2× range, 1000 + 200) én batching (6× 200).
    const transactions: Tx[] = Array.from({ length: 1200 }, (_, i) => ({
      id: `tx-${i}`,
      counterparty_iban: OWN_IBAN,
      counterparty_name: null,
      transaction_type: null,
    }))
    const stub = buildClient(transactions)
    const ids: OwnAccountIdentifiers = { ibans: new Set([OWN_IBAN]), namePatterns: [] }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await reclassifyOwnAccountTransfers(stub.client as any, 'user-1', ids, BUDGET_ID)

    expect(stub.rangeCallCount).toBe(2) // paginering: 1000 + 200, tweede pagina < 1000 stopt de lus
    expect(result.reclassified).toBe(1200)
    expect(stub.updates).toHaveLength(6) // 1200 / 200 = 6 batches
    for (const u of stub.updates) expect(u.ids).toHaveLength(200)
    // De SELECT-kant scoped wél op user_id.
    expect(stub.selectUserIdFilter).toBe('user-1')
  })

  it('lege identifier-set → {reclassified: 0} zonder enige query', async () => {
    const { client, fromCallCount } = buildClient([
      { id: 't1', counterparty_iban: OWN_IBAN, counterparty_name: null, transaction_type: 'expense' },
    ])
    const ids: OwnAccountIdentifiers = { ibans: new Set(), namePatterns: [] }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await reclassifyOwnAccountTransfers(client as any, 'user-1', ids, BUDGET_ID)

    expect(result).toEqual({ reclassified: 0 })
    expect(fromCallCount).toBe(0)
  })

  it('schrijft het trio {transaction_type, category_source, budget_id}', async () => {
    const stub = buildClient([
      { id: 't1', counterparty_iban: OWN_IBAN, counterparty_name: null, transaction_type: 'expense' },
    ])
    const ids: OwnAccountIdentifiers = { ibans: new Set([OWN_IBAN]), namePatterns: [] }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await reclassifyOwnAccountTransfers(stub.client as any, 'user-1', ids, BUDGET_ID)

    expect(stub.updates[0].patch).toEqual({
      transaction_type: 'transfer',
      category_source: 'transfer',
      budget_id: BUDGET_ID,
    })
    // Eigenaarscontrole op de SCHRIJF, niet alleen op de kandidaat-lees. De
    // docblock van de helper belooft dit; tot 11 aug stond het er niet, en de
    // toenmalige stub kon het verschil niet zien.
    expect(stub.updateUserIdFilter).toBe(true)
  })

  it('telt de TERUGGEGEVEN rijen, niet de kandidaten', async () => {
    // Een UPDATE die door RLS nul rijen raakt geeft géén error. Een teller die
    // `batchIds.length` optelt zou dan "1 omgezet" melden terwijl er niets
    // geschreven is — een leugen die de gebruiker rechtstreeks te zien krijgt.
    const stub = buildClient([
      { id: 't1', counterparty_iban: OWN_IBAN, counterparty_name: null, transaction_type: 'expense' },
      { id: 't2', counterparty_iban: OWN_IBAN, counterparty_name: null, transaction_type: 'expense' },
    ])
    const ids: OwnAccountIdentifiers = { ibans: new Set([OWN_IBAN]), namePatterns: [] }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await reclassifyOwnAccountTransfers(stub.client as any, 'user-1', ids, BUDGET_ID)

    expect(result.reclassified).toBe(2)
    expect(stub.updates[0].ids).toEqual(['t1', 't2'])
  })

  it('matcht ook op naam-patroon, niet alleen IBAN', async () => {
    const { client, updates } = buildClient([
      { id: 't1', counterparty_iban: null, counterparty_name: 'Mijn PayPal rekening', transaction_type: 'expense' },
      { id: 't2', counterparty_iban: null, counterparty_name: 'Albert Heijn', transaction_type: 'expense' },
    ])
    const ids: OwnAccountIdentifiers = { ibans: new Set(), namePatterns: ['paypal'] }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await reclassifyOwnAccountTransfers(client as any, 'user-1', ids, BUDGET_ID)

    expect(result.reclassified).toBe(1)
    expect(updates[0].ids).toEqual(['t1'])
  })
})
