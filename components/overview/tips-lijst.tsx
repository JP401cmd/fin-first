'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Check, Clock, ThumbsDown, Loader2, MessageCircle, ArrowRight, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { Recommendation } from '@/lib/recommendation-data'
import { deepLinkForRecommendation } from '@/lib/recommendation-deep-link'

/**
 * TipsLijst — toptips bovenaan /overzicht/tips. Toont pending +
 * postponed-ready recommendations met inline beslissingsknoppen:
 *   - Doe nu     → status='accepted', maakt acties aan (bestaande flow)
 *   - Later      → status='postponed' met postponed_until = now + 14d
 *   - Negeren    → status='rejected'
 *
 * Sortering: priority_score desc (hoogste prioriteit bovenaan); bij gelijke
 * score winnen postponed-ready voor pending zodat herziene tips opvallen.
 *
 * Geen modal-deeplink naar Will-chat — de gebruiker beslist hier; alleen
 * een footer-CTA "Vraag Will om nieuwe voorstellen" opent de chat met
 * een passende kick-off-prompt.
 */
interface TipsLijstProps {
  recommendations: Recommendation[]
  /** Wordt aangeroepen na elke mutatie zodat de parent de page-data ververst. */
  onChanged?: () => void
  /** Aanvullend op onChanged: alleen bij accept aangeroepen — parent kan
   * scrollen naar de nieuwe actie zodat de gebruiker de uitkomst ziet. */
  onAccepted?: () => void
}

type DecisionKind = 'accept' | 'postpone' | 'reject'

const POSTPONE_DAYS = 14

function sortTips(recs: Recommendation[]): Recommendation[] {
  const now = new Date()
  const isReady = (r: Recommendation) =>
    r.status === 'postponed' && !!r.postponed_until && new Date(r.postponed_until) <= now
  return [...recs].sort((a, b) => {
    // Postponed-ready bovenaan binnen dezelfde prio-bucket
    const readyDelta = (isReady(b) ? 1 : 0) - (isReady(a) ? 1 : 0)
    if (readyDelta !== 0) return readyDelta
    return (b.priority_score ?? 0) - (a.priority_score ?? 0)
  })
}

export function TipsLijst({ recommendations, onChanged, onAccepted }: TipsLijstProps) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<{ id: string; kind: DecisionKind } | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  // Filter alleen pending + postponed-ready; expired/rejected/accepted horen
  // hier niet thuis. Postponed-niet-ready slaan we ook over (wachttijd loopt).
  const visible = useMemo(() => {
    const now = Date.now()
    return sortTips(
      recommendations.filter((r) => {
        if (dismissed.has(r.id)) return false
        if (r.status === 'pending') return true
        if (r.status === 'postponed' && r.postponed_until) {
          return new Date(r.postponed_until).getTime() <= now
        }
        return false
      }),
    )
  }, [recommendations, dismissed])

  async function decide(rec: Recommendation, kind: DecisionKind) {
    if (loadingId) return
    setLoadingId({ id: rec.id, kind })

    const body: Record<string, unknown> = { action: kind }
    if (kind === 'postpone') {
      body.postponed_until = new Date(Date.now() + POSTPONE_DAYS * 86400 * 1000).toISOString()
    }

    try {
      const res = await fetch(`/api/ai/recommendations/${rec.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error('decision failed')

      // Optimistisch UI: tip uit lijst halen. router.refresh haalt de
      // canonieke server-data op (incl. nieuwe actions bij accept).
      setDismissed((prev) => new Set(prev).add(rec.id))
      onChanged?.()
      if (kind === 'accept') {
        onAccepted?.()
      } else {
        router.refresh()
      }
    } catch {
      // niets — gebruiker kan opnieuw klikken
    } finally {
      setLoadingId(null)
    }
  }

  if (visible.length === 0) {
    return (
      <section aria-label="Tips" className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-6 text-center">
        <Sparkles className="mx-auto h-6 w-6 text-wil-400" aria-hidden="true" />
        <h2 className="mt-2 font-serif text-lg text-[var(--ink)]">Geen tips wachten op je</h2>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Vraag Will om een doorlichting voor een verse tip.
        </p>
        <Link
          href="/berichten?prompt=analyseer-mijn-financien"
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-wil-500 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-wil-600"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Vraag Will om tips
        </Link>
      </section>
    )
  }

  return (
    <section aria-label="Tips" className="space-y-2.5">
      <header className="flex items-baseline justify-between">
        <h2 className="font-serif text-lg sm:text-xl text-[var(--ink)]">
          Toptips van Will
        </h2>
        <Link
          href="/berichten?prompt=analyseer-mijn-financien"
          className="inline-flex items-center gap-1 text-xs font-semibold text-wil-700 hover:text-wil-800"
        >
          <MessageCircle className="h-3 w-3" aria-hidden="true" />
          Vraag meer
        </Link>
      </header>

      <ul className="space-y-2.5" role="list">
        {visible.map((rec) => (
          <TipCard
            key={rec.id}
            rec={rec}
            loading={loadingId?.id === rec.id ? loadingId.kind : null}
            onDecide={decide}
          />
        ))}
      </ul>
    </section>
  )
}

function TipCard({
  rec,
  loading,
  onDecide,
}: {
  rec: Recommendation
  loading: DecisionKind | null
  onDecide: (rec: Recommendation, kind: DecisionKind) => void
}) {
  const days = rec.freedom_days_per_year ?? 0
  const monthly = rec.euro_impact_monthly
  const isReadyAgain = rec.status === 'postponed'
  // Sluit de vrijheids-loop: breng de gebruiker van inzicht → naar de plek
  // waar de wijziging écht doorgevoerd wordt (budget/bezit/schuld). De
  // helper ligt al klaar maar werd nergens in de UI gerenderd.
  const deepLink = deepLinkForRecommendation(rec)
  return (
    <li className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 shadow-[var(--s0)]">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-wil-500" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h3 className="font-serif text-base font-semibold text-[var(--ink)] leading-snug">
              {rec.title}
            </h3>
            {isReadyAgain && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                <Clock className="h-2.5 w-2.5" aria-hidden="true" />
                Eerder uitgesteld
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-[var(--ink-2)] leading-snug">{rec.description}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--ink-3)]">
            <span className="font-medium text-wil-600">
              +{days} {days === 1 ? 'dag' : 'dagen'} vrijheid/jaar
            </span>
            {monthly != null && monthly !== 0 && (
              <span>&euro;{Math.abs(monthly)}/mnd</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onDecide(rec, 'accept')}
          disabled={loading !== null}
          className="inline-flex items-center gap-1 rounded-full bg-wil-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-wil-600 disabled:opacity-50"
        >
          {loading === 'accept' ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="h-3 w-3" aria-hidden="true" />
          )}
          Doe nu
        </button>
        <button
          type="button"
          onClick={() => onDecide(rec, 'postpone')}
          disabled={loading !== null}
          className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
        >
          {loading === 'postpone' ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <Clock className="h-3 w-3" aria-hidden="true" />
          )}
          Later
        </button>
        <button
          type="button"
          onClick={() => onDecide(rec, 'reject')}
          disabled={loading !== null}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-[var(--paper)] px-3 py-1 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
        >
          {loading === 'reject' ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <ThumbsDown className="h-3 w-3" aria-hidden="true" />
          )}
          Negeren
        </button>
      </div>

      {deepLink && (
        <Link
          href={deepLink.href}
          target={deepLink.isExternal ? '_blank' : undefined}
          rel={deepLink.isExternal ? 'noopener noreferrer' : undefined}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-wil-700 transition-colors hover:text-wil-800"
        >
          {deepLink.label}
          {deepLink.isExternal ? (
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          )}
        </Link>
      )}
    </li>
  )
}
