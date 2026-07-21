// lib/page-status/status-cache.ts
//
// Korte, per-gebruiker+perspectief+route TTL-cache voor de SERVER-berekende
// status-duiding (PageStatusInfo) van de CASHFLOW-familie.
//
// Aanleiding (perf): de vier cashflow-subpagina's (budget/transacties/
// vaste-lasten/forecast) seeden hun page-status NIET server-side (hun server-page
// SSR-laadt andere loaders → geen React-cache()-overlap). Elke subnavigatie
// her-fetcht daardoor via GET /api/overzicht/page-status → computePageStatusInfo,
// dat loadDashboardData + loadCashflowData + loadVasteLastenSummary draait (zwaar).
// Snel heen-en-weer klikken tussen subpagina's herhaalt die zware load telkens.
//
// Deze cache vouwt herhaalde reads binnen een kort venster samen. Staleness op een
// DUIDINGS-banner is akkoord (kaart-besluit): de escalatie-heropening blijft
// client-side werken en de per-gebruiker "geminimaliseerd"-voorkeur wordt NOOIT
// gecachet — die leest de route altijd vers.
//
// Cross-account-veiligheid: de sleutel bevat ALTIJD user.id (én perspectief), dus
// een entry kan nooit naar een andere gebruiker lekken. Entries verlopen na de
// TTL, dus een logout hoeft de cache niet te wissen (de volgende gebruiker heeft
// een andere sleutel; oude entries vervallen vanzelf). Alleen cashflow-routes
// worden gecachet — de lichte 'lever'/'box2'-families en de 'freedom'-root (die
// al server-side geseed wordt) blijven ongemoeid.

import type { PageStatusInfo } from '@/lib/page-status/types'

/** Time-to-live van een cache-entry (ms). Binnen 30–60s-venster uit de kaart. */
export const STATUS_CACHE_TTL_MS = 45_000

interface CacheEntry {
  info: PageStatusInfo | null
  expiresAt: number
}

const store = new Map<string, CacheEntry>()

/** Bouw de cache-sleutel — bevat altijd user.id (cross-account-isolatie). */
export function statusCacheKey(
  userId: string,
  perspective: string,
  route: string,
): string {
  return `${userId}::${perspective}::${route}`
}

/**
 * Lees een cache-entry. `hit` is alleen true als de entry bestaat én niet
 * verlopen is; verlopen entries worden meteen opgeruimd.
 */
export function readStatusCache(
  key: string,
  now: number = Date.now(),
): { hit: boolean; info: PageStatusInfo | null } {
  const entry = store.get(key)
  if (!entry) return { hit: false, info: null }
  if (entry.expiresAt <= now) {
    store.delete(key)
    return { hit: false, info: null }
  }
  return { hit: true, info: entry.info }
}

/** Schrijf een cache-entry met TTL vanaf `now`. */
export function writeStatusCache(
  key: string,
  info: PageStatusInfo | null,
  now: number = Date.now(),
  ttlMs: number = STATUS_CACHE_TTL_MS,
): void {
  store.set(key, { info, expiresAt: now + ttlMs })
}

/** Alleen voor tests: wist de volledige cache. */
export function __resetStatusCache(): void {
  store.clear()
}
