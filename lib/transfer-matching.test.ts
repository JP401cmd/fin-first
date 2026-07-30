import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { findTransferPairs, linkUnmatchedTransfers, type UnlinkedTransfer } from './transfer-matching'

/**
 * Koppeling van ongekoppelde eigen-overboekingen.
 *
 * ## Waarom dit bestand bestaat
 *
 * Dit is het gevaarlijkste stuk van de IBAN-encryptie-omzetting. De IBANs van je
 * eigen rekeningen komen sinds die omzetting via `GET /api/own-accounts/ibans`
 * (de sleutels zijn server-only, dus de browser kan `iban_encrypted` niet zelf
 * ontsleutelen). Levert die ophaal een LEGE of ONVOLLEDIGE set, dan vindt deze
 * functie geen enkel paar — en blijft elke helft van een interne overboeking in
 * de rest van de app staan als een échte inkomst en een échte uitgave. De
 * spaarquote is dan corrupt, en er verschijnt nergens een fout.
 *
 * Daarom toetsen deze tests twee dingen apart:
 *
 *  1. **De matchregels** (`findTransferPairs`, puur, geen IO).
 *  2. **Dat een mislukte IBAN-ophaal LUID faalt** in plaats van als `0` terug te
 *     komen. `0 gekoppelde paren` en `ik kon de IBANs niet lezen` zagen er in de
 *     vorige versie identiek uit; dat verschil is precies de bug-klasse die deze
 *     omzetting kon introduceren.
 */

const ACC_A = 'acc-a'
const ACC_B = 'acc-b'
const IBAN_A = 'NL01BANK0000000001'
const IBAN_B = 'NL02BANK0000000002'

function tx(over: Partial<UnlinkedTransfer> & { id: string }): UnlinkedTransfer {
  return {
    account_id: ACC_A,
    date: '2026-03-10',
    amount: -100,
    counterparty_iban: IBAN_B,
    ...over,
  }
}

describe('findTransferPairs — de matchregels', () => {
  const ibans = new Map([[ACC_A, IBAN_A], [ACC_B, IBAN_B]])

  it('koppelt een gespiegeld paar met kruislings kloppende IBANs', () => {
    const pairs = findTransferPairs([
      tx({ id: 'uit', account_id: ACC_A, amount: -250, counterparty_iban: IBAN_B }),
      tx({ id: 'in', account_id: ACC_B, amount: 250, counterparty_iban: IBAN_A }),
    ], ibans)

    expect(pairs).toEqual([['uit', 'in']])
  })

  it('normaliseert spaties en kleine letters aan beide kanten', () => {
    const pairs = findTransferPairs([
      tx({ id: 'uit', account_id: ACC_A, amount: -250, counterparty_iban: 'nl02 bank 0000 0000 02' }),
      tx({ id: 'in', account_id: ACC_B, amount: 250, counterparty_iban: 'NL01 BANK 0000 0000 01' }),
    ], new Map([[ACC_A, 'nl01 bank 0000 0000 01'], [ACC_B, ' NL02BANK0000000002 ']]))

    expect(pairs).toEqual([['uit', 'in']])
  })

  it('koppelt niet bij hetzelfde teken, een te groot bedragverschil of meer dan een dag ertussen', () => {
    expect(findTransferPairs([
      tx({ id: 'a', account_id: ACC_A, amount: -250, counterparty_iban: IBAN_B }),
      tx({ id: 'b', account_id: ACC_B, amount: -250, counterparty_iban: IBAN_A }),
    ], ibans)).toEqual([])

    expect(findTransferPairs([
      tx({ id: 'a', account_id: ACC_A, amount: -250, counterparty_iban: IBAN_B }),
      tx({ id: 'b', account_id: ACC_B, amount: 251, counterparty_iban: IBAN_A }),
    ], ibans)).toEqual([])

    expect(findTransferPairs([
      tx({ id: 'a', account_id: ACC_A, date: '2026-03-10', amount: -250, counterparty_iban: IBAN_B }),
      tx({ id: 'b', account_id: ACC_B, date: '2026-03-14', amount: 250, counterparty_iban: IBAN_A }),
    ], ibans)).toEqual([])
  })

  it('koppelt elke transactie hoogstens één keer', () => {
    const pairs = findTransferPairs([
      tx({ id: 'uit', account_id: ACC_A, amount: -250, counterparty_iban: IBAN_B }),
      tx({ id: 'in1', account_id: ACC_B, amount: 250, counterparty_iban: IBAN_A }),
      tx({ id: 'in2', account_id: ACC_B, amount: 250, counterparty_iban: IBAN_A }),
    ], ibans)

    expect(pairs).toEqual([['uit', 'in1']])
  })

  it('DE FAALMODUS: zonder IBANs vindt de matcher niets — daarom moet de ophaal luid falen', () => {
    // Dit is geen wens maar een vaststelling: de matcher kán niets zonder IBANs.
    // Hij heeft geen manier om "ik weet het niet" te onderscheiden van "er is
    // geen paar", dus de bescherming MOET een laag hoger zitten. Zie de test
    // hieronder over `linkUnmatchedTransfers`.
    const pairs = findTransferPairs([
      tx({ id: 'uit', account_id: ACC_A, amount: -250, counterparty_iban: IBAN_B }),
      tx({ id: 'in', account_id: ACC_B, amount: 250, counterparty_iban: IBAN_A }),
    ], new Map())

    expect(pairs).toEqual([])
  })
})

// ── De IO-laag: waar de eigen IBANs vandaan komen ──────────────────────────

type StubTx = UnlinkedTransfer
type Updated = { id: string; linked_transfer_id: string }

function buildSupabase(rows: StubTx[], opts: { readError?: string } = {}) {
  const updates: Updated[] = []
  return {
    updates,
    client: {
      from: () => {
        let pendingUpdate: { linked_transfer_id: string } | null = null
        const chain = {
          select: () => chain,
          eq(_col: string, val: string) {
            if (pendingUpdate) {
              updates.push({ id: val, linked_transfer_id: pendingUpdate.linked_transfer_id })
              return Promise.resolve({ error: null })
            }
            return chain
          },
          is: () => chain,
          order: () =>
            opts.readError
              ? Promise.resolve({ data: null, error: { message: opts.readError } })
              : Promise.resolve({ data: rows, error: null }),
          update(payload: { linked_transfer_id: string }) {
            pendingUpdate = payload
            return chain
          },
        }
        return chain
      },
    },
  }
}

const originalFetch = globalThis.fetch

function stubIbanRoute(body: unknown, ok = true, status = 200) {
  globalThis.fetch = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as typeof fetch
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('linkUnmatchedTransfers — de IBANs komen uit de route, en falen is luid', () => {
  const pair: StubTx[] = [
    tx({ id: 'uit', account_id: ACC_A, amount: -250, counterparty_iban: IBAN_B }),
    tx({ id: 'in', account_id: ACC_B, amount: 250, counterparty_iban: IBAN_A }),
  ]

  it('koppelt een paar met de ONTSLEUTELDE IBANs uit /api/own-accounts/ibans', async () => {
    stubIbanRoute({
      accounts: [
        { id: ACC_A, iban: IBAN_A, is_active: true },
        { id: ACC_B, iban: IBAN_B, is_active: true },
      ],
      unreadable: 0,
    })
    const { client, updates } = buildSupabase(pair)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linked = await linkUnmatchedTransfers(client as any, 'user-1')

    expect(linked).toBe(1)
    expect(updates).toEqual([
      { id: 'uit', linked_transfer_id: 'in' },
      { id: 'in', linked_transfer_id: 'uit' },
    ])
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/own-accounts/ibans')
  })

  it('GOOIT wanneer de IBAN-route faalt — nooit stil 0', async () => {
    // Dit is de kern. De vorige implementatie deed `return 0` bij een leesfout op
    // de rekeningen, wat niet te onderscheiden was van "niets te koppelen". Elk
    // ongekoppeld paar telt daarna mee als een echte inkomst én een echte uitgave.
    stubIbanRoute({ error: 'Interne serverfout' }, false, 500)
    const { client, updates } = buildSupabase(pair)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(linkUnmatchedTransfers(client as any, 'user-1')).rejects.toThrow(/IBAN/i)
    expect(updates).toEqual([])
  })

  it('GOOIT wanneer de route een onvolledige set meldt (unreadable > 0)', async () => {
    // Half koppelen is erger dan niet koppelen: de niet-gekoppelde helft blijft
    // meetellen als inkomst/uitgave, en niemand ziet het.
    stubIbanRoute({
      accounts: [{ id: ACC_A, iban: IBAN_A, is_active: true }],
      unreadable: 1,
    })
    const { client, updates } = buildSupabase(pair)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(linkUnmatchedTransfers(client as any, 'user-1')).rejects.toThrow(/ontsleutelen/i)
    expect(updates).toEqual([])
  })

  it('GOOIT wanneer de transactie-leesronde faalt, in plaats van 0 terug te geven', async () => {
    stubIbanRoute({ accounts: [], unreadable: 0 })
    const { client } = buildSupabase([], { readError: 'connection reset' })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(linkUnmatchedTransfers(client as any, 'user-1')).rejects.toThrow(/overboekingen lezen mislukt/i)
  })

  it('minder dan twee transfers is een legitieme 0 — en raakt de IBAN-route niet eens aan', async () => {
    stubIbanRoute({ accounts: [], unreadable: 0 })
    const { client } = buildSupabase([tx({ id: 'alleen' })])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await linkUnmatchedTransfers(client as any, 'user-1')).toBe(0)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
