'use client'

/**
 * Euro-weergave — "toekomstige euro's" (nominaal) ⇄ "huidige euro's" (koopkracht).
 *
 * Eén profiel-brede voorkeur die bepaalt of geprojecteerde bedragen nominaal
 * (zoals de kernel ze rekent) of gedeflateerd naar koopkracht van vandaag
 * getoond worden. De deflatie zelf gebeurt aan de RENDER-grens met de
 * kernel-factor per rij — zie `lib/euro-display.ts`.
 *
 * SINGLE SOURCE OF TRUTH: élke consumer leest `useEuroView()`. Er is bewust
 * GÉÉN lokale override per component (geen eigen showReal-state meer) — twee
 * bronnen naast elkaar geven drift én, erger, dubbele deflatie.
 *
 * Cross-device, server-side: de voorkeur staat op `profiles.euro_view` en de
 * provider wordt met `initialView` uit een SERVER-PROP geseed (zie
 * app/(app)/layout.tsx) zodat SSR en eerste client-render meteen kloppen.
 *
 * Persistentie = display-mode-stijl: optimistisch state zetten, dan een
 * fire-and-forget PUT naar /api/euro-view; bij een niet-ok response (of
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
import type { EuroView } from '@/lib/euro-display'

export type { EuroView }

interface EuroViewContextValue {
  /** Huidige profiel-brede euro-weergave. */
  view: EuroView
  /** Zet een specifieke weergave (optimistisch + server-persist met rollback). */
  setView: (next: EuroView) => void
  /** Flip tussen 'nominal' en 'real'. */
  toggle: () => void
}

const EuroViewContext = createContext<EuroViewContextValue | null>(null)

/**
 * Persisteer de weergave naar de eigen profielrij. Fire-and-forget vanuit de
 * caller; geeft `true` bij succes zodat de caller bij falen kan terugrollen.
 */
async function persistView(view: EuroView): Promise<boolean> {
  try {
    const res = await fetch('/api/euro-view', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ view }),
      keepalive: true,
    })
    return res.ok
  } catch {
    return false
  }
}

export function EuroViewProvider({
  initialView,
  children,
}: {
  initialView: EuroView
  children: ReactNode
}) {
  // Seed uit de server-prop (NIET altijd-default) zodat SSR == client → geen flash.
  const [view, setViewState] = useState<EuroView>(initialView)

  const setView = useCallback((next: EuroView) => {
    setViewState((prev) => {
      if (next === prev) return prev
      // Optimistisch zetten; bij een mislukte PUT terugrollen naar `prev`.
      void persistView(next).then((ok) => {
        if (!ok) setViewState(prev)
      })
      return next
    })
  }, [])

  const toggle = useCallback(() => {
    setView(view === 'nominal' ? 'real' : 'nominal')
  }, [view, setView])

  const value = useMemo<EuroViewContextValue>(
    () => ({ view, setView, toggle }),
    [view, setView, toggle],
  )

  return <EuroViewContext.Provider value={value}>{children}</EuroViewContext.Provider>
}

// Veilige fallback buiten een provider (unit-tests, storybook, dev-sandboxes):
// 'nominal' + no-op setters, zoals use-display-mode. Dit is bewust óók de
// regressiegarantie: bestaande component-tests draaien zonder provider en zien
// dus exact het huidige, nominale beeld.
const FALLBACK_CONTEXT: EuroViewContextValue = {
  view: 'nominal',
  setView: () => {},
  toggle: () => {},
}

/** Access de huidige euro-weergave. Buiten een provider: 'nominal' + no-ops. */
export function useEuroView(): EuroViewContextValue {
  return useContext(EuroViewContext) ?? FALLBACK_CONTEXT
}
