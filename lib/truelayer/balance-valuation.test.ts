import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BANK_SYNC_CORRECTION_NOTE,
  BANK_SYNC_VALUATION_NOTE,
  bankSyncValuationDate,
  formatBankSyncCorrectionNote,
  formatBankSyncNote,
  isSameBalance,
  loadBankSyncBalanceChanges,
  parseBankSyncPrevious,
  revertBankBalanceRevaluation,
} from './balance-valuation'

/**
 * Het herwaarderingsspoor van de banksync (fase 8).
 *
 * Twee dingen worden hier vastgepind. **Eén:** het notitieformaat, want dat is
 * het enige transport van de vorige waarde tussen de callback (die het saldo
 * schrijft) en het correctiemoment (dat het moet kunnen terugdraaien) — een
 * stille formaatwijziging maakt de compensatie geruisloos onmogelijk. **Twee:**
 * dat de compensatie append-only is, alleen de LAATSTE waardering terugdraait,
 * en idempotent is.
 */

// ── Queue-stub, zelfde vorm als in de relink- en callback-tests ─────────────
// `.from(table)` levert een chainable die de eerstvolgende canned response van
// die tabel consumeert, op `maybeSingle()` of op `await`.

type Call = { table: string; op: 'select' | 'update' | 'upsert'; data?: Record<string, unknown> }

function makeStub(queues: Record<string, Array<{ data?: unknown; error?: unknown }>>) {
  const calls: Call[] = []

  function next(table: string) {
    const queue = queues[table]
    if (!queue || queue.length === 0) {
      throw new Error(`Geen canned response meer gequeued voor tabel "${table}"`)
    }
    const entry = queue.shift()!
    return { data: entry.data ?? null, error: entry.error ?? null }
  }

  function makeBuilder(table: string): Record<string, unknown> {
    const builder: Record<string, unknown> = {
      select: () => {
        calls.push({ table, op: 'select' })
        return builder
      },
      update: (data: Record<string, unknown>) => {
        calls.push({ table, op: 'update', data })
        return builder
      },
      upsert: (data: Record<string, unknown>) => {
        calls.push({ table, op: 'upsert', data })
        return builder
      },
      delete: () => {
        calls.push({ table, op: 'update', data: { __delete: true } })
        return builder
      },
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
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
  }
}

const ASSET = {
  id: 'asset-1',
  name: 'ING Betaalrekening 4300',
  asset_type: 'cash',
  current_value: 2543.67,
  net_worth_inclusion_pct: 100,
}

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('notitieformaat', () => {
  it('schrijft en leest de vorige waarde terug (heen-en-weer)', () => {
    for (const previous of [0, 1000, 2543.67, -12.5, 1234567.89]) {
      expect(parseBankSyncPrevious(formatBankSyncNote(previous))).toBe(previous)
    }
  })

  it('rondt op hele centen af, zodat de notitie geen drijvende-komma-staart draagt', () => {
    const note = formatBankSyncNote(0.1 + 0.2)
    expect(note).toBe(`${BANK_SYNC_VALUATION_NOTE} · vorige waarde 0.3`)
    expect(parseBankSyncPrevious(note)).toBe(0.3)
  })

  it('leest een compensatie NIET als banksync-waardering (anders compenseert de compensatie zichzelf)', () => {
    // `bank-sync-correctie` begint óók met `bank-sync`; een losse
    // startsWith-toets zou hier een tweede compensatie in gang zetten.
    const note = formatBankSyncCorrectionNote(2543.67)
    expect(note.startsWith(BANK_SYNC_CORRECTION_NOTE)).toBe(true)
    expect(parseBankSyncPrevious(note)).toBeNull()
  })

  it('leest een handmatige of onbekende notitie niet als banksync-waardering', () => {
    expect(parseBankSyncPrevious(null)).toBeNull()
    expect(parseBankSyncPrevious('')).toBeNull()
    expect(parseBankSyncPrevious('Waarde bijgewerkt van 1000 naar 2543.67')).toBeNull()
    expect(parseBankSyncPrevious('Historische invoer via verloop-editor')).toBeNull()
    expect(parseBankSyncPrevious('bank-sync')).toBeNull()
    expect(parseBankSyncPrevious('bank-sync · vorige waarde onbekend')).toBeNull()
  })

  it('vergelijkt saldi in hele centen, niet als double', () => {
    expect(isSameBalance(0.1 + 0.2, 0.3)).toBe(true)
    expect(isSameBalance(2543.67, 2543.68)).toBe(false)
    expect(isSameBalance(-12.5, -12.5)).toBe(true)
  })

  it('waardeert op een yyyy-mm-dd-dag', () => {
    expect(bankSyncValuationDate(new Date('2026-07-30T22:15:00.000Z'))).toBe('2026-07-30')
  })
})

describe('revertBankBalanceRevaluation', () => {
  it('draait het banksaldo terug met een compenserende waardering — append-only', async () => {
    const { client, calls } = makeStub({
      bank_accounts: [{ data: { linked_asset_id: 'asset-1' } }, { data: null }],
      valuations: [
        { data: { valuation_date: '2026-07-30', value: 2543.67, notes: formatBankSyncNote(1000) } },
        { data: null },
      ],
      assets: [{ data: ASSET }, { data: { id: 'asset-1' } }],
      balance_snapshots: [{ data: null }],
    })

    const result = await revertBankBalanceRevaluation(client, {
      userId: 'user-1',
      bankAccountId: 'ba-1',
      date: '2026-07-30',
    })

    expect(result).toEqual({ reverted: true, from: 2543.67, to: 1000 })

    // Nooit een delete op het grootboek: de correctie is een nieuwe rij.
    expect(calls.some((c) => c.data?.__delete)).toBe(false)

    const valuation = calls.find((c) => c.table === 'valuations' && c.op === 'upsert')
    expect(valuation?.data).toMatchObject({
      user_id: 'user-1',
      entity_type: 'asset',
      entity_id: 'asset-1',
      valuation_date: '2026-07-30',
      value: 1000,
    })
    expect(String(valuation?.data?.notes)).toContain(BANK_SYNC_CORRECTION_NOTE)

    // Bezitting én bankrekening gaan samen terug: syncAccountBalance schreef
    // hetzelfde getal naar beide, dus de inverse raakt ook beide.
    expect(calls.find((c) => c.table === 'assets' && c.op === 'update')?.data).toMatchObject({
      current_value: 1000,
    })
    expect(calls.find((c) => c.table === 'bank_accounts' && c.op === 'update')?.data).toMatchObject({
      balance: 1000,
    })

    // En de verloop-band beweegt mee.
    expect(calls.find((c) => c.table === 'balance_snapshots' && c.op === 'upsert')?.data).toMatchObject({
      entity_id: 'asset-1',
      balance: 1000,
      snapshot_date: '2026-07-30',
    })
  })

  it('doet niets wanneer de laatste waardering geen banksync is (handmatige herwaardering wint)', async () => {
    const { client, calls } = makeStub({
      bank_accounts: [{ data: { linked_asset_id: 'asset-1' } }],
      valuations: [{ data: { valuation_date: '2026-07-30', value: 3000, notes: 'Waarde bijgewerkt van 2543.67 naar 3000' } }],
    })

    const result = await revertBankBalanceRevaluation(client, { userId: 'user-1', bankAccountId: 'ba-1' })

    expect(result).toEqual({ reverted: false })
    expect(calls.some((c) => c.op === 'update' || c.op === 'upsert')).toBe(false)
  })

  it('is idempotent: na een compensatie doet een tweede aanroep niets', async () => {
    const { client, calls } = makeStub({
      bank_accounts: [{ data: { linked_asset_id: 'asset-1' } }],
      valuations: [
        { data: { valuation_date: '2026-07-30', value: 1000, notes: formatBankSyncCorrectionNote(2543.67) } },
      ],
    })

    const result = await revertBankBalanceRevaluation(client, { userId: 'user-1', bankAccountId: 'ba-1' })

    expect(result).toEqual({ reverted: false })
    expect(calls.some((c) => c.op === 'update' || c.op === 'upsert')).toBe(false)
  })

  it('doet niets zonder cash-bezit — de banksync heeft dan nooit een vermogenswaarde geraakt', async () => {
    const { client, calls } = makeStub({
      bank_accounts: [{ data: { linked_asset_id: null } }],
    })

    const result = await revertBankBalanceRevaluation(client, { userId: 'user-1', bankAccountId: 'ba-1' })

    expect(result).toEqual({ reverted: false })
    expect(calls.some((c) => c.table === 'valuations')).toBe(false)
  })

  it('meldt GEEN succes wanneer de bezitting niet is teruggezet, en laat de markering weg zodat een herhaling nog werkt', async () => {
    // De gevaarlijkste stille fout van dit pad: de update raakt 0 rijen
    // (RLS-onzichtbaar of een vreemd id) en PostgREST geeft dan géén error.
    // Zonder deze gate zou de route "teruggedraaid" loggen over een bezitting die
    // het banksaldo van een vreemde bank gewoon houdt — en die dan, door de
    // markering, ook niet meer te herstellen was.
    const { client, calls } = makeStub({
      bank_accounts: [{ data: { linked_asset_id: 'asset-1' } }],
      valuations: [{ data: { valuation_date: '2026-07-30', value: 2543.67, notes: formatBankSyncNote(1000) } }],
      assets: [{ data: ASSET }, { data: null }],
    })

    const result = await revertBankBalanceRevaluation(client, { userId: 'user-1', bankAccountId: 'ba-1' })

    expect(result).toEqual({ reverted: false })
    // Géén correctie-markering: die zou de idempotentie-poort dichttrekken op een
    // toestand die nog hersteld moet worden.
    expect(calls.some((c) => c.table === 'valuations' && c.op === 'upsert')).toBe(false)
    expect(calls.some((c) => c.table === 'balance_snapshots')).toBe(false)
  })

  it('meldt WEL succes wanneer alleen de markering faalt — het saldo staat dan al terug', async () => {
    const { client, calls } = makeStub({
      bank_accounts: [{ data: { linked_asset_id: 'asset-1' } }, { data: null }],
      valuations: [
        { data: { valuation_date: '2026-07-30', value: 2543.67, notes: formatBankSyncNote(1000) } },
        { error: { message: 'permission denied for table valuations' } },
      ],
      assets: [{ data: ASSET }, { data: { id: 'asset-1' } }],
      balance_snapshots: [{ data: null }],
    })

    const result = await revertBankBalanceRevaluation(client, { userId: 'user-1', bankAccountId: 'ba-1' })

    expect(result).toEqual({ reverted: true, from: 2543.67, to: 1000 })
    expect(calls.find((c) => c.table === 'assets' && c.op === 'update')?.data).toMatchObject({
      current_value: 1000,
    })
  })
})

describe('loadBankSyncBalanceChanges', () => {
  it('levert alleen banksync-waarderingen van de gevraagde dag', async () => {
    const { client } = makeStub({
      valuations: [
        {
          data: [
            { entity_id: 'asset-1', value: 2543.67, notes: formatBankSyncNote(1000) },
            { entity_id: 'asset-2', value: 800, notes: 'Waarde bijgewerkt van 700 naar 800' },
          ],
        },
      ],
    })

    const changes = await loadBankSyncBalanceChanges(client, {
      userId: 'user-1',
      assetIds: ['asset-1', 'asset-2'],
      date: '2026-07-30',
    })

    expect(changes.get('asset-1')).toEqual({ previous: 1000, current: 2543.67 })
    // Een handmatige herwaardering van dezelfde dag mag nooit als "overgenomen
    // van de bank" lezen.
    expect(changes.has('asset-2')).toBe(false)
  })

  it('slaat een waardering over die per saldo niets veranderde', async () => {
    const { client } = makeStub({
      valuations: [{ data: [{ entity_id: 'asset-1', value: 1000, notes: formatBankSyncNote(1000) }] }],
    })

    const changes = await loadBankSyncBalanceChanges(client, {
      userId: 'user-1',
      assetIds: ['asset-1'],
      date: '2026-07-30',
    })

    expect(changes.size).toBe(0)
  })

  it('leest niets wanneer er geen dragers met een cash-bezit zijn', async () => {
    // Geen gequeuede respons: zou de helper tóch bevragen, dan gooit de stub.
    const { client, calls } = makeStub({})

    const changes = await loadBankSyncBalanceChanges(client, { userId: 'user-1', assetIds: [] })

    expect(changes.size).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('faalt zacht met een lege map — de melding is bevestiging, geen voorwaarde', async () => {
    const { client } = makeStub({
      valuations: [{ error: { message: 'permission denied for table valuations' } }],
    })

    const changes = await loadBankSyncBalanceChanges(client, {
      userId: 'user-1',
      assetIds: ['asset-1'],
      date: '2026-07-30',
    })

    expect(changes.size).toBe(0)
  })
})
