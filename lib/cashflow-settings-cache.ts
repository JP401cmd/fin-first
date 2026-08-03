// lib/cashflow-settings-cache.ts
//
// Korte, per-gebruiker TTL-cache voor `CashflowSettingsData` — de bundel die
// `GET /api/overzicht/cashflow-settings` levert aan het instellingen-blok onderaan
// /overzicht/cashflow.
//
// Aanleiding (perf Task 2.2): dat blok is `ssr:false` en staat onder de vouw, maar
// zijn data (`loadCashflowSettingsData` → `loadCoreData`, ~25 queries in twee
// seriële golven) werd tóch in het hub-request meegeladen en hield daarmee de hele
// pagina op. De data is nu lazy en komt via deze route binnen zodra het blok in
// beeld scrollt. Zonder cache betaalt élk hub-bezoek waarbij de gebruiker naar
// beneden scrolt die ~25 queries opnieuw — React `cache()` overleeft geen
// request-grens.
//
// Spiegel van lib/cashflow-status-cache.ts en lib/page-status/status-cache.ts:
// zelfde vorm, zelfde TTL, bewust geen vierde variant met eigen semantiek.
//
// WAAROM SERVER-SIDE EN NIET IN DE BROWSER. Een module-level cache in het
// client-eiland zou de netwerk-roundtrip óók besparen, maar overleeft een
// uitlog/inlog in hetzelfde tabblad: `app/logout/page.tsx` doet `router.replace`
// en de loginpagina `router.push` — beide client-side navigaties, dus de
// JS-modulegraaf blijft in leven. Binnen het TTL-venster zou gebruiker B dan het
// inkomen/uitgaven-blok van gebruiker A te zien krijgen. Hier zit de user-id
// verplicht in de sleutel, dus dat kan per constructie niet.
//
// GEEN expliciete invalidatie: de Map leeft per lambda-instance, dus een
// mutatie-getriggerde purge werkt niet cross-instance en zou schijnzekerheid
// geven. Een verse profiel-/budgetmutatie toont maximaal één TTL-venster een
// verouderd bedrag; het blok schrijft zijn eigen wijzigingen optimistisch weg
// (`recomputeTriple` + PUT /api/parameters), dus de gebruiker ziet zijn eigen
// bewerking meteen.

import type { CashflowSettingsData } from '@/lib/cashflow-settings-data'

/** Time-to-live van een cache-entry (ms). Gelijk aan de twee zuster-caches. */
export const CASHFLOW_SETTINGS_CACHE_TTL_MS = 45_000

interface CacheEntry {
  data: CashflowSettingsData
  expiresAt: number
}

const store = new Map<string, CacheEntry>()

/** Bouw de cache-sleutel — bevat altijd de user-id (cross-account-isolatie). */
export function cashflowSettingsCacheKey(userId: string): string {
  return userId
}

/**
 * Uitkomst van een cache-lezing. Discriminated union zoals de status-cache:
 * `null` is hier geen geldige gecachete waarde (een gebruiker zonder sessie komt
 * nooit tot een schrijfactie), dus `hit: true` gárandeert data.
 */
export type CashflowSettingsCacheRead =
  | { hit: true; data: CashflowSettingsData }
  | { hit: false; data: null }

/**
 * Lees een cache-entry. `hit` is alleen true als de entry bestaat én niet
 * verlopen is; verlopen entries worden meteen opgeruimd.
 */
export function readCashflowSettingsCache(
  key: string,
  now: number = Date.now(),
): CashflowSettingsCacheRead {
  const entry = store.get(key)
  if (!entry) return { hit: false, data: null }
  if (entry.expiresAt <= now) {
    store.delete(key)
    return { hit: false, data: null }
  }
  return { hit: true, data: entry.data }
}

/** Schrijf een cache-entry met TTL vanaf `now`. */
export function writeCashflowSettingsCache(
  key: string,
  data: CashflowSettingsData,
  now: number = Date.now(),
  ttlMs: number = CASHFLOW_SETTINGS_CACHE_TTL_MS,
): void {
  store.set(key, { data, expiresAt: now + ttlMs })
}

/** Alleen voor tests: wist de volledige cache. */
export function __resetCashflowSettingsCache(): void {
  store.clear()
}
