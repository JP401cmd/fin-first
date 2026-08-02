// lib/cashflow-status-cache.ts
//
// Korte, per-gebruiker+perspectief TTL-cache voor de vier cashflow-KAARTSTATUSSEN
// die `GET /api/overzicht/cashflow-status` levert (de sidebar-status-dots onder
// Cashflow).
//
// Aanleiding (perf): die route draait loadDashboardData + loadCashflowData +
// loadVasteLastenSummary — tientallen Supabase-roundtrips plus de volledige
// recurring-detectie — om VIER statuskleuren te leveren. De cashflow-pagina heeft
// datzelfde werk net server-side gedaan, maar React `cache()` overleeft geen
// request-grens: de client-hook (lib/hooks/use-cashflow-card-statuses.ts) fetcht
// ná hydratie en herhaalt dus de hele last, zonder enig hergebruik.
//
// Deze cache vouwt herhaalde reads binnen een kort venster samen — spiegel van
// lib/page-status/status-cache.ts (zelfde vorm, zelfde TTL), bewust GEEN tweede
// variant. Staleness op een statuskleur is akkoord: hetzelfde besluit als bij de
// status-duiding-banner. Een mutatie op transacties/recurrings/budgets toont
// maximaal één TTL-venster een verouderde dot — een zwakker signaal dan de banner.
//
// GEEN expliciete invalidatie: de Map leeft per lambda-instance, dus een
// mutatie-getriggerde purge werkt niet cross-instance en zou schijnzekerheid
// geven.
//
// Reikwijdte: dit lost het TWEEDE bezoek op, niet het eerste. De eerste hit per
// gebruiker per TTL blijft even duur tot de route zelf op een slankere loader
// staat.
//
// Cross-account-veiligheid: de sleutel bevat ALTIJD de user-id én het perspectief
// (een perspectiefwissel levert per definitie verse statussen). Een entry kan dus
// nooit naar een andere gebruiker of een ander perspectief lekken; entries
// verlopen vanzelf, dus een logout hoeft de cache niet te wissen.

import type { CashflowCardStatuses } from '@/lib/cashflow-cards'

/** Time-to-live van een cache-entry (ms). Gelijk aan de page-status-cache. */
export const CASHFLOW_STATUS_CACHE_TTL_MS = 45_000

interface CacheEntry {
  statuses: CashflowCardStatuses
  expiresAt: number
}

const store = new Map<string, CacheEntry>()

/** Bouw de cache-sleutel — bevat altijd de user-id (cross-account-isolatie). */
export function cashflowStatusCacheKey(userId: string, perspective: string): string {
  return `${userId}::${perspective}`
}

/**
 * Uitkomst van een cache-lezing. Bewust een discriminated union: anders dan de
 * page-status-cache (waar `null` een geldige gecachete waarde is) betekent
 * "geen statussen" hier altijd een miss — `hit: true` gárandeert dus statussen.
 */
export type CashflowStatusCacheRead =
  | { hit: true; statuses: CashflowCardStatuses }
  | { hit: false; statuses: null }

/**
 * Lees een cache-entry. `hit` is alleen true als de entry bestaat én niet
 * verlopen is; verlopen entries worden meteen opgeruimd.
 */
export function readCashflowStatusCache(
  key: string,
  now: number = Date.now(),
): CashflowStatusCacheRead {
  const entry = store.get(key)
  if (!entry) return { hit: false, statuses: null }
  if (entry.expiresAt <= now) {
    store.delete(key)
    return { hit: false, statuses: null }
  }
  return { hit: true, statuses: entry.statuses }
}

/** Schrijf een cache-entry met TTL vanaf `now`. */
export function writeCashflowStatusCache(
  key: string,
  statuses: CashflowCardStatuses,
  now: number = Date.now(),
  ttlMs: number = CASHFLOW_STATUS_CACHE_TTL_MS,
): void {
  store.set(key, { statuses, expiresAt: now + ttlMs })
}

/** Alleen voor tests: wist de volledige cache. */
export function __resetCashflowStatusCache(): void {
  store.clear()
}
