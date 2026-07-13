'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * MilestoneCelebration — een ingetogen, zelf-sluitend viermoment in krant-stijl.
 *
 * Filosofie (P-05, besluit 4 uit docs/ux-review-jul2026.md §8): mijlpalen worden
 * gevierd, maar **ingetogen en krant-waardig** — alleen bij échte mijlpalen
 * (eerste bezitting, doel 100%), nooit bij routine-saves. Geen confetti, geen
 * emoji, geen "Yay!". Framing is feitelijk en waardig, in vrijheidstaal.
 *
 * Vorm: een gecentreerd editorial vignet (paper-blok, harde ink-rand, scherpe
 * hoeken) met ornament `✦`, een Playfair-kop met precies één `<em>`-accent, en
 * één Source-Serif-zin die de betekenis duidt. Zachte fade-in, auto-dismiss na
 * ~4,5s, met een subtiele sluitknop. GEEN blokkerende modal en NIET het
 * overlay/nav-pill-signaal — de viering zweeft boven de content en verdwijnt
 * vanzelf.
 *
 * Once-guard: `hasCelebrated(key)` / `markCelebrated(key)` op localStorage per
 * mijlpaal-key. **Per-device** (localStorage) — bewust geaccepteerd: een viering
 * is een momentopname, geen cross-device-status. Wie op twee apparaten dezelfde
 * mijlpaal passeert kan 'm twee keer zien; dat is onschadelijk en niet de moeite
 * van een server-rondgang waard. Voor cross-device onthouden (zoals de status-
 * banner) bestaat een eigen-rij-pref-pad; celebrations vallen daar bewust buiten.
 *
 * Module-accent loopt via `--module-active-*` (route-breed gezet) — geen
 * hardcodes. Respecteert `prefers-reduced-motion` (instant, geen translate).
 */

const STORAGE_PREFIX = 'tf-celebrated:'

/** True wanneer de mijlpaal met deze key al eerder is gevierd (per-device). */
export function hasCelebrated(key: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key) === '1'
  } catch {
    return false
  }
}

/** Markeer de mijlpaal met deze key als gevierd (per-device). */
export function markCelebrated(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, '1')
  } catch {
    /* private mode / storage disabled — degradeer stil, viering toont dan telkens */
  }
}

export interface MilestoneCelebrationProps {
  /** localStorage once-guard key, uniek per mijlpaal (bv. 'first-asset', `goal-reached:${id}`). */
  celebrationKey: string
  /**
   * Playfair-kop. Bevat idealiter precies één `<em>`-accent (wordt automatisch
   * in module-accent + italic gezet). Bv. `<>Je eerste <em>bezitting</em> staat.</>`.
   */
  title: ReactNode
  /** Eén Source-Serif-zin die de betekenis duidt in vrijheidstaal. */
  meaning: string
  /** Hairline-kicker boven de kop. Default 'Mijlpaal'. */
  kicker?: string
  /** Auto-dismiss-duur in ms. Default 4500. */
  durationMs?: number
  /** Aangeroepen wanneer de viering zichzelf sluit (auto-dismiss, sluitknop, of overslaan). */
  onDismiss?: () => void
}

export function MilestoneCelebration({
  celebrationKey,
  title,
  meaning,
  kicker = 'Mijlpaal',
  durationMs = 4500,
  onDismiss,
}: MilestoneCelebrationProps) {
  // Bevries de once-beslissing bij de eerste render zodat een re-render (bv.
  // door router.refresh of parent-state) 'm niet mid-animatie omgooit.
  const shouldShowRef = useRef<boolean | null>(null)
  if (shouldShowRef.current === null) {
    shouldShowRef.current = !hasCelebrated(celebrationKey)
  }
  const shouldShow = shouldShowRef.current

  const [reduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [visible, setVisible] = useState(false)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (!shouldShow) {
      // Al eerder gevierd — niets tonen; geef de parent-state meteen vrij.
      onDismissRef.current?.()
      return
    }
    markCelebrated(celebrationKey)

    // Fade-in: één frame na mount de eindstate zetten zodat de transition pakt.
    // (Reduced motion → direct zichtbaar, geen transition.)
    let enterT: ReturnType<typeof setTimeout> | undefined
    if (reduced) {
      setVisible(true)
    } else {
      enterT = setTimeout(() => setVisible(true), 10)
    }

    // Auto-dismiss: fade-out, dan onDismiss ná de fade zodat de exit zichtbaar is.
    let exitT: ReturnType<typeof setTimeout> | undefined
    const dismissT = setTimeout(() => {
      setVisible(false)
      if (reduced) {
        onDismissRef.current?.()
      } else {
        exitT = setTimeout(() => onDismissRef.current?.(), 260)
      }
    }, durationMs)

    return () => {
      if (enterT) clearTimeout(enterT)
      clearTimeout(dismissT)
      if (exitT) clearTimeout(exitT)
    }
    // celebrationKey/durationMs/reduced zijn stabiel voor de levensduur van deze mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!shouldShow) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed left-1/2 z-[70] w-[min(92vw,26rem)] -translate-x-1/2 top-[calc(env(safe-area-inset-top,0px)+4rem)]"
    >
      <div
        className="pointer-events-auto relative border border-[var(--ink)] bg-[var(--paper)] px-6 py-6 text-center shadow-[var(--s2)]"
        style={{
          opacity: visible ? 1 : 0,
          transform: reduced ? 'none' : visible ? 'translateY(0)' : 'translateY(-8px)',
          transition: reduced
            ? 'none'
            : 'opacity 240ms ease-out, transform 240ms ease-out',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setVisible(false)
            onDismissRef.current?.()
          }}
          aria-label="Sluiten"
          className="absolute right-2.5 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-3)] transition-colors hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--module-active-500)]"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
        </button>

        <div
          aria-hidden="true"
          className="mb-2 text-[15px] leading-none"
          style={{ color: 'var(--module-active-500)' }}
        >
          ✦
        </div>

        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--module-active-700)]">
          {kicker}
        </p>

        <h3
          className="mx-auto max-w-[24ch] text-[20px] font-bold leading-tight tracking-[-0.01em] text-[var(--ink)] sm:text-[22px] [&_em]:font-normal [&_em]:italic [&_em]:text-[var(--module-active-700)]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          {title}
        </h3>

        <p className="mx-auto mt-2 max-w-[34ch] font-serif text-sm italic leading-snug text-[var(--ink-2)]">
          {meaning}
        </p>
      </div>
    </div>
  )
}
