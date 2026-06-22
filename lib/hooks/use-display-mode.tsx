'use client'

/**
 * Weergavemodus — "Eenvoudig" ⇄ "Volledig" voor heel TriFinity.
 *
 * Eén profiel-brede voorkeur (`mode`) die de "diepte"-laag van de UI aanstuurt:
 *   'simple' → DepthSection's standaard ingeklapt (rustig, beginnervriendelijk).
 *   'full'   → diepte-secties standaard open (expert).
 *
 * SINGLE SOURCE OF TRUTH: élke consumer leest `useDisplayMode()`. Er is bewust
 * GÉÉN tweede leespad (geen localStorage-spiegel, geen prop-drilling van de raw
 * waarde) — dat zou exact de drift introduceren die CLAUDE.md verbiedt.
 *
 * Cross-device, server-side: anders dan `use-privacy` (apparaat-lokaal,
 * localStorage) staat deze modus op de eigen `profiles`-rij. De provider wordt
 * met `initialMode` uit een SERVER-PROP geseed (zie app/(app)/layout.tsx) zodat
 * SSR en eerste client-render meteen kloppen — geen flash/hydration-mismatch.
 *
 * Persistentie = page-status-stijl: optimistisch state zetten, dan een
 * fire-and-forget PUT naar /api/display-mode; bij een niet-ok response (of
 * netwerkfout) rolt de state terug naar de vorige waarde.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

export type DisplayMode = 'simple' | 'full'

interface DisplayModeContextValue {
  /** Huidige profiel-brede weergavemodus. */
  mode: DisplayMode
  /** Zet een specifieke modus (optimistisch + server-persist met rollback). */
  setMode: (next: DisplayMode) => void
  /** Flip tussen 'simple' en 'full'. */
  toggle: () => void
}

const DisplayModeContext = createContext<DisplayModeContextValue | null>(null)

/**
 * Persisteer de modus naar de eigen profielrij. Fire-and-forget vanuit de
 * caller; geeft `true` bij succes zodat de caller bij falen kan terugrollen.
 */
async function persistMode(mode: DisplayMode): Promise<boolean> {
  try {
    const res = await fetch('/api/display-mode', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode }),
      keepalive: true,
    })
    return res.ok
  } catch {
    return false
  }
}

export function DisplayModeProvider({
  initialMode,
  children,
}: {
  initialMode: DisplayMode
  children: ReactNode
}) {
  // Seed uit de server-prop (NIET altijd-default) zodat SSR == client → geen flash.
  const [mode, setModeState] = useState<DisplayMode>(initialMode)

  const setMode = useCallback((next: DisplayMode) => {
    setModeState((prev) => {
      if (next === prev) return prev
      // Optimistisch zetten; bij een mislukte PUT terugrollen naar `prev`.
      void persistMode(next).then((ok) => {
        if (!ok) setModeState(prev)
      })
      return next
    })
  }, [])

  const toggle = useCallback(() => {
    setMode(mode === 'simple' ? 'full' : 'simple')
  }, [mode, setMode])

  const value = useMemo<DisplayModeContextValue>(
    () => ({ mode, setMode, toggle }),
    [mode, setMode, toggle],
  )

  return (
    <DisplayModeContext.Provider value={value}>
      {children}
    </DisplayModeContext.Provider>
  )
}

// Veilige fallback buiten een provider (unit-tests, storybook, dev-sandboxes):
// 'simple' + no-op setters, zoals use-privacy. De echte provider hangt in de
// authenticated app-layout zodat alle echte routes de live, geseede modus krijgen.
const FALLBACK_CONTEXT: DisplayModeContextValue = {
  mode: 'simple',
  setMode: () => {},
  toggle: () => {},
}

/** Access de huidige weergavemodus. Buiten een provider: 'simple' + no-ops. */
export function useDisplayMode(): DisplayModeContextValue {
  return useContext(DisplayModeContext) ?? FALLBACK_CONTEXT
}
