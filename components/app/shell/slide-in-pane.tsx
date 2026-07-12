'use client'

/**
 * SANDBOX / Fase 0 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §3.4 (slide-in pane)
 * Achter feature-flag in productie. Voor nu: alleen sandbox-test.
 *
 * Desktop-only overlay-pane die van rechts in glijdt (lg: ≥1024px).
 * Onder lg rendert de component bewust `null` — mobile gebruikt straks
 * stack-push (Fase 0.5), niet deze pane.
 *
 * Bewuste keuzes:
 *  - GEEN dim-overlay/backdrop: onderliggende content moet leesbaar blijven
 *    naast de pane. Dit is het kernverschil met BottomSheet.
 *  - GEEN `rounded-*` (krant-stijl, scherpe hoeken).
 *  - Tailwind `lg:`-classes ipv `useMediaQuery` — server-rendered, geen flicker.
 *  - Hergebruikt `useFocusTrap` voor a11y (canonieke referentie: bottom-sheet.tsx).
 *  - `prefers-reduced-motion`: instant-show, geen slide-animatie.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, X } from 'lucide-react'
import { useFocusTrap } from '@/lib/hooks/use-focus-trap'
import { acquireOverlay } from '@/lib/overlay-signal'

/**
 * Pane-actie voor primaire / secundaire knop in de standaard footer-bar.
 * Hergebruikt het visuele patroon van `mobile-bottom-bar.tsx` action-bar
 * variant (primary = solid ink-bg, secondary = outline) zodat desktop pane
 * en mobile bottom-bar één visuele taal delen. Touch-target ≥44px is via
 * `min-h-11` afgedwongen.
 */
export type PaneAction = {
  label: string
  onClick: () => void
  /** Wanneer true: knop is gedisabled (opacity 50, geen cursor-pointer). */
  disabled?: boolean
  /** Wanneer true op de primary: vervang label door "…" en blokkeer click. */
  loading?: boolean
}

type SlideInPaneProps = {
  open: boolean
  onClose: () => void
  /** Optionele back-knop in pane-header. Wanneer aangereikt verschijnt ←
   *  links naast de titel met deze handler; anders valt de ←-knop terug op
   *  `onClose` (zodat de affordance altijd bestaat — sommige flows tonen
   *  een bevestiging op back terwijl ✕ rechts een snelle exit blijft). */
  onBack?: () => void
  title?: string
  children: ReactNode
  /** Optionele actions in pane-header (rechts naast titel, vóór ✕). */
  actions?: ReactNode
  /** Standaard footer-actie. Wanneer minimaal één van primary/secondary is
   *  doorgegeven verschijnt een sticky footer-bar onderin de pane. Beide
   *  weggelaten = geen footer (geen lege bar). */
  primaryAction?: PaneAction
  secondaryAction?: PaneAction
  /** Optionele context-info in de footer-bar, gerenderd vóór de actie-knoppen
   *  (links). Gebruikt om bv. een live-preview-bedrag of validatie-status naast
   *  Opslaan/Annuleren te tonen, zodat de gebruiker bij het bedienen van de
   *  primaire actie direct ziet welk resultaat ze opslaat. Geen footer als
   *  zowel acties als info weggelaten zijn. */
  footerInfo?: ReactNode
}

const SLIDE_DURATION_MS = 240
const SLIDE_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)'

export function SlideInPane({
  open,
  onClose,
  onBack,
  title,
  children,
  actions,
  primaryAction,
  secondaryAction,
  footerInfo,
}: SlideInPaneProps) {
  // `mounted` controleert of we überhaupt in de portal renderen. Tijdens de
  // exit-animatie blijven we gemount totdat de transitionend-callback klaar is,
  // zodat de slide-out zichtbaar is voordat de DOM-node verdwijnt.
  const [mounted, setMounted] = useState(false)
  // `entered` triggert de transform (closed → open). We zetten deze in een
  // requestAnimationFrame nadat we mounten, zodat het browser-paint twee
  // verschillende states ziet (translateX(100%) → 0) en de transitie effectief is.
  const [entered, setEntered] = useState(false)

  const paneRef = useRef<HTMLDivElement>(null)
  // Sync onClose-callback via effect (niet tijdens render) — anders triggert de
  // React-linter `react-hooks/refs`. We willen de laatste onClose binnen
  // event-handlers gebruiken zonder ze in deps-arrays te hoeven herhalen.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  const titleId = useId()

  // `prefersReducedMotion` als state (niet ref) — we lezen de waarde tijdens
  // render om de `transition`-style te bepalen. Lazy-initial zorgt dat de
  // initial render direct correct is (geen flash met animatie tijdens
  // hydration als de gebruiker reduced-motion aan heeft staan). Daarna
  // luisteren we via een effect naar OS-wijzigingen (handler is een external
  // subscription — geen 'setState in effect body'-anti-pattern).
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  // ── Mount / enter / exit lifecycle ───────────────────────────
  // Canonieke entry/exit-animatie-pattern (zelfde als BottomSheet):
  // we synchroniseren een externe waarneembare staat (DOM-render-cycle +
  // transitionend-tijdslijn) met de `open`-prop. setState binnen dit effect
  // is bewust — alternatief (afgeleide state via render) zou de exit-animatie
  // onmogelijk maken omdat de component direct unmount bij `open=false`.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setMounted(true)
      // Eerst painten in closed state, dan toggelen naar entered. Dubbel rAF
      // is nodig omdat React de DOM batched: één rAF garandeert mount-paint,
      // de tweede triggert de transform-transitie.
      const raf1 = requestAnimationFrame(() => {
        const raf2 = requestAnimationFrame(() => setEntered(true))
        return () => cancelAnimationFrame(raf2)
      })
      return () => cancelAnimationFrame(raf1)
    }

    // open = false: trigger exit. Als reduced-motion: instant-unmount.
    if (!mounted) return
    if (prefersReducedMotion) {
      setEntered(false)
      setMounted(false)
      return
    }

    setEntered(false)
    // Wacht tot transition klaar is voordat we unmounten — anders flickert
    // de pane uit zonder slide-out.
    const timer = setTimeout(() => setMounted(false), SLIDE_DURATION_MS + 20)
    return () => clearTimeout(timer)
  }, [open, mounted, prefersReducedMotion])
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Escape-key sluit pane ────────────────────────────────────
  useEffect(() => {
    if (!mounted) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mounted])

  // ── Focus-trap (canonieke hook, zelfde als BottomSheet) ──────
  useFocusTrap({ active: mounted && entered, containerRef: paneRef })

  // ── FloatingNavButton verbergen zolang de pane open is ───────
  // Gehaakt op de `open`-prop (niet `mounted`), zodat het signaal DIRECT bij
  // close-start vrijkomt en de pill soepel terugkomt tijdens de slide-out.
  // De pane is desktop-only (`hidden lg:flex`) waar de pill al `lg:hidden` is,
  // dus dit is vooral consistentie met BottomSheet — geen zichtbaar effect op
  // desktop. Zie lib/overlay-signal.ts.
  useEffect(() => {
    if (!open) return
    return acquireOverlay()
  }, [open])

  const handleClose = useCallback(() => {
    onCloseRef.current()
  }, [])

  if (!mounted) return null
  if (typeof document === 'undefined') return null

  // De `hidden lg:flex` zorgt ervoor dat de pane onder 1024px überhaupt niet
  // in de layout verschijnt. Combined met de `null`-check in mounted boven is
  // dit een dubbele veiligheidsklep voor mobile.
  return createPortal(
    <div
      ref={paneRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      // z-index = 40: bewust LAGER dan zwevende FAB's (chat-panel, activation-
      // button) op `z-50`. De chat-bubble moet boven de pane blijven floaten
      // omdat hij globale assistentie aanbiedt — ook tijdens een open pane.
      // Om visuele overlap met de pane-footer-knoppen rechtsonderin te
      // voorkomen, worden de footer-knoppen LINKS uitgelijnd (zie footer-bar
      // hieronder). Zo blijft de chat-FAB bereikbaar én vallen de pane-acties
      // ruim links van de bubble.
      className="hidden lg:flex fixed right-0 z-40 flex-col bg-[var(--paper)] border-l border-[var(--border-ed)] shadow-[-4px_0_24px_-12px_rgba(0,0,0,0.12)] lg:w-[560px] xl:w-[680px]"
      style={{
        // Pane reikt tot de bovenkant van de viewport — geen header-strook
        // om onder te schuiven (Sidebar+TopBar leven via een portal naast de
        // pane). Tot 0 doorlopen geeft visueel ruimte voor een prominente
        // close-affordance bovenin. `bottom: 0` blijft ongemoeid.
        top: 0,
        bottom: 0,
        // Closed state: volledig rechts uit beeld. Open state: 0.
        // We gebruiken inline-style omdat de transitie tussen twee states
        // moet animeren — Tailwind `data-[state=open]` zou een rebuild
        // van het transform-arsenaal vergen, dit is duidelijker.
        transform: entered ? 'translateX(0)' : 'translateX(100%)',
        transition: prefersReducedMotion
          ? 'none'
          : `transform ${SLIDE_DURATION_MS}ms ${SLIDE_EASING}`,
        willChange: 'transform',
      }}
    >
      {/* Pane-header — back-knop links (standaard), titel midden, actions + ✕ rechts.
          Krant-stijl: scherpe hoeken, geen rounded. Hoogte 56px.
          De ←-knop is **altijd** zichtbaar: wanneer geen `onBack` is doorgegeven
          valt deze terug op `onClose`, zodat de affordance bestaat ongeacht
          de flow. ✕ rechtsboven blijft daarnaast als snelle-exit-knop staan. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-ed)] px-4 py-3">
        <button
          type="button"
          onClick={onBack ?? handleClose}
          aria-label={onBack ? 'Terug' : 'Sluiten'}
          className="touch-target text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {title && (
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span
              aria-hidden
              className="inline-block h-px w-7 shrink-0"
              style={{ background: 'var(--module-active-500)' }}
            />
            <h3
              id={titleId}
              className="font-bold text-[var(--ink)] truncate"
              style={{ fontFamily: 'var(--font-playfair, serif)' }}
            >
              {title}
            </h3>
          </div>
        )}

        {/* Spacer wanneer geen titel, zodat actions/✕ rechts blijven uitgelijnd. */}
        {!title && <div className="flex-1" />}

        {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}

        <button
          type="button"
          onClick={handleClose}
          aria-label="Sluiten"
          className="touch-target text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] shrink-0"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body — eigen scroll, safe-area-padding onderaan voor iOS-notch op iPad-landscape.
          De buitenste div behoudt scroll-eigenschappen; een inner-wrapper levert de
          standaard content-padding (28→32px horizontaal / 24→28px verticaal). Pixel-
          waarden i.p.v. spacing-tokens omdat de Editorial-tokens niet exact passen
          op de gewenste pane-ademruimte. Consumers renderen géén eigen outer-padding
          meer op het top-level child binnen `<ShellOverlay kind="pane">` — innerlijke
          section-padding (cards, dividers) blijft uiteraard wél aan de consument. */}
      <div
        className="min-h-0 flex-1 overflow-y-auto safe-bottom"
        style={{ overscrollBehaviorY: 'contain' }}
      >
        <div className="px-7 py-6 lg:px-8 lg:py-7">
          {children}
        </div>
      </div>

      {/* Standaard footer-bar — alleen renderen wanneer minimaal één actie of
          context-info is doorgegeven (geen lege bar bij read-only panes). De
          footer staat BUITEN de scroll-div en is daardoor altijd zichtbaar
          onderaan de pane (sticky-gedrag via flex-column-layout: header +
          flex-1 scroll-body + footer). De pane-flex-column zorgt dat de
          footer geen padding nodig heeft op de body — die kan tot onder de
          footer doorscrollen omdat ze in een aparte flex-row leven. */}
      {(primaryAction || secondaryAction || footerInfo) && (
        // Knoppen LINKS uitgelijnd (`justify-start`) — bewust afwijkend van
        // platform-conventie (rechts) om visuele overlap met de zwevende
        // chat-FAB rechtsonderin (z-50, pane is z-40) te voorkomen.
        // Volgorde: footerInfo EERST (links, bv. live preview-bedrag),
        // dan primary, dan secondary. Reden: alle elementen blijven links
        // van de FAB-zone (rechts) gegroepeerd; de info-rail leest als
        // context-anker waarna de actie-knoppen direct ernaast staan.
        // `shrink-0` op info voorkomt dat de tekst inkrimpt onder druk van
        // de knoppen — bij echt smalle panes (lg:560px) staat de hele rij
        // gewoon links uitgelijnd binnen de gap-3 spacing.
        <div className="flex shrink-0 items-center justify-start gap-3 border-t border-[var(--border-ed)] bg-[var(--paper)] px-7 py-4 lg:px-8">
          {footerInfo && (
            <div className="shrink-0 text-[var(--ink-2)]">{footerInfo}</div>
          )}
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled || primaryAction.loading}
              className="inline-flex min-h-11 items-center justify-center bg-[var(--ink)] px-4 text-sm font-medium leading-none text-[var(--paper)] transition-colors hover:bg-[var(--ink-2)] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
            >
              {primaryAction.loading ? `${primaryAction.label} …` : primaryAction.label}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              disabled={secondaryAction.disabled}
              className="inline-flex min-h-11 items-center justify-center border-2 border-[var(--ink)] bg-[var(--paper)] px-4 text-sm font-medium leading-none text-[var(--ink)] transition-colors hover:bg-[var(--subtle)] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ fontFamily: 'var(--font-inter, system-ui, sans-serif)' }}
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  )
}
