'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
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
}

const PERSPECTIVE_STORAGE_KEY = 'trifinity_perspective'

const PerspectiveContext = createContext<PerspectiveContextType>({
  perspective: 'personal',
  isHousehold: false,
  availablePerspectives: [{ id: 'personal', label: 'Persoonlijk', description: 'Alleen jouw financiën' }],
  setPerspective: () => {},
  partnerName: null,
  loading: true,
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

export function PerspectiveProvider({ children }: { children: ReactNode }) {
  const [perspective, setLocalPerspective] = useState<Perspective>('personal')
  const [isHousehold, setIsHousehold] = useState(false)
  const [availablePerspectives, setAvailablePerspectives] = useState<PerspectiveOption[]>([
    { id: 'personal', label: 'Persoonlijk', description: 'Alleen jouw financiën' },
  ])
  const [partnerName, setPartnerName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Load perspective from API on mount
  useEffect(() => {
    async function loadPerspective() {
      try {
        const res = await fetch('/api/perspective')
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
      } catch {
        // Fall back to localStorage
        setLocalPerspective(getStoredPerspective())
      }
      setLoading(false)
    }
    loadPerspective()
  }, [])

  const setPerspective = useCallback(async (newPerspective: Perspective) => {
    setLocalPerspective(newPerspective)
    storePerspective(newPerspective)

    // Persist to server
    try {
      await fetch('/api/perspective', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perspective: newPerspective }),
      })
    } catch {
      // Local storage is the fallback
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
      }}
    >
      {children}
    </PerspectiveContext.Provider>
  )
}
