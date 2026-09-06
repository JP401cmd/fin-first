// lib/transaction-staleness.ts
// ---------------------------------------------------------------------------
// Wanneer rust een cijfer op VEROUDERDE transacties? ÉÉN antwoord, voor élk
// oppervlak. Zustermodule van `lib/holdings-staleness.ts`, dat exact dezelfde
// vraag beantwoordt voor koersen ("Prijzen verouderd").
//
// DE AANLEIDING (UR2-13). Op een account met 407 transacties waarvan de jongste
// van 25 maart 2026 was, toonde de app op 31 augustus 2026:
//   • /overzicht — cashflow-widget: "Importeer transacties om je maandelijkse
//     cashflow te zien", terwijl er 407 stonden. De widget toetste op de
//     GEREALISEERDE huidige + vorige maand; die waren leeg, en "leeg venster"
//     werd gelezen als "geen transacties";
//   • /overzicht/budget — Transacties-kaart: "Nog geen transacties";
//   • daarnaast een spaarquote van 38 % zonder één aanduiding dat die op data
//     van vijf maanden terug rust.
// Alle drie waren waar binnen hun eigen venster en onwaar als mededeling. De
// holdings-pagina deed het naast de deur al goed, met een expliciete banner.
//
// DE MAANDKORREL, EN WAAROM DIE DE JUISTE IS. Het oordeel rust op de jongste
// maand ín het 12-maands MAANDAGGREGAAT (`tx_month_aggregate`) dat élke
// cashflow-loader toch al ophaalt — dus nul extra queries, en per constructie
// dezelfde grondslag als de cijfers waarover het iets zegt. Een exacte
// `max(date)`-query zou een dag-precieze leeftijd geven maar kost op de
// gestreamde cashflow-hub twee extra round-trips (de RLS-scope dwingt een
// eigen/gedeeld-splitsing af, zie `getEarliestIncomeDate`) voor een precisie die
// geen enkele melding gebruikt: "je laatste boeking is van maart 2026" is het
// hele bericht.
//
// BEWUSTE GRENS — VERDER DAN 12 MAANDEN KIJKT DEZE MODULE NIET. Het aggregaat
// vensterert op twaalf maanden; is de jongste transactie ouder, dan is er geen
// maand en levert dit bestand `state: 'none'` ("we weten van geen transacties").
// Dat is dezelfde uitkomst als bij een gebruiker die er werkelijk geen heeft.
// Bekend, benoemd en onschadelijk: elk cijfer dat deze melding begeleidt staat
// zélf op dat 12-maands venster, dus buiten het venster is er ook geen cijfer
// meer om te relativeren.
// ---------------------------------------------------------------------------

import { localMonthBounds } from '@/lib/month-range'

/**
 * Hoeveel hele kalendermaanden er tussen de jongste transactie en de lopende
 * maand mogen zitten voordat de data "verouderd" heet.
 *
 * 2 = "de vorige maand is helemaal voorbijgegaan zonder één boeking". Bewust
 * niet 1: op de 3e van de maand heeft een gebruiker die per maand importeert
 * nog niets in de lopende maand staan, en een melding die elke maand een paar
 * dagen afgaat leert de gebruiker haar te negeren — precies de val die
 * `holdings-staleness.ts` met handelsdagen omzeilt.
 *
 * De prijs van de maandkorrel: op de 1e van de maand kan een gat van 2 maanden
 * horen bij een laatste boeking van 32 dagen geleden. Ook dan is het bericht
 * waar — er ging een volle kalendermaand voorbij zonder transactie — alleen net
 * eerder streng dan een dagtelling zou zijn.
 */
export const TX_STALE_AFTER_MONTHS = 2

export type TransactionFreshnessState =
  /** Geen transactie in het 12-maands venster (of nooit één gehad). */
  | 'none'
  /** Er is recent geboekt; cijfers mogen zonder voorbehoud gepresenteerd worden. */
  | 'fresh'
  /** De jongste boeking ligt `TX_STALE_AFTER_MONTHS`+ maanden terug. */
  | 'stale'

export interface TransactionFreshness {
  state: TransactionFreshnessState
  /** Er is minstens één transactie bekend — de toets voor "ontkent dit scherm bestaande data?". */
  hasHistory: boolean
  /** Hele kalendermaanden tussen de jongste transactiemaand en nu; `null` zonder historie. */
  monthsBehind: number | null
  /** De jongste transactiemaand als aggregaat-sleutel ('YYYY-MM'), of `null`. */
  latestMonth: string | null
  /** Diezelfde maand in gewone taal ('maart 2026'), of `null`. */
  latestMonthLabel: string | null
}

const NONE: TransactionFreshness = {
  state: 'none',
  hasHistory: false,
  monthsBehind: null,
  latestMonth: null,
  latestMonthLabel: null,
}

/** 'YYYY-MM' → 'maart 2026'. Lokale componenten, dus geen UTC-dagverschuiving. */
export function monthKeyLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map((p) => parseInt(p, 10))
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey
  return new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  )
}

/**
 * Het versheidsoordeel over de transactiedata.
 *
 * @param latestMonth - Jongste maand met transacties ('YYYY-MM'), zoals
 *   `aggLatestMonth` die uit het maandaggregaat haalt. `null`/`undefined` =
 *   geen transactie in het venster.
 * @param now - Referentiemoment; parameter (geen interne `new Date()`) zodat
 *   het oordeel deterministisch te testen is naast de cijfers die het beschrijft.
 */
export function transactionFreshness(
  latestMonth: string | null | undefined,
  now: Date = new Date(),
): TransactionFreshness {
  if (!latestMonth || !/^\d{4}-\d{2}$/.test(latestMonth)) return NONE

  // Dezelfde sleutel-afleiding als de aggregaat-consumers (`currentMonthKey`):
  // lokale jaar/maand via `localMonthBounds`, nooit `toISOString()`.
  const nowKey = localMonthBounds(now).start.slice(0, 7)
  const [latestYear, latestMonthNr] = latestMonth.split('-').map((p) => parseInt(p, 10))
  const [nowYear, nowMonthNr] = nowKey.split('-').map((p) => parseInt(p, 10))
  // Een toekomstige boeking (geplande transactie) is nooit "achter": klem op 0.
  const monthsBehind = Math.max(
    0,
    (nowYear - latestYear) * 12 + (nowMonthNr - latestMonthNr),
  )

  return {
    state: monthsBehind >= TX_STALE_AFTER_MONTHS ? 'stale' : 'fresh',
    hasHistory: true,
    monthsBehind,
    latestMonth,
    latestMonthLabel: monthKeyLabel(latestMonth),
  }
}

/**
 * De leeftijd in gewone taal: "5 maanden geleden", "vorige maand".
 *
 * Alleen zinvol vanaf één maand achterstand; binnen de lopende maand (0) is er
 * niets te melden en geeft deze functie `null` terug, zodat een oppervlak niet
 * per ongeluk "0 maanden geleden" schrijft.
 */
export function transactionAgeLabel(monthsBehind: number | null): string | null {
  if (monthsBehind == null || monthsBehind < 1) return null
  if (monthsBehind === 1) return 'vorige maand'
  return `${monthsBehind} maanden geleden`
}
