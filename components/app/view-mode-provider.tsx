'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Eye, PencilRuler } from 'lucide-react'

/**
 * ViewMode — plan A-5 / Tier-2 #13: "Bovenaan UI een toggle die widgets/
 * secties filtert per intensiteits-niveau. Beginners blijven in Kijken."
 *
 * Twee modi mapt naar de drie gebruikers-niveaus uit het plan (§3.1):
 *  - **Kijken** — niveau-A "Beginnen" (Mo, Linda). Minimaal: kompas,
 *    Health Score, briefing, kerngrafiek. Geen scenario-tools.
 *  - **Plannen** — niveau-B "Verdiepen" + niveau-C "Plannen" (Sanne,
 *    Erik, Anouk & Jasper). Alle scenario-tools, parameters, sliders
 *    en widget-configurator zichtbaar.
 *
 * Persistence: localStorage (`trifinity:view-mode`). Geen DB-migratie
 * — bewust client-side voor snelle iteratie. SSR-safe via mounted-flag.
 *
 * Filtering wordt door consumer-components zelf gedaan via de
 * `useViewMode()` hook. Widgets/secties die alleen voor "Plannen"
 * zijn checken `mode === 'plannen'` voordat ze renderen; widgets
 * voor beide modi tonen altijd.
 */

export type ViewMode = 'kijken' | 'plannen'

const STORAGE_KEY = 'trifinity:view-mode'

interface ViewModeContextValue {
  mode: ViewMode
  setMode: (next: ViewMode) => void
  /** Convenience: true wanneer de gebruiker in plannen-modus zit. */
  isPlannen: boolean
  /** Of het localStorage-laden voltooid is. Voor SSR-safe rendering. */
  mounted: boolean
}

const ViewModeContext = createContext<ViewModeContextValue>({
  mode: 'kijken',
  setMode: () => {},
  isPlannen: false,
  mounted: false,
})

export function useViewMode() {
  return useContext(ViewModeContext)
}

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ViewMode>('kijken')
  const [mounted, setMounted] = useState(false)

  // Hydratatie ná mount om SSR-mismatch te vermijden.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw === 'plannen' || raw === 'kijken') {
        setModeState(raw)
      }
    } catch {
      // localStorage disabled — blijf op default 'kijken'.
    }
    setMounted(true)
  }, [])

  function setMode(next: ViewMode) {
    setModeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Silent fail.
    }
  }

  return (
    <ViewModeContext.Provider
      value={{
        mode,
        setMode,
        isPlannen: mode === 'plannen',
        mounted,
      }}
    >
      {children}
    </ViewModeContext.Provider>
  )
}

/**
 * Capsule-style toggle die past in een TopBar of header-row. Beide modi
 * krijgen een icoon zodat de keuze visueel snel scanbaar is.
 *
 * Mobile: zelfde capsule, kleinere padding.
 */
export function ViewModeToggle({ className }: { className?: string }) {
  const { mode, setMode, mounted } = useViewMode()
  // Voor SSR: render statische pill in "kijken" tot client-mount. Geen
  // mismatch want default-state is 'kijken' op server én client.
  const active = mounted ? mode : 'kijken'
  return (
    <div
      role="group"
      aria-label="Weergave-modus"
      className={`inline-flex rounded-full border border-[var(--border-ed)] bg-[var(--subtle)] p-0.5 ${className ?? ''}`}
    >
      <button
        type="button"
        onClick={() => setMode('kijken')}
        aria-pressed={active === 'kijken'}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
          active === 'kijken'
            ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
            : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
        }`}
      >
        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
        Kijken
      </button>
      <button
        type="button"
        onClick={() => setMode('plannen')}
        aria-pressed={active === 'plannen'}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
          active === 'plannen'
            ? 'bg-[var(--paper)] text-[var(--ink)] shadow-sm'
            : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]'
        }`}
      >
        <PencilRuler className="w-3.5 h-3.5" aria-hidden="true" />
        Plannen
      </button>
    </div>
  )
}
