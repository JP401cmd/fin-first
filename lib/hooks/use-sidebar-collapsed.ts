/**
 * Onderdeel van de new-navigation-shell. Plan: docs/navigatie-redesign-plan.md §3
 *
 * AANTEKENING (bevinding M13, 28-08-2026) — deze kop zei tot vandaag "SANDBOX /
 * Fase 0 … achter feature-flag in productie. Voor nu: alleen sandbox-test."
 * Dat klopte niet meer: de hook wordt onvoorwaardelijk gebruikt door de live
 * `Sidebar` (via `responsive-shell.tsx`) en er is geen feature-flag te vinden.
 * De tekst is bijgewerkt, het gedrag bewust niet — dit was een documentatie-
 * drift, geen defect. Diezelfde sandbox-kop staat nog op meer shell-bestanden
 * (o.a. `top-bar.tsx`); die zijn hier niet meegenomen.
 *
 * De ingeklapt-stand is bewust PER APPARAAT (localStorage): het is een
 * ruimtekeuze op dít scherm, geen profielvoorkeur die mee hoort te reizen.
 * Voorkeuren die wél cross-device gelden staan op de eigen profielrij.
 */
'use client'

import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'fintwo:sidebar-collapsed'
const STORAGE_EVENT = 'storage'

/**
 * Lees de huidige collapsed-waarde uit localStorage. Defensief tegen SSR
 * (typeof window === 'undefined') en geblokkeerde-storage uitzonderingen
 * (private-mode in oude browsers).
 */
function readStored(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * SSR-safe snapshot: server geeft altijd `false` (expanded) terug zodat
 * server- en eerste-client-render overeenkomen. Hydratie pakt direct de
 * localStorage-waarde via useSyncExternalStore.
 */
function getServerSnapshot(): boolean {
  return false
}

/**
 * Subscribe op storage-events zodat collapse-state synchroniseert tussen
 * tabs (extra-feature, geen vereiste). useSyncExternalStore vereist een
 * subscribe-callback met een unsubscribe-return.
 */
function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(STORAGE_EVENT, callback)
  return () => window.removeEventListener(STORAGE_EVENT, callback)
}

/**
 * Sidebar collapse-state met localStorage-persistence per device.
 * Gebruikt `useSyncExternalStore` om SSR-mismatch te voorkomen zonder
 * de "set-state-in-effect"-anti-pattern te triggeren.
 */
export function useSidebarCollapsed(): [boolean, (value: boolean) => void] {
  // useSyncExternalStore garandeert dat de server-snapshot (`false`) op de
  // server gebruikt wordt, terwijl de client direct na hydratie de echte
  // localStorage-waarde leest. Geen useEffect-roundtrip nodig.
  const collapsed = useSyncExternalStore(subscribe, readStored, getServerSnapshot)

  const setCollapsed = useCallback((value: boolean) => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(STORAGE_KEY, String(value))
      // useSyncExternalStore observeert het 'storage'-event, dat alleen
      // vuurt voor *andere* tabs. Voor de huidige tab moeten we expliciet
      // dispatchen zodat dezelfde tab z'n eigen update direct ziet.
      window.dispatchEvent(new StorageEvent(STORAGE_EVENT, { key: STORAGE_KEY, newValue: String(value) }))
    } catch {
      /* localStorage unavailable */
    }
  }, [])

  return [collapsed, setCollapsed]
}
