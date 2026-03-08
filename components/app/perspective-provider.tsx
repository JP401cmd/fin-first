'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

export type Perspective = 'personal' | 'household' | 'partner'

export interface PerspectiveOption {
  id: Perspective
  label: string
  description: string
}

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
}

const PERSPECTIVE_STORAGE_KEY = 'trifinity_perspective'

const PerspectiveContext = createContext<PerspectiveContextType>({
  perspective: 'personal',
  isHousehold: false,
  availablePerspectives: [{ id: 'personal', label: 'Persoonlijk', description: 'Alleen jouw financiën' }],
  setPerspective: () => {},
  partnerName: null,
  loading: true,
  perspectiveVersion: 0,
})

export function usePerspective() {
  return useContext(PerspectiveContext)
}

/**
 * Get locally stored perspective preference.
 */
function getStoredPerspective(): Perspective {
  if (typeof window === 'undefined') return 'personal'
  try {
    const stored = localStorage.getItem(PERSPECTIVE_STORAGE_KEY)
    if (stored && ['personal', 'household', 'partner'].includes(stored)) {
      return stored as Perspective
    }
  } catch {
    // localStorage not available
  }
  return 'personal'
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

export function PerspectiveProvider({ children }: { children: ReactNode }) {
  const [perspective, setLocalPerspective] = useState<Perspective>('personal')
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
          const localPerspective = getStoredPerspective()

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
        } else {
          // Fall back to localStorage
          setLocalPerspective(getStoredPerspective())
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Fall back to localStorage
        setLocalPerspective(getStoredPerspective())
      }
      setLoading(false)
    }
    loadPerspective()
    return () => controller.abort()
  }, [])

  const setPerspective = useCallback(async (newPerspective: Perspective) => {
    // Optimistic local update — always immediate
    setLocalPerspective(newPerspective)
    storePerspective(newPerspective)
    setPerspectiveVersion(v => v + 1)

    // Cancel any in-flight server-sync request before starting a new one
    patchControllerRef.current?.abort()
    const controller = new AbortController()
    patchControllerRef.current = controller

    // Persist to server (fire-and-forget with cancellation)
    try {
      await fetch('/api/perspective', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perspective: newPerspective }),
        signal: controller.signal,
      })
    } catch {
      // AbortError or network error — local storage is the fallback
    }
  }, [])

  return (
    <PerspectiveContext.Provider
      value={{
        perspective,
        isHousehold,
        availablePerspectives,
        setPerspective,
        partnerName,
        loading,
        perspectiveVersion,
      }}
    >
      {children}
    </PerspectiveContext.Provider>
  )
}
