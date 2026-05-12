'use client'

/**
 * Toggle-state voor de mobiele apps-strip boven de bottom-nav (Kern-module).
 * Default dicht; long-press op de Kern-tab in `BottomNavTabs` toggelt
 * (op `/core/**`) of forceert open (vanaf andere modules, met automatische
 * navigatie naar `/core`). State leeft per browser-tab via sessionStorage —
 * past bij andere session-scoped nav-state (NavStackProvider) maar zonder
 * de stack-logica te belasten met een UI-toggle.
 *
 * Implementatie: module-level external store + `useSyncExternalStore` voor
 * SSR-safe reactivity. Hydrate uit sessionStorage gebeurt one-shot via
 * `useEffect` op de Provider; de store notifyt zelf alle subscribers wanneer
 * de waarde verandert. Hierdoor geen lokale setState-in-effect (zou de
 * `react-hooks/set-state-in-effect` lint-regel triggeren) en geen flash van
 * een omgekeerde state tijdens hydrate.
 *
 * Hook returneert een veilige fallback (`{ isOpen: false, toggle/setOpen
 * noop }`) wanneer er geen Provider in de tree zit (oude shell, desktop-only
 * paden) zodat consumenten geen runtime-crash krijgen.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

const STORAGE_KEY = 'fin:mobile-app-strip-open'

type MobileAppStripState = {
  isOpen: boolean
  toggle: () => void
  setOpen: (open: boolean) => void
}

const FALLBACK: MobileAppStripState = {
  isOpen: false,
  toggle: () => {},
  setOpen: () => {},
}

// Module-level external store. Single source of truth — meerdere Providers
// (sandbox + production tree, of hot-reload) delen dezelfde waarde, wat exact
// is wat we willen voor een UI-toggle die sessionStorage backed is.
const store = {
  value: false,
  hydrated: false,
  listeners: new Set<() => void>(),
}

function readFromSessionStorage(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeToSessionStorage(open: boolean) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, open ? 'true' : 'false')
  } catch {
    // sessionStorage kan onbeschikbaar zijn (private mode, embedded contexts)
  }
}

function notify() {
  store.listeners.forEach((listener) => listener())
}

function hydrateOnce() {
  if (store.hydrated || typeof window === 'undefined') return
  store.hydrated = true
  const stored = readFromSessionStorage()
  if (store.value !== stored) {
    store.value = stored
    notify()
  }
}

function setStoreOpen(open: boolean) {
  if (store.value === open) return
  store.value = open
  writeToSessionStorage(open)
  notify()
}

function subscribe(callback: () => void): () => void {
  store.listeners.add(callback)
  return () => {
    store.listeners.delete(callback)
  }
}

function getSnapshot(): boolean {
  return store.value
}

function getServerSnapshot(): boolean {
  return false
}

const MobileAppStripContext = createContext<MobileAppStripState>(FALLBACK)

export function MobileAppStripProvider({ children }: { children: ReactNode }) {
  const isOpen = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // One-shot hydrate: muteer de module-level store en notify subscribers.
  // useSyncExternalStore krijgt via z'n eigen subscribe-callback de nieuwe
  // snapshot — geen lokale setState, dus geen cascading-render warning.
  useEffect(() => {
    hydrateOnce()
  }, [])

  const toggle = useCallback(() => setStoreOpen(!store.value), [])
  const setOpen = useCallback((open: boolean) => setStoreOpen(open), [])

  const value = useMemo<MobileAppStripState>(
    () => ({ isOpen, toggle, setOpen }),
    [isOpen, toggle, setOpen],
  )

  return (
    <MobileAppStripContext.Provider value={value}>
      {children}
    </MobileAppStripContext.Provider>
  )
}

export function useMobileAppStripState(): MobileAppStripState {
  return useContext(MobileAppStripContext)
}
