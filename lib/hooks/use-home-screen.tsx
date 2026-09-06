'use client'

/**
 * Homescherm-keuze — Overzicht ⇄ Budgetteren als startscherm.
 *
 * Eén profiel-brede voorkeur die bepaalt waar een "ga naar hoofdscherm"-
 * navigatie landt: /overzicht (default) of /overzicht/budget.
 * Waarden + routes zijn canoniek in `lib/home-screen.ts`; deze hook levert
 * naast de keuze ook de afgeleide `homeHref` zodat consumers (top-bar ←,
 * long-press op de waffle) nooit zelf een route hoeven te mappen.
 *
 * SINGLE SOURCE OF TRUTH: élke client-consumer leest `useHomeScreen()`.
 * Server-side consumers (edge-middleware, layout-seed) lezen de kolom direct —
 * er is bewust géén tweede client-leespad of localStorage-spiegel.
 *
 * Cross-device, server-side: de voorkeur staat op `profiles.home_screen` en de
 * provider wordt met `initialHomeScreen` uit een SERVER-PROP geseed (zie
 * app/(app)/layout.tsx) zodat SSR en eerste client-render meteen kloppen.
 *
 * Persistentie = euro-view-stijl: optimistisch state zetten, dan een
 * fire-and-forget PUT naar /api/home-screen; bij een niet-ok response (of
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
import {
  DEFAULT_HOME_SCREEN,
  HOME_SCREEN_HREFS,
  type HomeScreen,
} from '@/lib/home-screen'

export type { HomeScreen }

interface HomeScreenContextValue {
  /** Huidige profiel-brede homescherm-keuze. */
  homeScreen: HomeScreen
  /** De route die bij de keuze hoort — consumeer deze, map nooit zelf. */
  homeHref: string
  /** Zet een specifieke keuze (optimistisch + server-persist met rollback). */
  setHomeScreen: (next: HomeScreen) => void
  /** Flip tussen 'overzicht' en 'budget'. */
  toggle: () => void
}

const HomeScreenContext = createContext<HomeScreenContextValue | null>(null)

/**
 * Persisteer de keuze naar de eigen profielrij. Fire-and-forget vanuit de
 * caller; geeft `true` bij succes zodat de caller bij falen kan terugrollen.
 */
async function persistHomeScreen(screen: HomeScreen): Promise<boolean> {
  try {
    const res = await fetch('/api/home-screen', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ screen }),
      keepalive: true,
    })
    return res.ok
  } catch {
    return false
  }
}

export function HomeScreenProvider({
  initialHomeScreen,
  children,
}: {
  initialHomeScreen: HomeScreen
  children: ReactNode
}) {
  // Seed uit de server-prop (NIET altijd-default) zodat SSR == client → geen flash.
  const [homeScreen, setHomeScreenState] = useState<HomeScreen>(initialHomeScreen)

  const setHomeScreen = useCallback((next: HomeScreen) => {
    setHomeScreenState((prev) => {
      if (next === prev) return prev
      // Optimistisch zetten; bij een mislukte PUT terugrollen naar `prev`.
      void persistHomeScreen(next).then((ok) => {
        if (!ok) setHomeScreenState(prev)
      })
      return next
    })
  }, [])

  const toggle = useCallback(() => {
    setHomeScreen(homeScreen === 'overzicht' ? 'budget' : 'overzicht')
  }, [homeScreen, setHomeScreen])

  const value = useMemo<HomeScreenContextValue>(
    () => ({
      homeScreen,
      homeHref: HOME_SCREEN_HREFS[homeScreen],
      setHomeScreen,
      toggle,
    }),
    [homeScreen, setHomeScreen, toggle],
  )

  return <HomeScreenContext.Provider value={value}>{children}</HomeScreenContext.Provider>
}

// Veilige fallback buiten een provider (unit-tests, storybook, dev-sandboxes):
// 'overzicht' + no-op setters, zoals use-euro-view. Dit is bewust óók de
// regressiegarantie: bestaande component-tests draaien zonder provider en zien
// dus exact het huidige gedrag (home = /overzicht).
const FALLBACK_CONTEXT: HomeScreenContextValue = {
  homeScreen: DEFAULT_HOME_SCREEN,
  homeHref: HOME_SCREEN_HREFS[DEFAULT_HOME_SCREEN],
  setHomeScreen: () => {},
  toggle: () => {},
}

/** Access de huidige homescherm-keuze. Buiten een provider: 'overzicht' + no-ops. */
export function useHomeScreen(): HomeScreenContextValue {
  return useContext(HomeScreenContext) ?? FALLBACK_CONTEXT
}
