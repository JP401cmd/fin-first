/**
 * Canonieke oordeel-copy per hefboom (S1, richtingsbesluit R5 "duiding boven
 * reductie").
 *
 * ── Waarom een eigen module ──────────────────────────────────────────────
 * Er bestaan in de app drie oordeelswoordenlijsten en ze doen NIET hetzelfde
 * werk:
 *
 *  1. `LEVERAGE_STATUS_LABEL` (lib/leverage-status.ts) — GENERIEK, puur
 *     statussemantiek: "Goed op koers · Aandacht · Risico · Geen score".
 *     Blijft waar hij is; hij is de vangnet-naam van de status-dot.
 *  2. Dít bestand — DOMEINSPECIFIEK per hefboom: "Goed gespreid" zegt een
 *     beginner méér dan "Goed op koers". Precies dáárom is deze lijst NIET
 *     samengevoegd met #1: alles op één generieke lijst trekken vernietigt de
 *     duiding die S1 terugvraagt.
 *  3. De lokale near-duplicaat van #1 in `QuoteMeter`
 *     (components/overview/cashflow/vaste-lasten-insights.tsx) — dat is drift
 *     en hoort naar #1 geconsolideerd te worden. Belegd bij kaart S2; NIET
 *     hier meegenomen.
 *
 * ── De regel die deze module vastlegt ────────────────────────────────────
 * **Een status draagt altijd een woord; kleur is nooit de enige drager.**
 * De shell (`components/overview/leverage-card.tsx`) dwingt dat structureel
 * af — deze module levert het woord dat het beste past.
 *
 * ── Wft ──────────────────────────────────────────────────────────────────
 * Elk oordeel is een CONSTATERING over de eigen situatie: geen imperatief
 * ("stort", "verschuif"), geen bedrag- of besparingsbelofte. De belasting-
 * regel houdt bovendien zijn hedge ("Mogelijk") — het geijkte BEL-3-voorbeeld
 * van de toegestane vorm.
 *
 * Pure module (géén 'use client') zodat server-components die de status
 * afleiden en client-components die hem renderen dezelfde zin lezen.
 */

import type { Hefboom } from './hefboom-config'
import type { LeverageStatus } from './leverage-status'

/**
 * Oordeel in gewone taal per hefboom × status.
 *
 * `neutral` staat er bewust NIET in: neutraal betekent dat er niets te
 * oordelen valt. Wat er dan wél getoond wordt, beslist de call-site — zie
 * `HEFBOOM_VERDICT_NEUTRAL` hieronder.
 *
 * Historie van de teksten:
 *  - De bezittingen-/cashflow-regels zijn 1-op-1 overgenomen uit de oude
 *    `statusSubText()` in `hefbomen-nav.tsx` (nu verwijderd).
 *  - `schulden.warn` was `Schuldratio {rawValue}` — het enige niet-gewone-taal
 *    oordeel in de lijst. Vervangen door een zin; het rátiogetal blijft
 *    bereikbaar in de drill-down (`pillar.rawValue`, Volledig).
 *  - `belasting` was voor good/warn/bad bewust IDENTIEK ("Mogelijk betaal je
 *    meer dan nodig"). De motivering daarvoor — belasting heeft sinds ADR 0010
 *    geen eigen gezondheidspijler en de tegel zou terugvallen op een
 *    totaalscore-proxy — is achterhaald: de tegel leest zijn status sinds de
 *    lever-pariteitsfix uit `loadLeverScores` → `box3TaxStatus`, een échte,
 *    betekenisvolle Box 3-status. De proxy is nog uitsluitend fallback voor het
 *    geval `leverScores` ontbreekt.
 *
 *    Gevolg van die achterstallige koppeling was bug UR2-04: bij een GROENE
 *    belasting-hefboom (onder de vrijstelling) stond op één scherm de kaart
 *    "Belasting — Mogelijk betaal je meer dan nodig" naast het kompas
 *    "Belasting: Goed op koers". Het oordeel volgt nu de status; de geijkte
 *    BEL-3-hedge blijft staan waar hij hoort — op `warn`.
 */
export const HEFBOOM_VERDICT: Record<
  Hefboom,
  Record<Exclude<LeverageStatus, 'neutral'>, string>
> = {
  bezittingen: {
    good: 'Goed gespreid',
    warn: 'Beperkt gespreid',
    bad: 'Sterk geconcentreerd',
  },
  schulden: {
    good: 'Aflossing op schema',
    warn: 'Schuldenlast vraagt aandacht',
    bad: 'Hoge schuldenlast',
  },
  cashflow: {
    good: 'Op koers met sparen',
    warn: 'Lager dan doel',
    bad: 'Tekort op rekening',
  },
  // Elk van de drie is een CONSTATERING over de eigen Box 3-positie, geen
  // imperatief en geen besparingsbelofte (Wft). `good` dekt twee gevallen —
  // onder de heffingsvrije voet, én beperkt erboven mét fiscaal partner
  // (box3TaxStatus) — vandaar "beperkt" en niet "geen": dat laatste zou voor het
  // partner-geval onwaar zijn.
  belasting: {
    good: 'Belastingdruk beperkt',
    warn: 'Mogelijk betaal je meer dan nodig',
    bad: 'Hoge belastingdruk',
  },
}

/**
 * Wat een tegel toont wanneer er (nog) niets te oordelen valt.
 *
 * Bewust géén "Geen score" (dat is app-jargon en de generieke
 * `LEVERAGE_STATUS_LABEL['neutral']`): een beginner leest "Nog geen gegevens"
 * als een toestand die hij zelf kan oplossen.
 */
export const HEFBOOM_VERDICT_NEUTRAL = 'Nog geen gegevens'

/**
 * Het oordeel voor één hefboom in gewone taal.
 *
 * @returns de domeinspecifieke zin, of `null` bij `neutral` — dan is er niets
 *   te oordelen. De call-site kiest of hij `HEFBOOM_VERDICT_NEUTRAL` toont
 *   (Eenvoudig: elke tegel draagt een woord) of niets (Volledig: ongewijzigd,
 *   de status-dot draagt daar de toegankelijke naam).
 */
export function hefboomVerdict(
  key: Hefboom,
  status: LeverageStatus,
): string | null {
  if (status === 'neutral') return null
  return HEFBOOM_VERDICT[key][status]
}
