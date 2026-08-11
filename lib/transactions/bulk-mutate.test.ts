/**
 * Unit-tests voor de enige schrijfprimitive van transactie-bulkbewerken.
 *
 * Drie eigenschappen worden hier bewezen, en het zijn precies de drie die stil
 * kunnen falen:
 *
 *  1. **Scoping op BEIDE rondes.** De RLS op `transactions` is asymmetrisch:
 *     SELECT is huishoud-verbreed, UPDATE/DELETE zijn own-row. De leesronde die
 *     de kandidaten bepaalt mag daar dus niet op leunen.
 *  2. **Tellen uit `.select('id')`.** Een UPDATE die door RLS nul rijen raakt
 *     geeft géén fout. Wie kandidaten telt, meldt succes over een mutatie die
 *     niet gebeurd is (R-NF4).
 *  3. **Batching op BULK_BATCH_SIZE**, met een gesneuvelde batch die de rest niet
 *     meesleept (R-NF5).
 */
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  readBulkCandidates,
  bulkUpdateTransactions,
  bulkDeleteTransactions,
  planBulkBudgetUpdate,
  collectLinkedCounterpartIds,
  type BulkCandidateRow,
} from './bulk-mutate'
import { BULK_BATCH_SIZE } from './bulk-contract'

type Filter = [string, ...unknown[]]

interface RecordedCall {
  table: string
  op: 'select' | 'update' | 'delete'
  values?: Record<string, unknown>
  filters: Filter[]
  selected?: string
}

type Responder = (call: RecordedCall) => { data: unknown[] | null; error: unknown }

/** Chainable fake die elke aanroep vastlegt en pas bij `await` antwoordt. */
function makeClient(respond: Responder) {
  const calls: RecordedCall[] = []

  function builder(call: RecordedCall) {
    const b: Record<string, unknown> = {}
    const record = (name: string) => (...args: unknown[]) => {
      call.filters.push([name, ...args])
      return b
    }
    for (const name of ['eq', 'in', 'is', 'not', 'or', 'gt', 'lt', 'gte', 'lte', 'order', 'range']) {
      b[name] = record(name)
    }
    b.select = (columns: string) => {
      call.selected = columns
      return b
    }
    b.maybeSingle = () => Promise.resolve(respond(call))
    b.then = (
      resolve: (v: { data: unknown[] | null; error: unknown }) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(respond(call)).then(resolve, reject)
    return b
  }

  const client = {
    from(table: string) {
      return {
        select(columns: string) {
          const call: RecordedCall = { table, op: 'select', filters: [], selected: columns }
          calls.push(call)
          return builder(call)
        },
        update(values: Record<string, unknown>) {
          const call: RecordedCall = { table, op: 'update', values, filters: [] }
          calls.push(call)
          return builder(call)
        },
        delete() {
          const call: RecordedCall = { table, op: 'delete', filters: [] }
          calls.push(call)
          return builder(call)
        },
      }
    },
  }

  return { client: client as unknown as SupabaseClient, calls }
}

function idsOf(call: RecordedCall): string[] {
  const found = call.filters.find(([name, column]) => name === 'in' && column === 'id')
  return (found?.[2] as string[]) ?? []
}

function hasUserScope(call: RecordedCall, userId: string): boolean {
  return call.filters.some(([name, column, value]) => name === 'eq' && column === 'user_id' && value === userId)
}

const row = (over: Partial<BulkCandidateRow> & { id: string }): BulkCandidateRow => ({
  is_split: false,
  transaction_type: null,
  linked_transfer_id: null,
  ...over,
})

describe('readBulkCandidates', () => {
  it('scopet de LEESronde expliciet op user_id — RLS is hier bewust breder', () => {
    const { client, calls } = makeClient(() => ({ data: [], error: null }))
    return readBulkCandidates(client, 'user-1', ['a']).then(() => {
      expect(calls).toHaveLength(1)
      expect(calls[0].op).toBe('select')
      expect(hasUserScope(calls[0], 'user-1')).toBe(true)
    })
  })

  it('batcht op BULK_BATCH_SIZE zodat geen enkele ronde tegen max_rows kan lopen', async () => {
    const ids = Array.from({ length: BULK_BATCH_SIZE * 2 + 7 }, (_, i) => `id-${i}`)
    const { client, calls } = makeClient((call) => ({
      data: idsOf(call).map((id) => ({ id, is_split: false, transaction_type: null, linked_transfer_id: null })),
      error: null,
    }))

    const rows = await readBulkCandidates(client, 'user-1', ids)
    expect(calls).toHaveLength(3)
    expect(idsOf(calls[0])).toHaveLength(BULK_BATCH_SIZE)
    expect(idsOf(calls[2])).toHaveLength(7)
    expect(rows).toHaveLength(ids.length)
  })

  it('laat een gefaalde batch als "niet gevonden" vallen in plaats van hem blind mee te nemen', async () => {
    const { client } = makeClient(() => ({ data: null, error: { message: 'boem' } }))
    expect(await readBulkCandidates(client, 'user-1', ['a', 'b'])).toEqual([])
  })
})

describe('bulkUpdateTransactions', () => {
  it('scopet de SCHRIJFronde op user_id en telt uit .select("id")', async () => {
    // De database geeft er één terug terwijl er drie kandidaten waren: precies
    // het RLS-scenario waarin een naïeve teller succes zou melden.
    const { client, calls } = makeClient(() => ({ data: [{ id: 'a' }], error: null }))
    const result = await bulkUpdateTransactions(client, 'user-1', [
      { ids: ['a', 'b', 'c'], patch: { budget_id: 'x' } },
    ])

    expect(result.touched).toBe(1)
    expect(calls[0].op).toBe('update')
    expect(hasUserScope(calls[0], 'user-1')).toBe(true)
    expect(calls[0].selected).toBe('id')
  })

  it('stempelt updated_at mee', async () => {
    const { client, calls } = makeClient(() => ({ data: [], error: null }))
    await bulkUpdateTransactions(client, 'u', [{ ids: ['a'], patch: { budget_id: null } }])
    expect(calls[0].values).toHaveProperty('updated_at')
  })

  it('sluit splits uit met .not(is_split, is, true) — niet met .eq(false)', async () => {
    // `.eq('is_split', false)` zou stil élke NULL-rij droppen; de kolom is
    // nullable met default false.
    const { client, calls } = makeClient(() => ({ data: [], error: null }))
    await bulkUpdateTransactions(client, 'u', [{ ids: ['a'], patch: {} }], { excludeSplits: true })
    expect(calls[0].filters).toContainEqual(['not', 'is_split', 'is', true])
    expect(calls[0].filters.some(([n, c]) => n === 'eq' && c === 'is_split')).toBe(false)
  })

  it('batcht per groep en laat een gesneuvelde batch de rest niet meeslepen', async () => {
    const ids = Array.from({ length: BULK_BATCH_SIZE + 3 }, (_, i) => `id-${i}`)
    let call = 0
    const { client, calls } = makeClient((c) => {
      call += 1
      if (call === 1) return { data: null, error: { message: 'batch stuk' } }
      return { data: idsOf(c).map((id) => ({ id })), error: null }
    })

    const result = await bulkUpdateTransactions(client, 'u', [{ ids, patch: { budget_id: 'x' } }])
    expect(calls).toHaveLength(2)
    expect(result.failedIds).toHaveLength(BULK_BATCH_SIZE)
    expect(result.touched).toBe(3)
  })

  it('slaat lege groepen over', async () => {
    const { client, calls } = makeClient(() => ({ data: [], error: null }))
    await bulkUpdateTransactions(client, 'u', [{ ids: [], patch: { budget_id: 'x' } }])
    expect(calls).toHaveLength(0)
  })
})

describe('bulkDeleteTransactions', () => {
  it('verwijdert own-row gescoped en telt uit .select("id")', async () => {
    const { client, calls } = makeClient(() => ({ data: [{ id: 'a' }, { id: 'b' }], error: null }))
    const result = await bulkDeleteTransactions(client, 'user-1', ['a', 'b', 'c'])

    expect(calls[0].op).toBe('delete')
    expect(hasUserScope(calls[0], 'user-1')).toBe(true)
    expect(calls[0].selected).toBe('id')
    expect(result.touched).toBe(2)
  })
})

describe('planBulkBudgetUpdate', () => {
  const budgetId = 'budget-1'

  it('meldt onbekende id’s als not_found in plaats van ze te muteren', () => {
    const plan = planBulkBudgetUpdate({
      requestedIds: ['a', 'weg'],
      candidates: [row({ id: 'a' })],
      budgetId,
      targetsEigenRekening: false,
    })
    expect(plan.skipped).toContainEqual({ id: 'weg', reason: 'not_found' })
    expect(plan.groups.flatMap((g) => g.ids)).toEqual(['a'])
  })

  it('sluit splits uit en meldt ze', () => {
    const plan = planBulkBudgetUpdate({
      requestedIds: ['a', 's'],
      candidates: [row({ id: 'a' }), row({ id: 's', is_split: true })],
      budgetId,
      targetsEigenRekening: false,
    })
    expect(plan.skipped).toContainEqual({ id: 's', reason: 'is_split' })
    expect(plan.groups.flatMap((g) => g.ids)).toEqual(['a'])
  })

  it('behandelt is_split = null als "geen split" (nullable kolom, default false)', () => {
    const plan = planBulkBudgetUpdate({
      requestedIds: ['a'],
      candidates: [row({ id: 'a', is_split: null })],
      budgetId,
      targetsEigenRekening: false,
    })
    expect(plan.skipped).toEqual([])
    expect(plan.groups[0].ids).toEqual(['a'])
  })

  it('schrijft het canonieke trio in ÉÉN groep bij Eigen rekening (AC7)', () => {
    const plan = planBulkBudgetUpdate({
      requestedIds: ['a', 'b'],
      candidates: [row({ id: 'a' }), row({ id: 'b', transaction_type: 'DEBIT' })],
      budgetId,
      targetsEigenRekening: true,
    })
    expect(plan.groups).toHaveLength(1)
    expect(plan.groups[0].patch).toEqual({
      budget_id: budgetId,
      category_source: 'transfer',
      transaction_type: 'transfer',
    })
  })

  it('wist de markering UITSLUITEND op rijen die nú een verschuiving zijn (AC8)', () => {
    const plan = planBulkBudgetUpdate({
      requestedIds: ['t1', 't2', 'g1', 'g2'],
      candidates: [
        row({ id: 't1', transaction_type: 'transfer' }),
        row({ id: 't2', transaction_type: 'joint_transfer' }),
        row({ id: 'g1', transaction_type: 'DEBIT' }),
        row({ id: 'g2', transaction_type: null }),
      ],
      budgetId,
      targetsEigenRekening: false,
    })

    const wissers = plan.groups.find((g) => 'transaction_type' in g.patch)!
    const rest = plan.groups.find((g) => !('transaction_type' in g.patch))!

    expect(wissers.patch).toEqual({ budget_id: budgetId, category_source: 'manual', transaction_type: null })
    expect(wissers.ids.sort()).toEqual(['t1', 't2'])
    // Importherkomst blijft intact: geen `transaction_type`-sleutel in de patch,
    // dus de UPDATE raakt de kolom niet aan.
    expect(rest.patch).toEqual({ budget_id: budgetId, category_source: 'manual' })
    expect(rest.ids.sort()).toEqual(['g1', 'g2'])
  })

  it('ondersteunt ontkoppelen (budgetId = null)', () => {
    const plan = planBulkBudgetUpdate({
      requestedIds: ['a'],
      candidates: [row({ id: 'a' })],
      budgetId: null,
      targetsEigenRekening: false,
    })
    expect(plan.groups[0].patch).toEqual({ budget_id: null, category_source: 'manual' })
  })
})

describe('collectLinkedCounterpartIds', () => {
  it('levert de tegenboekingen die zelf niet geselecteerd zijn', () => {
    const ids = collectLinkedCounterpartIds(
      [row({ id: 'a', linked_transfer_id: 'z' }), row({ id: 'b', linked_transfer_id: 'a' })],
      ['a', 'b'],
    )
    expect(ids).toEqual(['z'])
  })

  it('ontdubbelt', () => {
    const ids = collectLinkedCounterpartIds(
      [row({ id: 'a', linked_transfer_id: 'z' }), row({ id: 'b', linked_transfer_id: 'z' })],
      ['a', 'b'],
    )
    expect(ids).toEqual(['z'])
  })
})
