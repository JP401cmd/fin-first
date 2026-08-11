/**
 * Deelbare Vrijheidscheck-uitkomst — de privacy-naad (ADR 0067).
 *
 * ADR 0067 legt vast dat de uitkomst deelbaar is **in vrijheidstijd en alléén in
 * vrijheidstijd**: "X jaar en Y maanden vrijheid". In het gedeelde beeld, de
 * link-preview en de tekst staan NOOIT bedragen, percentages of ingevoerde
 * gegevens.
 *
 * Dit bestand maakt die grens *structureel* in plaats van afgesproken:
 *
 *  - `selectShareFreedom` is de ENIGE functie in het deelpad die de volledige
 *    `CheckReportData` ziet. Hij geeft twee gehele getallen terug — `years` en
 *    `months` — en niets anders. Alles verderop (tekst, beeld, knop, dialoog)
 *    werkt uitsluitend op dat `ShareFreedom`-object en heeft dus geen enkele
 *    referentie naar het rapport, de intake of een tussenstand. Een bedrag kán
 *    er niet in komen; het wordt niet meegegeven.
 *  - De gedeelde URL is `<origin>/check` — geen querystring, geen token, geen
 *    identifier. De ontvanger landt op de publieke check en doet 'm zelf; er
 *    wordt niets opgeslagen en niets herbezoekbaar gemaakt (dataminimalisatie).
 *  - De gedeelde tekst wekt geen opvolgverwachting (ADR 0068): er staat nergens
 *    dat wij contact opnemen.
 *
 * Bewaakt door `lib/check/__tests__/share-freedom.test.ts`: die test voert het
 * VOLLEDIGE rapport in en eist dat er in de complete deel-payload geen `€`, geen
 * `%` en geen ander cijfer voorkomt dan de jaren en maanden zelf.
 */

import { formatFreedomTimeString } from '@/lib/format'
import type { CheckReportData } from './types'

/**
 * Het enige dat het deelpad te zien krijgt: de berekende vrijheidstijd, in twee
 * gehele getallen. Bewust géén `totalDays`/`isDeficit`/labels — hoe smaller dit
 * object, hoe kleiner het lek-oppervlak.
 */
export interface ShareFreedom {
  readonly years: number
  readonly months: number
}

/** Pad waar de ontvanger van een gedeelde link landt. Bewust zonder parameters. */
export const CHECK_SHARE_PATH = '/check'

/** Maximum uit `calculateFreedomTime` (lib/format.ts) — daar wordt op 9999 jaar gekapt. */
const MAX_YEARS = 9999

function wholeNonNegative(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(max, Math.floor(value)))
}

/**
 * Reduceert het volledige rapport tot de deelbare vrijheidstijd.
 *
 * Geeft `null` wanneer er niets zinnigs te delen valt:
 *  - `isDeficit` — het vrijheidsvermogen staat onder nul; "0 jaar vrijheid"
 *    delen is geen uitkomst maar een schandpaal;
 *  - `isInfinite` — geen uitgaven bekend, dus geen betekenisvolle tijd;
 *  - afgerond nul jaar én nul maanden.
 *
 * `null` betekent voor de render: géén deel-knop tonen.
 */
export function selectShareFreedom(report: CheckReportData): ShareFreedom | null {
  const time = report.snapshot.netWorthFreedom
  if (time.isDeficit || time.isInfinite) return null

  const years = wholeNonNegative(time.years, MAX_YEARS)
  const months = wholeNonNegative(time.months, 11)
  if (years <= 0 && months <= 0) return null

  return { years, months }
}

/**
 * "12 jaar en 4 maanden" — via de canonieke formatter uit `lib/format.ts`
 * (consume, don't recompute). `days` is hier per definitie 0: we delen alleen
 * uitkomsten van minstens een maand.
 */
export function formatShareFreedomLabel(freedom: ShareFreedom): string {
  return formatFreedomTimeString(
    {
      years: freedom.years,
      months: freedom.months,
      days: 0,
      totalDays: 0,
      isDeficit: false,
      isInfinite: false,
    },
    'long',
  )
}

/** De tekst-payload voor de native share-sheet en het klembord. */
export interface FreedomShareText {
  /** Titel voor de share-sheet. */
  title: string
  /** De boodschap zelf — zonder URL (die geeft de share-sheet apart mee). */
  text: string
  /** De gedeelde link: `<origin>/check`, parameterloos. */
  url: string
  /** Tekst + link aan elkaar, voor het klembord. */
  clipboard: string
}

/**
 * Bouwt de publieke deel-tekst.
 *
 * Compliance (Wft): dit is een weergave van de eigen uitkomst plus een
 * uitnodiging om dezelfde som te doen — inzicht, geen aanbeveling over een
 * financieel product. Geen rendementsbelofte, geen "gegarandeerd", geen
 * opvolgverwachting (ADR 0068).
 *
 * @param origin - `window.location.origin`; alleen protocol+host, nooit een pad
 *                 of querystring uit de huidige (token-dragende) rapport-URL.
 */
export function buildFreedomShareText(
  freedom: ShareFreedom,
  origin: string,
): FreedomShareText {
  const label = formatShareFreedomLabel(freedom)
  const url = `${origin.replace(/\/+$/, '')}${CHECK_SHARE_PATH}`
  const text = `Ik heb ${label} vrijheid opgebouwd — geld is opgeslagen tijd. Doe je eigen Vrijheidscheck:`

  return {
    title: 'Mijn Vrijheidscheck',
    text,
    url,
    clipboard: `${text} ${url}`,
  }
}

/** De regels die op de deelbare kaart (het beeld) worden getekend. */
export interface FreedomCardCopy {
  kicker: string
  /** De uitkomst, groot: "12 jaar en 4 maanden". */
  headline: string
  subline: string
  principle: string
  wordmark: string
  footer: string
}

/**
 * De volledige tekst van het deelbare beeld. Neemt — net als de tekst-payload —
 * uitsluitend `ShareFreedom`, zodat de kaart-render nooit bij een bedrag kán.
 *
 * @param host - `window.location.host`, alleen om de lezer te vertellen waar de
 *               check staat. Geen pad, geen parameters.
 */
export function buildFreedomCardCopy(
  freedom: ShareFreedom,
  host: string,
): FreedomCardCopy {
  return {
    kicker: 'Vrijheidscheck',
    headline: formatShareFreedomLabel(freedom),
    subline: 'vrijheid heb ik al opgebouwd',
    principle: 'Geld is opgeslagen tijd.',
    wordmark: 'trifinity.',
    footer: `Doe je eigen check · ${host}${CHECK_SHARE_PATH}`,
  }
}

/** Bestandsnaam voor het opgeslagen beeld. Bewust zonder enig persoonsgegeven. */
export const FREEDOM_CARD_FILENAME = 'vrijheidscheck.png'
