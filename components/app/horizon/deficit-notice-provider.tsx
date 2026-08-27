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
import {
  DEFICIT_NOTICE_MINIMIZE_KEY,
  resolveDeficitNoticeDisplay,
} from '@/lib/horizon/deficit-loan-minimize'
import type { BannerDisplay } from '@/lib/page-status/display'

/**
 * DeficitNoticeProvider — deelt de tekort-lening-melding van /toekomst tussen de
 * melding zélf (diep in `horizon-client.tsx`, bij de tijdas-grafiek) en het
 * statuspunt naast de pagina-'i' in de paginakop. Zo werkt de
 * meldingen-conventie uit CLAUDE.md ook hier: uitgeklapt = de melding,
 * geminimaliseerd = alleen een gekleurd punt links van de 'i'.
 *
 * BEWUST GEEN `PageStatusProvider`: die haalt zijn `info` via
 * `GET /api/overzicht/page-status` op en kent alleen /overzicht-routes. De
 * infobron is hier LOKAAL — de tekort-lening komt uit de horizon-run die de
 * pagina toch al draait (`detectDeficitLoanFromRows`). Deze provider is daarom
 * een dunne consumer op dezelfde bouwstenen (`BannerDisplay`, LEVERAGE_STATUS_*,
 * hetzelfde PUT-schrijfpad) zonder een tweede fetch-pad te introduceren.
 *
 * ONTHOUDEN: server-side en cross-device via de bestaande JSONB-pref
 * `profiles.status_banner_minimized` onder de sleutel `/toekomst/tekort-lening`,
 * geschreven via `PUT /api/overzicht/page-status` (own-row read-modify-write,
 * anon-RLS-client). Nooit localStorage. De initiële waarde komt server-side mee
 * als `initialMinimizedPeak`, zodat het punt/de melding niet flikkert.
 *
 * STATUS-KLEUR: de tekort-lening kent één ernstniveau — 'aandacht' (stoplicht-
 * oranje). Die kleur komt uit de gedeelde `LEVERAGE_STATUS_DOT`-map en volgt de
 * module-accentkeuze bewust NIET (CLAUDE.md-kleurconventie).
 */

/** Het ernstniveau van deze melding: één bucket, 'aandacht'. */
const DEFICIT_STATUS = 'warn' as const

interface DeficitNoticeContextValue {
  /** 'expanded' = melding · 'minimized' = punt naast de 'i' · 'none' = geen melding. */
  display: BannerDisplay | 'none'
  /** Is er een provider die minimaliseren kan onthouden? */
  canMinimize: boolean
  /** Melding inklappen tot het punt (onthoudt de huidige piek). */
  minimize: () => void
  /** Melding weer uitklappen (wist de voorkeur). */
  restore: () => void
}

const NOOP = () => {}

const DeficitNoticeContext = createContext<DeficitNoticeContextValue | null>(null)

/**
 * Registratiekanaal: de melding meldt haar huidige piek (of null) aan de
 * provider. Bewust apart van de consumer-context — spiegelt de
 * `PageStatusSeedContext`-scheiding — zodat de callback stabiel blijft en de
 * consumers hun contract houden.
 */
const DeficitNoticeRegisterContext = createContext<
  ((peak: number | null) => void) | null
>(null)

export function DeficitNoticeProvider({
  initialMinimizedPeak = null,
  children,
}: {
  /** Server-side gelezen opgeslagen piek uit `profiles.status_banner_minimized`. */
  initialMinimizedPeak?: number | null
  children: React.ReactNode
}) {
  // De piek uit de huidige run; null zolang er geen (zichtbare) tekort-lening is.
  const [peak, setPeak] = useState<number | null>(null)
  const [minimizedPeak, setMinimizedPeak] = useState<number | null>(
    initialMinimizedPeak,
  )

  // Stabiele registratie-callback (identiteit verandert nooit) zodat het
  // effect in `useDeficitNotice` alleen op de piek zelf hertriggert.
  const register = useCallback((next: number | null) => {
    setPeak((prev) => (prev === next ? prev : next))
  }, [])

  // Houdt de laatst bekende piek vast voor de rollback-vergelijking, zonder
  // `persist` te laten hertekenen bij elke re-render.
  const minimizedRef = useRef(minimizedPeak)
  useEffect(() => {
    minimizedRef.current = minimizedPeak
  }, [minimizedPeak])

  const persist = useCallback((level: number | null, rollbackTo: number | null) => {
    // Fire-and-forget; bij een fout terugrollen naar de vorige waarde, zodat de
    // UI direct reageert maar consistent blijft met wat de server bewaart.
    ;(async () => {
      try {
        const res = await fetch('/api/overzicht/page-status', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ route: DEFICIT_NOTICE_MINIMIZE_KEY, level }),
        })
        if (!res.ok) setMinimizedPeak(rollbackTo)
      } catch {
        setMinimizedPeak(rollbackTo)
      }
    })()
  }, [])

  const minimize = useCallback(() => {
    if (peak == null) return
    const prev = minimizedRef.current
    // Pure setState + side-effect ERBUITEN, zodat een dubbele StrictMode-
    // invocatie niet tot een dubbele PUT leidt (mirror van PageStatusProvider).
    setMinimizedPeak(peak)
    persist(peak, prev)
  }, [peak, persist])

  const restore = useCallback(() => {
    const prev = minimizedRef.current
    setMinimizedPeak(null)
    persist(null, prev)
  }, [persist])

  const display = resolveDeficitNoticeDisplay(peak, minimizedPeak)

  const value = useMemo<DeficitNoticeContextValue>(
    () => ({ display, canMinimize: true, minimize, restore }),
    [display, minimize, restore],
  )

  return (
    <DeficitNoticeContext.Provider value={value}>
      <DeficitNoticeRegisterContext.Provider value={register}>
        {children}
      </DeficitNoticeRegisterContext.Provider>
    </DeficitNoticeContext.Provider>
  )
}

/**
 * Hook voor de MELDING zelf: registreert de huidige piek bij de provider en
 * geeft terug of de melding uitgeklapt, geminimaliseerd of afwezig is.
 *
 * Zónder provider (bv. de legacy /horizon-route, waar geen paginakop met 'i'
 * staat om het punt naast te zetten) blijft de melding gewoon uitgeklapt en is
 * `canMinimize` false — de minimaliseer-knop wordt dan niet getoond, zodat er
 * geen knop bestaat die niets onthoudt.
 *
 * @param peak De piek uit de huidige run, of null als er geen (zichtbare)
 *   tekort-lening is — de caller past de eigen view-gating al toe.
 */
export function useDeficitNotice(peak: number | null): DeficitNoticeContextValue {
  const register = useContext(DeficitNoticeRegisterContext)
  const ctx = useContext(DeficitNoticeContext)

  useEffect(() => {
    register?.(peak)
  }, [register, peak])

  // Alleen bij UNMOUNT opruimen (geen peak in de deps): anders zou elke
  // piekwijziging eerst een null-flits door de provider sturen.
  useEffect(() => {
    return () => register?.(null)
  }, [register])

  if (ctx) return ctx
  return {
    display: peak == null ? 'none' : 'expanded',
    canMinimize: false,
    minimize: NOOP,
    restore: NOOP,
  }
}

/**
 * DeficitNoticeDot — de geminimaliseerde vorm van de tekort-lening-melding: een
 * klein rond knopje met een gekleurd statuspunt, links naast de pagina-'i'.
 * Klik → melding weer uitklappen.
 *
 * Spiegelt `PageStatusDot` één-op-één in vorm (h-7 w-7 rounded-full, dezelfde
 * border/paper) zodat het punt en de 'i' één visuele familie vormen. Rendert
 * alleen wanneer de provider `display === 'minimized'` zegt.
 *
 * PLAATSING: de conventie beschrijft absolute offsets (`right-[52px]
 * sm:right-[60px]`) voor pagina's waar de 'i' absoluut rechtsboven staat. De
 * /toekomst-kop zet zijn controls in een `flex items-center gap-2`-cluster;
 * daar levert DOM-volgorde (punt vóór de 'i') exact dezelfde plaatsing met de
 * juiste 8px tussenruimte. De `className`-prop houdt de absolute variant open.
 */
export function DeficitNoticeDot({ className = '' }: { className?: string }) {
  const ctx = useContext(DeficitNoticeContext)
  if (!ctx || ctx.display !== 'minimized') return null

  const label = `${LEVERAGE_STATUS_LABEL[DEFICIT_STATUS]} — toon de melding over je tekort-lening`

  return (
    <div className={className}>
      <button
        type="button"
        onClick={ctx.restore}
        aria-label={label}
        title={label}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] transition-all hover:border-[var(--module-active-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      >
        <span
          className={`h-2.5 w-2.5 rounded-full ${LEVERAGE_STATUS_DOT[DEFICIT_STATUS]}`}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}
