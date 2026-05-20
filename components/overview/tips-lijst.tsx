'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles,
  Check,
  Clock,
  X,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Recommendation } from '@/lib/recommendation-data'
import {
  HEFBOOM_CONFIG,
  HEFBOOM_FOR_RECOMMENDATION,
} from '@/lib/hefboom-config'

/**
 * TipsLijst — prioriteerbare lijst van Will-recommendations met 3
 * acties per item: "Doe nu", "Later", "Negeren".
 *
 * Plan T-5 (Tier-2 #11): "Tips-overzicht als prioriteerbare lijst,
 * niet als losse cards. Eén top-tip per week met 'doe dit nu / negeer /
 * later' als actie."
 *
 * Persist via supabase.from('recommendations').update({ status }).
 * Plan: status mapping naar drie acties:
 *  - "Doe nu"    → status = 'accepted'  (gebruiker zet om in actie)
 *  - "Later"     → status = 'postponed' (zichtbaar maar lager priori)
 *  - "Negeren"   → status = 'rejected'  (verbergen)
 *
 * Lijst toont alleen status='pending' items (active backlog). Recently
 * actioned/rejected zijn niet meer zichtbaar — user kan ze terugzien
 * op /will#voorstellen.
 */

const ACTION_LABELS: Record<'accepted' | 'postponed' | 'rejected', {
  label: string
  Icon: LucideIcon
  tone: string
}> = {
  accepted: { label: 'Doe nu', Icon: Check, tone: 'text-emerald-700 border-emerald-200 hover:bg-emerald-50' },
  postponed: { label: 'Later', Icon: Clock, tone: 'text-amber-700 border-amber-200 hover:bg-amber-50' },
  rejected: { label: 'Negeren', Icon: X, tone: 'text-stone-700 border-stone-200 hover:bg-stone-50' },
}

/**
 * Plan T-3: tips zijn altijd gekoppeld aan één van de vier hefbomen.
 * Mapping en visuele config staan in `lib/hefboom-config.ts` — gedeeld
 * met BriefingPanel zodat hefboom-tags overal identiek ogen.
 */

export function TipsLijst({
  recommendations,
}: {
  recommendations: Recommendation[]
}) {
  const router = useRouter()
  // Optimistic-UI: track welke items zijn weggevallen (om flicker te
  // vermijden tussen klik en router.refresh).
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pending = recommendations.filter(
    (r) => r.status === 'pending' && !hidden.has(r.id),
  )

  async function handleAction(
    id: string,
    nextStatus: 'accepted' | 'postponed' | 'rejected',
  ) {
    setSaving(id)
    setError(null)
    // Optimistic: verberg meteen
    setHidden((prev) => new Set(prev).add(id))
    const supabase = createClient()
    const { error: updateError } = await supabase
      .from('recommendations')
      .update({ status: nextStatus })
      .eq('id', id)
    setSaving(null)
    if (updateError) {
      // Rollback bij fout
      setHidden((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setError(`Opslaan mislukt: ${updateError.message}`)
      return
    }
    router.refresh()
  }

  if (pending.length === 0) {
    return (
      <article className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6 sm:p-8 text-center">
        <span className="inline-flex w-10 h-10 rounded-xl bg-violet-50 items-center justify-center mb-3">
          <Sparkles className="w-5 h-5 text-violet-700" aria-hidden="true" />
        </span>
        <h2 className="font-serif text-lg text-[var(--ink)] mb-2">
          Geen openstaande tips
        </h2>
        <p className="text-sm text-[var(--ink-2)] leading-relaxed">
          Will heeft op dit moment geen nieuwe aanbevelingen. Check terug
          na de volgende briefing of bekijk je gearchiveerde tips via{' '}
          <Link href="/will" className="underline hover:text-[var(--ink-2)]">
            /will
          </Link>
          .
        </p>
      </article>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {error}
        </div>
      )}
      {pending.map((rec, i) => (
        <article
          key={rec.id}
          className="rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5"
        >
          <header className="flex items-start gap-3 mb-2">
            <span
              className={`inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${
                i === 0
                  ? 'bg-violet-100 text-violet-700'
                  : 'bg-[var(--subtle)] text-[var(--ink-3)]'
              } text-xs font-bold`}
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              {i === 0 && (
                <div className="text-[10px] uppercase tracking-[0.08em] font-semibold text-violet-700 mb-0.5">
                  Top tip deze week
                </div>
              )}
              <h3 className="text-sm font-semibold text-[var(--ink)] leading-tight">
                {rec.title}
              </h3>
              {rec.description && (
                <p className="mt-1 text-xs text-[var(--ink-2)] leading-snug">
                  {rec.description}
                </p>
              )}
              {(() => {
                const hefboom = HEFBOOM_FOR_RECOMMENDATION[rec.recommendation_type]
                if (!hefboom) return null
                const cfg = HEFBOOM_CONFIG[hefboom]
                const HefIcon = cfg.Icon
                return (
                  <div
                    data-testid="hefboom-tag"
                    className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.tint}`}
                  >
                    <HefIcon className="w-3 h-3" aria-hidden="true" />
                    {cfg.label}
                  </div>
                )
              })()}
            </div>
          </header>

          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            {(Object.keys(ACTION_LABELS) as Array<keyof typeof ACTION_LABELS>).map(
              (status) => {
                const meta = ACTION_LABELS[status]
                const ActionIcon = meta.Icon
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => handleAction(rec.id, status)}
                    disabled={saving === rec.id}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${meta.tone}`}
                  >
                    <ActionIcon className="w-3 h-3" aria-hidden="true" />
                    {meta.label}
                  </button>
                )
              },
            )}
            <ImpactBadges
              freedomDays={rec.freedom_days_per_year}
              euroMonthly={rec.euro_impact_monthly}
              euroYearly={rec.euro_impact_yearly}
            />
          </div>
        </article>
      ))}

      <p className="text-[11px] italic text-[var(--ink-3)] text-center pt-2">
        {pending.length} openstaande tip{pending.length === 1 ? '' : 's'} —
        gearchiveerde tips terug te vinden op{' '}
        <Link href="/will" className="underline hover:text-[var(--ink-2)]">
          /will
        </Link>
        .
      </p>
    </div>
  )
}

/**
 * Impact-badges per tip — toont vrijheidsdagen + EUR-impact per maand of
 * jaar. Past de TriFinity-filosofie "Geld is opgeslagen tijd" toe door
 * beide eenheden naast elkaar te tonen.
 */
function ImpactBadges({
  freedomDays,
  euroMonthly,
  euroYearly,
}: {
  freedomDays: number | null
  euroMonthly: number | null
  euroYearly: number | null
}) {
  const hasFreedom = freedomDays != null && freedomDays > 0
  // Geef voorrang aan euroYearly als die er is — meer "concreet
  // groot bedrag" dan maandelijks. Anders euroMonthly × 12.
  const yearly = euroYearly ?? (euroMonthly != null ? euroMonthly * 12 : null)
  const hasYearly = yearly != null && yearly > 0
  if (!hasFreedom && !hasYearly) return null
  return (
    <span className="ml-auto inline-flex items-center gap-2 text-[10px] text-[var(--ink-3)]">
      {hasYearly && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-1.5 py-0.5 font-semibold">
          +€{Math.round(yearly).toLocaleString('nl-NL')}/jr
        </span>
      )}
      {hasFreedom && (
        <span className="inline-flex items-center gap-1">
          <Sparkles className="w-3 h-3" aria-hidden="true" />
          +{Math.round(freedomDays)} dagen vrijheid/jr
        </span>
      )}
    </span>
  )
}
