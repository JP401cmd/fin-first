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
  STALE_TX_NOTICE_MINIMIZE_KEY,
  resolveStaleNoticeDisplay,
} from '@/lib/transaction-staleness-minimize'
import type { BannerDisplay } from '@/lib/page-status/display'

/**
 * StaleNoticeProvider — deelt de "Gegevens verouderd"-melding van /overzicht
 * tussen de banner zélf (in de `banners`-slot van de hero, blok 1) en het
 * statuspunt naast de pagina-'i' (in de utility-cluster van het gestreamde blok
 * 2). Zo werkt de meldingen-conventie uit CLAUDE.md ook hier: uitgeklapt = de
 * melding, geminimaliseerd = alleen een gekleurd punt links van de 'i'.
 *
 * BEWUST GEEN `PageStatusProvider`: die haalt zijn `info` via
 * `GET /api/overzicht/page-status` op en kent alleen /overzicht-routes met een
 * server-berekende status. De infobron is hier LOKAAL — de achterstand komt uit
 * het maandaggregaat dat /overzicht toch al ophaalt (`getTxAgg12m` →
 * `transactionFreshness`). Deze provider is daarom een dunne consumer op
 * dezelfde bouwstenen (`BannerDisplay`, LEVERAGE_STATUS_*, hetzelfde
 * PUT-schrijfpad) zonder een tweede fetch-pad te introduceren. Spiegel van
 * `components/app/horizon/deficit-notice-provider.tsx`.
 *
 * SERVER-GESEED, GEEN FLITS. Zowel de huidige achterstand (`monthsBehind`) als
 * de opgeslagen voorkeur (`initialMinimizedMonths`) komen als props uit de
 * server-render. De eerste render — SSR én hydration — kent de juiste toestand
 * dus al; er is geen effect-ronde waarin de banner eerst uitklapt en daarna
 * inklapt. (Bewust anders dan de tekort-lening-melding, die haar piek pas diep
 * in een client-grafiek kent en zich daarom via een effect moet registreren.)
 *
 * ONTHOUDEN: server-side en cross-device via de bestaande JSONB-pref
 * `profiles.status_banner_minimized` onder de sleutel
 * `/overzicht/gegevens-verouderd`, geschreven via
 * `PUT /api/overzicht/page-status` (own-row read-modify-write, anon-RLS-client).
 * Nooit localStorage — deze keuze moet op élk apparaat gelden.
 *
 * STATUS-KLEUR: dit is een aandacht-melding — één ernstniveau, 'warn'
 * (stoplicht-oranje) uit de gedeelde `LEVERAGE_STATUS_DOT`-map. Volgt de
 * module-accentkeuze bewust NIET (CLAUDE.md-kleurconventie).
 */

/** Het ernstniveau van deze melding: één bucket, 'aandacht'. */
const STALE_STATUS = 'warn' as const

interface StaleNoticeContextValue {
  /** 'expanded' = melding · 'minimized' = punt naast de 'i' · 'none' = geen melding. */
  display: BannerDisplay | 'none'
  /** Is er een provider die minimaliseren kan onthouden? */
  canMinimize: boolean
  /** Melding inklappen tot het punt (onthoudt de huidige achterstand). */
  minimize: () => void
  /** Melding weer uitklappen (wist de voorkeur). */
  restore: () => void
}

const NOOP = () => {}

const StaleNoticeContext = createContext<StaleNoticeContextValue | null>(null)

export function StaleNoticeProvider({
  monthsBehind = null,
  initialMinimizedMonths = null,
  children,
}: {
  /**
   * De achterstand in hele maanden uit de HUIDIGE server-render, of null als de
   * data vers is / er geen historie is. Server-side afgeleid uit hetzelfde
   * `transactionFreshness`-oordeel als de banner — geen tweede drempel.
   */
  monthsBehind?: number | null
  /** Server-side gelezen opgeslagen maandaantal uit `profiles.status_banner_minimized`. */
  initialMinimizedMonths?: number | null
  children: React.ReactNode
}) {
  const [minimizedMonths, setMinimizedMonths] = useState<number | null>(
    initialMinimizedMonths,
  )

  // Houdt de laatst bekende waarde vast voor de rollback-vergelijking, zonder
  // `persist` te laten hertekenen bij elke re-render.
  const minimizedRef = useRef(minimizedMonths)
  useEffect(() => {
    minimizedRef.current = minimizedMonths
  }, [minimizedMonths])

  const persist = useCallback((level: number | null, rollbackTo: number | null) => {
    // Fire-and-forget; bij een fout terugrollen naar de vorige waarde, zodat de
    // UI direct reageert maar consistent blijft met wat de server bewaart.
    ;(async () => {
      try {
        const res = await fetch('/api/overzicht/page-status', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ route: STALE_TX_NOTICE_MINIMIZE_KEY, level }),
        })
        if (!res.ok) setMinimizedMonths(rollbackTo)
      } catch {
        setMinimizedMonths(rollbackTo)
      }
    })()
  }, [])

  const minimize = useCallback(() => {
    if (monthsBehind == null) return
    const prev = minimizedRef.current
    // Pure setState + side-effect ERBUITEN, zodat een dubbele StrictMode-
    // invocatie niet tot een dubbele PUT leidt (mirror van PageStatusProvider).
    setMinimizedMonths(monthsBehind)
    persist(monthsBehind, prev)
  }, [monthsBehind, persist])

  const restore = useCallback(() => {
    const prev = minimizedRef.current
    setMinimizedMonths(null)
    persist(null, prev)
  }, [persist])

  const display = resolveStaleNoticeDisplay(monthsBehind, minimizedMonths)

  const value = useMemo<StaleNoticeContextValue>(
    () => ({ display, canMinimize: true, minimize, restore }),
    [display, minimize, restore],
  )

  return (
    <StaleNoticeContext.Provider value={value}>{children}</StaleNoticeContext.Provider>
  )
}

/**
 * Hook voor de MELDING zelf.
 *
 * Zónder provider (bv. /overzicht/cashflow, waar dezelfde banner boven de
 * KPI-kaarten staat maar geen paginakop-cluster is om het punt in te hangen)
 * blijft de melding gewoon uitgeklapt en is `canMinimize` false — de
 * minimaliseer-knop wordt dan niet getoond, zodat er geen knop bestaat die
 * niets onthoudt.
 */
export function useStaleNotice(): StaleNoticeContextValue {
  const ctx = useContext(StaleNoticeContext)
  if (ctx) return ctx
  return { display: 'expanded', canMinimize: false, minimize: NOOP, restore: NOOP }
}

/**
 * StaleNoticeDot — de geminimaliseerde vorm van de "Gegevens verouderd"-melding:
 * een klein rond knopje met een gekleurd statuspunt, links naast de pagina-'i'.
 * Klik → melding weer uitklappen.
 *
 * Spiegelt `PageStatusDot` één-op-één in vorm (h-7 w-7 rounded-full, dezelfde
 * border/paper) zodat het punt en de 'i' één visuele familie vormen. Rendert
 * alleen wanneer de provider `display === 'minimized'` zegt.
 *
 * PLAATSING: de conventie beschrijft absolute offsets (`right-[52px]
 * sm:right-[60px]`) voor pagina's waar de 'i' absoluut rechtsboven staat. De
 * utility-cluster van /overzicht is een `flex items-center gap-2`-rij; daar
 * levert DOM-volgorde (dit punt vóór `PageStatusDot` en de 'i') exact dezelfde
 * plaatsing met de juiste 8px tussenruimte. De `className`-prop houdt de
 * absolute variant open voor pagina's die 'm wél nodig hebben.
 */
export function StaleNoticeDot({ className = '' }: { className?: string }) {
  const ctx = useContext(StaleNoticeContext)
  if (!ctx || ctx.display !== 'minimized') return null

  const label = `${LEVERAGE_STATUS_LABEL[STALE_STATUS]} — toon de melding over verouderde gegevens`

  return (
    <div className={className}>
      <button
        type="button"
        onClick={ctx.restore}
        aria-label={label}
        title={label}
        // 28×28 is bewust: het punt hoort visueel één familie te vormen met de
        // pagina-`i` (zie de meldingen-conventie in CLAUDE.md). `extend` rekt
        // alléén het raakgebied op tot 44×44 via ::after — de layout en de
        // zichtbare maat blijven gelijk, maar de raakdrempel (M19) wordt gehaald.
        className={`${tapTargetClass('extend')} flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] transition-all hover:border-[var(--module-active-500)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]`}
      >
        <span
          className={`h-2.5 w-2.5 rounded-full ${LEVERAGE_STATUS_DOT[STALE_STATUS]}`}
          aria-hidden="true"
        />
      </button>
    </div>
  )
}
