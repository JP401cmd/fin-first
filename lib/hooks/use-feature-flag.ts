/**
 * Fase 0.2 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §2.2, §3.1, §4.1
 * Achter feature-flag `new_navigation_shell`. Bij flag uit = oude shell.
 *
 * Eenvoudige client-side feature-flag-hook met `localStorage`-fallback voor dev.
 * SSR-safe via `useSyncExternalStore` — server-snapshot is altijd `false` zodat
 * server- en eerste-client-render overeenkomen, en pas na hydratie de echte
 * waarde uit localStorage wordt gelezen. Voorkomt zo flicker / hydration-mismatch.
 *
 * Gebruikte conventies (zelfde als use-sidebar-collapsed.ts):
 *   - Storage-prefix `fintwo:flag:` om collisions met andere keys te voorkomen.
 *   - Storage-event als subscribe-bron: cross-tab sync (extra-feature, geen vereiste).
 *   - Same-tab dispatch via `dispatchEvent(new StorageEvent(...))` zodat de
 *     huidige tab haar eigen update direct ziet (storage-event vuurt normaal
 *     alleen voor *andere* tabs).
 *   - Try/catch rond elke localStorage-call om in private-mode oude browsers
 *     niet te crashen.
 *
 * Voor productie-rollout (post-Fase 4) kan dit hook vervangen worden door een
 * server-side feature-flag-resolver (bv. Supabase profile-prefs) zonder dat
 * de aanroepende code hoeft te veranderen.
 */
'use client'

import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_PREFIX = 'fintwo:flag:'
const STORAGE_EVENT = 'storage'

/**
 * Lees de huidige waarde van een feature-flag uit localStorage.
 * Defensief tegen SSR (`window === undefined`) en geblokkeerde-storage
 * uitzonderingen (private-mode in oude browsers).
 */
function getStored(flag: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + flag) === 'true'
  } catch {
    return false
  }
}

/**
 * SSR-safe snapshot: server geeft altijd `false` (flag uit) terug zodat
 * server- en eerste-client-render overeenkomen. Hydratie pakt direct de
 * localStorage-waarde via useSyncExternalStore.
 */
function getServerSnapshot(): boolean {
  return false
}

/**
 * Feature-flag hook met localStorage-persistence.
 *
 * Returned tuple:
 *   [enabled, setEnabled] — `enabled` is reactief op storage-events
 *   (cross-tab + same-tab via dispatchEvent), `setEnabled` schrijft naar
 *   localStorage en notificeert subscribers.
 *
 * Gebruik:
 *   const [enabled, setEnabled] = useFeatureFlag('new_navigation_shell')
 *
 * @param flag - de naam van de feature-flag (zonder prefix)
 */
export function useFeatureFlag(flag: string): [boolean, (value: boolean) => void] {
  // Subscribe op storage-events zodat de hook reageert op flag-mutaties
  // vanuit andere tabs én vanuit dezelfde tab (via dispatchEvent in setStored).
  // useCallback zodat de subscribe-referentie stabiel is per `flag`.
  const subscribe = useCallback((callback: () => void) => {
    if (typeof window === 'undefined') return () => {}
    window.addEventListener(STORAGE_EVENT, callback)
    return () => window.removeEventListener(STORAGE_EVENT, callback)
  }, [])

  // Closure over `flag` zodat useSyncExternalStore weet welke key te lezen.
  // useCallback houdt de getSnapshot-referentie stabiel zolang `flag` niet
  // verandert — vereist door useSyncExternalStore voor correct memoization.
  const getSnapshot = useCallback(() => getStored(flag), [flag])

  const enabled = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const setEnabled = useCallback((value: boolean) => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_PREFIX + flag, String(value))
      // Storage-event vuurt normaal alleen voor *andere* tabs — voor de
      // huidige tab dispatchen we 'm expliciet zodat subscribers in dezelfde
      // tab hun update direct krijgen.
      window.dispatchEvent(
        new StorageEvent(STORAGE_EVENT, {
          key: STORAGE_PREFIX + flag,
          newValue: String(value),
        }),
      )
    } catch {
      /* localStorage unavailable */
    }
  }, [flag])

  return [enabled, setEnabled]
}
