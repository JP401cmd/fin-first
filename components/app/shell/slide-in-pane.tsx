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

type SlideInPaneProps = {
  open: boolean
  onClose: () => void
  /** Optionele back-knop in pane-header. Wanneer aangereikt verschijnt ←
   *  links naast de titel; anders alleen ✕ rechts. Use-case: pane "verdiept"
   *  (transactie-detail vanuit budget — plan §6.1). */
  onBack?: () => void
  title?: string
  children: ReactNode
  /** Optionele actions in pane-header (rechts naast titel, vóór ✕). */
  actions?: ReactNode
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
      className="hidden lg:flex fixed right-0 z-40 flex-col bg-[var(--paper)] border-l border-[var(--border-ed)] shadow-[-4px_0_24px_-12px_rgba(0,0,0,0.12)] lg:w-[480px] xl:w-[560px]"
      style={{
        top: 'var(--header-height)',
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
      {/* Pane-header — back-knop links (optioneel), titel midden, actions + ✕ rechts.
          Krant-stijl: scherpe hoeken, geen rounded. Hoogte 56px = 1px ruimer
          dan AppHeader (57px) zodat content-area visueel niet wegschuift. */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-ed)] px-4 py-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Terug"
            className="touch-target text-[var(--ink-3)] hover:bg-[var(--subtle)] hover:text-[var(--ink-2)] shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}

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

        {/* Spacer wanneer geen titel maar wel back-knop, zodat actions/✕ rechts blijven. */}
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

      {/* Body — eigen scroll, safe-area-padding onderaan voor iOS-notch op iPad-landscape. */}
      <div
        className="min-h-0 flex-1 overflow-y-auto safe-bottom"
        style={{ overscrollBehaviorY: 'contain' }}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
