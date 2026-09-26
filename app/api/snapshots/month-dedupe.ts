/**
 * Netto-lijn-projectie van de maand-dedupe voor `net_worth_snapshots`.
 *
 * De regel "één stand per kalendermaand; de laatste `snapshot_date` in de maand
 * wint" staat in `lib/snapshots/month-dedupe.ts` — dit bestand projecteert de
 * winnaar alleen naar de vorm die twee routes lezen:
 *   - GET /api/snapshots/history        (handmatige historie-invoer)
 *   - GET /api/snapshots/group-history  (netto-vermogen — verloop, brok B2a)
 *
 * Het gewonnen `snapshot_date` blijft in de uitkomst zodat de aanroeper een
 * HANDMATIGE maandstand kan herkennen: /api/snapshots/history POST schrijft die
 * op de 1e van de maand ('<maand>-01') en verwijdert alle andere rijen in
 * diezelfde maand (gezaghebbend + idempotent). Auto/cron/POST-snapshots landen op
 * de werkelijke kalenderdag (`toISOString()`-datum), dus alleen op de 1e als het
 * toevallig de 1e is.
 */

import { dedupeSnapshotsByMonth } from '@/lib/snapshots/month-dedupe'

/** Minimale rij-vorm die de dedupe leest — een superset (extra kolommen) mag. */
export interface NetWorthSnapshotRow {
  snapshot_date: string
  net_worth: number | string
}

/** De winnende maandstand: waarde + de bron-`snapshot_date` (voor manual-detectie). */
export interface MonthlyNetWorth {
  /** Netto vermogen van de winnende rij (laatste snapshot_date in de maand). */
  netWorth: number
  /** `snapshot_date` (YYYY-MM-DD) van de winnende rij. */
  snapshotDate: string
}

/**
 * Dedupe `net_worth_snapshots`-rijen tot één stand per kalendermaand
 * ('YYYY-MM' → winnaar) via de gedeelde regel in `lib/snapshots/month-dedupe.ts`,
 * geprojecteerd naar `{ netWorth, snapshotDate }`.
 */
export function dedupeNetWorthByMonth(
  rows: readonly NetWorthSnapshotRow[],
): Map<string, MonthlyNetWorth> {
  const byMonth = new Map<string, MonthlyNetWorth>()
  for (const [month, row] of dedupeSnapshotsByMonth(rows)) {
    byMonth.set(month, { netWorth: Number(row.net_worth), snapshotDate: String(row.snapshot_date) })
  }
  return byMonth
}

/**
 * True als de winnende maandstand een HANDMATIGE invoer is.
 *
 * /api/snapshots/history POST schrijft handmatige rijen op de 1e van de maand
 * ('<maand>-01') en verwijdert alle andere rijen in die maand; auto/cron/POST-
 * snapshots landen op de werkelijke kalenderdag. Detectie = dag-deel '01'.
 *
 * Bewuste grens: een auto-snapshot die toevallig op de 1e van de maand valt
 * leest óók als 'manual'. Dat is inherent aan deze conventie — de history-POST is
 * de enige schrijver die de 1e-van-de-maand als "handmatige stand" hanteert.
 */
export function isManualMonthStand(snapshotDate: string): boolean {
  return snapshotDate.slice(8, 10) === '01'
}
