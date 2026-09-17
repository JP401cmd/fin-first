'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { tapTargetClass } from '@/components/editorial/tap-target'
import {
  EINDSITUATIE_MINIMIZED_FLAG,
  EINDSITUATIE_NOTICE_MINIMIZE_KEY,
  resolveEindsituatieNoticeDisplay,
} from '@/lib/horizon/eindsituatie-notice-minimize'
import type { BannerDisplay } from '@/lib/page-status/display'

/**
 * EindsituatieNoticeProvider — deelt de "waarom blijft er aan het eind zoveel over?"-
 * melding van /toekomst tussen de melding zélf (boven de tijdas-grafiek) en het
 * statuspunt naast de pagina-'i'. Zusje van `AowNoticeProvider` en
 * `DeficitNoticeProvider`: zelfde meldingen-conventie, zelfde PUT-schrijfpad
 * (`/api/overzicht/page-status`, own-row JSONB-pref, nooit localStorage), zelfde
 * server-seed zodat punt/melding niet flikkeren.
 *
 * KLEUR: de melding is informatief (een rekenuitkomst, geen risico). Het punt draagt
 * daarom de horizon-accent-tint, net als de informatieve vrijheidsbanner in
 * `PageStatusDot` — geen stoplicht-amber, want er is niets dat aandacht vraagt.
 */

interface EindsituatieNoticeContextValue {
  /** 'expanded' = melding · 'minimized' = punt naast de 'i' · 'none' = geen melding. */
  display: BannerDisplay | 'none'
  /** Is er een provider die minimaliseren kan onthouden? */
  canMinimize: boolean
  minimize: () => void
  restore: () => void
}

const NOOP = () => {}

const EindsituatieNoticeContext = createContext<EindsituatieNoticeContextValue | null>(null)
const EindsituatieNoticeRegisterContext = createContext<((present: boolean) => void) | null>(null)

export function EindsituatieNoticeProvider({
  initialMinimizedFlag = null,
  children,
}: {
  /** Server-side gelezen vlag uit `profiles.status_banner_minimized` (1 of null). */
  initialMinimizedFlag?: number | null
  children: React.ReactNode
}) {
  const [present, setPresent] = useState(false)
  const [minimizedFlag, setMinimizedFlag] = useState<number | null>(initialMinimizedFlag)

  const register = useCallback((next: boolean) => {
    setPresent((prev) => (prev === next ? prev : next))
  }, [])

  const minimizedRef = useRef(minimizedFlag)
  useEffect(() => {
    minimizedRef.current = minimizedFlag
  }, [minimizedFlag])

  const persist = useCallback((level: number | null, rollbackTo: number | null) => {
    ;(async () => {
      try {
        const res = await fetch('/api/overzicht/page-status', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ route: EINDSITUATIE_NOTICE_MINIMIZE_KEY, level }),
        })
        if (!res.ok) setMinimizedFlag(rollbackTo)
      } catch {
        setMinimizedFlag(rollbackTo)
      }
    })()
  }, [])

  const minimize = useCallback(() => {
    if (!present) return
    const prev = minimizedRef.current
    setMinimizedFlag(EINDSITUATIE_MINIMIZED_FLAG)
    persist(EINDSITUATIE_MINIMIZED_FLAG, prev)
  }, [present, persist])

  const restore = useCallback(() => {
    const prev = minimizedRef.current
    setMinimizedFlag(null)
    persist(null, prev)
  }, [persist])

  const display = resolveEindsituatieNoticeDisplay(present, minimizedFlag)

  const value = useMemo<EindsituatieNoticeContextValue>(
    () => ({ display, canMinimize: true, minimize, restore }),
    [display, minimize, restore],
  )

  return (
    <EindsituatieNoticeContext.Provider value={value}>
      <EindsituatieNoticeRegisterContext.Provider value={register}>{children}</EindsituatieNoticeRegisterContext.Provider>
    </EindsituatieNoticeContext.Provider>
  )
}

/**
 * Hook voor de MELDING: registreert of er een duiding is en geeft de weergave terug.
 * Zónder provider blijft de melding uitgeklapt en is `canMinimize` false.
 */
export function useEindsituatieNotice(present: boolean): EindsituatieNoticeContextValue {
  const register = useContext(EindsituatieNoticeRegisterContext)
  const ctx = useContext(EindsituatieNoticeContext)

  useEffect(() => {
    register?.(present)
  }, [register, present])

  useEffect(() => {
    return () => register?.(false)
  }, [register])

  if (ctx) return ctx
  return {
    display: present ? 'expanded' : 'none',
    canMinimize: false,
    minimize: NOOP,
    restore: NOOP,
  }
}

/**
 * EindsituatieNoticeDot — de geminimaliseerde vorm, links naast de pagina-'i'
 * (h-7 w-7-familie). Rendert alleen bij `display === 'minimized'`; klik = heropenen.
 */
export function EindsituatieNoticeDot({ className = '' }: { className?: string }) {
  const ctx = useContext(EindsituatieNoticeContext)
  if (!ctx || ctx.display !== 'minimized') return null

  const label = 'Toelichting — toon de uitleg over wat er aan het eind overblijft'

  return (
    <div className={className}>
      <button
        type="button"
        onClick={ctx.restore}
        aria-label={label}
        title={label}
        className={`flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] ${tapTargetClass('extend')} transition-all hover:border-[var(--module-active-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]`}
      >
        <span className="h-2.5 w-2.5 rounded-full bg-horizon-500" aria-hidden="true" />
      </button>
    </div>
  )
}
