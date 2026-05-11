'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, CheckCircle2 } from 'lucide-react'
import type { DashboardData } from '@/components/widgets/widget-renderer'
import { useGoalGuideState } from '@/lib/hooks/use-goal-guide-state'
import { useStandardGuideState } from '@/lib/hooks/use-standard-guide-state'
import { getGoalGuideSteps } from '@/lib/briefing/goal-guide-steps'
import {
  STANDARD_GUIDE_STEPS,
  isStandardStepComplete,
  isAllStandardComplete,
} from '@/lib/briefing/standard-guide-steps'
import { GOAL_CATALOG, isGoalSlug } from '@/lib/goals/catalog'
import type { GoalSlug } from '@/lib/goals/types'
import type { ModuleGuideStep } from '@/lib/briefing/module-guide-steps'

// ── Per-goal accent (zelfde mapping als GoalGuideCard) ──────────────────

const GOAL_ACCENT: Record<GoalSlug, 'kern' | 'wil' | 'horizon' | 'cross'> = {
  'grip-uitgaven': 'kern',
  'vermogen-overzicht': 'kern',
  noodfonds: 'wil',
  'schulden-aflossen': 'kern',
  'eerder-stoppen': 'horizon',
  'bewust-leven': 'wil',
}

// ── Accent classes — identiek aan GoalGuideCard ─────────────────────────

type Accent = 'kern' | 'wil' | 'horizon' | 'cross'

const ACCENT_CLASSES: Record<Accent, {
  border: string
  bar: string
  dotDone: string
  dotOpen: string
  lineDone: string
  lineOpen: string
}> = {
  kern: {
    border: 'border-l-kern-400',
    bar: 'bg-kern-500',
    dotDone: 'bg-emerald-500 border-emerald-500',
    dotOpen: 'border-kern-300 bg-[var(--paper)]',
    lineDone: 'bg-kern-400',
    lineOpen: 'bg-[var(--border-ed)]',
  },
  wil: {
    border: 'border-l-wil-400',
    bar: 'bg-wil-500',
    dotDone: 'bg-emerald-500 border-emerald-500',
    dotOpen: 'border-wil-300 bg-[var(--paper)]',
    lineDone: 'bg-wil-400',
    lineOpen: 'bg-[var(--border-ed)]',
  },
  horizon: {
    border: 'border-l-horizon-400',
    bar: 'bg-horizon-500',
    dotDone: 'bg-emerald-500 border-emerald-500',
    dotOpen: 'border-horizon-300 bg-[var(--paper)]',
    lineDone: 'bg-horizon-400',
    lineOpen: 'bg-[var(--border-ed)]',
  },
  cross: {
    border: 'border-l-[var(--border-md)]',
    bar: 'bg-[var(--ink-3)]',
    dotDone: 'bg-emerald-500 border-emerald-500',
    dotOpen: 'border-[var(--border-md)] bg-[var(--paper)]',
    lineDone: 'bg-emerald-400',
    lineOpen: 'bg-[var(--border-ed)]',
  },
}

// ── Step-list (gedeeld tussen beide kaarten) ────────────────────────────

interface StepListProps {
  steps: readonly ModuleGuideStep[]
  isDone: (stepKey: string) => boolean
  onToggle: (stepKey: string) => void
  accent: Accent
}

function StepList({ steps, isDone, onToggle, accent }: StepListProps) {
  const a = ACCENT_CLASSES[accent]
  return (
    <div className="relative ml-1">
      {steps.map((step, index) => {
        const done = isDone(step.key)
        const isLast = index === steps.length - 1

        const stepLabel = (
          <span
            className={
              done
                ? 'text-[var(--ink-4)] line-through'
                : 'text-[var(--ink-2)] group-hover/step:text-[var(--ink)] transition-colors'
            }
          >
            {step.label}
          </span>
        )

        return (
          <div key={step.key} className="relative flex items-start gap-3 group/step">
            {!isLast && (
              <div
                className={`absolute left-[7px] top-[18px] w-[2px] bottom-0 transition-colors duration-300 ${
                  done ? a.lineDone : a.lineOpen
                }`}
                aria-hidden="true"
              />
            )}

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onToggle(step.key)
              }}
              className={`relative z-10 shrink-0 mt-[3px] flex h-4 w-4 items-center justify-center rounded-full border-2 transition-all duration-200 cursor-pointer ${
                done ? a.dotDone : `${a.dotOpen} hover:scale-110`
              }`}
              aria-label={
                done
                  ? `Markeer "${step.label}" als niet afgerond`
                  : `Markeer "${step.label}" als afgerond`
              }
            >
              {done && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
            </button>

            <div className={`flex-1 text-xs leading-snug ${isLast ? 'pb-0' : 'pb-4'}`}>
              {step.href && !done ? (
                <Link href={step.href} className="hover:underline underline-offset-2">
                  {stepLabel}
                </Link>
              ) : (
                stepLabel
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── ProgressBar (boven elke step-list) ──────────────────────────────────

interface ProgressBarProps {
  done: number
  total: number
  accent: Accent
}

function ProgressBar({ done, total, accent }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const a = ACCENT_CLASSES[accent]
  return (
    <div className="mb-3 space-y-1.5">
      <p className="text-xs font-mono tabular-nums text-[var(--ink-3)]">
        {done} van {total} voltooid
      </p>
      <div
        className="h-1 w-full bg-[var(--subtle)] rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full ${a.bar} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Skeleton (loading-state) ────────────────────────────────────────────

function CardSkeleton({ accent }: { accent: Accent }) {
  const a = ACCENT_CLASSES[accent]
  return (
    <article
      className={`card-editorial border-l-3 ${a.border} p-4 sm:p-5 animate-pulse`}
    >
      <div className="h-4 w-40 rounded bg-[var(--subtle)] mb-3" />
      <div className="h-1 w-full rounded-full bg-[var(--subtle)] mb-4" />
      <div className="space-y-3">
        <div className="h-3 w-3/4 rounded bg-[var(--subtle)]" />
        <div className="h-3 w-2/3 rounded bg-[var(--subtle)]" />
        <div className="h-3 w-1/2 rounded bg-[var(--subtle)]" />
      </div>
    </article>
  )
}

// ── Goal-card ───────────────────────────────────────────────────────────

function GoalStappenplanCard() {
  const {
    primaryGoalSlug,
    isCardVisible: isGoalCardVisible,
    isStepComplete,
    toggleStep,
    isAllComplete,
    dismissCard,
    error,
  } = useGoalGuideState()

  // ── Completion celebration state ────────────────────────────────────
  // Hooks moeten altijd in dezelfde volgorde — daarom alle hook-aanroepen
  // boven de runtime-checks houden.
  const slug: GoalSlug | null =
    primaryGoalSlug && isGoalSlug(primaryGoalSlug) ? (primaryGoalSlug as GoalSlug) : null
  const allComplete = slug ? isAllComplete(slug) : false
  const visible = slug ? isGoalCardVisible(slug) : false

  const [fadingOut, setFadingOut] = useState(false)
  const [hidden, setHidden] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Houd de laatste dismissCard-fn in een ref zodat de timer-callback altijd
  // de actuele closure aanroept zonder dat we de timer opnieuw moeten zetten.
  // Sync via effect (mag niet tijdens render — react-hooks/refs).
  const dismissCardRef = useRef(dismissCard)
  useEffect(() => {
    dismissCardRef.current = dismissCard
  }, [dismissCard])

  const fadeAndDismiss = useCallback(
    (fadeDelay: number) => {
      if (!slug) return
      fadeTimerRef.current = setTimeout(() => {
        setFadingOut(true)
      }, fadeDelay)

      dismissTimerRef.current = setTimeout(() => {
        dismissCardRef.current(slug)
        setHidden(true)
      }, fadeDelay + 500)
    },
    [slug],
  )

  useEffect(() => {
    if (!allComplete) return
    fadeAndDismiss(4000)
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [allComplete, fadeAndDismiss])

  const handleEarlyClose = () => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    fadeAndDismiss(0)
  }

  // ── Bail-outs (ná alle hooks) ───────────────────────────────────────
  if (!slug) return null
  if (!visible) return null
  if (hidden) return null

  const entry = GOAL_CATALOG[slug]
  if (!entry) return null
  const goalSteps = getGoalGuideSteps()
  const steps = goalSteps[slug] ?? []
  if (steps.length === 0) return null

  const accent: Accent = GOAL_ACCENT[slug] ?? 'wil'
  const a = ACCENT_CLASSES[accent]
  const doneCount = steps.filter((s) => isStepComplete(slug, s.key)).length

  // ── Celebration-state UI ────────────────────────────────────────────
  if (allComplete) {
    return (
      <article
        className={`card-editorial border-l-3 ${a.border} p-4 sm:p-5 transition-all duration-500 ${
          fadingOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
      >
        <div className="flex flex-col items-center justify-center py-4 text-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">Doel volbracht!</p>
            <p className="text-xs text-[var(--ink-3)] mt-1">
              Stappen voor: {entry.label}
            </p>
          </div>
          <button
            type="button"
            onClick={handleEarlyClose}
            className="text-xs text-[var(--ink-4)] hover:text-[var(--ink-2)] transition-colors mt-1"
          >
            Sluiten
          </button>
        </div>
      </article>
    )
  }

  // ── Normal card UI ───────────────────────────────────────────────────
  return (
    <article className={`card-editorial border-l-3 ${a.border} p-4 sm:p-5`}>
      <p className="text-sm font-semibold text-[var(--ink)] mb-3">
        Stappen voor: {entry.label}
      </p>
      <ProgressBar done={doneCount} total={steps.length} accent={accent} />
      {error && (
        <p className="text-[10px] text-amber-700 mb-2">Voortgang kon niet worden geladen</p>
      )}
      <StepList
        steps={steps}
        isDone={(stepKey) => isStepComplete(slug, stepKey)}
        onToggle={(stepKey) => toggleStep(slug, stepKey)}
        accent={accent}
      />
    </article>
  )
}

// ── Standaard-card ──────────────────────────────────────────────────────

interface StandardCardProps {
  data: DashboardData
}

function StandaardStappenplanCard({ data }: StandardCardProps) {
  const {
    manuallyCompletedKeys,
    toggleStep,
    dismissCard,
    isCardDismissed,
    error,
  } = useStandardGuideState()

  const accent: Accent = 'kern'
  const a = ACCENT_CLASSES[accent]

  // ── Completion celebration state ────────────────────────────────────
  const allComplete = isAllStandardComplete(data, manuallyCompletedKeys)
  const dismissed = isCardDismissed()

  const [fadingOut, setFadingOut] = useState(false)
  const [hidden, setHidden] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissCardRef = useRef(dismissCard)
  useEffect(() => {
    dismissCardRef.current = dismissCard
  }, [dismissCard])

  const fadeAndDismiss = useCallback((fadeDelay: number) => {
    fadeTimerRef.current = setTimeout(() => {
      setFadingOut(true)
    }, fadeDelay)

    dismissTimerRef.current = setTimeout(() => {
      void dismissCardRef.current()
      setHidden(true)
    }, fadeDelay + 500)
  }, [])

  useEffect(() => {
    if (!allComplete) return
    fadeAndDismiss(4000)
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [allComplete, fadeAndDismiss])

  const handleEarlyClose = () => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    fadeAndDismiss(0)
  }

  // ── Bail-outs ───────────────────────────────────────────────────────
  if (dismissed) return null
  if (hidden) return null

  const doneCount = STANDARD_GUIDE_STEPS.filter((s) =>
    isStandardStepComplete(s.key, data, manuallyCompletedKeys),
  ).length

  // ── Celebration-state UI ────────────────────────────────────────────
  if (allComplete) {
    return (
      <article
        className={`card-editorial border-l-3 ${a.border} p-4 sm:p-5 transition-all duration-500 ${
          fadingOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
      >
        <div className="flex flex-col items-center justify-center py-4 text-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">Alle stappen klaar!</p>
            <p className="text-xs text-[var(--ink-3)] mt-1">Algemene stappen</p>
          </div>
          <button
            type="button"
            onClick={handleEarlyClose}
            className="text-xs text-[var(--ink-4)] hover:text-[var(--ink-2)] transition-colors mt-1"
          >
            Sluiten
          </button>
        </div>
      </article>
    )
  }

  // ── Normal card UI ───────────────────────────────────────────────────
  return (
    <article className={`card-editorial border-l-3 ${a.border} p-4 sm:p-5`}>
      <p className="text-sm font-semibold text-[var(--ink)] mb-3">Algemene stappen</p>
      <ProgressBar
        done={doneCount}
        total={STANDARD_GUIDE_STEPS.length}
        accent={accent}
      />
      {error && (
        <p className="text-[10px] text-amber-700 mb-2">Voortgang kon niet worden geladen</p>
      )}
      <StepList
        steps={STANDARD_GUIDE_STEPS}
        isDone={(stepKey) => isStandardStepComplete(stepKey, data, manuallyCompletedKeys)}
        onToggle={(stepKey) => toggleStep(stepKey)}
        accent={accent}
      />
    </article>
  )
}

// ── Strook (orchestrator) ───────────────────────────────────────────────

interface Props {
  data: DashboardData
}

/**
 * "Stappenplannen-strook" boven het Wil-dashboard.
 *
 * - Links: doel-stappenplan (alleen als de gebruiker een primary_goal_slug heeft
 *   en dat doel nog niet helemaal is afgerond).
 * - Rechts: standaard-stappenplan (algemene onboarding-acties die voor iedere
 *   gebruiker gelden, met auto-completion uit DashboardData).
 *
 * Beide kaarten hebben een voortgangsbalk en dezelfde dots+lijn-stijl als de
 * bestaande GoalGuideCard / ModuleGuideCard. Geen X-dismiss op de strook —
 * conform spec blijven kaarten zichtbaar zolang stappen openstaan.
 *
 * Als beide kaarten verborgen zijn → render `null` zodat er geen lege strook
 * achterblijft.
 */
export function StappenplannenStrook({ data }: Props) {
  const { loading: goalLoading, primaryGoalSlug, isCardVisible, isAllComplete } = useGoalGuideState()
  const { loading: stdLoading, isCardDismissed } = useStandardGuideState()

  // Bepaal of beide kaarten zouden renderen — zo niet, niets tonen.
  const hasGoalCard = (() => {
    if (!primaryGoalSlug) return false
    if (!isGoalSlug(primaryGoalSlug)) return false
    const slug = primaryGoalSlug as GoalSlug
    if (!isCardVisible(slug)) return false
    // We laten de celebration-state wel zien (allComplete is nog rendered binnen
    // de card), dus tellen die als "heeft kaart". Pas wanneer dismissedAt
    // gezet wordt, valt visible naar false.
    return true
  })()

  const hasStdCard = !isCardDismissed()

  // Loading: render skeletons (geen lege ruimte tijdens fetch).
  if (goalLoading || stdLoading) {
    return (
      <section aria-label="Stappenplannen" className="px-4 sm:px-6 mb-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <CardSkeleton accent="wil" />
          <CardSkeleton accent="kern" />
        </div>
      </section>
    )
  }

  // Refine: standaard-card kan ook verborgen zijn omdat alle stappen klaar
  // zijn en de celebration is voorbijgegaan. Idem voor goal.
  const goalAllDone =
    primaryGoalSlug && isGoalSlug(primaryGoalSlug)
      ? isAllComplete(primaryGoalSlug as GoalSlug)
      : false

  // Als de doel-card weg is én de standaard-card weg is, hele strook hidden.
  // (Beide kaarten managen hun eigen post-celebration hide-state intern; hier
  // checken we de top-level visible/dismissed-condities.)
  if (!hasGoalCard && !hasStdCard) return null

  return (
    <section aria-label="Stappenplannen" className="px-4 sm:px-6 mb-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {hasGoalCard && <GoalStappenplanCard />}
        {hasStdCard && <StandaardStappenplanCard data={data} />}
      </div>
      {/* `goalAllDone` is hier bewust niet gebruikt om de kaart vroegtijdig te
          verbergen — de celebration-UI binnen GoalStappenplanCard handelt dit
          zelf af. We bewaren de variabele om eventuele toekomstige analytics-
          hooks (zonder render-effect) eenvoudig in te kunnen pluggen. */}
      <span hidden aria-hidden data-goal-all-done={goalAllDone ? 'true' : 'false'} />
    </section>
  )
}
