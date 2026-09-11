// lib/history-basis.ts
//
// DE HISTORIEBASIS — afgesloten maanden, één deler per gebruiker (ADR 0138)
// ───────────────────────────────────────────────────────────────────────────
// De ENE plek die bepaalt (a) welke kalendermaanden meetellen voor de
// budgetrealisatie en het transactie-jaarinkomen, en (b) door hoeveel maanden
// een som over dat venster wordt gedeeld om naar een jaarbedrag te schalen.
//
// TWEE REGELS, beide eigenaarsbesluit van 11 sep 2026 (B-041 + B-045):
//
//  1. ALLEEN AFGESLOTEN MAANDEN. Het venster loopt van `HISTORY_WINDOW_MONTHS`
//     maanden terug tot en met de VORIGE maand. De lopende maand is halfvol en
//     asymmetrisch gevuld (vaste lasten rond de 1e, salaris rond de 25e); haar
//     meetellen liet de budgetsom — en daarmee de spaarquote op /overzicht —
//     gedurende de maand verschuiven. Een boeking van vandaag telt pas mee
//     zodra de maand voorbij is.
//
//  2. ÉÉN DELER PER GEBRUIKER. `historyMonths` = het aantal afgesloten maanden
//     sinds de vroegste transactie (van welke soort dan ook) in het venster,
//     geklemd op 1..HISTORY_WINDOW_MONTHS. Diezelfde deler geldt voor ÁLLE
//     budgetten én voor het transactie-jaarinkomen. Tot dit besluit had elk
//     budget zijn eigen deler (de leeftijd sinds `budgets.created_at`), waardoor
//     een budget van drie maanden oud met één boeking van €1.200 als
//     "€300 per maand, berekend over 4 maanden" doortelde, terwijl een ouder
//     budget met dezelfde boeking €100 gaf. Dezelfde boeking, twee antwoorden.
//
// WAAROM "IN HET VENSTER" EN NIET ALL-TIME. De vroegste datum wordt uit
// dezelfde aggregaat-rijen afgeleid die de realisatie al ophaalt: geen extra
// query, en op het service-role-pad (snapshot-cron) automatisch dezelfde scope.
// Voor iedereen zonder gat aan de vensterrand is dat identiek aan de all-time
// vroegste transactie; heeft iemand méér dan een jaar historie, dan klemt de
// bovengrens beide op 12. Het enige verschil ontstaat bij een gat dat de
// vensterrand overspant (wél oude boekingen, niets in de oudste maanden van het
// venster) — dan telt de historiebasis de maanden mét data, wat voor een
// maandgemiddelde het eerlijker antwoord is.
//
// PUUR. Geen I/O, geen React, geen Supabase-import — importeerbaar aan beide
// kanten. `lib/budget-realized.ts` (server) bouwt het venster hiermee;
// `lib/retirement-expense-basis.ts` deelt de schaalformule.

import { HISTORY_WINDOW_MONTHS } from '@/lib/constants'
import { localMonthStartMonthsAgo } from '@/lib/month-range'

/** De minimale rijvorm die de historietelling nodig heeft. */
export interface HistoryAggRow {
  /** Kalendermaand als 'YYYY-MM'. */
  month: string
  sum_positief: number | string
  sum_negatief: number | string
  count?: number | string
}

/**
 * De maandsleutels ('YYYY-MM') van het historievenster, oud → nieuw: de
 * `HISTORY_WINDOW_MONTHS` AFGESLOTEN maanden vóór `now`. De lopende maand staat
 * er per constructie niet in. Tijdzone-veilig via lib/month-range.ts.
 */
export function historyMonthKeys(now: Date): string[] {
  const keys: string[] = []
  for (let n = HISTORY_WINDOW_MONTHS; n >= 1; n--) {
    keys.push(localMonthStartMonthsAgo(now, n).slice(0, 7))
  }
  return keys
}

/**
 * Aantal AFGESLOTEN kalendermaanden tussen `earliest` en `now`: het verschil in
 * (jaar, maand), waarbij de lopende maand niet meetelt. Nooit negatief.
 *
 * Dezelfde telling die `savingsRateDataMonths` (6-maands spaarquote) en
 * `extrapolateAnnualIncome` (client-terugval) al deden — hier één keer.
 */
export function closedMonthsSince(now: Date, earliest: string | Date): number {
  const e = earliest instanceof Date ? earliest : new Date(earliest)
  if (Number.isNaN(e.getTime())) return 0
  return Math.max(0, (now.getFullYear() - e.getFullYear()) * 12 + (now.getMonth() - e.getMonth()))
}

/** De ene klem: 1..HISTORY_WINDOW_MONTHS. Onleesbare invoer → het volle venster. */
export function clampHistoryMonths(months: number): number {
  if (!Number.isFinite(months)) return HISTORY_WINDOW_MONTHS
  return Math.max(1, Math.min(HISTORY_WINDOW_MONTHS, Math.floor(months)))
}

/**
 * DE DELER: het aantal afgesloten maanden met transactiehistorie in het venster.
 *
 * = spanwijdte van de vroegste maand mét een boeking (van welke soort dan ook —
 * ook transfers, ook rijen zonder budget) tot het einde van het venster,
 * geklemd op 1..HISTORY_WINDOW_MONTHS. Geen enkele boeking in het venster →
 * het volle venster: er valt dan toch niets te delen (elke post op 'planned',
 * jaarinkomen 0), en zo blijft de deler eindig.
 *
 * `monthKeys` is de reeks uit `historyMonthKeys(now)`; rijen buiten die reeks
 * tellen niet mee.
 */
export function historyMonthsFromRows(
  rows: readonly HistoryAggRow[],
  monthKeys: readonly string[],
): number {
  const monthIndex = new Map(monthKeys.map((k, i) => [k, i]))
  let firstIdx: number | null = null
  for (const r of rows) {
    const idx = monthIndex.get(r.month)
    if (idx === undefined) continue
    const pos = Number(r.sum_positief) || 0
    const neg = Number(r.sum_negatief) || 0
    const count = r.count === undefined ? 1 : Number(r.count) || 0
    if (pos === 0 && neg === 0 && count <= 0) continue
    if (firstIdx === null || idx < firstIdx) firstIdx = idx
  }
  if (firstIdx === null) return HISTORY_WINDOW_MONTHS
  return clampHistoryMonths(monthKeys.length - firstIdx)
}

/**
 * Schaal een som over het historievenster naar een JAARBEDRAG:
 * (som / historyMonths) × 12 zolang de historie korter is dan het venster,
 * anders de som zelf. De ENIGE plek waar deze schaling woont — de budgetposten
 * (`computeBudgetBasis`) en het transactie-jaarinkomen (`transactionAnnualIncome`)
 * delen 'm, zodat teller en noemer nooit uit twee vensters kunnen komen.
 */
export function annualizeHistorySum(sum: number, historyMonths: number): number {
  // Niets (of NaN) te schalen → 0, nooit NaN de keten in.
  if (!(sum > 0)) return 0
  const months = clampHistoryMonths(historyMonths)
  return months < HISTORY_WINDOW_MONTHS ? (sum / months) * 12 : sum
}
