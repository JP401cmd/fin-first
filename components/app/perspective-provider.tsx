'use client'

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Datacontract(en) wonen nu in @/lib/types/perspective (import-richting UI→lib).
import type { Perspective, PerspectiveOption } from '@/lib/types/perspective'
export type { Perspective, PerspectiveOption }

interface PerspectiveContextType {
  /** Current selected perspective */
  perspective: Perspective
  /** Whether user has household mode available */
  isHousehold: boolean
  /** All available perspectives for this user */
  availablePerspectives: PerspectiveOption[]
  /** Change the perspective */
  setPerspective: (p: Perspective) => void
  /** Partner name if available */
  partnerName: string | null
  /** Loading state */
  loading: boolean
  /** Monotonically increasing version counter — increments on each perspective switch */
  perspectiveVersion: number
  /**
   * Bump `perspectiveVersion` zonder van perspectief te wisselen — signaal
   * "perspectief-afhankelijke data is gewijzigd, herlaad". Gebruikt o.a. nadat
   * de huishoud-uitgave-na-pensioen is aangepast, zodat zowel de hero/grafiek
   * bovenaan als de huishoud-FIRE-sectie meteen verversen.
   */
  refreshData: () => void
}

const PERSPECTIVE_STORAGE_KEY = 'trifinity_perspective'
/** Cookie gelezen door server-componenten via getServerPerspective(). */
const PERSPECTIVE_COOKIE = 'tf_perspective'

/**
 * Schrijf het perspectief als cookie zodat server-loaders het meteen kennen.
 * path=/ + ~1 jaar geldig + SameSite=Lax.
 */
function storePerspectiveCookie(p: Perspective) {
  if (typeof document === 'undefined') return
  document.cookie = `${PERSPECTIVE_COOKIE}=${p}; path=/; max-age=31536000; samesite=lax`
}

const PerspectiveContext = createContext<PerspectiveContextType>({
  perspective: 'personal',
  isHousehold: false,
  availablePerspectives: [{ id: 'personal', label: 'Persoonlijk', description: 'Alleen jouw financiën' }],
  setPerspective: () => {},
  partnerName: null,
  loading: true,
  perspectiveVersion: 0,
  refreshData: () => {},
})

export function usePerspective() {
  return useContext(PerspectiveContext)
}

/**
 * Get locally stored perspective preference.
 *
 * `fallback` is de cookie-seed: is localStorage leeg of geblokkeerd (private
 * mode, gewiste site-data), dan is de cookie nog steeds een geldige uitdrukking
 * van dezelfde voorkeur — beide worden in lockstep geschreven door
 * `setPerspective`. Zonder deze terugval zou de provider in dat geval alsnog
 * naar 'personal' klappen ná de fetch: precies de flits die C1 beschrijft, maar
 * dan andersom.
 */
function getStoredPerspective(fallback: Perspective = 'personal'): Perspective {
  if (typeof window === 'undefined') return fallback
  try {
    const stored = localStorage.getItem(PERSPECTIVE_STORAGE_KEY)
    if (stored && ['personal', 'household', 'partner'].includes(stored)) {
      return stored as Perspective
    }
  } catch {
    // localStorage not available
  }
  return fallback
}

/**
 * Store perspective preference locally.
 */
function storePerspective(p: Perspective) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(PERSPECTIVE_STORAGE_KEY, p)
  } catch {
    // localStorage not available
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Server-sync van een perspectiefwissel (WF-NAV-19, bug2)
 *
 * `setPerspective` werkt optimistisch: state, localStorage en cookie gaan meteen
 * om, de PATCH volgt. Was die PATCH fire-and-forget, dan liep een netwerkfout
 * stil dood — en omdat de mount-effect bij de vólgende paginalading bewust de
 * SERVERWAARDE laat winnen, draaide die de wissel dan alsnog terug. De gebruiker
 * zag zijn keuze zonder melding verdampen.
 *
 * Gekozen richting (eigenaarsbesluit 3 sep 2026, optie A): de PATCH herhalen in
 * plaats van stil falen, zodat de server bijtrekt vóór de volgende lading. De
 * mount-effect blijft ongemoeid — juist omdat die de C1/C7-garantie draagt dat
 * de server een inmiddels ONGELDIGE keuze mag corrigeren (partner ontkoppeld).
 * Optie B (cookie laat winnen bij mount) zou dat onderscheid moeten raden.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Aantal pogingen inclusief de eerste; daarna geeft de sync op. */
const PERSPECTIVE_SYNC_MAX_ATTEMPTS = 4
/** Wachttijd vóór poging 2; verdubbelt daarna (300 → 600 → 1200 ms). */
const PERSPECTIVE_SYNC_BASE_DELAY_MS = 300

/**
 * `setTimeout` als promise, die meteen afbreekt zodra `signal` afgaat.
 *
 * Zonder de abort-koppeling zou een nieuwe wissel tijdens de backoff-pauze pas
 * ná die pauze opgemerkt worden — en dan alsnog een verouderde waarde posten.
 */
function waitWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Schrijf het gekozen perspectief naar de server, met herhaling bij netwerkfout.
 *
 * Stopt bewust in drie gevallen:
 * - `res.ok` — klaar.
 * - een 4xx — de server wijst dit verzoek principieel af (niet ingelogd,
 *   ongeldig perspectief). Herhalen verandert dat antwoord niet.
 * - `signal.aborted` — er is een NIEUWERE wissel; die heeft zijn eigen sync en
 *   moet winnen. Doorgaan zou een verouderde waarde terugschrijven.
 *
 * Alleen een netwerkfout of een 5xx wordt herhaald: precies de gevallen waarin
 * de server de keuze nog niet gezien heeft.
 */
async function syncPerspectiveToServer(p: Perspective, signal: AbortSignal): Promise<void> {
  for (let attempt = 1; attempt <= PERSPECTIVE_SYNC_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch('/api/perspective', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perspective: p }),
        signal,
      })
      if (res.ok || res.status < 500) return
    } catch {
      // AbortError én netwerkfout landen hier; alleen de eerste is definitief.
      if (signal.aborted) return
    }

    if (attempt === PERSPECTIVE_SYNC_MAX_ATTEMPTS) return

    try {
      await waitWithAbort(PERSPECTIVE_SYNC_BASE_DELAY_MS * 2 ** (attempt - 1), signal)
    } catch {
      return // afgebroken tijdens de backoff-pauze
    }
  }
}

/**
 * Custom hook for perspective-dependent data fetching with automatic cancellation.
 *
 * Returns an AbortSignal that is cancelled whenever the perspective changes,
 * preventing stale data from overwriting newer results during rapid switching.
 *
 * Usage:
 *   const { perspective } = usePerspective()
 *   const signal = usePerspectiveAbort(perspective)
 *   useEffect(() => {
 *     fetchData({ signal }).then(data => { if (!signal.aborted) setData(data) })
 *   }, [perspective, signal])
 */
export function usePerspectiveAbort(perspective: Perspective): AbortSignal {
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    // Abort the previous request when perspective changes
    controllerRef.current?.abort()
    controllerRef.current = new AbortController()

    // Cleanup on unmount
    return () => {
      controllerRef.current?.abort()
    }
  }, [perspective])

  // Ensure there's always a controller
  if (!controllerRef.current) {
    controllerRef.current = new AbortController()
  }

  return controllerRef.current.signal
}

/**
 * @param initialPerspective Server-side gelezen `tf_perspective`-cookie
 *   (`getServerPerspective()` in `app/(app)/layout.tsx`). Dit is de SYNCHRONE
 *   seed van de provider-state.
 *
 *   WAAROM (bevinding C1/C7): de provider startte altijd op `'personal'` en
 *   corrigeerde pas ná `fetch('/api/perspective')`. Bij een huishoud-gebruiker
 *   toonde elke laadbeurt daardoor eerst de PERSOONLIJKE cijfers en daarna de
 *   HUISHOUD-cijfers — twee elk-voor-zich correcte, maar verschillende
 *   antwoorden op dezelfde vraag. Wie op het verkeerde moment keek, zag per
 *   herlaadbeurt iets anders.
 *
 *   De cookie is de bron die de server toch al leest (dezelfde waarde voedt de
 *   sidebar en alle perspectief-bewuste server-loaders), dus seeden hiermee
 *   houdt server-HTML en eerste client-render identiek — geen hydration-mismatch
 *   en geen flits. De async `/api/perspective`-ronde blijft: die levert
 *   `availablePerspectives`/`partnerName` én corrigeert de seed wanneer de
 *   opgeslagen voorkeur inmiddels niet meer geldig is (partner losgekoppeld).
 */
export function PerspectiveProvider({
  children,
  initialPerspective = 'personal',
}: {
  children: ReactNode
  initialPerspective?: Perspective
}) {
  const router = useRouter()
  const [perspective, setLocalPerspective] = useState<Perspective>(initialPerspective)
  const [isHousehold, setIsHousehold] = useState(false)
  const [availablePerspectives, setAvailablePerspectives] = useState<PerspectiveOption[]>([
    { id: 'personal', label: 'Persoonlijk', description: 'Alleen jouw financiën' },
  ])
  const [partnerName, setPartnerName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [perspectiveVersion, setPerspectiveVersion] = useState(0)

  // AbortController for server-sync PATCH requests — cancels stale requests on rapid switching
  const patchControllerRef = useRef<AbortController | null>(null)

  // Load perspective from API on mount
  useEffect(() => {
    const controller = new AbortController()
    async function loadPerspective() {
      try {
        const res = await fetch('/api/perspective', { signal: controller.signal })
        if (controller.signal.aborted) return
        if (res.ok) {
          const data = await res.json()
          const serverPerspective = data.selectedPerspective as Perspective
          const localPerspective = getStoredPerspective(initialPerspective)

          // Use server value if available, otherwise use local
          const activePerspective = serverPerspective !== 'personal' ? serverPerspective : localPerspective

          // Validate against available perspectives
          const available = data.availablePerspectives as PerspectiveOption[]
          const validPerspective = available.find(p => p.id === activePerspective)
            ? activePerspective
            : 'personal'

          setLocalPerspective(validPerspective)
          setIsHousehold(data.isHousehold)
          setAvailablePerspectives(available)
          setPartnerName(data.partnerName)
          storePerspective(validPerspective)
          // Houd de server-cookie in sync met het resolved perspectief, zodat
          // server-componenten meteen correct renderen (ook vóór een switch).
          storePerspectiveCookie(validPerspective)
        } else {
          // Fall back to localStorage, dan de cookie-seed
          setLocalPerspective(getStoredPerspective(initialPerspective))
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Fall back to localStorage, dan de cookie-seed
        setLocalPerspective(getStoredPerspective(initialPerspective))
      }
      setLoading(false)
    }
    loadPerspective()
    return () => controller.abort()
  }, [initialPerspective])

  const setPerspective = useCallback(async (newPerspective: Perspective) => {
    // Optimistic local update — always immediate
    setLocalPerspective(newPerspective)
    storePerspective(newPerspective)
    storePerspectiveCookie(newPerspective)
    setPerspectiveVersion(v => v + 1)

    // Soft re-render van server-componenten met het nieuwe perspectief
    // (leest de zojuist gezette cookie). Voorkomt "eigen-data-flits".
    router.refresh()

    // Cancel any in-flight server-sync request before starting a new one
    patchControllerRef.current?.abort()
    const controller = new AbortController()
    patchControllerRef.current = controller

    // Persist to server, met herhaling bij netwerkfout — zie
    // `syncPerspectiveToServer`. Een stille mislukking zou de wissel bij de
    // volgende paginalading laten terugdraaien (WF-NAV-19/c).
    await syncPerspectiveToServer(newPerspective, controller.signal)
  }, [router])

  // Laat geen backoff-timer of retry-lus achter na unmount (bv. uitloggen):
  // de wissel die erbij hoorde is dan niet meer aan de orde.
  useEffect(() => {
    return () => patchControllerRef.current?.abort()
  }, [])

  // Verversen zonder perspectief-wissel — bump alleen de versie-teller zodat
  // perspectief-afhankelijke effecten (hero/grafiek + huishoud-FIRE-sectie)
  // opnieuw laden. Géén router.refresh/PATCH (voorkomt server-flits).
  const refreshData = useCallback(() => {
    setPerspectiveVersion(v => v + 1)
  }, [])

  // Stable context value — without memoization the inline object literal
  // changes identity on every parent render and re-renders all consumers.
  const value = useMemo(
    () => ({
      perspective,
      isHousehold,
      availablePerspectives,
      setPerspective,
      partnerName,
      loading,
      perspectiveVersion,
      refreshData,
    }),
    [perspective, isHousehold, availablePerspectives, setPerspective, partnerName, loading, perspectiveVersion, refreshData],
  )

  return (
    <PerspectiveContext.Provider value={value}>
      {children}
    </PerspectiveContext.Provider>
  )
}
