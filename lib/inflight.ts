/**
 * inflight — concurrency-dedupe voor client-side fetches.
 *
 * Terwijl een aanroep voor `key` "in de lucht" is, krijgt elke volgende aanroep
 * met dezelfde `key` DEZELFDE promise terug — er gaat dus maar één netwerk-
 * roundtrip uit, hoe vaak de aanroeper ook (gelijktijdig) mount. De entry wordt
 * gewist zodra de promise settelt, zodat een LATERE aanroep gewoon opnieuw
 * fetcht.
 *
 * Bewust GEEN tijd-gebaseerde cache: dit dedupe't alleen gelijktijdige calls,
 * niet over de tijd. Zo kan er nooit stale data van een vórige gebruiker blijven
 * hangen na een same-tab logout→login (cross-account-lek) — precies dezelfde
 * reden waarom use-page-status geen module-level cache heeft.
 *
 * Gebruik:
 *   const data = await inflight(`news-peek`, () => fetch('/api/news?peek=1').then(r => r.json()))
 *
 * Structurele aanleiding (perf fase 1): de dubbele shell-render (desktop- +
 * mobiel-tak beide gemount pre-hydratie) en hook-aanroepen die per rij herhalen
 * (bv. useNewsUnread in elke sidebar-"overige"-rij) vuurden identieke fetches
 * meermaals per pageload af. Deze helper vouwt die samen tot één.
 */

const pending = new Map<string, Promise<unknown>>()

export function inflight<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = pending.get(key)
  if (existing) return existing as Promise<T>

  const p = (async () => {
    try {
      return await factory()
    } finally {
      // Wis pas ná settle: gelijktijdige aanroepers delen deze promise; een
      // aanroep ná settle fetcht vers.
      pending.delete(key)
    }
  })()

  pending.set(key, p)
  return p
}

/** Alleen voor tests: wist de in-flight-registratie. */
export function __resetInflight(): void {
  pending.clear()
}
