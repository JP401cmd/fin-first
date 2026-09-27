// ── Service-worker: welke caches gebruikersinhoud kunnen dragen ──────────────
//
// Eén bron voor twee lezers die elkaar anders stil kwijtraken:
//   - `app/sw.ts` wist deze caches bij het activeren van een nieuwe worker, zodat
//     een al uitgerolde oude worker geen gerenderde pagina's laat staan;
//   - `lib/browser-account-storage.ts` wist ze bij elke identiteitswissel en elke
//     uitgang (uitloggen, overal uitloggen, account verwijderen, ander account).
//
// Waarom bestaat dit? Tot sep 2026 cachte de worker élke navigatie in
// `pages-cache` en serveerde hij na 3 s de vorige HTML — verouderde cijfers
// zonder dat iemand het zag, en gerenderde vermogens- en transactiecijfers die
// na uitloggen op het toestel bleven staan. Navigaties, RSC-verzoeken en
// cross-origin-verzoeken (Supabase) gaan nu NetworkOnly (besluit eigenaar
// 27 sep 2026: geen offline "laatste stand").
//
// Bewust GEEN import uit `@serwist/next/worker`: dit bestand zit ook in de
// clientbundel (via browser-account-storage) en moet dus afhankelijkheidsvrij
// blijven. De test legt de namen van Serwist's standaardcaches tegen
// `PAGES_CACHE_NAME`, zodat een Serwist-upgrade die ze hernoemt rood wordt.
//
// Houd dit bestand zonder `@/`-imports: `app/sw.ts` importeert het relatief, en
// relatief blijft werken ongeacht hoe de Serwist-CLI de worker bundelt.

/** De statische pagina die de worker toont als een navigatie offline mislukt. */
export const OFFLINE_URL = '/offline'

/**
 * Caches die gerenderde pagina's of RSC-payloads (en daarmee financiële cijfers)
 * kunnen bevatten. Statische caches (JS/CSS/fonts/afbeeldingen, precache) staan
 * hier bewust niet in: die zijn content-gehasht en bevatten niets van een account.
 */
export const USER_CONTENT_CACHE_NAMES = [
  // Onze eigen navigatiecache tot sep 2026 — wordt niet meer geschreven, maar staat
  // nog op toestellen met een oude worker.
  'pages-cache',
  // Serwist `defaultCache` (@serwist/next/worker → PAGES_CACHE_NAME).
  'pages-rsc-prefetch',
  'pages-rsc',
  'pages',
  // Serwist `defaultCache`: NetworkFirst-vangnet voor overige same-origin GET's.
  'others',
  // Serwist `defaultCache`: NetworkFirst voor élke cross-origin GET — daarmee ook
  // de directe Supabase-REST-reads uit clientcomponenten (RLS-gescoped, maar voor
  // elk account dezelfde URL). Sinds sep 2026 NetworkOnly in `app/sw.ts`.
  'cross-origin',
] as const

/**
 * IndexedDB-database waarin Serwist's ExpirationPlugin per cache de URL's met
 * een tijdstempel bijhoudt — paden en query-filters van eerder gecachete
 * verzoeken. Zonder de caches zelf is hij wees; de uitlogpurge gooit 'm weg.
 * Naam uit serwist (`CacheTimestampsModel`, DB_NAME).
 */
export const SW_EXPIRATION_DB_NAME = 'serwist-expiration'

/**
 * Wis alle caches met mogelijke gebruikersinhoud. Faal-zacht: de promise lost
 * altijd op, ook als Cache Storage ontbreekt (oude browser, onveilige context) of
 * een verwijdering weigert — in- en uitloggen mag hier nooit op stranden. Cache
 * Storage is per origin, dus dit raakt nooit caches van een andere site.
 */
export async function deleteUserContentCaches(
  storage: CacheStorage | undefined,
): Promise<void> {
  if (!storage) return
  await Promise.all(
    USER_CONTENT_CACHE_NAMES.map(async (name) => {
      try {
        await storage.delete(name)
      } catch {
        // Weigert de browser deze ene cache, dan gaan de andere gewoon door.
      }
    }),
  )
}
