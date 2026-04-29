'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────
//
// A one-shot confirmation banner that appears on the destination page
// after a successful save. This is the "happy flow" companion to the
// existing `ToastProvider` — use a toast for ephemeral cross-page
// feedback, and this banner for inline success state anchored to
// content the user just created or edited.
//
// The banner auto-dismisses after `durationMs` (default 5s — within
// the 4-6s window prescribed by the design bible) and can be dismissed
// manually via an icon-only close button. An optional "Ongedaan maken"
// link renders on the right: supply `undoHref` for a navigation-based
// undo, or `onUndo` for a local handler. `undoLabel` can override the
// default Dutch copy if needed for specific contexts.

export type SuccessBannerProps = {
  /**
   * The success message shown in serif body font.
   * Active voice with "je" — e.g. "Je hebt je budget opgezet."
   */
  message: string
  /**
   * Optional href to navigate to when the user clicks the undo link.
   * Mutually exclusive with `onUndo`; if both are provided `undoHref` wins.
   */
  undoHref?: string
  /**
   * Optional click handler for the undo link (useful for local state
   * reversal without navigation).
   */
  onUndo?: () => void
  /**
   * Label for the undo action. Defaults to "Ongedaan maken".
   */
  undoLabel?: string
  /**
   * Auto-dismiss timeout in ms. Default 5000 (5s).
   * Pass `0` to disable auto-dismiss (user must close manually).
   */
  durationMs?: number
}

/**
 * SuccessBanner — Inline success confirmation banner in `--positive` tint.
 *
 * Krant-esthetiek: scherpe hoeken, Source Serif body, UPPERCASE kicker.
 * Accessible: `role="status"` + `aria-live="polite"`, 44px touch target
 * on close, respects `prefers-reduced-motion`.
 *
 * @example
 * ```tsx
 * <SuccessBanner
 *   message="Je hebt je budget opgezet."
 *   undoHref="/core/budgets?undo=last"
 *   undoLabel="Ongedaan maken"
 * />
 * ```
 */
export function SuccessBanner({
  message,
  undoHref,
  onUndo,
  undoLabel = 'Ongedaan maken',
  durationMs = 5000,
}: SuccessBannerProps) {
  // Dismissed: once true, the component renders nothing. Irreversible in
  // a single mount — caller controls lifecycle via React key if re-show
  // is needed.
  const [dismissed, setDismissed] = useState(false)

  // Entered controls the entry animation. We flip it to `true` on the
  // first animation frame after mount so the browser can paint the
  // pre-entry state first (opacity 0 + translateY). Without this two-
  // step render the transition never plays.
  const [entered, setEntered] = useState(false)

  // Respect prefers-reduced-motion. Read once on mount; this value does
  // not need to react to runtime changes because the entrance animation
  // only plays on mount.
  const reducedMotionRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // `matchMedia` is unavailable in some test environments (JSDOM) and
    // legacy browsers. Treat that as "no preference" and play the
    // animation — safer than throwing during mount.
    reducedMotionRef.current =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false

    // If motion is reduced, skip the animation entirely by entering
    // on the next tick without the transform offset.
    if (reducedMotionRef.current) {
      setEntered(true)
      return
    }

    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  // Auto-dismiss timer. `durationMs === 0` disables the timer so callers
  // can pin the banner until the user closes it (rare — use sparingly).
  useEffect(() => {
    if (durationMs <= 0) return
    const id = window.setTimeout(() => setDismissed(true), durationMs)
    return () => window.clearTimeout(id)
  }, [durationMs])

  if (dismissed) return null

  const reduced = reducedMotionRef.current
  const hasUndo = Boolean(undoHref || onUndo)

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="success-banner"
      className="flex items-start gap-3 border border-[var(--positive)]/30 bg-[var(--positive)]/10 px-4 py-3 text-positive"
      style={{
        // Entry animation: fade-in + slide-down 200ms with an inline
        // transition so we can gate it on `prefers-reduced-motion`
        // without adding new CSS keyframes.
        opacity: entered ? 1 : 0,
        transform: entered ? 'translateY(0)' : 'translateY(-8px)',
        transition: reduced ? 'none' : 'opacity 200ms ease-out, transform 200ms ease-out',
      }}
    >
      {/* Left column: kicker + message (serif body) */}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-[0.08em] font-medium leading-none mb-1">
          GELUKT
        </p>
        <p className="font-serif text-base leading-snug">{message}</p>
      </div>

      {/* Undo link — rendered on the right, aligned to the message baseline
          by the flex container. Uses a Next Link when an href is given so
          intra-app transitions stay client-side. */}
      {hasUndo && (
        <div className="flex-shrink-0 pt-[2px]">
          {undoHref ? (
            <Link
              href={undoHref}
              onClick={onUndo}
              className="text-sm underline-offset-2 hover:underline focus-visible:underline focus:outline-none"
            >
              {undoLabel}
            </Link>
          ) : (
            <button
              type="button"
              onClick={onUndo}
              className="text-sm underline-offset-2 hover:underline focus-visible:underline focus:outline-none"
            >
              {undoLabel}
            </button>
          )}
        </div>
      )}

      {/* Close button — icon-only, min 44x44 touch target per WCAG AAA.
          The visual icon is smaller (16px) but the hit-area is padded
          out via w-11/h-11 to meet the touch target requirement. */}
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Sluiten"
        className="flex-shrink-0 inline-flex h-11 w-11 -m-3 items-center justify-center text-positive hover:opacity-70 focus-visible:opacity-70 focus:outline-none"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
