'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { X, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { WillDots } from '@/components/app/will-dots'

// ── localStorage key ────────────────────────────────────────────────────
const DISMISSED_KEY = 'trifinity_coach_bubble_dismissed'

// ── Types ───────────────────────────────────────────────────────────────

type CoachSuggestion = {
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

// ── Data-gap-based suggestions (prioriteit: bank > assets > budget > goals) ──

const DATA_GAP_SUGGESTIONS: {
  check: (gaps: CoachDataGaps) => boolean
  suggestion: CoachSuggestion
}[] = [
  {
    // Hoogste prioriteit: geen bankrekening
    check: (g) => !g.hasBank,
    suggestion: {
      message: 'Voeg je eerste bankrekening toe om je saldo te zien en transacties automatisch te importeren.',
      cta: 'Rekening toevoegen',
      ctaHref: '/core/cash/connect',
    },
  },
  {
    // Geen assets (maar eventueel wel bank — bank is ook een asset)
    check: (g) => !g.hasAssets,
    suggestion: {
      message: 'Voeg je vermogen toe — spaargeld, beleggingen, je woning — voor een compleet financieel beeld.',
      cta: 'Vermogen toevoegen',
      ctaHref: '/core/assets',
    },
  },
  {
    // Heeft bank + assets, maar geen budget
    check: (g) => !g.hasBudgets,
    suggestion: {
      message: 'Stel je eerste budget in om grip te krijgen op je maandelijkse uitgaven.',
      cta: 'Budget instellen',
      ctaHref: '/core/budgets',
    },
  },
  {
    // Heeft alles behalve doelen
    check: (g) => !g.hasGoals,
    suggestion: {
      message: 'Stel je financiële doelen in — zo weet je precies waar je naartoe werkt.',
      cta: 'Doelen bekijken',
      ctaHref: '/will',
    },
  },
]

/**
 * Bepaal de meest impactvolle suggestie op basis van data-gaps.
 * Retourneert null als er geen gap is (alles is ingevuld).
 */
function getDataGapSuggestion(gaps: CoachDataGaps): CoachSuggestion | null {
  for (const entry of DATA_GAP_SUGGESTIONS) {
    if (entry.check(gaps)) return entry.suggestion
  }
  return null
}

// ── Path-based coaching suggestions (fallback) ──────────────────────────

const PATH_SUGGESTIONS: Record<string, CoachSuggestion> = {
  '/core/budgets': {
    message: 'Voeg je eerste budget toe om grip te krijgen op je uitgaven.',
    cta: 'Budget toevoegen',
  },
  '/core/debts': {
    message: 'Registreer je schulden om je aflosstrategie in kaart te brengen.',
    cta: 'Schuld toevoegen',
  },
  '/core': {
    message: 'Dit is je financieel fundament. Voeg bezittingen en schulden toe voor een compleet overzicht.',
    cta: 'Overzicht bekijken',
  },
  '/will': {
    message: 'Hier vind je gepersonaliseerde tips en acties om je financiële doelen te bereiken.',
    cta: 'Tips bekijken',
  },
  '/horizon': {
    message: 'Ontdek wanneer je financieel vrij kunt zijn en speel met scenario\'s.',
    cta: 'Projectie bekijken',
  },
  '/nieuws': {
    message: 'Je persoonlijke financiële krant staat klaar. Lees het laatste nieuws.',
    cta: 'Eerste artikel lezen',
  },
}

const DEFAULT_SUGGESTION: CoachSuggestion = {
  message: 'Welkom! Verken de app en ontdek wat je financiële vrijheid betekent.',
  cta: 'Aan de slag',
  ctaHref: '/core',
}

/**
 * Zoek de beste suggestie op basis van het huidige pad.
 * Matcht eerst exact, dan prefix (bv. `/core/assets/cash` → `/core`).
 */
function getPathSuggestion(pathname: string): CoachSuggestion {
  if (PATH_SUGGESTIONS[pathname]) return PATH_SUGGESTIONS[pathname]

  // Prefix-match: langste prefix eerst
  const prefixes = Object.keys(PATH_SUGGESTIONS).sort(
    (a, b) => b.length - a.length,
  )
  for (const prefix of prefixes) {
    if (pathname.startsWith(prefix + '/') || pathname === prefix) {
      return PATH_SUGGESTIONS[prefix]
    }
  }

  return DEFAULT_SUGGESTION
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
}

/**
 * CoachBubble — Verschijnt na onboarding-voltooiing (`?welcome=1`) als
 * een vriendelijke, niet-blokkerende coaching-tip. De WillDots-mascotte
 * begeleidt de gebruiker naar hun eerste meaningvolle actie.
 *
 * Kenmerken:
 *  - Data-gap-gebaseerde suggestie (bank > assets > budget > goals)
 *  - Fallback naar pad-afhankelijke suggestie
 *  - 1.5s vertraging zodat WelcomeBanner eerst verschijnt
 *  - Persistente dismissal via localStorage
 *  - Auto-dismissal na 45 seconden
 *  - Niet-blokkerend: fixed position, pagina blijft bruikbaar
 */
export function CoachBubble({ dataGaps }: CoachBubbleProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [animating, setAnimating] = useState(false)

  const isWelcome = searchParams.get('welcome') === '1'

  // Toon de bubble alleen bij welcome=1 én niet eerder dismissed
  useEffect(() => {
    if (!isWelcome) return

    const dismissed = localStorage.getItem(DISMISSED_KEY)
    if (dismissed) return

    // Vertraging: laat WelcomeBanner eerst verschijnen
    const timer = setTimeout(() => {
      setVisible(true)
      // Entrance animation
      requestAnimationFrame(() => setAnimating(true))
    }, 1500)

    return () => clearTimeout(timer)
  }, [isWelcome])

  // Auto-dismiss na 45 seconden
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(() => dismiss(), 45_000)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const dismiss = useCallback(() => {
    setAnimating(false)
    // Wacht op exit-animatie
    setTimeout(() => {
      setVisible(false)
      localStorage.setItem(DISMISSED_KEY, Date.now().toString())
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

  if (!visible) return null

  // Data-gap-suggestie heeft voorrang boven pad-gebaseerde suggestie
  const suggestion = (dataGaps && getDataGapSuggestion(dataGaps))
    ?? getPathSuggestion(pathname)

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
      aria-label="Welkomst coaching tip"
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
