'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Info } from 'lucide-react'
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
import { buildHelpKey, type StepSource } from '@/lib/briefing/help-key'
import { StepHelpSheet } from './step-help-sheet'

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
  /** Bron van de stappen — bepaalt het help-key prefix. */
  source: StepSource
  /** Voor `source="goal"`: de GoalSlug. Voor `source="standard"`: undefined. */
  scope?: string
}

function StepList({ steps, isDone, onToggle, accent, source, scope }: StepListProps) {
  const a = ACCENT_CLASSES[accent]
  // Lokale state voor de help-sheet — open=stepKey betekent: toon sheet voor
  // deze stap. Sluiten herstelt focus naar de Info-knop via ShellOverlay's
  // ingebouwde focus-trap.
  const [openHelpFor, setOpenHelpFor] = useState<string | null>(null)
  const openStep = openHelpFor
    ? steps.find((s) => s.key === openHelpFor) ?? null
    : null

  return (
    <>
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

              <div
                className={`flex-1 text-xs leading-snug flex items-start gap-1.5 ${
                  isLast ? 'pb-0' : 'pb-4'
                }`}
              >
                <span className="flex-1 min-w-0">
                  {step.href && !done ? (
                    <Link href={step.href} className="hover:underline underline-offset-2">
                      {stepLabel}
                    </Link>
                  ) : (
                    stepLabel
                  )}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setOpenHelpFor(step.key)
                  }}
                  aria-label={`Uitleg over: ${step.label}`}
                  className="shrink-0 -mt-0.5 -mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--ink-4)] hover:text-[var(--module-active-700)] hover:bg-[var(--module-active-50)] transition-colors"
                >
                  <Info className="h-3 w-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {openStep && (
        <StepHelpSheet
          open={true}
          onClose={() => setOpenHelpFor(null)}
          helpKey={buildHelpKey(source, openStep.key, scope)}
          stepLabel={openStep.label}
        />
      )}
    </>
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
        source="goal"
        scope={slug}
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
        source="standard"
      />
    </article>
  )
}

// ── Strook (orchestrator) ───────────────────────────────────────────────

interface Props {
  data: DashboardData
}

// ── Editorial intro (boven de carousel) ─────────────────────────────────

function StrookIntro() {
  return (
    <div className="mb-3">
      <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-[var(--ink-3)]">
        <span
          className="inline-block w-7 h-px bg-[var(--module-active-500)] mr-2.5 align-middle"
          aria-hidden="true"
        />
        Volgende stappen
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-3)]">
        Een handvol acties om je profiel te vervolmaken en de app onder de knie te
        krijgen. Voel je vrij om weg te klikken — ze begeleiden je naar je doel,
        ze houden je niet vast.
      </p>
    </div>
  )
}

// ── Carousel-wrapper (snap-scroll + optionele chevrons) ─────────────────

function StrookCarousel({ children }: { children: ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    function updateScroll() {
      if (!el) return
      setCanScrollLeft(el.scrollLeft > 0)
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    }
    updateScroll()
    el.addEventListener('scroll', updateScroll, { passive: true })
    // Re-evaluate na resize zodat chevrons verschijnen/verdwijnen wanneer
    // de viewport groeit of krimpt (mobile ↔ desktop).
    window.addEventListener('resize', updateScroll)
    return () => {
      el.removeEventListener('scroll', updateScroll)
      window.removeEventListener('resize', updateScroll)
    }
  }, [children])

  function scroll(direction: 'left' | 'right') {
    const el = scrollRef.current
    if (!el) return
    const scrollAmount = el.clientWidth * 0.7
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    })
  }

  const showChevrons = canScrollLeft || canScrollRight

  return (
    <div className="relative">
      {showChevrons && (
        <div className="hidden lg:flex absolute -top-9 right-0 items-center gap-1">
          <button
            type="button"
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className="rounded-lg p-1.5 text-[var(--ink-3)] transition-colors hover:bg-zinc-100 hover:text-[var(--ink-2)] disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Scroll links"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className="rounded-lg p-1.5 text-[var(--ink-3)] transition-colors hover:bg-zinc-100 hover:text-[var(--ink-2)] disabled:opacity-30 disabled:hover:bg-transparent"
            aria-label="Scroll rechts"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-none -mx-4 sm:-mx-6 px-4 sm:px-6"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {children}
      </div>
    </div>
  )
}

function CarouselItem({ children }: { children: ReactNode }) {
  return (
    <div className="snap-start shrink-0 w-[calc(100%-2rem)] lg:w-[calc(50%-0.5rem)]">
      {children}
    </div>
  )
}

/**
 * "Stappenplannen-strook" boven het Wil-dashboard.
 *
 * - Doel-stappenplan (alleen als de gebruiker een primary_goal_slug heeft en
 *   dat doel nog niet helemaal is afgerond).
 * - Standaard-stappenplan (algemene onboarding-acties die voor iedere gebruiker
 *   gelden, met auto-completion uit DashboardData).
 *
 * Layout: horizontale snap-carousel — desktop max 2 zichtbaar, mobile 1
 * zichtbaar met peek + native swipe. Chevrons verschijnen alleen wanneer er
 * meer kaarten zijn dan in de viewport passen. Geen X-dismiss op de strook —
 * conform spec blijven kaarten zichtbaar zolang stappen openstaan.
 *
 * Als beide kaarten verborgen zijn → render `null` zodat er geen lege strook
 * achterblijft.
 */
export function StappenplannenStrook({ data }: Props) {
  const { loading: goalLoading, primaryGoalSlug, isCardVisible, isAllComplete } = useGoalGuideState()
  const { loading: stdLoading, isCardDismissed, manuallyCompletedKeys } = useStandardGuideState()

  // Bepaal of beide kaarten zouden renderen — zo niet, niets tonen.
  const hasGoalCard = (() => {
    if (!primaryGoalSlug) return false
    if (!isGoalSlug(primaryGoalSlug)) return false
    const slug = primaryGoalSlug as GoalSlug
    if (!isCardVisible(slug)) return false
    return true
  })()

  const hasStdCard = !isCardDismissed()

  // Loading: render skeletons in dezelfde flex-layout (geen CLS).
  if (goalLoading || stdLoading) {
    return (
      <section aria-label="Stappenplannen" className="px-4 sm:px-6 mb-6">
        <StrookIntro />
        <StrookCarousel>
          <CarouselItem>
            <CardSkeleton accent="wil" />
          </CarouselItem>
          <CarouselItem>
            <CardSkeleton accent="kern" />
          </CarouselItem>
        </StrookCarousel>
      </section>
    )
  }

  const goalAllDone =
    primaryGoalSlug && isGoalSlug(primaryGoalSlug)
      ? isAllComplete(primaryGoalSlug as GoalSlug)
      : false

  const stdAllDone = isAllStandardComplete(data, manuallyCompletedKeys)

  if (!hasGoalCard && !hasStdCard) return null

  // Intro alleen tonen zolang minstens één zichtbare kaart nog open stappen
  // heeft. Tijdens de 4s celebration-window van de laatste kaart is de
  // toelichting overbodig en zou ze redundant boven "Doel volbracht!" hangen.
  // Daarna ruimt de orchestrator de hele section sowieso op (return null
  // hierboven zodra dismissCard heeft gepersisteerd).
  const remainingGoalCard = hasGoalCard && !goalAllDone
  const remainingStdCard = hasStdCard && !stdAllDone
  const showIntro = remainingGoalCard || remainingStdCard

  return (
    <section aria-label="Stappenplannen" className="px-4 sm:px-6 mb-6">
      {showIntro && <StrookIntro />}
      <StrookCarousel>
        {hasGoalCard && (
          <CarouselItem>
            <GoalStappenplanCard />
          </CarouselItem>
        )}
        {hasStdCard && (
          <CarouselItem>
            <StandaardStappenplanCard data={data} />
          </CarouselItem>
        )}
      </StrookCarousel>
    </section>
  )
}
