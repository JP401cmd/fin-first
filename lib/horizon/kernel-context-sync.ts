/**
 * Kernel-context-synchronisatie voor /toekomst (Task 1.3 — kernel-context-dedupe).
 *
 * De horizon-client seedt zijn kernel-context (rauwe profielrij + AOW-tabel) uit
 * `initialData` (server-side geleverd) en verversde die vroeger ALTIJD via een
 * mount-fetch (`loadKernelContext`) met verse object-referenties — óók wanneer de
 * data identiek was. Omdat `kernelRawProfile` en `aowRows` deps zijn van de
 * kernel-input-memo (`use-horizon-fire-sim`), leverde die tweede setState een
 * gegarandeerde TWEEDE volledige FIRE-solve op.
 *
 * Deze pure helpers maken de twee beslissingen los-testbaar:
 *  1. `shouldSkipKernelContextFetch` — mag de mount-fetch volledig overgeslagen
 *     worden (server leverde de complete context)?
 *  2. `keepRefIfEqual` — de referentie-behoudende guard voor het fallback-pad:
 *     identieke (deep-equal) data levert de VORIGE referentie op, zodat de
 *     memo niet herrekent (geen re-solve).
 */

import type { AowLeeftijdRow } from '@/lib/aow-leeftijd'
import type { ConvergentieRawProfileRow } from '@/lib/horizon-kernel/convergentie-router'

/** Minimale vorm die de skip-conditie nodig heeft (subset van HorizonPageData). */
export interface KernelContextSeed {
  rawProfile: ConvergentieRawProfileRow | null
  aowRows: AowLeeftijdRow[] | null | undefined
}

/**
 * True wanneer de server de VOLLEDIGE kernel-context al meelevert — een rauwe
 * profielrij én een gevulde AOW-tabel. Dan is de eerste render meteen compleet
 * en mag de mount-fetch (`loadKernelContext`) volledig worden overgeslagen, wat
 * de gegarandeerde tweede kernel-solve wegneemt.
 *
 * Een lege/ontbrekende AOW-tabel (legacy DB) of een gefaalde profiel-query
 * (`rawProfile === null`) → false: de client valt terug op de mount-fetch, nu
 * met een structurele-gelijkheidsguard (`keepRefIfEqual`).
 */
export function shouldSkipKernelContextFetch(seed: KernelContextSeed): boolean {
  return seed.rawProfile != null && (seed.aowRows?.length ?? 0) > 0
}

/**
 * Structurele diepe gelijkheid voor JSON-serialiseerbare data (de kernel-context
 * bevat alleen primitieven, arrays en plain objects — profielrij + AOW-rijen).
 * Bewust géén externe dependency: klein, deterministisch, en genoeg voor deze
 * vorm. NaN-gelijkheid is niet relevant voor deze data.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (a === null || b === null) return a === b
  if (typeof a !== 'object') return false

  const aIsArray = Array.isArray(a)
  const bIsArray = Array.isArray(b)
  if (aIsArray !== bIsArray) return false

  if (aIsArray && bIsArray) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }

  const aObj = a as Record<string, unknown>
  const bObj = b as Record<string, unknown>
  const aKeys = Object.keys(aObj)
  const bKeys = Object.keys(bObj)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false
    if (!deepEqual(aObj[key], bObj[key])) return false
  }
  return true
}

/**
 * Referentie-behoudende guard voor een setState-updater: geeft `prev` terug
 * wanneer `next` er structureel gelijk aan is (React bailt dan uit — geen
 * re-render, geen re-solve), en anders `next`.
 *
 * Gebruik: `setAowRows(prev => keepRefIfEqual(prev, verseRijen))`.
 */
export function keepRefIfEqual<T>(prev: T, next: T): T {
  return deepEqual(prev, next) ? prev : next
}
