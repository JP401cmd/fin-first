import { describe, it, expect, vi } from 'vitest'
import { storeHistoricalPrices, type HistoricalPrice } from './historical-prices'

/**
 * Deze suite pint het IDEMPOTENTIE-CONTRACT vast waar de backfill-route
 * (`app/api/holdings/backfill-history/route.ts`) op leunt: dezelfde koersreeks
 * twee keer aanbieden mag niets veranderen.
 *
 * Twee dingen moeten daarvoor kloppen en beide zijn stil te breken:
 * 1. de `onConflict` moet EXACT de kolommen van de unieke index noemen
 *    (`UNIQUE(holding_id, date)` — migratie 20260502000003). Wijkt hij af, dan
 *    geeft Postgres 42P10 of — erger — slaat de dedup over en groeit de tabel.
 * 2. de opgebouwde rijen moeten deterministisch zijn: geen tijdstempel of
 *    volgnummer dat bij een tweede run een andere rij oplevert.
 */

type UpsertCall = { rows: Record<string, unknown>[]; options: { onConflict?: string } }

function makeFakeSupabase() {
  const calls: UpsertCall[] = []
  const tables: string[] = []
  const client = {
    from(table: string) {
      tables.push(table)
      return {
        upsert(rows: Record<string, unknown>[], options: { onConflict?: string }) {
          calls.push({ rows, options })
          return Promise.resolve({ error: null })
        },
      }
    },
  }
  return { client, calls, tables }
}

const PRICES: HistoricalPrice[] = [
  { date: '2024-01-02', close: 10.5, open: 10.1, high: 10.9, low: 10.0, volume: 1000 },
  { date: '2024-01-03', close: 11.25 },
]

describe('storeHistoricalPrices — idempotentie-contract', () => {
  it('upsert op investment_holding_prices met onConflict exact "holding_id,date"', async () => {
    const { client, calls, tables } = makeFakeSupabase()

    const written = await storeHistoricalPrices(client, 'holding-1', PRICES)

    expect(written).toBe(2)
    expect(tables).toEqual(['investment_holding_prices'])
    expect(calls).toHaveLength(1)
    // Exact de kolommen van UNIQUE(holding_id, date) — niets meer, niets minder.
    expect(calls[0].options.onConflict).toBe('holding_id,date')
  })

  it('tweede run levert byte-voor-byte dezelfde rijen op (niets loopt op)', async () => {
    const first = makeFakeSupabase()
    const second = makeFakeSupabase()

    await storeHistoricalPrices(first.client, 'holding-1', PRICES)
    await storeHistoricalPrices(second.client, 'holding-1', PRICES)

    expect(second.calls[0].rows).toEqual(first.calls[0].rows)
    // Geen `created_at`/volgnummer/`Date.now()` in de payload: de rij wordt
    // volledig door (holding, dag, koers) bepaald.
    expect(first.calls[0].rows[0]).toEqual({
      holding_id: 'holding-1',
      date: '2024-01-02',
      close_price: 10.5,
      currency: 'EUR',
      source: 'yahoo_finance',
    })
  })

  it('chunken verandert de sleutel niet — elke chunk draagt dezelfde onConflict', async () => {
    // De route schrijft een `max`-reeks in chunks van 1000 weg. Elke chunk is een
    // eigen upsert; als er één zonder onConflict door zou glippen, ontstaat er
    // stille duplicatie bij de tweede run.
    const { client, calls } = makeFakeSupabase()

    await storeHistoricalPrices(client, 'holding-1', PRICES.slice(0, 1))
    await storeHistoricalPrices(client, 'holding-1', PRICES.slice(1))

    expect(calls).toHaveLength(2)
    for (const call of calls) {
      expect(call.options.onConflict).toBe('holding_id,date')
    }
  })

  it('lege reeks schrijft niets (Yahoo-miss mag geen upsert veroorzaken)', async () => {
    const { client, calls } = makeFakeSupabase()

    const written = await storeHistoricalPrices(client, 'holding-1', [])

    expect(written).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it('een DB-fout telt als 0 geschreven rijen, niet als succes', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = {
      from: () => ({
        upsert: () => Promise.resolve({ error: { message: 'boom' } }),
      }),
    }

    const written = await storeHistoricalPrices(client, 'holding-1', PRICES)

    expect(written).toBe(0)
    errorSpy.mockRestore()
  })
})
