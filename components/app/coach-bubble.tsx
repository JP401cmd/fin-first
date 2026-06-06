'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { X, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { WillDots } from '@/components/app/will-dots'
import {
  getFirstUndismissedSuggestion,
  DEFAULT_COACH_TIMING,
  DEFAULT_COACH_HEADER,
  type CoachSuggestion,
  type CoachDataGaps,
  type DeferredField,
  type CoachOverrides,
} from '@/lib/coach-suggestions'
import type { ModuleId } from '@/lib/module-registry'

// Re-export for backwards-compatible imports from this module.
export type { CoachDataGaps, DeferredField } from '@/lib/coach-suggestions'

// ── localStorage keys ───────────────────────────────────────────────────
/** Legacy key (pre-gezien-tracking) — migrated on first load */
const LEGACY_DISMISSED_KEY = 'trifinity_coach_bubble_dismissed'
/** New per-suggestion dismissed tracking (JSON array of keys) */
const DISMISSED_SUGGESTIONS_KEY = 'trifinity_coach_dismissed_suggestions'

// ── Dismissed-suggestions helpers ───────────────────────────────────────

function getDismissedKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_SUGGESTIONS_KEY)
    if (raw) return new Set(JSON.parse(raw) as string[])
  } catch { /* corrupt data — start fresh */ }
  return new Set()
}

function addDismissedKey(key: string): void {
  const dismissed = getDismissedKeys()
  dismissed.add(key)
  localStorage.setItem(DISMISSED_SUGGESTIONS_KEY, JSON.stringify([...dismissed]))
}

/**
 * Migrate from legacy single-key dismissal to per-suggestion tracking.
 * If old key exists, we import it as dismissing the "default" suggestion
 * and remove the old key. Existing users won't see a jarring new bubble.
 */
function migrateLegacyDismissal(): void {
  try {
    const legacy = localStorage.getItem(LEGACY_DISMISSED_KEY)
    if (legacy) {
      addDismissedKey('default')
      localStorage.removeItem(LEGACY_DISMISSED_KEY)
    }
  } catch { /* ignore */ }
}

// ── Component ───────────────────────────────────────────────────────────

export type CoachBubbleProps = {
  /**
   * Data-gap signalen vanuit de server-layout (feature #792). Wanneer
   * aanwezig, overruled de data-gap-suggestie de pad-gebaseerde suggestie.
   * Prioriteit: bank > assets > budget > goals. Wanneer er geen gap
   * gedetecteerd is, valt de bubble terug op pad-gebaseerde suggesties.
   */
  dataGaps?: CoachDataGaps
  /**
   * Velden die de gebruiker expliciet heeft overgeslagen met "Later invullen"
   * tijdens onboarding (feature #830). Wanneer aanwezig, krijgen deferred-
   * suggesties hogere prioriteit dan data-gap-suggesties. Auto-resolved
   * wanneer de onderliggende data inmiddels aanwezig is.
   */
  deferredFields?: DeferredField[]
  /**
   * Admin-overrides per regel (tekst/CTA/aan-uit), uit app_settings
   * 'coach_config'. Beheerd via /beheer/coach.
   */
  overrides?: CoachOverrides
  /**
   * Actieve modules van de gebruiker. Gate-t de module-gekoppelde data-gap-
   * suggesties (schulden/transacties/holdings/ISIN/FIRE/levensgebeurtenissen):
   * een gap verschijnt alleen als de bijbehorende module actief is. Wanneer
   * niet meegegeven, vindt geen module-gating plaats.
   */
  activeModules?: ModuleId[]
  /** Vertraging vóór de bubble verschijnt (ms). Default 1500. */
  delayMs?: number
  /** Tijd waarna de bubble automatisch sluit (ms). Default 45000. */
  autoDismissMs?: number
  /** Header-label boven het bericht. Default "Tip van Will". */
  headerLabel?: string
}

/**
 * CoachBubble — Verschijnt als een vriendelijke, niet-blokkerende
 * coaching-tip. Het WillDots-mascotte begeleidt de gebruiker naar hun
 * eerste meaningvolle actie.
 *
 * De catalogus van suggesties en de selectie-logica leven in
 * lib/coach-suggestions.ts; dit component is puur presentatie + timing +
 * gezien-tracking (localStorage).
 *
 * Kenmerken:
 *  - Per-suggestie gezien-tracking via localStorage
 *  - Data-gap-gebaseerde suggestie (bank > assets > budget > goals)
 *  - Fallback naar pad-afhankelijke suggestie
 *  - Na sluiten verschijnt dezelfde suggestie niet opnieuw
 *  - Configureerbare timing + header-label + per-regel overrides (/beheer/coach)
 *  - Niet-blokkerend: fixed position, pagina blijft bruikbaar
 */
export function CoachBubble({
  dataGaps,
  deferredFields,
  overrides,
  activeModules,
  delayMs = DEFAULT_COACH_TIMING.delayMs,
  autoDismissMs = DEFAULT_COACH_TIMING.autoDismissMs,
  headerLabel = DEFAULT_COACH_HEADER,
}: CoachBubbleProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [animating, setAnimating] = useState(false)
  /** Ref to the current suggestion so dismiss always tracks the correct key */
  const activeSuggestionRef = useRef<CoachSuggestion | null>(null)
  /** Prevent showing a second bubble after user already dismissed one this mount */
  const dismissedThisMount = useRef(false)

  // ── Show bubble on mount if there's an applicable undismissed suggestion ──
  useEffect(() => {
    if (dismissedThisMount.current) return

    // Migrate legacy single-key dismissal → per-suggestion tracking
    migrateLegacyDismissal()

    const dismissed = getDismissedKeys()
    const suggestion = getFirstUndismissedSuggestion(dataGaps, pathname, dismissed, deferredFields, overrides, activeModules)

    if (!suggestion) return

    activeSuggestionRef.current = suggestion

    // Vertraging: laat pagina-content eerst verschijnen
    const timer = setTimeout(() => {
      setVisible(true)
      // Entrance animation
      requestAnimationFrame(() => setAnimating(true))
    }, delayMs)

    return () => clearTimeout(timer)
  // Re-evaluate when pathname changes (client navigation), dataGaps, deferredFields, overrides, activeModules or delay change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, dataGaps, deferredFields, overrides, activeModules, delayMs])

  // Auto-dismiss na de geconfigureerde duur
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => dismiss(), autoDismissMs)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, autoDismissMs])

  const dismiss = useCallback(() => {
    setAnimating(false)
    dismissedThisMount.current = true

    // Track the specific suggestion that was dismissed
    const key = activeSuggestionRef.current?.key
    if (key) {
      addDismissedKey(key)
    }

    // Wacht op exit-animatie
    setTimeout(() => {
      setVisible(false)
      activeSuggestionRef.current = null
    }, 300)
  }, [])

  const handleCtaClick = useCallback(() => {
    dismiss()
    // Verwijder welcome param als de CTA geen navigatie heeft
    const params = new URLSearchParams(searchParams.toString())
    params.delete('welcome')
    const qs = params.toString()
    router.replace(pathname + (qs ? `?${qs}` : ''), { scroll: false })
  }, [dismiss, searchParams, router, pathname])

  if (!visible || !activeSuggestionRef.current) return null

  const suggestion = activeSuggestionRef.current

  return (
    <div
      className={`
        fixed z-50
        bottom-24 right-4
        md:bottom-6 md:right-6
        max-w-sm w-[calc(100%-2rem)]
        transition-all duration-300 ease-out
        ${animating
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4'
        }
      `}
      role="complementary"
      aria-label="Coaching tip"
    >
      <div className="relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s2)]">
        {/* Accent bar */}
        <div className="h-0.5 bg-gradient-to-r from-wil-400 via-kern-400 to-horizon-400" />

        <div className="p-4">
          {/* Close */}
          <button
            type="button"
            onClick={dismiss}
            className="absolute right-2.5 top-3 rounded-[var(--r-sm)] p-1 text-[var(--ink-4)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--ink-3)]"
            aria-label="Sluiten"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          {/* Content */}
          <div className="flex items-start gap-3 pr-6">
            {/* Mascot */}
            <div className="shrink-0 mt-0.5">
              <WillDots size={32} state="talking" />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[var(--ink)] leading-snug">
                {headerLabel}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-[var(--ink-2)]">
                {suggestion.message}
              </p>

              {/* CTA */}
              {suggestion.ctaHref ? (
                <Link
                  href={suggestion.ctaHref}
                  onClick={handleCtaClick}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-[var(--r-sm)] bg-wil-50 px-3 py-1.5 text-xs font-medium text-wil-700 transition-colors hover:bg-wil-100"
                >
                  {suggestion.cta}
                  <ArrowRight className="h-3 w-3" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={handleCtaClick}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-[var(--r-sm)] bg-wil-50 px-3 py-1.5 text-xs font-medium text-wil-700 transition-colors hover:bg-wil-100"
                >
                  {suggestion.cta}
                  <ArrowRight className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
