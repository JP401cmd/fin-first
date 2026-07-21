// lib/snapshot-daystamp.ts
//
// Pure dagstempel-logica voor de auto-snapshot-throttle (use-auto-snapshot.ts).
//
// De auto-snapshot moet 1×/UTC-dag draaien. use-auto-snapshot heeft al een
// module-level dag-guard (in-memory: 1× per JS-context), maar een HARDE reload
// start een nieuw JS-context waarin die guard leeg is → de (goedkope, server-
// gegate) roundtrip vuurt dan opnieuw. Een localStorage-dagstempel overleeft de
// reload en bespaart die no-op-call. De server-side dag-gate blijft de échte
// garantie dat er niet dubbel wordt weggeschreven.

/** localStorage-sleutel voor de laatst-geslaagde auto-snapshot-dag (UTC). */
export const AUTO_SNAPSHOT_DAY_KEY = 'trifinity:auto-snapshot-day'

/** UTC-dagstempel `YYYY-MM-DD` voor een datum (default: nu). */
export function utcDayStamp(date: Date = new Date()): string {
  return date.toISOString().split('T')[0]
}

/**
 * Beslis of de auto-snapshot-roundtrip overgeslagen mag worden.
 *
 * - `moduleDay`  = de in-memory module-guard (laatste dag deze JS-context).
 * - `storedDay`  = de localStorage-dagstempel (laatste GESLAAGDE roundtrip).
 * - `today`      = de huidige UTC-dagstempel.
 *
 * Overslaan zodra één van beide al op vandaag staat. Bij een dag-rollover (UTC)
 * matcht geen van beide → de snapshot draait weer (dagelijkse garantie).
 */
export function shouldSkipAutoSnapshot(
  moduleDay: string | null,
  storedDay: string | null,
  today: string,
): boolean {
  return moduleDay === today || storedDay === today
}
