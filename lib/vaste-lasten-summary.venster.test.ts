/**
 * ANALYSEVENSTER VAN DE VASTE-LASTENDETECTIE (V-001) — 24 maanden, was 12.
 *
 * Deze suite bewijst de venstergrens dáár waar hij telt: aan de loader-kant,
 * met een fake die `.gte('date', …)` ECHT toepast. Een unit-test op
 * `detectRecurringTransactions` kan dit niet: die krijgt de rijen aangereikt en
 * heeft geen venster.
 *
 * WAAROM DIT HET SLUITSTUK IS. De drempelwijziging (halfjaar/jaar vanaf twee
 * waarnemingen, zie recurring-detection.test.ts) is op zichzelf betekenisloos
 * zolang het venster twaalf maanden breed is: twee betalingen met een jaar
 * ertussen passen daar per definitie niet allebei in. De fixture hieronder is
 * daar precies op gebouwd — de eerste jaarbetaling ligt BUITEN het oude venster
 * en BINNEN het nieuwe.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { makeSupabase, type Row } from '@/test/helpers/fake-supabase'
import { __resetVasteLastenCache } from '@/lib/vaste-lasten-cache'
import { RECURRING_ANALYSIS_MONTHS } from '@/lib/recurring-detection'
import { loadVasteLastenSummary } from './vaste-lasten-summary'

/** Vast "nu": oude ondergrens 2025-07-01, nieuwe ondergrens 2024-07-01. */
const NU = new Date(2026, 5, 15, 12, 0, 0)

function tx(id: string, date: string, amount: number, counterparty: string): Row {
  return {
    id,
    date,
    amount,
    description: counterparty,
    counterparty_name: counterparty,
    is_income: false,
    budget_id: null,
    transaction_type: 'debit',
  }
}

/**
 * De jaarpost. `2025-02-10` ligt vóór de OUDE ondergrens (2025-07-01) en ná de
 * nieuwe (2024-07-01) — dus met een venster van twaalf maanden ziet de detectie
 * hier maar één betaling en bestaat het patroon niet.
 */
const JAARPOST = [
  tx('jaar-0', '2025-02-10', -119, 'SKYSHOWTIME'),
  tx('jaar-1', '2026-02-10', -119, 'SKYSHOWTIME'),
]

/** Losse posten van unieke tegenpartijen: geen eigen groep, wel genoeg rijen
 *  om de `transactions.length < 3`-afslag van de loader te passeren. */
const RUIS = [
  tx('ruis-0', '2025-11-04', -8.5, 'EENMALIG A'),
  tx('ruis-1', '2026-03-21', -19.95, 'EENMALIG B'),
]

function client(rows: Row[]) {
  return makeSupabase({
    profile: { id: 'u1' },
    transactions: rows,
    budgets: [],
    recurringTransactions: [],
  }).client
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NU)
  // De vaste-lastencache leeft op moduleniveau en overleeft een `it`.
  __resetVasteLastenCache()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('loadVasteLastenSummary — analysevenster (V-001)', () => {
  it('vindt een jaarabonnement waarvan de eerste betaling buiten het oude 12-maandsvenster ligt', () => {
    // Bewaakt de fixture: zonder deze eigenschap toetst de test hieronder niets.
    // (`localMonthStartMonthsAgo(NU, 11)` = 2025-07-01.)
    const eersteBetaling = String(JAARPOST[0].date)
    expect(eersteBetaling < '2025-07-01').toBe(true)
    expect(eersteBetaling >= '2024-07-01').toBe(true)
  })

  it('detecteert de jaarpost en telt hem mee in het maandtotaal', async () => {
    const summary = await loadVasteLastenSummary(client([...RUIS, ...JAARPOST]))

    const post = summary.subscriptions.find((s) => s.name === 'SKYSHOWTIME')
    expect(post).toBeDefined()
    expect(post!.frequency).toBe('yearly')
    expect(post!.occurrences).toBe(2)
    // Jaarbedrag door 12 (`toMonthly`), dus 119 / 12.
    expect(post!.monthlyAmount).toBeCloseTo(119 / 12, 5)
    expect(summary.totalMonthly).toBeCloseTo(119 / 12, 2)
  })

  it('rijen ONDER de nieuwe ondergrens blijven buiten beeld', async () => {
    // Drie betalingen van een oude, opgezegde maandpost, allemaal vóór
    // 2024-07-01: die hoort nog steeds niet in het totaal te staan. Zonder deze
    // getuige zou een venster van "alles" ook groen zijn.
    const teOud = [
      tx('oud-0', '2024-01-09', -40, 'OPGEZEGD ABONNEMENT'),
      tx('oud-1', '2024-02-09', -40, 'OPGEZEGD ABONNEMENT'),
      tx('oud-2', '2024-03-09', -40, 'OPGEZEGD ABONNEMENT'),
    ]

    const summary = await loadVasteLastenSummary(client([...RUIS, ...JAARPOST, ...teOud]))

    const namen = [...summary.subscriptions, ...summary.vasteKosten].map((i) => i.name)
    expect(namen).not.toContain('OPGEZEGD ABONNEMENT')
    expect(namen).toContain('SKYSHOWTIME')
  })

  it('het venster is één getal en komt uit de detectiemodule', () => {
    expect(RECURRING_ANALYSIS_MONTHS).toBe(24)
  })

  /**
   * DE TWEEDE SNEDE: binnen het venster, maar allang gestopt.
   *
   * De test hierboven bewijst alleen dat rijen ónder de ondergrens wegvallen.
   * Dat is de makkelijke helft. De gevaarlijke helft zit erbinnen: een
   * abonnement dat keurig maandelijks werd afgeschreven en toen is opgezegd
   * laat een perfect patroon achter, en `detectFrequency` kijkt uitsluitend naar
   * de intervallen — nooit naar hoe lang geleden de laatste betaling was. Met
   * een venster van 24 maanden is die staart twee keer zo lang als voorheen.
   */
  it('een abonnement dat binnen het venster is OPGEZEGD telt niet meer mee', async () => {
    // Ziggo EUR 55/mnd, vijf nette maandbetalingen, laatste februari 2025 —
    // ruim binnen het 24-maandsvenster (ondergrens 2024-07-01), maar zestien
    // maanden vóór "nu". Zonder de staarttermijn stond hier EUR 55/mnd in het
    // totaal, in de inkomensmeter en in de vrijheidsdagen.
    const opgezegd = ['2024-10', '2024-11', '2024-12', '2025-01', '2025-02'].map((maand, i) =>
      tx(`ziggo-${i}`, `${maand}-15`, -55, 'ZIGGO'),
    )

    const summary = await loadVasteLastenSummary(client([...RUIS, ...JAARPOST, ...opgezegd]))

    const namen = [...summary.subscriptions, ...summary.vasteKosten].map((i) => i.name)
    expect(namen).not.toContain('ZIGGO')
    // Het totaal is precies de jaarpost, zonder een spoor van de EUR 55.
    expect(summary.totalMonthly).toBeCloseTo(119 / 12, 2)
  })

  it('een LOPEND maandabonnement telt onverkort mee', async () => {
    // De spiegelzijde van de test hierboven: de staarttermijn mag geen levende
    // vaste lasten opeten.
    // Tot en met de maand van NU (15 juni 2026), dus geen datums in de toekomst.
    const lopend = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].map((maand, i) =>
      tx(`odido-${i}`, `${maand}-15`, -30, 'ODIDO'),
    )

    const summary = await loadVasteLastenSummary(client([...RUIS, ...lopend]))

    const namen = [...summary.subscriptions, ...summary.vasteKosten].map((i) => i.name)
    expect(namen).toContain('ODIDO')
    expect(summary.totalMonthly).toBeCloseTo(30, 2)
  })
})
