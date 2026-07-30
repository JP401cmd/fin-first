import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  loadExistingDedupKeys,
  loadExistingImportHashes,
  loadHouseholdSharedDedupKeys,
  EXISTING_HASH_PAGE_SIZE,
} from './existing-hashes'

/**
 * De dedup-leesronde van de bank-sync. Twee dingen worden hier vastgelegd:
 *
 * 1. De query spiegelt de unieke index
 *    `(user_id, account_id, import_hash, coalesce(bank_seq,''))` — dus MET
 *    `account_id`. Gebruiker-breed lezen was strenger dan de database en sloeg
 *    échte boekingen op een tweede rekening stil over.
 * 2. Er wordt gepagineerd, niet met `.in('import_hash', hashes)`. Dat laatste
 *    faalt stil bij grote batches (de import-pagina heeft het al afgeschaft) en
 *    dat gaat urgenter worden nu de bank ~19 maanden historie kan leveren.
 */

type Filter = { op: string; args: unknown[] }

function makeSupabase(pages: Array<{ data: unknown[] | null; error?: { message: string } }>) {
  const filters: Filter[] = []
  const ranges: Array<[number, number]> = []
  let pageIndex = 0

  const builder: Record<string, unknown> = {}
  const chain = (op: string) => (...args: unknown[]) => {
    filters.push({ op, args })
    if (op === 'range') ranges.push([args[0] as number, args[1] as number])
    return builder
  }
  for (const op of ['select', 'eq', 'neq', 'not', 'gte', 'lte', 'order']) builder[op] = chain(op)
  builder.range = (...args: unknown[]) => {
    filters.push({ op: 'range', args })
    ranges.push([args[0] as number, args[1] as number])
    const page = pages[pageIndex++] ?? { data: [] }
    return Promise.resolve(page)
  }

  const supabase = {
    from: vi.fn(() => builder),
  } as unknown as SupabaseClient

  return { supabase, filters, ranges }
}

const SCOPE = { userId: 'user-1', accountId: 'acct-1', minDate: '2026-01-01', maxDate: '2026-07-29' }

describe('loadExistingImportHashes', () => {
  it('scopet op gebruiker ÉN rekening, binnen het datumvenster van de batch', async () => {
    const { supabase, filters } = makeSupabase([{ data: [{ import_hash: 'h1' }] }])

    const result = await loadExistingImportHashes(supabase, SCOPE)

    expect(result).toEqual(new Set(['h1']))
    const eqs = filters.filter((f) => f.op === 'eq').map((f) => f.args)
    expect(eqs).toEqual([
      ['user_id', 'user-1'],
      ['account_id', 'acct-1'],
    ])
    expect(filters.filter((f) => f.op === 'gte').map((f) => f.args)).toEqual([['date', '2026-01-01']])
    expect(filters.filter((f) => f.op === 'lte').map((f) => f.args)).toEqual([['date', '2026-07-29']])
  })

  it('pagineert door tot een niet-volle pagina en voegt alle hashes samen', async () => {
    const fullPage = Array.from({ length: EXISTING_HASH_PAGE_SIZE }, (_, i) => ({ import_hash: `h${i}` }))
    const { supabase, ranges } = makeSupabase([
      { data: fullPage },
      { data: [{ import_hash: 'laatste' }] },
    ])

    const result = await loadExistingImportHashes(supabase, SCOPE)

    expect(result.size).toBe(EXISTING_HASH_PAGE_SIZE + 1)
    expect(result.has('h0')).toBe(true)
    expect(result.has('laatste')).toBe(true)
    expect(ranges).toEqual([
      [0, EXISTING_HASH_PAGE_SIZE - 1],
      [EXISTING_HASH_PAGE_SIZE, 2 * EXISTING_HASH_PAGE_SIZE - 1],
    ])
  })

  it('gooit bij een queryfout in plaats van "niets bestaat al" te concluderen', async () => {
    const { supabase } = makeSupabase([{ data: null, error: { message: 'relation "x" does not exist' } }])
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    // De melding is generiek: de route schrijft `err.message` naar
    // `bank_sync_log.error_message`, en die tabel zit in de AVG-data-export.
    // De rauwe driver-melding blijft in de serverlog.
    await expect(loadExistingImportHashes(supabase, SCOPE)).rejects.toThrow('Bestaande import-hashes ophalen mislukt')
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

/**
 * De laag-1-leesronde van het IMPORTPAD (fase 3/B7). Verschil met hierboven: het
 * importpad heeft wél volgnummers, dus de sleutel is de VOLLEDIGE indexsleutel
 * `import_hash|coalesce(bank_seq,'')`. Hash-only vergelijken zou hier strenger
 * zijn dan de database en twee échte boekingen samensmelten (R6).
 */
describe('loadExistingDedupKeys', () => {
  it('bouwt de volledige indexsleutel, inclusief bank_seq', async () => {
    const { supabase, filters } = makeSupabase([{
      data: [
        { import_hash: 'h1', bank_seq: '001' },
        { import_hash: 'h1', bank_seq: '002' },
        { import_hash: 'h2', bank_seq: null },
      ],
    }])

    const result = await loadExistingDedupKeys(supabase, SCOPE)

    // Twee rijen met dezelfde hash maar een ander Volgnr zijn TWEE sleutels.
    expect(result).toEqual(new Set(['h1|001', 'h1|002', 'h2|']))
    expect(filters.filter((f) => f.op === 'select').map((f) => f.args)).toEqual([['import_hash, bank_seq']])
  })

  it('scopet op gebruiker ÉN rekening, binnen het datumvenster van de batch', async () => {
    const { supabase, filters } = makeSupabase([{ data: [] }])

    await loadExistingDedupKeys(supabase, SCOPE)

    expect(filters.filter((f) => f.op === 'eq').map((f) => f.args)).toEqual([
      ['user_id', 'user-1'],
      ['account_id', 'acct-1'],
    ])
    expect(filters.filter((f) => f.op === 'gte').map((f) => f.args)).toEqual([['date', '2026-01-01']])
    expect(filters.filter((f) => f.op === 'lte').map((f) => f.args)).toEqual([['date', '2026-07-29']])
  })

  it('pagineert door tot een niet-volle pagina', async () => {
    const fullPage = Array.from({ length: EXISTING_HASH_PAGE_SIZE }, (_, i) => ({ import_hash: `h${i}`, bank_seq: null }))
    const { supabase, ranges } = makeSupabase([
      { data: fullPage },
      { data: [{ import_hash: 'laatste', bank_seq: null }] },
    ])

    const result = await loadExistingDedupKeys(supabase, SCOPE)

    expect(result.size).toBe(EXISTING_HASH_PAGE_SIZE + 1)
    expect(result.has('laatste|')).toBe(true)
    expect(ranges).toHaveLength(2)
  })

  it('gooit bij een queryfout in plaats van "niets bestaat al" te concluderen', async () => {
    const { supabase } = makeSupabase([{ data: null, error: { message: 'permission denied' } }])
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(loadExistingDedupKeys(supabase, SCOPE))
      .rejects.toThrow('Bestaande transacties voor duplicaatcontrole ophalen mislukt')
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})

/**
 * De huishoud-brede laag-1-leesronde: dezelfde indexsleutel, maar dan van de
 * PARTNER op een gedeelde rekening.
 *
 * Waarom deze loader bestaat: op een `ownership='shared'`-rekening mogen beide
 * partners importeren, en tot deze laag ving niets de tweede reeks af — niet de
 * `.eq('user_id')` van `loadExistingDedupKeys` (die ziet partnerrijen nooit) en
 * niet de unieke index (die droeg `user_id` in de sleutel). Gevolg was een
 * volledige dubbele transactiereeks in één gedeeld grootboek.
 *
 * De twee filters hieronder zijn samen de privacy-control en worden daarom
 * allebei apart vastgelegd: `.eq('ownership','shared')` is de tweede gordel naast
 * RLS, `.neq('user_id', …)` houdt de set zuiver op partnerrijen. Sneuvelt één van
 * de twee asserties, dan is dat geen test-detail maar een privacy-regressie.
 */
describe('loadHouseholdSharedDedupKeys', () => {
  it('leest ALLEEN gedeelde partnerrijen: .neq op user_id én .eq op ownership', async () => {
    const { supabase, filters } = makeSupabase([{ data: [] }])

    await loadHouseholdSharedDedupKeys(supabase, SCOPE)

    // `.neq('user_id')` — eigen rijen zijn hier niet interessant, die dekt laag 1
    // al af, en zo blijft de teller apart telbaar.
    expect(filters.filter((f) => f.op === 'neq').map((f) => f.args)).toEqual([['user_id', 'user-1']])
    // `.eq('ownership','shared')` — de expliciete tweede gordel naast RLS: een
    // toekomstige policy-verbreding mag hier nooit stil persoonlijke
    // partnerrijen binnenlaten.
    expect(filters.filter((f) => f.op === 'eq').map((f) => f.args)).toEqual([
      ['account_id', 'acct-1'],
      ['ownership', 'shared'],
    ])
    // Rekening + datumvenster blijven exact als bij de andere loaders.
    expect(filters.filter((f) => f.op === 'gte').map((f) => f.args)).toEqual([['date', '2026-01-01']])
    expect(filters.filter((f) => f.op === 'lte').map((f) => f.args)).toEqual([['date', '2026-07-29']])
  })

  it('bouwt de volledige indexsleutel, inclusief bank_seq', async () => {
    const { supabase, filters } = makeSupabase([{
      data: [
        { import_hash: 'h1', bank_seq: '001' },
        { import_hash: 'h2', bank_seq: null },
      ],
    }])

    const result = await loadHouseholdSharedDedupKeys(supabase, SCOPE)

    expect(result).toEqual(new Set(['h1|001', 'h2|']))
    expect(filters.filter((f) => f.op === 'select').map((f) => f.args)).toEqual([['import_hash, bank_seq']])
  })

  it('pagineert door tot een niet-volle pagina', async () => {
    const fullPage = Array.from({ length: EXISTING_HASH_PAGE_SIZE }, (_, i) => ({ import_hash: `h${i}`, bank_seq: null }))
    const { supabase, ranges } = makeSupabase([
      { data: fullPage },
      { data: [{ import_hash: 'laatste', bank_seq: null }] },
    ])

    const result = await loadHouseholdSharedDedupKeys(supabase, SCOPE)

    expect(result.size).toBe(EXISTING_HASH_PAGE_SIZE + 1)
    expect(result.has('laatste|')).toBe(true)
    expect(ranges).toEqual([
      [0, EXISTING_HASH_PAGE_SIZE - 1],
      [EXISTING_HASH_PAGE_SIZE, 2 * EXISTING_HASH_PAGE_SIZE - 1],
    ])
  })

  it('gooit bij een queryfout in plaats van "niets bestaat al" te concluderen', async () => {
    const { supabase } = makeSupabase([{ data: null, error: { message: 'permission denied' } }])
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Stil leeg teruggeven zou de partnerrijen onzichtbaar maken en precies de
    // dubbele reeks opleveren die deze loader hoort te voorkomen.
    await expect(loadHouseholdSharedDedupKeys(supabase, SCOPE))
      .rejects.toThrow('Bestaande transacties voor duplicaatcontrole ophalen mislukt')
    expect(consoleError).toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
