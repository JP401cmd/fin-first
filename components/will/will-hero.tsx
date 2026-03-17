'use client'

import { useState } from 'react'
import { Sparkles, Info, X, CalendarCheck } from 'lucide-react'
import { WillDots } from '@/components/app/will-dots'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface WillHeroProps {
  completedActions: {
    id: string
    status: string
    freedom_days_impact: number
    source: string
    completed_at: string | null
    created_at: string
    recommendation: { recommendation_type: string }[] | null
  }[]
  allActions: {
    id: string
    status: string
    freedom_days_impact: number
    completed_at: string | null
    created_at: string
  }[]
  openActions: {
    id: string
    status: string
    freedom_days_impact: number
    due_date: string | null
  }[]
  allPendingRecs: {
    id: string
    recommendation_type: string
    freedom_days_per_year: number
  }[]
  goals: { id: string }[]
  goalProgresses: { pct: number }[]
  completedGoalCount: number
  totalGoalCount: number
  /** Optional: check-in available banner */
  checkinAvailable?: boolean
}

/* ------------------------------------------------------------------ */
/*  Helper: HeroTooltip (teal-themed, for hero section)                */
/* ------------------------------------------------------------------ */

function HeroTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        aria-label="Meer informatie"
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
        className="touch-target"
      >
        <Info
          className={`h-4 w-4 cursor-help transition-colors ${
            open ? 'text-wil-300' : 'text-wil-400/50'
          } group-hover:text-wil-300`}
        />
      </button>
      <div
        role="tooltip"
        className={`absolute left-0 z-10 mt-1 w-64 rounded-lg border border-wil-700/50 bg-wil-900/95 p-3 text-xs leading-relaxed text-wil-100 shadow-[var(--s2)] backdrop-blur-sm transition-opacity ${
          open
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'
        }`}
      >
        {text}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Helper: KpiTooltip (neutral, for KPI stat cards)                   */
/* ------------------------------------------------------------------ */

function KpiTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label="Meer informatie"
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
        className="touch-target"
      >
        <Info
          className={`h-4 w-4 cursor-help transition-colors ${
            open ? 'text-wil-500' : 'text-[var(--ink-4)]'
          } group-hover:text-wil-500`}
        />
      </button>
      <div
        role="tooltip"
        className={`absolute right-0 z-10 mt-1 w-56 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 text-xs leading-relaxed text-[var(--ink-2)] shadow-[var(--s2)] transition-opacity ${
          open
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'
        }`}
      >
        {text}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Willpower score helper                                             */
/* ------------------------------------------------------------------ */

function getWillpowerScore(ratio: number): string {
  if (ratio > 80) return 'A'
  if (ratio > 60) return 'B'
  if (ratio > 40) return 'C'
  if (ratio > 20) return 'D'
  return 'E'
}

const WILLPOWER_LABELS: Record<string, string> = {
  A: 'uitstekend — je voert uit',
  B: 'sterk — goed bezig',
  C: 'groeiend — momentum bouwt op',
  D: 'startend — eerste stappen gezet',
  E: 'begin je reis',
}

/* ------------------------------------------------------------------ */
/*  WillHero component                                                 */
/* ------------------------------------------------------------------ */

export function WillHero({
  completedActions,
  allActions,
  openActions,
  allPendingRecs,
  goals,
  goalProgresses,
  completedGoalCount,
  totalGoalCount,
  checkinAvailable = false,
}: WillHeroProps) {
  const [checkinDismissed, setCheckinDismissed] = useState(false)

  /* ---------- Calculations ---------- */

  // Total freedom days won (all time)
  const totalFreedomDaysWon = completedActions.reduce(
    (sum, a) => sum + (Number(a.freedom_days_impact) || 0),
    0,
  )

  // Weekly freedom days won (current ISO week, starting Monday)
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1))
  weekStart.setHours(0, 0, 0, 0)
  const weeklyFreedomDaysWon = completedActions
    .filter((a) => a.completed_at && new Date(a.completed_at) >= weekStart)
    .reduce((sum, a) => sum + (Number(a.freedom_days_impact) || 0), 0)

  // Open potential: open action days + pending recommendation days
  const openActionDays = openActions.reduce(
    (sum, a) => sum + (Number(a.freedom_days_impact) || 0),
    0,
  )
  const pendingRecDays = allPendingRecs.reduce(
    (sum, r) => sum + (Number(r.freedom_days_per_year) || 0),
    0,
  )
  const openPotential = openActionDays + pendingRecDays

  // Completion ratio
  const totalActions = allActions.length
  const completionRatio =
    totalActions > 0
      ? Math.round((completedActions.length / totalActions) * 100)
      : 0

  // Average decision time (days from created_at to completed_at)
  const decisionDays: number[] = []
  for (const a of allActions) {
    if (a.status === 'completed' && a.completed_at) {
      const created = new Date(a.created_at).getTime()
      const decided = new Date(a.completed_at).getTime()
      const diff = Math.max(
        0,
        Math.round((decided - created) / (1000 * 60 * 60 * 24)),
      )
      decisionDays.push(diff)
    }
  }
  const avgDecisionDays =
    decisionDays.length > 0
      ? Math.round(
          decisionDays.reduce((s, d) => s + d, 0) / decisionDays.length,
        )
      : 0

  // Average goal progress
  const avgGoalProgress =
    goalProgresses.length > 0
      ? Math.round(
          goalProgresses.reduce((s, g) => s + g.pct, 0) / goalProgresses.length,
        )
      : 0

  // Willpower score
  const willpowerScore = getWillpowerScore(completionRatio)

  /* ---------- Render ---------- */

  return (
    <>
      {/* Check-in banner */}
      {checkinAvailable && !checkinDismissed && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-[var(--r)] border border-wil-200 bg-wil-50/60 px-4 py-3">
          <div className="flex items-center gap-3">
            <CalendarCheck className="h-4 w-4 shrink-0 text-wil-600" />
            <p className="text-sm text-wil-700">
              <span className="font-medium">Check-in beschikbaar</span>{' '}
              — neem even de tijd om je voortgang te evalueren.
            </p>
          </div>
          <button
            type="button"
            aria-label="Verberg check-in melding"
            onClick={() => setCheckinDismissed(true)}
            className="shrink-0 rounded-full p-1 text-wil-400 transition-colors hover:bg-wil-100 hover:text-wil-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Hero section */}
      <section
        data-testid="wil-hero"
        className="bg-[var(--paper)] border border-[var(--border-ed)] border-b-[var(--border-md)] overflow-hidden"
      >
        {/* Teal top accent bar */}
        <div className="h-1.5 bg-wil-500" />

        <div className="p-4 sm:p-6 md:p-8">
          {/* Avatar + label */}
          <div className="mb-3 sm:mb-6 flex items-center gap-3">
            <WillDots size={40} />
            <p className="label-editorial text-wil-600">
              Jouw wilskracht in actie
            </p>
          </div>

          {/* Primary metric: total freedom days won */}
          <div
            className="mb-2 flex items-baseline gap-2"
            data-testid="wil-hero-primary-metric"
          >
            <span
              className="font-display text-[36px] sm:text-[44px] md:text-[52px] font-bold tracking-tight text-[var(--ink)]"
              data-testid="wil-hero-freedom-days-value"
            >
              {totalFreedomDaysWon > 0 ? `+${totalFreedomDaysWon}` : '0'}
            </span>
            <span
              className="ml-3 font-serif italic text-lg text-[var(--ink-3)]"
              data-testid="wil-hero-freedom-days-label"
            >
              {totalFreedomDaysWon === 1
                ? 'vrijheidsdag gewonnen'
                : 'vrijheidsdagen gewonnen'}
            </span>
            <HeroTooltip text="Gewonnen vrijheidsdagen komen uitsluitend van voltooide acties in De Wil. Elke afgeronde actie levert concrete vrijheidsdagen op." />
          </div>

          {/* Weekly freedom days badge */}
          <div
            className="mb-3 sm:mb-5 flex items-center gap-3"
            data-testid="wil-hero-weekly-summary"
          >
            <div className="inline-flex items-center gap-2 rounded-full bg-wil-50 px-3 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-wil-500" />
              <span
                className="text-sm font-medium text-wil-700"
                data-testid="weekly-freedom-days-value"
              >
                Deze week: +
                {weeklyFreedomDaysWon % 1 === 0
                  ? weeklyFreedomDaysWon
                  : weeklyFreedomDaysWon.toFixed(1)}{' '}
                {weeklyFreedomDaysWon === 1
                  ? 'vrijheidsdag'
                  : 'vrijheidsdagen'}{' '}
                gewonnen
              </span>
            </div>
          </div>

          {/* Completion ratio progress bar */}
          <div className="mb-4 sm:mb-6">
            <div className="h-[5px] w-full overflow-hidden rounded-full bg-wil-100">
              <div
                className="h-full rounded-full bg-wil-500 transition-all duration-1000"
                style={{ width: `${Math.min(completionRatio, 100)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-[var(--ink-4)]">
              <span>0% acties voltooid</span>
              <span className="font-mono tabular-nums">
                {completionRatio}% afgerond
              </span>
              <span>100%</span>
            </div>
          </div>

          {/* 3 Sub KPIs */}
          <div
            className="grid grid-cols-1 gap-3 sm:gap-5 sm:grid-cols-3"
            data-testid="wil-hero-sub-kpis"
          >
            {/* KPI 1: Acties voltooid */}
            <div data-testid="wil-hero-acties-voltooid">
              <p className="label-editorial text-[var(--ink-3)]">
                Acties voltooid
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-[var(--ink)]">
                {completedActions.length} van {totalActions}
              </p>
              <p className="font-serif italic text-sm text-[var(--ink-3)]">
                bewuste keuzes gemaakt
              </p>
            </div>

            {/* KPI 2: Open potentieel */}
            <div data-testid="wil-hero-open-potentieel">
              <div className="flex items-center gap-1.5">
                <p className="label-editorial text-[var(--ink-3)]">
                  Open potentieel
                </p>
                <HeroTooltip text="Open potentieel toont vrijheidsdagen die je kunt winnen door openstaande acties en aanbevelingen in De Wil af te ronden." />
              </div>
              <p className="mt-1 font-mono text-2xl font-bold text-[var(--ink)]">
                +{openPotential} dagen
              </p>
              <p className="font-serif italic text-sm text-[var(--ink-3)]">
                nog te winnen
              </p>
            </div>

            {/* KPI 3: Beslissnelheid */}
            <div data-testid="wil-hero-beslissnelheid">
              <p className="label-editorial text-[var(--ink-3)]">
                Beslissnelheid
              </p>
              <p className="mt-1 font-mono text-2xl font-bold text-[var(--ink)]">
                {decisionDays.length > 0 ? `${avgDecisionDays} dagen` : '-'}
              </p>
              <p className="font-serif italic text-sm text-[var(--ink-3)]">
                gem. tijd tot beslissing
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* KPI Stat Cards */}
      <section
        data-testid="wil-kpi-grid"
        className="mt-4 sm:mt-8 grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {/* Doelvoortgang */}
        <div className="card-editorial p-3 sm:p-5" data-testid="kpi-doelvoortgang">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-[var(--r)] bg-wil-50">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-wil-600" />
            </div>
            <KpiTooltip text="Gemiddelde voortgang over al je actieve financiele doelen." />
          </div>
          <p className="text-sm font-medium text-[var(--ink-3)]">
            Doelvoortgang
          </p>
          <p className="mt-1 text-3xl font-bold text-[var(--ink)]">
            {goals.length > 0 ? `${avgGoalProgress}%` : '-'}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            {goals.length > 0
              ? `over ${goals.length} actieve doelen`
              : 'geen actieve doelen'}
          </p>
        </div>

        {/* Wilskrachtscore */}
        <div
          className="card-editorial p-3 sm:p-5"
          data-testid="kpi-wilskrachtscore"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-[var(--r)] bg-wil-50">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-wil-600" />
            </div>
            <KpiTooltip text="Je wilskrachtscore (A-E) is gebaseerd op het percentage voltooide acties. Hoe meer je uitvoert, hoe hoger je score." />
          </div>
          <p className="text-sm font-medium text-[var(--ink-3)]">
            Wilskrachtscore
          </p>
          <p className="mt-1 text-3xl font-bold text-[var(--ink)]">
            {willpowerScore}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            {WILLPOWER_LABELS[willpowerScore]}
          </p>
        </div>

        {/* Doelen voltooid */}
        <div
          className="card-editorial p-3 sm:p-5"
          data-testid="kpi-doelen-voltooid"
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-[var(--r)] bg-wil-50">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-wil-600" />
            </div>
            <KpiTooltip text="Aantal voltooide doelen ten opzichte van het totaal aantal doelen dat je hebt aangemaakt." />
          </div>
          <p className="text-sm font-medium text-[var(--ink-3)]">
            Doelen voltooid
          </p>
          <p className="mt-1 text-3xl font-bold text-[var(--ink)]">
            {completedGoalCount}/{totalGoalCount}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            {totalGoalCount > 0
              ? `${Math.round((completedGoalCount / totalGoalCount) * 100)}% bereikt`
              : 'stel je eerste doel'}
          </p>
        </div>
      </section>
    </>
  )
}
