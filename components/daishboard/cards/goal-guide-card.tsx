'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Check, CheckCircle2 } from 'lucide-react'
import { BriefingCard } from '../briefing-card'
import { useGoalGuideState } from '@/lib/hooks/use-goal-guide-state'
import type { GoalGuideCardSpec } from '@/lib/briefing/types'
import type { GoalSlug } from '@/lib/goals/types'
import { isGoalSlug } from '@/lib/goals/catalog'

// ── Per-goal accent (matches the goal's "feel": kern voor cash/budget,
//    horizon voor FIRE, wil voor coaching/inzicht) ─────────────────────

const GOAL_ACCENT: Record<GoalSlug, 'kern' | 'wil' | 'horizon' | 'cross'> = {
  'grip-uitgaven': 'kern',
  'vermogen-overzicht': 'kern',
  noodfonds: 'wil',
  'schulden-aflossen': 'kern',
  'eerder-stoppen': 'horizon',
  'bewust-leven': 'wil',
}

// ── Accent classes — identical palette as ModuleGuideCard ───────────────

const ACCENT_CLASSES: Record<'kern' | 'wil' | 'horizon' | 'cross', {
  dotDone: string
  dotOpen: string
  lineDone: string
  lineOpen: string
}> = {
  kern: {
    dotDone: 'bg-emerald-500 border-emerald-500',
    dotOpen: 'border-kern-300 bg-[var(--paper)]',
    lineDone: 'bg-kern-400',
    lineOpen: 'bg-[var(--border-ed)]',
  },
  wil: {
    dotDone: 'bg-emerald-500 border-emerald-500',
    dotOpen: 'border-wil-300 bg-[var(--paper)]',
    lineDone: 'bg-wil-400',
    lineOpen: 'bg-[var(--border-ed)]',
  },
  horizon: {
    dotDone: 'bg-emerald-500 border-emerald-500',
    dotOpen: 'border-horizon-300 bg-[var(--paper)]',
    lineDone: 'bg-horizon-400',
    lineOpen: 'bg-[var(--border-ed)]',
  },
  cross: {
    dotDone: 'bg-emerald-500 border-emerald-500',
    dotOpen: 'border-[var(--border-md)] bg-[var(--paper)]',
    lineDone: 'bg-emerald-400',
    lineOpen: 'bg-[var(--border-ed)]',
  },
}

// ── Component ─────────────────────────────────────────────────

interface Props {
  spec: GoalGuideCardSpec
}

export function GoalGuideCard({ spec }: Props) {
  const { toggleStep, dismissCard, isStepComplete, isAllComplete } = useGoalGuideState()

  // Cast to GoalSlug — invalid slugs zijn al gefilterd door BriefingCardGrid
  // (de spec.goalSlug-string is type-decoupled van GoalSlug om cyclische
  // imports te vermijden, zie lib/briefing/types.ts).
  const slug: GoalSlug = spec.goalSlug as GoalSlug
  const slugValid = isGoalSlug(spec.goalSlug)

  const cardModule = GOAL_ACCENT[slug] ?? 'wil'
  const accent = ACCENT_CLASSES[cardModule]

  // ── Completion celebration state ──────────────────────────────
  // Hooks moeten altijd aangeroepen worden in dezelfde volgorde — daarom
  // pas ná alle hook-aanroepen de runtime-check op `slugValid`.
  const allComplete = slugValid ? isAllComplete(slug) : false
  const [fadingOut, setFadingOut] = useState(false)
  const [hidden, setHidden] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissCardRef = useRef(dismissCard)
  dismissCardRef.current = dismissCard

  const fadeAndDismiss = useCallback((fadeDelay: number) => {
    fadeTimerRef.current = setTimeout(() => {
      setFadingOut(true)
    }, fadeDelay)

    dismissTimerRef.current = setTimeout(() => {
      dismissCardRef.current(slug)
      setHidden(true)
    }, fadeDelay + 500)
  }, [slug])

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

  const handleDismiss = () => {
    dismissCard(slug)
    setHidden(true)
  }

  // Bail-out na alle hooks — voorkom rendering met onbekende slug
  if (!slugValid) return null
  if (hidden) return null

  // ── Completion celebration UI ────────────────────────────────
  if (allComplete) {
    return (
      <div
        className={`transition-all duration-500 ${
          fadingOut ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
      >
        <BriefingCard module={cardModule}>
          <div className="flex flex-col items-center justify-center py-4 text-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">Doel volbracht!</p>
              <p className="text-xs text-[var(--ink-3)] mt-1">{spec.title}</p>
            </div>
            <button
              type="button"
              onClick={handleEarlyClose}
              className="text-xs text-[var(--ink-4)] hover:text-[var(--ink-2)] transition-colors mt-1"
            >
              Sluiten
            </button>
          </div>
        </BriefingCard>
      </div>
    )
  }

  // ── Normal card UI ───────────────────────────────────────────
  return (
    <BriefingCard module={cardModule}>
      <div className="flex items-start justify-between gap-2 mb-4">
        <p className="text-sm font-semibold text-[var(--ink)]">{spec.title}</p>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 p-0.5 rounded text-[var(--ink-4)] hover:text-[var(--ink-2)] hover:bg-[var(--subtle)] transition-colors"
          aria-label="Verberg kaart"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative ml-1">
        {spec.steps.map((step, index) => {
          const done = isStepComplete(slug, step.key)
          const isLast = index === spec.steps.length - 1
          const lineIsDone = done

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
                    lineIsDone ? accent.lineDone : accent.lineOpen
                  }`}
                  aria-hidden="true"
                />
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  toggleStep(slug, step.key)
                }}
                className={`relative z-10 shrink-0 mt-[3px] flex h-4 w-4 items-center justify-center rounded-full border-2 transition-all duration-200 cursor-pointer ${
                  done
                    ? accent.dotDone
                    : `${accent.dotOpen} hover:scale-110`
                }`}
                aria-label={done ? `Markeer "${step.label}" als niet afgerond` : `Markeer "${step.label}" als afgerond`}
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
    </BriefingCard>
  )
}
