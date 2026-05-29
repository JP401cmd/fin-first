'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { X, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { WillDots } from '@/components/app/will-dots'

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

// ── Types ───────────────────────────────────────────────────────────────

type CoachSuggestion = {
  key: string
  message: string
  cta: string
  ctaHref?: string
}

/**
 * Data-gap signalen vanuit de server-layout. Bepalen welke contextuele
 * suggestie de coach-bubble toont. Prioriteit (feature #792):
 *   bank > assets > budget > goals
 */
export type CoachDataGaps = {
  /** Heeft de gebruiker minstens één bankrekening (asset type=cash)? */
  hasBank: boolean
  /** Heeft de gebruiker minstens één actief asset? */
  hasAssets: boolean
  /** Heeft de gebruiker minstens één top-level budget? */
  hasBudgets: boolean
  /** Heeft de gebruiker openstaande acties/doelen? */
  hasGoals: boolean
}

/**
 * Velden die de gebruiker expliciet heeft overgeslagen met "Later invullen"
 * tijdens onboarding (feature #830). Stored in profiles.feature_preferences.deferred_onboarding_fields.
 */
export type DeferredField = 'income' | 'assets' | 'spaardoel'

// ── Deferred-field suggestions (feature #830) ─────────────────────────────
// Targeted messages for fields the user explicitly skipped during onboarding.
// Higher priority than generic data-gap suggestions because they reference
// the user's specific action ("Je hebt X overgeslagen"). Auto-resolve: the
// suggestion is suppressed when the underlying data is now present (the
// `resolved` check uses data gaps to detect fulfilment).
const DEFERRED_FIELD_SUGGESTIONS: {
  field: DeferredField
  key: string
  /** Returns true when the deferred field has been completed — suggestion auto-resolves */
  resolved: (gaps: CoachDataGaps) => boolean
  suggestion: Omit<CoachSuggestion, 'key'>
}[] = [
  {
    field: 'income',
    key: 'deferred_income',
    // Income is resolved when the user has bank accounts (income typically
    // inferred from transactions) or assets — a pragmatic proxy. The real
    // resolution is checking profiles.net_monthly_income > 0, but we don't
    // have that in the client. We'll clear the deferred field via an API
    // endpoint when income is saved.
    resolved: () => false, // resolved via API clear, not data gap
    suggestion: {
      message: 'Je hebt je inkomen overgeslagen bij het instellen. Vul het in voor een nauwkeuriger financieel beeld.',
      cta: 'Inkomen invullen',
      ctaHref: '/identity/profiel',
    },
  },
  {
    field: 'assets',
    key: 'deferred_assets',
    // Resolved when the user has at least one asset
    resolved: (gaps) => gaps.hasAssets,
    suggestion: {
      message: 'Je hebt je bezittingen overgeslagen bij het instellen. Voeg ze toe voor een compleet vermogensoverzicht.',
      cta: 'Bezittingen toevoegen',
      ctaHref: '/core/assets',
    },
  },
  {
    field: 'spaardoel',
    key: 'deferred_spaardoel',
    // Resolved when the user has at least one goal
    resolved: (gaps) => gaps.hasGoals,
    suggestion: {
      message: 'Je hebt je spaardoel overgeslagen bij het instellen. Een concreet doel helpt je sneller sparen.',
      cta: 'Spaardoel instellen',
      ctaHref: '/will',
    },
  },
]

// ── Data-gap-based suggestions (prioriteit: bank > assets > budget > goals) ──

const DATA_GAP_SUGGESTIONS: {
  key: string
  check: (gaps: CoachDataGaps) => boolean
  suggestion: Omit<CoachSuggestion, 'key'>
}[] = [
  {
    key: 'gap_bank',
    // Hoogste prioriteit: geen bankrekening — PSD2-koppeling als eerste stap (#813)
    check: (g) => !g.hasBank,
    suggestion: {
      message: 'Koppel je bank voor automatisch inzicht — je transacties worden vanzelf geïmporteerd en gecategoriseerd.',
      cta: 'Bank koppelen',
      ctaHref: '/core/cash/connect',
    },
  },
  {
    key: 'gap_assets',
    // Geen assets (maar eventueel wel bank — bank is ook een asset)
    check: (g) => !g.hasAssets,
    suggestion: {
      message: 'Voeg je vermogen toe — spaargeld, beleggingen, je woning — voor een compleet financieel beeld.',
      cta: 'Vermogen toevoegen',
      ctaHref: '/core/assets',
    },
  },
  {
    key: 'gap_budgets',
    // Heeft bank + assets, maar geen budget
    check: (g) => !g.hasBudgets,
    suggestion: {
      message: 'Stel je eerste budget in om grip te krijgen op je maandelijkse uitgaven.',
      cta: 'Budget instellen',
      ctaHref: '/core/budgets',
    },
  },
  {
    key: 'gap_goals',
    // Heeft alles behalve doelen
    check: (g) => !g.hasGoals,
    suggestion: {
      message: 'Stel je financiële doelen in — zo weet je precies waar je naartoe werkt.',
      cta: 'Doelen bekijken',
      ctaHref: '/will',
    },
  },
]

// ── Path-based coaching suggestions (fallback) ──────────────────────────

const PATH_SUGGESTIONS: { pathPrefix: string; key: string; suggestion: Omit<CoachSuggestion, 'key'> }[] = [
  {
    pathPrefix: '/core/budgets',
    key: 'path_budgets',
    suggestion: {
      message: 'Voeg je eerste budget toe om grip te krijgen op je uitgaven.',
      cta: 'Budget toevoegen',
    },
  },
  {
    pathPrefix: '/core/debts',
    key: 'path_debts',
    suggestion: {
      message: 'Registreer je schulden om je aflosstrategie in kaart te brengen.',
      cta: 'Schuld toevoegen',
    },
  },
  {
    pathPrefix: '/core',
    key: 'path_core',
    suggestion: {
      message: 'Dit is je financieel fundament. Voeg bezittingen en schulden toe voor een compleet overzicht.',
      cta: 'Overzicht bekijken',
    },
  },
  {
    pathPrefix: '/will',
    key: 'path_will',
    suggestion: {
      message: 'Hier vind je gepersonaliseerde tips en acties om je financiële doelen te bereiken.',
      cta: 'Tips bekijken',
    },
  },
  {
    pathPrefix: '/horizon',
    key: 'path_horizon',
    suggestion: {
      message: 'Ontdek wanneer je financieel vrij kunt zijn en speel met scenario\'s.',
      cta: 'Projectie bekijken',
    },
  },
  {
    pathPrefix: '/nieuws',
    key: 'path_nieuws',
    suggestion: {
      message: 'Je persoonlijke financiële krant staat klaar. Lees het laatste nieuws.',
      cta: 'Eerste artikel lezen',
    },
  },
]

const DEFAULT_SUGGESTION: CoachSuggestion = {
  key: 'default',
  message: 'Welkom! Verken de app en ontdek wat je financiële vrijheid betekent.',
  cta: 'Aan de slag',
  ctaHref: '/core',
}

/**
 * Vind de eerste niet-dismissed suggestie. Prioriteit:
 *  0. Uitgestelde onboarding-velden (feature #830) — specifieke feedback
 *  1. Data-gap suggesties (bank > assets > budget > goals)
 *  2. Pad-gebaseerde suggestie (exacte + prefix match)
 *  3. Default welkomstbericht
 *
 * Retourneert null als alle toepasselijke suggesties al gezien zijn.
 */
function getFirstUndismissedSuggestion(
  dataGaps: CoachDataGaps | undefined,
  pathname: string,
  dismissed: Set<string>,
  deferredFields?: DeferredField[],
): CoachSuggestion | null {
  // 0. Deferred onboarding fields — targeted suggestions for explicitly skipped items
  if (deferredFields && deferredFields.length > 0 && dataGaps) {
    for (const entry of DEFERRED_FIELD_SUGGESTIONS) {
      if (
        deferredFields.includes(entry.field) &&
        !entry.resolved(dataGaps) &&
        !dismissed.has(entry.key)
      ) {
        return { key: entry.key, ...entry.suggestion }
      }
    }
  }

  // 1. Data-gap suggesties
  if (dataGaps) {
    for (const entry of DATA_GAP_SUGGESTIONS) {
      if (entry.check(dataGaps) && !dismissed.has(entry.key)) {
        return { key: entry.key, ...entry.suggestion }
      }
    }
  }

  // 2. Pad-gebaseerde suggestie — exact match eerst, dan prefix (langste eerst)
  //    PATH_SUGGESTIONS is al geordend van specifiek naar breed
  for (const entry of PATH_SUGGESTIONS) {
    const matches =
      pathname === entry.pathPrefix ||
      pathname.startsWith(entry.pathPrefix + '/')
    if (matches && !dismissed.has(entry.key)) {
      return { key: entry.key, ...entry.suggestion }
    }
  }

  // 3. Default welkomstbericht
  if (!dismissed.has(DEFAULT_SUGGESTION.key)) {
    return DEFAULT_SUGGESTION
  }

  return null
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
}

/**
 * CoachBubble — Verschijnt als een vriendelijke, niet-blokkerende
 * coaching-tip. OverzichtlDots-mascotte begeleidt de gebruiker naar hun
 * eerste meaningvolle actie.
 *
 * Kenmerken (feature #791 — gezien-tracking):
 *  - Per-suggestie gezien-tracking via localStorage
 *  - Data-gap-gebaseerde suggestie (bank > assets > budget > goals)
 *  - Fallback naar pad-afhankelijke suggestie
 *  - Na sluiten verschijnt dezelfde suggestie niet opnieuw
 *  - Bij een volgend bezoek kan een andere suggestie verschijnen
 *  - 1.5s vertraging zodat pagina-content eerst verschijnt
 *  - Auto-dismissal na 45 seconden
 *  - Niet-blokkerend: fixed position, pagina blijft bruikbaar
 */
export function CoachBubble({ dataGaps, deferredFields }: CoachBubbleProps) {
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
    const suggestion = getFirstUndismissedSuggestion(dataGaps, pathname, dismissed, deferredFields)

    if (!suggestion) return

    activeSuggestionRef.current = suggestion

    // Vertraging: laat pagina-content eerst verschijnen
    const timer = setTimeout(() => {
      setVisible(true)
      // Entrance animation
      requestAnimationFrame(() => setAnimating(true))
    }, 1500)

    return () => clearTimeout(timer)
  // Re-evaluate when pathname changes (client navigation), dataGaps, or deferredFields change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, dataGaps, deferredFields])

  // Auto-dismiss na 45 seconden
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => dismiss(), 45_000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

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
                Tip van je coach
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
