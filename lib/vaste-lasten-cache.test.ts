/**
 * VINGERAFDRUK-CACHE OP DE VASTE-LASTENDETECTIE (T3.3).
 *
 * Drie lagen, want een cache die alleen "er kwam een waarde terug" aantoont
 * bewijst niets — dat doet een cache die nooit raakt ook:
 *
 *  A. de cache zelf: hit/miss, TTL, vingerafdruk-mismatch, cross-account, en dat
 *     er per gebruiker hooguit ÉÉN entry blijft staan;
 *  B. de samenstelling van de vingerafdruk: wat hem moet laten kantelen (een
 *     rij erbij, een bewerkte vaste last, een verschoven venster) en wat niet
 *     (de volgorde waarin PostgREST de recurring-rijen aanlevert);
 *  C. het loaderpad, met TELLERS: bij een treffer draait
 *     `detectRecurringTransactions` NIET en komen er geen paginatie-queries bij;
 *     bij een gewijzigde vingerafdruk draait hij wél weer.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/recurring-detection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/recurring-detection')>()
  return { ...actual, detectRecurringTransactions: vi.fn(actual.detectRecurringTransactions) }
})

import type { SupabaseClient } from '@supabase/supabase-js'
import { detectRecurringTransactions } from '@/lib/recurring-detection'
import {
  makeSupabase,
  withFailingTxFetches,
  type FakeSupabase,
  type Row,
} from '@/test/helpers/fake-supabase'
import {
  VASTE_LASTEN_CACHE_TTL_MS,
  VASTE_LASTEN_CACHE_MAX_ENTRIES,
  vasteLastenFingerprint,
  readVasteLastenCache,
  writeVasteLastenCache,
  __resetVasteLastenCache,
  type VasteLastenFingerprintInput,
} from './vaste-lasten-cache'
import { loadVasteLastenSummary, type VasteLastenSummary } from './vaste-lasten-summary'

const detectSpy = vi.mocked(detectRecurringTransactions)

/** Vast "nu", zodat het 12-maandsvenster (ondergrens 2025-07-01) niet meebeweegt. */
const NU = new Date(2026, 5, 15, 12, 0, 0)

const SAMENVATTING: VasteLastenSummary = {
  subscriptions: [],
  vasteKosten: [],
  totalMonthlySubscriptions: 0,
  totalMonthlyVasteKosten: 0,
  totalMonthly: 12,
  count: 1,
}

const BASIS_INPUT: VasteLastenFingerprintInput = {
  windowStart: '2025-07-01',
  txCount: 240,
  txTransferCount: 12,
  txMaxDate: '2026-06-14',
  txMaxCreatedAt: '2026-06-14T22:00:00Z',
  txMaxUpdatedAt: '2026-06-14T22:00:00Z',
  recurring: [
    {
      id: 'r-1',
      counterparty_name: 'Verhuurder',
      amount: -1200,
      name: 'Huur',
      frequency: 'monthly',
      category_override: 'vaste_kosten',
      end_date: null,
    },
    {
      id: 'r-2',
      counterparty_name: 'Streamer',
      amount: -12,
      name: 'Streaming',
      frequency: 'monthly',
      category_override: 'subscription',
      end_date: null,
    },
  ],
}

beforeEach(() => {
  __resetVasteLastenCache()
  detectSpy.mockClear()
})

describe('A — de cache zelf', () => {
  const FP = 'vingerafdruk-1'

  it('een lege cache is altijd een misser', () => {
    expect(readVasteLastenCache('u1', FP)).toEqual({ hit: false, summary: null })
  })

  it('dezelfde gebruiker + dezelfde vingerafdruk levert de opgeslagen samenvatting', () => {
    writeVasteLastenCache('u1', FP, SAMENVATTING)
    const gelezen = readVasteLastenCache('u1', FP)
    expect(gelezen.hit).toBe(true)
    expect(gelezen.summary).toEqual(SAMENVATTING)
  })

  it('een andere vingerafdruk is een misser — óók binnen de TTL', () => {
    writeVasteLastenCache('u1', FP, SAMENVATTING)
    expect(readVasteLastenCache('u1', 'vingerafdruk-2').hit).toBe(false)
  })

  it('na de TTL is de entry weg, ook bij dezelfde vingerafdruk', () => {
    const t0 = 1_000_000
    writeVasteLastenCache('u1', FP, SAMENVATTING, t0)
    expect(readVasteLastenCache('u1', FP, t0 + VASTE_LASTEN_CACHE_TTL_MS - 1).hit).toBe(true)
    expect(readVasteLastenCache('u1', FP, t0 + VASTE_LASTEN_CACHE_TTL_MS).hit).toBe(false)
  })

  it('een andere gebruiker leest nooit mee, ook niet op dezelfde vingerafdruk', () => {
    writeVasteLastenCache('u1', FP, SAMENVATTING)
    expect(readVasteLastenCache('u2', FP).hit).toBe(false)
  })

  it('houdt per gebruiker hooguit één entry: een nieuwe schrijfactie vervangt de vorige', () => {
    writeVasteLastenCache('u1', 'fp-oud', SAMENVATTING)
    writeVasteLastenCache('u1', 'fp-nieuw', SAMENVATTING)
    // Zou de vingerafdruk in de Map-sleutel staan, dan bleef 'fp-oud' tot de TTL
    // staan en zou deze lezing een treffer zijn.
    expect(readVasteLastenCache('u1', 'fp-oud').hit).toBe(false)
    expect(readVasteLastenCache('u1', 'fp-nieuw').hit).toBe(true)
  })

  it('begrenst het aantal entries: bij een volle cache sneuvelt de eerstvervallende', () => {
    const t0 = 1_000_000
    for (let i = 0; i < VASTE_LASTEN_CACHE_MAX_ENTRIES; i++) {
      // Oplopende schrijftijd ⇒ oplopende vervaltijd; 'u0' vervalt als eerste.
      writeVasteLastenCache(`u${i}`, FP, SAMENVATTING, t0 + i)
    }
    expect(readVasteLastenCache('u0', FP, t0).hit).toBe(true)

    writeVasteLastenCache('nieuw', FP, SAMENVATTING, t0 + VASTE_LASTEN_CACHE_MAX_ENTRIES)

    // Zonder begrenzing blijft een entry van een gebruiker die nooit terugkomt
    // tot in het oneindige staan — de read ruimt alleen op wat híj tegenkomt.
    expect(readVasteLastenCache('u0', FP, t0).hit).toBe(false)
    expect(readVasteLastenCache('u1', FP, t0).hit).toBe(true)
    expect(readVasteLastenCache('nieuw', FP, t0).hit).toBe(true)
  })
})

describe('B — waar de vingerafdruk op reageert', () => {
  const BASIS = vasteLastenFingerprint(BASIS_INPUT)

  it('is stabiel bij identieke invoer', () => {
    expect(vasteLastenFingerprint(BASIS_INPUT)).toBe(BASIS)
  })

  it('kantelt bij een transactie erbij of eraf', () => {
    expect(vasteLastenFingerprint({ ...BASIS_INPUT, txCount: 241 })).not.toBe(BASIS)
  })

  it('kantelt bij een nieuwere transactiedatum en bij een verse insert', () => {
    expect(vasteLastenFingerprint({ ...BASIS_INPUT, txMaxDate: '2026-06-15' })).not.toBe(BASIS)
    expect(
      vasteLastenFingerprint({ ...BASIS_INPUT, txMaxCreatedAt: '2026-06-15T06:00:00Z' }),
    ).not.toBe(BASIS)
  })

  it('kantelt bij een bewerkte transactierij (updated_at)', () => {
    expect(
      vasteLastenFingerprint({ ...BASIS_INPUT, txMaxUpdatedAt: '2026-06-15T06:00:00Z' }),
    ).not.toBe(BASIS)
  })

  it('kantelt bij een vaste last op "excluded" — het geval dat alleen tellen mist', () => {
    // Aantal actieve recurrings ONGEWIJZIGD (2), alleen de markering verandert.
    const recurring = BASIS_INPUT.recurring.map((r) =>
      r.id === 'r-2' ? { ...r, category_override: 'excluded' } : r,
    )
    expect(recurring).toHaveLength(BASIS_INPUT.recurring.length)
    expect(vasteLastenFingerprint({ ...BASIS_INPUT, recurring })).not.toBe(BASIS)
  })

  it('kantelt bij een hernoemde of anders geprijsde vaste last', () => {
    const hernoemd = BASIS_INPUT.recurring.map((r) => (r.id === 'r-1' ? { ...r, name: 'Huur nieuw' } : r))
    const anderBedrag = BASIS_INPUT.recurring.map((r) => (r.id === 'r-1' ? { ...r, amount: -1250 } : r))
    expect(vasteLastenFingerprint({ ...BASIS_INPUT, recurring: hernoemd })).not.toBe(BASIS)
    expect(vasteLastenFingerprint({ ...BASIS_INPUT, recurring: anderBedrag })).not.toBe(BASIS)
  })

  it('kantelt bij een verschoven venstergrens (maandwissel)', () => {
    expect(vasteLastenFingerprint({ ...BASIS_INPUT, windowStart: '2025-08-01' })).not.toBe(BASIS)
  })

  it('kantelt als een boeking als overboeking wordt gemarkeerd', () => {
    // Het TOTALE aantal rijen blijft gelijk — alleen de transfer-telling schuift
    // op. De twee paden die dit doen (own-accounts/reclassify,
    // transfer-confirm-sheet) schrijven geen `updated_at` mee, dus zonder deze
    // component ziet de vingerafdruk er niets van.
    const na = { ...BASIS_INPUT, txTransferCount: BASIS_INPUT.txTransferCount! + 1 }
    expect(na.txCount).toBe(BASIS_INPUT.txCount)
    expect(na.txMaxUpdatedAt).toBe(BASIS_INPUT.txMaxUpdatedAt)
    expect(vasteLastenFingerprint(na)).not.toBe(BASIS)
  })

  it('kantelt NIET door de volgorde waarin de recurring-rijen binnenkomen', () => {
    // PostgREST geeft zonder `order` geen volgordegarantie; een cache die daarop
    // reageert zou willekeurig missen.
    const omgekeerd = [...BASIS_INPUT.recurring].reverse()
    expect(omgekeerd[0].id).not.toBe(BASIS_INPUT.recurring[0].id)
    expect(vasteLastenFingerprint({ ...BASIS_INPUT, recurring: omgekeerd })).toBe(BASIS)
  })
})

/** `maandGrens(n)` = de n-de maand na 2025-08, als `YYYY-MM` binnen het venster. */
function maandGrens(n: number): string {
  const d = new Date(2025, 7 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Twaalf maandelijkse afschrijvingen: genoeg voor twee detecteerbare patronen. */
function transacties(extra: Row[] = []): Row[] {
  const rows: Row[] = []
  for (let m = 0; m < 6; m++) {
    rows.push({
      id: `tx-huur-${m}`,
      date: `${maandGrens(m)}-01`,
      amount: -800,
      description: 'huurtermijn',
      counterparty_name: 'WOONSTICHTING',
      is_income: false,
      budget_id: null,
      transaction_type: 'debit',
    })
    rows.push({
      id: `tx-polis-${m}`,
      date: `${maandGrens(m)}-05`,
      amount: -25,
      description: 'premie',
      counterparty_name: 'ZORGVERZEKERAAR',
      is_income: false,
      budget_id: null,
      transaction_type: 'debit',
    })
  }
  return [...rows, ...extra]
}

const BEVESTIGD: Row = {
  id: 'r-abo',
  counterparty_name: 'Streamer',
  amount: -12,
  name: 'Streaming',
  frequency: 'monthly',
  category_override: 'subscription',
  end_date: null,
  is_active: true,
}

function fake(rows: Row[], recurring: Row[] = [BEVESTIGD]): FakeSupabase {
  return makeSupabase({
    profile: { id: 'u1' },
    transactions: rows,
    budgets: [],
    recurringTransactions: recurring,
  })
}

describe('C — op het loaderpad', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NU)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('tweede aanroep met ongewijzigde gegevens: geen detectie, geen ophaal, zelfde uitkomst', async () => {
    const db = fake(transacties())

    const eerste = await loadVasteLastenSummary(db.client)
    const naEerste = db.tableQueriesFor('transactions')
    const tweede = await loadVasteLastenSummary(db.client)

    expect(detectSpy).toHaveBeenCalledTimes(1)
    // De tweede ronde kost precies de vijf aggregaten van de vingerafdruk (twee
    // tellingen + drie maxima) — geen enkele paginatie-query erbij.
    expect(db.tableQueriesFor('transactions') - naEerste).toBe(5)
    expect(db.tableQueriesFor('budgets')).toBe(1)
    expect(tweede).toEqual(eerste)
    expect(tweede.totalMonthly).toBeGreaterThan(0)
  })

  it('een transactie erbij laat het dure pad wél opnieuw draaien', async () => {
    const eersteDb = fake(transacties())
    await loadVasteLastenSummary(eersteDb.client)
    expect(detectSpy).toHaveBeenCalledTimes(1)

    const tweedeDb = fake(
      transacties([
        {
          id: 'tx-nieuw',
          date: `${maandGrens(6)}-01`,
          amount: -800,
          description: 'huurtermijn',
          counterparty_name: 'WOONSTICHTING',
          is_income: false,
          budget_id: null,
          transaction_type: 'debit',
        },
      ]),
    )
    await loadVasteLastenSummary(tweedeDb.client)

    expect(detectSpy).toHaveBeenCalledTimes(2)
  })

  it('een vaste last op "excluded" zetten verdwijnt meteen uit het totaal', async () => {
    const voor = fake(transacties())
    const eerste = await loadVasteLastenSummary(voor.client)
    expect(eerste.totalMonthlySubscriptions).toBe(12)

    // Zelfde AANTAL actieve recurrings, alleen de markering wijzigt — precies wat
    // een vingerafdruk op `count(*)` alleen niet zou zien.
    const na = fake(transacties(), [{ ...BEVESTIGD, category_override: 'excluded' }])
    const tweede = await loadVasteLastenSummary(na.client)

    expect(detectSpy).toHaveBeenCalledTimes(2)
    expect(tweede.totalMonthlySubscriptions).toBe(0)
  })

  it('een boeking als overboeking markeren laat het dure pad opnieuw draaien', async () => {
    const voor = fake(transacties())
    await loadVasteLastenSummary(voor.client)
    expect(detectSpy).toHaveBeenCalledTimes(1)

    // Exact dezelfde rijenset, één rij nu een overboeking. Het aantal rijen, de
    // datums en `updated_at` bewegen NIET mee — alleen de transfer-telling. Deze
    // getuige loopt end-to-end en dekt daarmee óók de bedrading: een
    // vingerafdruk die het veld wel kent maar de query niet doet, valt hier om.
    const rijen = transacties().map((r) =>
      r.id === 'tx-huur-0' ? { ...r, transaction_type: 'transfer' } : r,
    )
    expect(rijen).toHaveLength(transacties().length)
    const na = fake(rijen)
    await loadVasteLastenSummary(na.client)

    expect(detectSpy).toHaveBeenCalledTimes(2)
  })

  it('een mislukte ophaal wordt NIET onthouden — de detectie komt terug zodra het weer lukt', async () => {
    const db = fake(transacties())
    // Alleen de EERSTE ophaalpoging faalt; de vingerafdrukronde slaagt beide
    // keren, dus zonder de completeness-guard zou de afgekapte uitkomst onder een
    // geldige vingerafdruk worden vastgepind.
    const client = withFailingTxFetches(db, [1])

    const eerste = await loadVasteLastenSummary(client)
    // Nul rijen ⇒ de `< 3`-tak: alleen de bevestigde vaste last, geen detectie.
    expect(detectSpy).toHaveBeenCalledTimes(0)
    expect(eerste.count).toBe(1)

    const tweede = await loadVasteLastenSummary(client)

    expect(detectSpy).toHaveBeenCalledTimes(1)
    expect(tweede.count).toBeGreaterThan(eerste.count)
    expect(tweede.totalMonthly).toBeGreaterThan(eerste.totalMonthly)
  })

  it('valt de vingerafdrukronde om, dan wordt de cache overgeslagen', async () => {
    const db = fake(transacties())
    const client = metFoutOp(db.client, 'recurring_transactions')

    await loadVasteLastenSummary(client)
    await loadVasteLastenSummary(client)

    // Geen vingerafdruk = geen entry om op te treffen: het dure pad draait elke
    // keer opnieuw, in plaats van te blijven hangen op een halve meting.
    expect(detectSpy).toHaveBeenCalledTimes(2)
  })
})

/**
 * Wikkelt een nep-client zodat één tabel een PostgREST-fout teruggeeft. De
 * gedeelde mock kent bewust geen foutpaden — dit is lokaal aan deze ene test.
 */
function metFoutOp(client: SupabaseClient, tabel: string): SupabaseClient {
  const echt = client.from.bind(client)
  const fout = { data: null, error: { message: 'boom' } }
  return {
    ...client,
    auth: client.auth,
    from: (naam: string) => {
      if (naam !== tabel) return echt(naam)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = new Proxy(
        {
          then: (res: (v: unknown) => unknown) => Promise.resolve(fout).then(res),
        },
        {
          get: (target, prop) =>
            prop in target ? (target as Record<string | symbol, unknown>)[prop] : () => b,
        },
      )
      return b
    },
  } as unknown as SupabaseClient
}
