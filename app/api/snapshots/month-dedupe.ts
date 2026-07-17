/**
 * Gedeeld per-kalendermaand-dedupe-idioom voor `net_worth_snapshots`.
 *
 * ENIGE bron van de "één netto-vermogen-stand per kalendermaand"-regel voor de
 * netto-lijn, gedeeld door:
 *   - GET /api/snapshots/history        (handmatige historie-invoer)
 *   - GET /api/snapshots/group-history  (netto-vermogen — verloop, brok B2a)
 *
 * Per kalendermaand wint de rij met de LAATSTE `snapshot_date` in die maand. Het
 * gewonnen `snapshot_date` blijft in de uitkomst zodat de aanroeper een
 * HANDMATIGE maandstand kan herkennen: /api/snapshots/history POST schrijft die
 * op de 1e van de maand ('<maand>-01') en verwijdert alle andere rijen in
 * diezelfde maand (gezaghebbend + idempotent). Auto/cron/POST-snapshots landen op
 * de werkelijke kalenderdag (`toISOString()`-datum), dus alleen op de 1e als het
 * toevallig de 1e is.
 */

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
 * ('YYYY-MM' → winnaar). De rij met de LAATSTE `snapshot_date` in een maand wint.
 *
 * Werkt ongeacht de invoervolgorde (vergelijkt `snapshot_date`), maar produceert
 * bij oplopend gesorteerde invoer exact hetzelfde als het oude inline "laatste
 * write wint"-idioom van de history-route. De unique-constraint
 * (user_id, snapshot_date) garandeert dat er per maand geen twee rijen met
 * dezelfde datum zijn, dus er is geen tie-break nodig.
 */
export function dedupeNetWorthByMonth(
  rows: readonly NetWorthSnapshotRow[],
): Map<string, MonthlyNetWorth> {
  const byMonth = new Map<string, MonthlyNetWorth>()
  for (const row of rows) {
    const snapshotDate = String(row.snapshot_date)
    const month = snapshotDate.slice(0, 7)
    const current = byMonth.get(month)
    // `>=` houdt "laatste write wint" aan bij oplopend gesorteerde invoer,
    // en kiest anders de laatste snapshot_date in de maand.
    if (!current || snapshotDate >= current.snapshotDate) {
      byMonth.set(month, { netWorth: Number(row.net_worth), snapshotDate })
    }
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
