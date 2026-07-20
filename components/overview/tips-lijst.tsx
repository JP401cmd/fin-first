'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Check, Clock, ThumbsDown, MessageCircle, ArrowRight, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import type { Recommendation } from '@/lib/recommendation-data'
import { deepLinkForRecommendation } from '@/lib/recommendation-deep-link'
import { useChatContextOptional } from '@/components/app/chat/chat-provider'
import { ANALYSE_FINANCIEN_PROMPT } from '@/components/app/chat/chat-prompt-deeplink'
import { useOptionalToast } from '@/components/app/toast-provider'

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
 * Geen modal-deeplink naar Fin-chat — de gebruiker beslist hier; alleen
 * een footer-CTA "Vraag Fin om nieuwe voorstellen" opent de chat met
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

/**
 * Zichtbaar undo-venster (ms). De keuze wordt direct optimistisch verwerkt,
 * maar de server-mutatie (POST) volgt pas ná dit venster — zo kost
 * "Ongedaan maken" geen server-roundtrip. Geëxporteerd zodat de test 'm pint.
 */
export const TIP_UNDO_DELAY_MS = 5500

const DECISION_TOAST_TITLE: Record<DecisionKind, string> = {
  accept: 'Tip geaccepteerd',
  postpone: 'Tip uitgesteld',
  reject: 'Tip genegeerd',
}

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
  const chat = useChatContextOptional()
  const { addToast } = useOptionalToast()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  // Openstaande, nog niet doorgevoerde keuzes (delayed-commit). Per tip houden we
  // de keuze + timer vast zodat "Ongedaan maken" de timer kan annuleren en een
  // unmount de POST alsnog direct kan flushen — de keuze gaat nooit verloren.
  const pendingRef = useRef<
    Map<string, { rec: Recommendation; kind: DecisionKind; timer: ReturnType<typeof setTimeout> }>
  >(new Map())

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

  const restoreTip = useCallback((id: string) => {
    setDismissed((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  // De echte server-mutatie. Draait pas ná het undo-venster (of direct bij
  // unmount). Pas ná een geslaagde POST verversen we de canonieke server-data.
  const commitDecision = useCallback(
    async (rec: Recommendation, kind: DecisionKind) => {
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

        onChanged?.()
        if (kind === 'accept') {
          onAccepted?.()
        } else {
          router.refresh()
        }
      } catch {
        // Mislukt: tip terug in de lijst zodat de gebruiker opnieuw kan kiezen;
        // een toast maakt het falen zichtbaar.
        restoreTip(rec.id)
        addToast({
          type: 'error',
          title: 'Niet opgeslagen',
          message: 'Je keuze is niet opgeslagen — probeer het opnieuw.',
        })
      }
    },
    [onChanged, onAccepted, router, addToast, restoreTip],
  )

  // Ref met de laatste commit zodat het unmount-effect kan flushen zonder de
  // pending-keuzes bij elke re-render (nieuwe commit-identiteit) prematuur te
  // triggeren — de cleanup mag ALLEEN bij echte unmount lopen.
  const commitRef = useRef(commitDecision)
  useEffect(() => {
    commitRef.current = commitDecision
  }, [commitDecision])

  // Bij unmount (bv. wegnavigeren): alle nog niet verlopen keuzes alsnog direct
  // doorvoeren zodat een keuze nooit verloren gaat.
  useEffect(() => {
    const pending = pendingRef.current
    return () => {
      for (const { rec, kind, timer } of pending.values()) {
        clearTimeout(timer)
        void commitRef.current(rec, kind)
      }
      pending.clear()
    }
  }, [])

  const decide = useCallback(
    (rec: Recommendation, kind: DecisionKind) => {
      // Al een openstaande keuze voor deze tip? Negeer dubbelklikken.
      if (pendingRef.current.has(rec.id)) return

      // 1) Direct optimistisch verbergen zodat de UI meteen reageert.
      setDismissed((prev) => new Set(prev).add(rec.id))

      // 2) POST plannen ná het undo-venster.
      const timer = setTimeout(() => {
        pendingRef.current.delete(rec.id)
        void commitDecision(rec, kind)
      }, TIP_UNDO_DELAY_MS)
      pendingRef.current.set(rec.id, { rec, kind, timer })

      // 3) Toast met "Ongedaan maken" — annuleert de timer (geen server-call)
      //    en toont de tip weer.
      addToast({
        type: 'info',
        title: DECISION_TOAST_TITLE[kind],
        // Iets korter dan de commit-delay: de undo-knop verdwijnt gegarandeerd
        // vóórdat de POST vuurt (geen "ongedaan"-klik op een al-verstuurde keuze).
        duration: TIP_UNDO_DELAY_MS - 300,
        action: {
          label: 'Ongedaan maken',
          onClick: () => {
            const entry = pendingRef.current.get(rec.id)
            if (entry) {
              clearTimeout(entry.timer)
              pendingRef.current.delete(rec.id)
            }
            restoreTip(rec.id)
          },
        },
      })
    },
    [addToast, commitDecision, restoreTip],
  )

  if (visible.length === 0) {
    return (
      <section aria-label="Tips" className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-6 text-center">
        <Sparkles className="mx-auto h-6 w-6 text-wil-400" aria-hidden="true" />
        <h2 className="mt-2 font-serif text-lg text-[var(--ink)]">Geen tips wachten op je</h2>
        <p className="mt-1 text-sm text-[var(--ink-3)]">
          Vraag Fin om een doorlichting voor een verse tip.
        </p>
        <button
          type="button"
          onClick={() => chat?.openWithMessage(ANALYSE_FINANCIEN_PROMPT)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-wil-500 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-wil-600"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
          Vraag Fin om tips
        </button>
      </section>
    )
  }

  return (
    <section aria-label="Tips" className="space-y-2.5">
      <header className="flex items-baseline justify-between">
        <h2 className="font-serif text-lg sm:text-xl text-[var(--ink)]">
          Toptips van Fin
        </h2>
        <button
          type="button"
          onClick={() => chat?.openWithMessage(ANALYSE_FINANCIEN_PROMPT)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-wil-700 hover:text-wil-800"
        >
          <MessageCircle className="h-3 w-3" aria-hidden="true" />
          Vraag meer
        </button>
      </header>

      <ul className="space-y-2.5" role="list">
        {visible.map((rec) => (
          <TipCard key={rec.id} rec={rec} onDecide={decide} />
        ))}
      </ul>
    </section>
  )
}

function TipCard({
  rec,
  onDecide,
}: {
  rec: Recommendation
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
          className="inline-flex items-center gap-1 rounded-full bg-wil-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-wil-600"
        >
          <Check className="h-3 w-3" aria-hidden="true" />
          Doe nu
        </button>
        <button
          type="button"
          onClick={() => onDecide(rec, 'postpone')}
          className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100"
        >
          <Clock className="h-3 w-3" aria-hidden="true" />
          Later
        </button>
        <button
          type="button"
          onClick={() => onDecide(rec, 'reject')}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-[var(--paper)] px-3 py-1 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          <ThumbsDown className="h-3 w-3" aria-hidden="true" />
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
