/**
 * Eén stand per kalendermaand voor `net_worth_snapshots` — de ENIGE bron van
 * die regel.
 *
 * Auto-, cron- en POST-snapshots landen op de werkelijke kalenderdag, dus een
 * maand kan meerdere rijen hebben (gemeten op productie, 26 sep 2026: tot 26 in
 * één maand). Elke lezer die een reeks "per maand" toont of er een vorige of
 * recentste stand uit leest, dedupliceert via deze module. Per kalendermaand wint
 * de rij met de LAATSTE `snapshot_date`.
 *
 * Lezers:
 *   - `lib/server-data/base.ts#getNetWorthSnapshots12m` (het 12-maandsvenster);
 *   - `app/api/snapshots/month-dedupe.ts#dedupeNetWorthByMonth`, de netto-lijn van
 *     GET /api/snapshots/history en GET /api/snapshots/group-history.
 *
 * De unique-constraint `(user_id, snapshot_date)` garandeert per gebruiker geen
 * twee rijen met dezelfde datum, dus een tie-break is niet nodig. Bij gelijke
 * datums (alleen denkbaar over gebruikers heen) wint de later aangeboden rij.
 */

/** Minimale rij-vorm: alleen `snapshot_date` (YYYY-MM-DD) wordt gelezen. */
export interface MonthKeyedSnapshot {
  snapshot_date: string
}

/**
 * Dedupe tot één rij per kalendermaand (`'YYYY-MM'` → winnende rij, ongewijzigd).
 * Werkt ongeacht de invoervolgorde. De kaart houdt de invoegvolgorde van de
 * eerste rij per maand aan; gebruik `latestSnapshotPerMonth` voor een oplopende
 * reeks.
 */
export function dedupeSnapshotsByMonth<T extends MonthKeyedSnapshot>(
  rows: readonly T[],
): Map<string, T> {
  const byMonth = new Map<string, T>()
  for (const row of rows) {
    const snapshotDate = String(row.snapshot_date)
    const month = snapshotDate.slice(0, 7)
    const current = byMonth.get(month)
    // `>=`: bij oplopende invoer wint de laatste write, anders de laatste datum.
    if (!current || snapshotDate >= String(current.snapshot_date)) {
      byMonth.set(month, row)
    }
  }
  return byMonth
}

/** De winnende rij per kalendermaand, oplopend op `snapshot_date`. */
export function latestSnapshotPerMonth<T extends MonthKeyedSnapshot>(rows: readonly T[]): T[] {
  return [...dedupeSnapshotsByMonth(rows).values()].sort((a, b) =>
    String(a.snapshot_date).localeCompare(String(b.snapshot_date)),
  )
}
