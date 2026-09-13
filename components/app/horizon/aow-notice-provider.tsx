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
import { LEVERAGE_STATUS_DOT, LEVERAGE_STATUS_LABEL } from '@/lib/leverage-status'
import { tapTargetClass } from '@/components/editorial/tap-target'
import {
  AOW_MINIMIZED_FLAG,
  AOW_NOTICE_MINIMIZE_KEY,
  resolveAowNoticeDisplay,
} from '@/lib/horizon/aow-notice-minimize'
import type { BannerDisplay } from '@/lib/page-status/display'

/**
 * AowNoticeProvider — deelt de "AOW ontbreekt"-melding van /toekomst (TPR-04) tussen
 * de melding zélf (bij de tijdas-grafiek in `horizon-client.tsx`) en het statuspunt
 * naast de pagina-'i' in de paginakop. Zusje van `DeficitNoticeProvider`: zelfde
 * meldingen-conventie (uitgeklapt = melding, geminimaliseerd = gekleurd punt), zelfde
 * PUT-schrijfpad (`/api/overzicht/page-status`, own-row JSONB-pref, nooit localStorage),
 * zelfde server-seed zodat punt/melding niet flikkeren.
 *
 * BEWUST GEEN `PageStatusProvider`: die fetcht zijn `info` per /overzicht-route. De
 * infobron is hier LOKAAL — de adapter-notice `aow_ontbreekt` reist mee in de horizon-
 * run die de pagina toch al draait. Geen tweede fetch-pad.
 *
 * NIVEAU: geen piek/escalatie — de melding is er of niet. Opgeslagen als vlag 1
 * (`AOW_MINIMIZED_FLAG`); heropenen wist de vlag. Kleur: stoplicht-'aandacht'
 * (oranje), volgt de module-accentkeuze bewust NIET.
 */

const AOW_STATUS = 'warn' as const

interface AowNoticeContextValue {
  /** 'expanded' = melding · 'minimized' = punt naast de 'i' · 'none' = geen melding. */
  display: BannerDisplay | 'none'
  /** Is er een provider die minimaliseren kan onthouden? */
  canMinimize: boolean
  minimize: () => void
  restore: () => void
}

const NOOP = () => {}

const AowNoticeContext = createContext<AowNoticeContextValue | null>(null)
/** Registratiekanaal: de melding meldt of de notice aanwezig is (na view-gating). */
const AowNoticeRegisterContext = createContext<((present: boolean) => void) | null>(null)

export function AowNoticeProvider({
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
          body: JSON.stringify({ route: AOW_NOTICE_MINIMIZE_KEY, level }),
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
    // Pure setState + side-effect erbuiten (StrictMode-dubbele updater → geen dubbele PUT).
    setMinimizedFlag(AOW_MINIMIZED_FLAG)
    persist(AOW_MINIMIZED_FLAG, prev)
  }, [present, persist])

  const restore = useCallback(() => {
    const prev = minimizedRef.current
    setMinimizedFlag(null)
    persist(null, prev)
  }, [persist])

  const display = resolveAowNoticeDisplay(present, minimizedFlag)

  const value = useMemo<AowNoticeContextValue>(
    () => ({ display, canMinimize: true, minimize, restore }),
    [display, minimize, restore],
  )

  return (
    <AowNoticeContext.Provider value={value}>
      <AowNoticeRegisterContext.Provider value={register}>{children}</AowNoticeRegisterContext.Provider>
    </AowNoticeContext.Provider>
  )
}

/**
 * Hook voor de MELDING zelf: registreert of de notice aanwezig is en geeft de weergave
 * terug. Zónder provider blijft de melding uitgeklapt en is `canMinimize` false (geen
 * knop die niets onthoudt) — spiegel van `useDeficitNotice`.
 */
export function useAowNotice(present: boolean): AowNoticeContextValue {
  const register = useContext(AowNoticeRegisterContext)
  const ctx = useContext(AowNoticeContext)

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
 * AowNoticeDot — de geminimaliseerde vorm: rond knopje met stoplicht-punt, links naast
 * de pagina-'i' (zelfde h-7 w-7-familie als `PageStatusDot`/`DeficitNoticeDot`).
 * Rendert alleen bij `display === 'minimized'`; klik = melding heropenen.
 */
export function AowNoticeDot({ className = '' }: { className?: string }) {
  const ctx = useContext(AowNoticeContext)
  if (!ctx || ctx.display !== 'minimized') return null

  const label = `${LEVERAGE_STATUS_LABEL[AOW_STATUS]} — toon de melding over je AOW`

  return (
    <div className={className}>
      <button
        type="button"
        onClick={ctx.restore}
        aria-label={label}
        title={label}
        className={`flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] ${tapTargetClass('extend')} transition-all hover:border-[var(--module-active-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]`}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${LEVERAGE_STATUS_DOT[AOW_STATUS]}`} aria-hidden="true" />
      </button>
    </div>
  )
}
