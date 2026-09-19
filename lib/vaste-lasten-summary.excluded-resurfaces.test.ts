/**
 * REGRESSIE — B-054 (2026-09-18-testbug-3e1dd1, Notion 3dff9e8d-568a-814e-a48b-fa07c725aea4).
 *
 * Norm: een post die de gebruiker via "Niet opnemen" heeft uitgesloten
 * (`category_override: 'excluded'` + `is_active: false` in
 * `recurring_transactions`, zie app/api/recurring/route.ts) verschijnt NOOIT
 * terug als gedetecteerde suggestie op /overzicht/budget/vaste-lasten.
 *
 * Wat deze test bewaakt: `loadFingerprintRound` in lib/vaste-lasten-summary.ts
 * haalt `existingRecurrings` op met `.or(REVIEWED_RECURRING_FILTER)` —
 * bevestigd ÓF uitgesloten. Die rijenset voedt `detectRecurringTransactions`'
 * `existingNormSet` (lib/recurring-detection.ts), het enige mechanisme dat een
 * patroon als "al beoordeeld" markeert. Zou de query terugvallen op een kale
 * `.eq('is_active', true)`, dan is de uitsluiting voor de detector onzichtbaar
 * en komt het patroon bij elke scan als NIEUW terug — de oorspronkelijke
 * melding. Dezelfde filter staat in app/api/detect-recurring,
 * app/api/subscriptions/detect-ai en app/api/subscriptions/analyse-ai (Fins
 * route); deze test dekt de pagina-loader, de routes delen de constante.
 *
 * Waarom de realistische mock: `lib/vaste-lasten-summary.test.ts` gebruikt een
 * minimale mock waarin `.eq()`/`.or()` no-ops zijn, dus daar wordt de filter
 * nooit echt toegepast. `test/helpers/fake-supabase.ts` (dezelfde als
 * `vaste-lasten-summary.keyset.test.ts`) past `.eq()` en de herkende
 * `.or()`-vormen wél toe.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { makeSupabase, type Row } from '@/test/helpers/fake-supabase'
import { __resetVasteLastenCache } from '@/lib/vaste-lasten-cache'
import { loadVasteLastenSummary } from './vaste-lasten-summary'

// Vast "nu" zodat het Ziggo-patroon binnen de STAARTTERMIJN (monthly: 50 dagen,
// zie lib/recurring-detection.ts STALE_AFTER_DAYS) als LOPEND geldt.
const NU = new Date(2026, 8, 15, 12, 0, 0) // 15 sep 2026

function maandDatum(maandenTerug: number, dag: number): string {
  const d = new Date(2026, 8 - maandenTerug, dag)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function tx(id: string, date: string): Row {
  return {
    id,
    date,
    amount: -55,
    description: 'Ziggo',
    counterparty_name: 'Ziggo',
    is_income: false,
    budget_id: null,
    transaction_type: null,
  }
}

beforeEach(() => {
  __resetVasteLastenCache()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NU)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('B-054 — een geëxcludeerde vaste last komt terug als nieuwe suggestie', () => {
  it('mag NIET opnieuw als gedetecteerde suggestie verschijnen na "Niet opnemen"', async () => {
    // Vier maandelijkse Ziggo-afschrijvingen — genoeg voor een 'medium'-patroon
    // (MIN_OCCURRENCES.monthly = 3, amountCV = 0, freqConfidence 'high').
    const transactions = [
      tx('t1', maandDatum(3, 5)),
      tx('t2', maandDatum(2, 5)),
      tx('t3', maandDatum(1, 5)),
      tx('t4', maandDatum(0, 5)),
    ]

    // De gebruiker koos "Niet opnemen" (RecurringClassifySheet) voor Ziggo:
    // dat schrijft precies dit weg (app/api/recurring/route.ts).
    const recurringTransactions: Row[] = [
      {
        id: 'excl-1',
        counterparty_name: 'Ziggo',
        name: 'Ziggo',
        amount: -55,
        frequency: 'monthly',
        category_override: 'excluded',
        is_active: false,
        end_date: null,
      },
    ]

    const fake = makeSupabase({
      profile: { id: 'user-parity' },
      transactions,
      recurringTransactions,
    })

    const summary = await loadVasteLastenSummary(fake.client)

    const terug = [...summary.subscriptions, ...summary.vasteKosten].find(
      (i) => i.name.toLowerCase().includes('ziggo'),
    )

    // VERWACHT: geen enkele Ziggo-post in het overzicht — de gebruiker heeft
    // 'm expliciet uitgesloten.
    expect(terug).toBeUndefined()
  })
})
