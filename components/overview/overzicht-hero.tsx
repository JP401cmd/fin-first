'use client'

import { useMemo, useState } from 'react'
import { PageInfoButton } from '@/components/editorial'
import { PAGE_INFO } from '@/lib/page-info-content'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { HealthScoreReceipt } from '@/components/app/horizon/health-score-receipt'
import type { HealthScore } from '@/lib/financial-health'
import type { GoalWithBudget } from '@/lib/will-data-loader'
import { HefbomenNav, HefbomenLegenda } from './overzicht-hero/hefbomen-nav'
import { HealthScoreCard } from './overzicht-hero/health-score-card'
import {
  HealthScoreEmptyState,
  DoelenEmptyState,
} from './overzicht-hero/empty-states'
import {
  VoortgangDoelenCard,
  type GoalProgress,
} from './overzicht-hero/voortgang-doelen-card'
import { MiniTimelineStrip } from './overzicht-hero/mini-timeline-strip'
import { VrijheidStrip } from './overzicht-hero/vrijheid-strip'
import type { HefbomenTotals } from './overzicht-hero/hefbomen-nav'

type OverzichtHeroProps = {
  userName?: string
  health: HealthScore | null
  goals?: GoalWithBudget[]
  goalProgresses?: GoalProgress[]
  /** Percentage op weg naar financiële vrijheid (0-100). Uit healthScoreInput. */
  freedomPct?: number | null
  /** Huidige leeftijd (afgerond) — null bij ontbrekende DOB. */
  currentAge?: number | null
  /** Vrijheidsleeftijd / pensioenleeftijd uit fireStrategy.endAge. */
  endAge?: number | null
  /** Pensioen-modus uit fireStrategy.strategy === 'pensioen'. */
  isPensioenMode?: boolean
  /** Optionele totaalbedragen per hefboom (bezittingen, schulden, etc.). */
  totals?: HefbomenTotals
}

function formatDateNL(): string {
  const formatter = new Intl.DateTimeFormat('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  const parts = formatter.format(new Date())
  return parts.charAt(0).toUpperCase() + parts.slice(1)
}

function greetingByHour(): string {
  const h = new Date().getHours()
  if (h < 6) return 'Goedenacht'
  if (h < 12) return 'Goedemorgen'
  if (h < 18) return 'Goedemiddag'
  return 'Goedenavond'
}

/**
 * OverzichtHero — visuele hero op /overzicht (Tier-2 #4 + #8).
 *
 * Orchestreert: begroeting + datum, vier-hefbomen-tegels, Health Score-card
 * (of empty-state), Voortgang-doelen-card (of empty-state), Vrijheid-strip
 * en Mini-tijdslijn naar vrijheidsmoment. Sub-componenten leven in
 * `./overzicht-hero/`. Drill-down via BottomSheet (kassabon met pillars).
 *
 * Komt bovenop de bestaande WillLanding-content — geen vervanging.
 */
export function OverzichtHero({
  userName,
  health,
  goals,
  goalProgresses,
  freedomPct,
  currentAge,
  endAge,
  isPensioenMode,
  totals,
}: OverzichtHeroProps) {
  const [receiptOpen, setReceiptOpen] = useState(false)

  // Memoize once per mount — datum + groet wisselen zelden tijdens een
  // sessie. Voorkomt onnodige Intl-formatter-instances bij elke re-render.
  const dateLabel = useMemo(() => formatDateNL(), [])
  const greeting = useMemo(() => greetingByHour(), [])

  // Defensief: log dev-warning bij mismatch tussen goals + progresses-arrays.
  // Caller zou ze altijd parallel moeten leveren; mismatch wijst op een
  // loader-bug die anders silent gewone goals zou laten doorvallen.
  if (
    process.env.NODE_ENV !== 'production' &&
    goals &&
    goalProgresses &&
    goalProgresses.length > goals.length
  ) {
    console.warn(
      `[OverzichtHero] goalProgresses.length (${goalProgresses.length}) > ` +
        `goals.length (${goals.length}). Extra progresses worden genegeerd.`,
    )
  }

  // Bouw doelen-display: koppel goals met hun progress op index, sorteer
  // achterop-achter doelen eerst, skip voltooide. Type-guard predicate
  // narrowt zodat we daarna geen non-null assertions nodig hebben.
  const goalDisplay = (goals ?? [])
    .map((g, i) => ({ goal: g, progress: goalProgresses?.[i] ?? null }))
    .filter(
      (g): g is { goal: GoalWithBudget; progress: GoalProgress } =>
        g.progress != null && g.progress.pct < 100,
    )
    .sort((a, b) => Number(!a.progress.onTrack) - Number(!b.progress.onTrack))
    .slice(0, 3)

  return (
    <section className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-6 pb-2 md:pt-8 md:pb-4">
      <PageInfoButton
        description={PAGE_INFO['/overzicht'] ?? ''}
        className="absolute right-4 top-6 sm:right-6 sm:top-8"
      />

      <header className="mb-6 pr-12 sm:pr-16">
        <div className="text-[11px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-4)]">
          {dateLabel}
        </div>
        <h1 className="mt-1 font-serif text-2xl md:text-3xl font-semibold text-[var(--ink)] leading-tight">
          {greeting}
          {userName ? `, ${userName}` : ''}
        </h1>
        {goalDisplay.length > 0 && (
          <p className="mt-2 text-sm sm:text-base text-[var(--ink-2)]">
            <strong className="font-semibold text-[var(--ink)]">
              {goalDisplay.length}
            </strong>{' '}
            {goalDisplay.length === 1 ? 'actief doel' : 'actieve doelen'} — kijk
            hoever je bent.
          </p>
        )}
      </header>

      <HefbomenNav health={health} totals={totals} />
      <HefbomenLegenda />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {health ? (
          <HealthScoreCard health={health} onOpenReceipt={() => setReceiptOpen(true)} />
        ) : (
          <HealthScoreEmptyState />
        )}
        {goalDisplay.length > 0 ? (
          <VoortgangDoelenCard items={goalDisplay} />
        ) : (
          <DoelenEmptyState />
        )}
      </div>

      <VrijheidStrip freedomPct={freedomPct ?? null} />

      {currentAge != null && endAge != null && (
        <MiniTimelineStrip
          currentAge={currentAge}
          endAge={endAge}
          freedomPct={freedomPct ?? 0}
          isPensioenMode={isPensioenMode ?? false}
        />
      )}

      {health && (
        <BottomSheet
          open={receiptOpen}
          onClose={() => setReceiptOpen(false)}
          title="Financiële gezondheid"
          size="lg"
        >
          <HealthScoreReceipt health={health} />
        </BottomSheet>
      )}

      {/* Filosofie-tagline als hero-footer — visueel afsluitend na sheet-mount. */}
      <p className="mt-6 pb-4 text-center text-[11px] uppercase tracking-[0.18em] text-[var(--ink-3)] font-medium">
        Geld is opgeslagen tijd
      </p>
    </section>
  )
}
