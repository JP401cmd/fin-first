/**
 * KEYSET-PAGINATIE OP DE VASTE-LASTENDETECTIE (T3.2).
 *
 * `fetchAllRecurringTx` haalde het 12-maandsvenster met OFFSET-paginatie op
 * (`.range(from, from + 999)`); dat is nu een cursor op (date, id). De wissel mag
 * alleen als de detectie exact dezelfde rijen in exact dezelfde volgorde krijgt:
 *
 *  • dezelfde VERZAMELING — een keyset die de grens verkeerd legt slaat rijen
 *    over of levert ze dubbel, en dat gebeurt precies daar waar veel rijen
 *    dezelfde datum delen. De fixture legt de paginagrens daarom bewust MIDDEN
 *    in zo'n reeks (bewaakt door een eigen assertie, zodat de fixture niet stil
 *    kan wegdrijven van wat hij hoort uit te lokken).
 *  • dezelfde VOLGORDE — `detectRecurringTransactions` sorteert per groep zelf op
 *    datum, maar breekt gelijkspel op de volgorde van binnenkomst: `getMostCommon`
 *    voor de meest voorkomende omschrijving, en de eindsortering op (confidence,
 *    bedrag) voor twee even grote vaste lasten. Beide gevallen staan hieronder
 *    als expliciete getuige.
 *
 * De rijen worden afgevangen met een call-through-spy op
 * `detectRecurringTransactions`: dat is de enige plek waar de volledige, samen-
 * gevoegde paginatie-uitkomst langskomt.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/recurring-detection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/recurring-detection')>()
  return { ...actual, detectRecurringTransactions: vi.fn(actual.detectRecurringTransactions) }
})

import { detectRecurringTransactions, type TransactionForDetection } from '@/lib/recurring-detection'
import { makeSupabase, MAX_ROWS, type Row } from '@/test/helpers/fake-supabase'
import { loadVasteLastenSummary } from './vaste-lasten-summary'

const detectSpy = vi.mocked(detectRecurringTransactions)

/** Vast "nu", zodat het 12-maandsvenster (ondergrens 2025-07-01) niet meebeweegt. */
const NU = new Date(2026, 5, 15, 12, 0, 0)

/** Aantal fillerrijen dat dezelfde datum deelt — meer dan één, dus de cursor
 *  moet de `date.eq.X AND id.gt.Y`-tak echt gebruiken. */
const RIJEN_PER_DATUM = 30

function datumPlus(dagen: number): string {
  const d = new Date(2025, 6, 1 + dagen)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function tx(id: string, date: string, amount: number, counterparty: string, description: string): Row {
  return {
    id,
    date,
    amount,
    description,
    counterparty_name: counterparty,
    is_income: false,
    budget_id: null,
    transaction_type: 'debit',
  }
}

/**
 * Twee vaste lasten met IDENTIEK maandbedrag en identieke betrouwbaarheid: hun
 * onderlinge volgorde in de eindlijst is een gelijkspel dat de stabiele sort
 * beslecht op de volgorde waarin de groepen ontdekt zijn — dus op de aanlever-
 * volgorde. ALFA begint een dag eerder dan BETA, maar draagt de HOOGSTE id's;
 * op (date, id) wint ALFA, op id-alleen zou BETA winnen.
 */
function tweelingRijen(): Row[] {
  const rows: Row[] = []
  for (let m = 0; m < 6; m++) {
    const maand = String(8 + m).padStart(2, '0')
    const jaar = 8 + m > 12 ? 2026 : 2025
    const echteMaand = 8 + m > 12 ? String(8 + m - 12).padStart(2, '0') : maand
    rows.push(tx(`zz-alfa-${m}`, `${jaar}-${echteMaand}-01`, -30, 'ALFA VERZEKERING', 'polis'))
    rows.push(tx(`aa-beta-${m}`, `${jaar}-${echteMaand}-02`, -30, 'BETA VERZEKERING', 'polis'))
  }
  return rows
}

/**
 * Eén groep met TWEE EVEN VAAK voorkomende omschrijvingen (3× BBB, 3× AAA):
 * `getMostCommon` telt gelijk en houdt dan de omschrijving die als EERSTE
 * binnenkwam. Met de canonieke (date, id)-volgorde is dat de vroegste datum.
 */
function gelijkspelRijen(): Row[] {
  const spec: [string, string][] = [
    ['2025-09-03', 'BBB'],
    ['2025-10-03', 'AAA'],
    ['2025-11-03', 'BBB'],
    ['2025-12-03', 'AAA'],
    ['2026-01-03', 'BBB'],
    ['2026-02-03', 'AAA'],
  ]
  return spec.map(([date, omschrijving], i) =>
    tx(`tb-${i}`, date, -45, 'GELIJKSPEL VERZEKERING', omschrijving),
  )
}

/**
 * Fillerrijen met een UNIEKE tegenpartij per rij (dus geen eigen groep: een groep
 * van één valt af) en `RIJEN_PER_DATUM` rijen per datum. De id's lopen via een
 * permutatie, zodat de id-volgorde niets met de datumvolgorde te maken heeft en
 * een sortering op alleen id meteen zichtbaar zou zijn.
 */
function fillerRijen(aantal: number): Row[] {
  const rows: Row[] = []
  for (let i = 0; i < aantal; i++) {
    const permutatie = (i * 617) % aantal
    rows.push(
      tx(
        `f-${String(permutatie).padStart(5, '0')}`,
        datumPlus(Math.floor(i / RIJEN_PER_DATUM)),
        -3,
        `FILLER ${i}`,
        'losse aankoop',
      ),
    )
  }
  return rows
}

/** De fixture in de volgorde waarin de database hem MOET aanleveren. */
function canoniek(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    const ad = String(a.date)
    const bd = String(b.date)
    if (ad !== bd) return ad < bd ? -1 : 1
    return String(a.id) < String(b.id) ? -1 : 1
  })
}

const TRANSACTIES = [...fillerRijen(1182), ...tweelingRijen(), ...gelijkspelRijen()]
const CANONIEK = canoniek(TRANSACTIES)

function client() {
  return makeSupabase({
    profile: { id: 'u1' },
    transactions: TRANSACTIES,
    budgets: [],
    recurringTransactions: [],
  })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NU)
  detectSpy.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('fetchAllRecurringTx — keyset-paginatie levert het volledige venster', () => {
  it('de fixture legt de paginagrens midden in een reeks gelijke datums', () => {
    // Bewaakt de fixture zelf: zonder deze eigenschap toetst de test hieronder
    // niet meer het geval waar een keyset-cursor stukloopt.
    expect(TRANSACTIES.length).toBeGreaterThan(MAX_ROWS)
    expect(CANONIEK[MAX_ROWS - 1].date).toBe(CANONIEK[MAX_ROWS].date)
    expect(CANONIEK[MAX_ROWS - 1].id).not.toBe(CANONIEK[MAX_ROWS].id)
  })

  it('levert élke rij precies één keer, in de canonieke (date, id)-volgorde', async () => {
    const { client: supabase } = client()

    await loadVasteLastenSummary(supabase)

    expect(detectSpy).toHaveBeenCalledTimes(1)
    const aangeleverd = detectSpy.mock.calls[0][0] as TransactionForDetection[]
    expect(aangeleverd.map((t) => t.id)).toEqual(CANONIEK.map((r) => r.id))
    // Geen dubbelingen: even lang én uniek — een keyset die de grensrijen
    // opnieuw ophaalt zou hier stranden nog vóór de volgorde-assertie.
    expect(new Set(aangeleverd.map((t) => t.id)).size).toBe(TRANSACTIES.length)
  })

  it('paginert in twee rondes en stopt daarna (geen extra lege ronde)', async () => {
    const fake = client()

    await loadVasteLastenSummary(fake.client)

    // 1182 filler + 12 tweeling + 6 gelijkspel = 1200 rijen → pagina 1 zit vol
    // (1000), pagina 2 levert er 200 en is daarmee de laatste.
    expect(fake.tableQueriesFor('transactions')).toBe(2)
  })
})

describe('fetchAllRecurringTx — de gelijkspelgevallen blijven bepaald', () => {
  it('bij twee even vaak voorkomende omschrijvingen wint de vroegste datum', async () => {
    const { client: supabase } = client()

    await loadVasteLastenSummary(supabase)

    const gedetecteerd = detectSpy.mock.results[0].value as ReturnType<typeof detectRecurringTransactions>
    const groep = gedetecteerd.find((d) => d.counterpartyName === 'GELIJKSPEL VERZEKERING')
    expect(groep).toBeDefined()
    // 3× BBB en 3× AAA; BBB staat op de vroegste datum (2025-09-03).
    expect(groep!.commonDescription).toBe('BBB')
  })

  it('twee vaste lasten met hetzelfde bedrag houden de volgorde van binnenkomst', async () => {
    const { client: supabase } = client()

    const summary = await loadVasteLastenSummary(supabase)

    const namen = summary.vasteKosten.map((i) => i.name)
    const alfa = namen.indexOf('ALFA VERZEKERING')
    const beta = namen.indexOf('BETA VERZEKERING')
    expect(alfa).toBeGreaterThanOrEqual(0)
    expect(beta).toBeGreaterThanOrEqual(0)
    // ALFA begint een dag eerder, dus wordt als eerste ontdekt — óók al draagt
    // hij de hoogste id's. Zou de cursor op alleen `id` ordenen, dan kwam BETA
    // eerst binnen en zou deze volgorde omklappen.
    expect(alfa).toBeLessThan(beta)
  })
})
