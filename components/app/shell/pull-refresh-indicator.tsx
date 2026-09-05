'use client'

/**
 * PullRefreshIndicator — de zichtbare helft van het eigen pull-to-refresh.
 *
 * Bewust GEEN generieke spinner: een ronddraaiend wieltje hoort bij een
 * material-app, niet bij een krant. Tijdens het TREKKEN is de meter een liniaal
 * — een hairline die vult met de pull-voortgang, in de accentkleur van de
 * actieve module (`--module-active-*`, dus kern op /overzicht, horizon op
 * /toekomst, wil op /mijn). Zodra het verversen loopt neemt FIN het over:
 * dezelfde avatar in zijn wacht-stand (`FinDots state="thinking"`) die ook de
 * ladende vermogensgrafiek draagt (`mini-networth-chart-anchor.tsx`). Wachten
 * heeft daarmee app-breed één gezicht in plaats van twee eigen animaties. Onder
 * beide staat een serif-italic microtekst die de drie standen benoemt.
 *
 * ── Waarom dit een eigen component is en niet inline in de shell ────────
 * Het gebaar zet bij elke `touchmove` state (de pull-afstand). Zat die state in
 * `MobileStackShell`, dan zou élke frame de complete pagina-`children`
 * her-renderen. Hier blijft de re-render beperkt tot dit ~40-regels-component.
 *
 * ── Positionering ───────────────────────────────────────────────────────
 * Rendert als eerste kind ín de tray-`<main>`: `sticky top-0` met `h-0`, dus
 * zonder ook maar één pixel layout te kosten. De strip erin groeit als een
 * gordijn omlaag over de pagina-opening. Het is GEEN overlay in de zin van de
 * modal-conventie (geen backdrop, geen focus-trap, geen scroll-lock), dus geen
 * `z-[70]`: een lokale `z-10` binnen de scroller volstaat. Hij zit boven aan de
 * viewport en raakt de zwevende nav-pill (`z-[60]`, onderaan, `fixed`) niet.
 *
 * ── Toegankelijkheid ────────────────────────────────────────────────────
 * Het gebaar is touch-only, dus het mag nooit de enige weg zijn: de
 * NavMenuSheet draagt een "Ververs pagina"-knop met exact dezelfde actie. De
 * standen worden hier via een `aria-live="polite"`-regio aangekondigd; de
 * zichtbare tekst is `aria-hidden` zodat een schermlezer 'm niet dubbel leest.
 * Bij `prefers-reduced-motion` blijft de functie volledig intact — alleen de
 * hoogte-overgang en de sweep gaan uit.
 */

import { useCallback, useEffect, useRef, useState, useTransition, type RefObject } from 'react'
import { useRouter } from 'next/navigation'
import { usePullToRefresh, PULL_THRESHOLD_PX } from '@/lib/hooks/use-pull-to-refresh'
import { FinDots } from '@/components/app/fin-dots'

const LABELS = {
  pulling: 'Trek omlaag om te verversen',
  ready: 'Laat los om te verversen',
  refreshing: 'Bijwerken…',
} as const

type PullRefreshIndicatorProps = {
  /** De tray-`<main>`; het gebaar leeft op deze scroll-container. */
  scrollRef: RefObject<HTMLElement | null>
}

export function PullRefreshIndicator({ scrollRef }: PullRefreshIndicatorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [announcedDone, setAnnouncedDone] = useState(false)
  const doneTimer = useRef<number | null>(null)

  // `router.refresh()` geeft geen promise; binnen een transition levert
  // `isPending` het klaar-signaal. Dat is de enige manier om te weten wanneer de
  // server-loaders opnieuw gedraaid hebben.
  const handleRefresh = useCallback(() => {
    setAnnouncedDone(false)
    startTransition(() => {
      router.refresh()
    })
  }, [router])

  const { phase, distance, progress } = usePullToRefresh({
    scrollRef,
    onRefresh: handleRefresh,
    refreshing: isPending,
  })

  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mql.matches)
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  // Melding "bijgewerkt" ná afloop — anders hoort een schermlezer alleen het
  // begin van de verversing en nooit het einde.
  const wasRefreshing = useRef(false)
  useEffect(() => {
    if (phase === 'refreshing') {
      wasRefreshing.current = true
      return
    }
    if (!wasRefreshing.current) return
    wasRefreshing.current = false
    setAnnouncedDone(true)
    if (doneTimer.current) window.clearTimeout(doneTimer.current)
    doneTimer.current = window.setTimeout(() => setAnnouncedDone(false), 3000)
  }, [phase])

  useEffect(
    () => () => {
      if (doneTimer.current) window.clearTimeout(doneTimer.current)
    },
    [],
  )

  const active = phase !== 'idle'
  const dragging = phase === 'pulling' || phase === 'ready'
  const liveMessage = announcedDone
    ? 'Pagina bijgewerkt'
    : phase === 'refreshing'
      ? 'Bezig met bijwerken'
      : phase === 'ready'
        ? LABELS.ready
        : ''

  return (
    // `h-0` + `sticky`: neemt geen layout-ruimte in, blijft bij het bovenrand
    // van de scrollport hangen. `lg:hidden` omdat het gebaar daar sowieso een
    // no-op is (de `<main>` is op desktop geen scroll-container).
    <div className="sticky top-0 z-10 h-0 lg:hidden" data-pull-refresh={phase}>
      <p className="sr-only" aria-live="polite" role="status">
        {liveMessage}
      </p>

      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 overflow-hidden bg-[var(--bg)]"
        style={{
          height: active ? distance : 0,
          opacity: active ? 1 : 0,
          transition:
            dragging || reduceMotion
              ? 'none'
              : 'height 260ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms ease-out',
        }}
      >
        <div className="flex h-full flex-col items-center justify-end gap-2 px-4 pb-3">
          {phase === 'refreshing' ? (
            // Fin wacht mee. 22px + gap-2 (8) + de microtekst (11) + pb-3 (12)
            // = 53, dus het past binnen `PULL_REST_PX` (56) — de rusthoogte van
            // de strip tijdens het verversen. De trek-stand houdt exact dezelfde
            // maatvoering als voorheen; `fin-dots.css` regelt zijn eigen
            // reduced-motion, dus hier geen tweede schakelaar.
            <FinDots size={22} state="thinking" />
          ) : (
            /* De liniaal: hairline-goot met een vullende inkt-streep erin. */
            <div className="h-px w-24 overflow-hidden bg-[var(--rule-soft,var(--border-ed))]">
              <div
                className="h-px bg-[var(--module-active-500)]"
                style={{
                  width: `${Math.round(progress * 100)}%`,
                  transition: dragging ? 'none' : 'width 200ms ease-out',
                }}
              />
            </div>
          )}

          <p
            className={`font-serif text-[11px] italic leading-none ${
              phase === 'ready' || phase === 'refreshing'
                ? 'text-[var(--module-active-700)]'
                : 'text-[var(--ink-3)]'
            }`}
          >
            {phase === 'refreshing'
              ? LABELS.refreshing
              : distance >= PULL_THRESHOLD_PX
                ? LABELS.ready
                : LABELS.pulling}
          </p>
        </div>
      </div>
    </div>
  )
}
