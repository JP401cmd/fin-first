'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Check, CheckCircle2 } from 'lucide-react'
import { BriefingCard } from '../briefing-card'
import { useModuleGuideState } from '@/lib/hooks/use-module-guide-state'
import type { ModuleGuideCardSpec } from '@/lib/briefing/types'
import type { ModuleId } from '@/lib/module-registry'

// ── Module → card accent mapping ──────────────────────────────

const MODULE_ACCENT: Record<ModuleId, 'kern' | 'wil' | 'horizon' | 'cross'> = {
  budgetteren: 'kern',
  vermogensregistratie: 'kern',
  aandelenregistratie: 'kern',
  inzicht_acties: 'wil',
  toekomstplannen: 'horizon',
  nieuws: 'cross',
}

// ── Accent color for the timeline line + completed dots ────────

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
  spec: ModuleGuideCardSpec
}

export function ModuleGuideCard({ spec }: Props) {
  const { toggleStep, dismissCard, isStepComplete, isAllComplete } = useModuleGuideState()
  const cardModule = MODULE_ACCENT[spec.moduleId] ?? 'cross'
  const accent = ACCENT_CLASSES[cardModule]

  // ── Completion celebration state ──────────────────────────────
  const allComplete = isAllComplete(spec.moduleId)
  const [fadingOut, setFadingOut] = useState(false)
  const [hidden, setHidden] = useState(false)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Stable ref for dismissCard to avoid resetting timers when state changes
  const dismissCardRef = useRef(dismissCard)
  dismissCardRef.current = dismissCard

  // Helper: start fade then dismiss permanently
  const fadeAndDismiss = useCallback((fadeDelay: number) => {
    fadeTimerRef.current = setTimeout(() => {
      setFadingOut(true)
    }, fadeDelay)

    dismissTimerRef.current = setTimeout(() => {
      dismissCardRef.current(spec.moduleId)
      setHidden(true) // Remove from DOM immediately (grid re-render may lag)
    }, fadeDelay + 500)
  }, [spec.moduleId])

  // When all steps are completed, start the auto-dismiss countdown
  useEffect(() => {
    if (!allComplete) return
    fadeAndDismiss(4000) // 4s celebration → 0.5s fade → dismiss
    return () => {
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [allComplete, fadeAndDismiss])

  // Early close: user clicks to dismiss during celebration
  const handleEarlyClose = () => {
    if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    fadeAndDismiss(0) // Immediate fade + 0.5s dismiss
  }

  // Also handle X button dismiss: hide card locally
  const handleDismiss = () => {
    dismissCard(spec.moduleId)
    setHidden(true)
  }

  // ── Hidden: card fully dismissed, don't render ──────────────
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
              <p className="text-sm font-semibold text-[var(--ink)]">Alles afgerond!</p>
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
      {/* Header: title + dismiss button */}
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

      {/* Vertical timeline */}
      <div className="relative ml-1">
        {spec.steps.map((step, index) => {
          const done = isStepComplete(spec.moduleId, step.key)
          const isLast = index === spec.steps.length - 1

          // Determine if the connecting line below this dot should be "done"
          // Line is done if THIS step is done
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
              {/* Vertical line segment BELOW this dot (except last step) */}
              {!isLast && (
                <div
                  className={`absolute left-[7px] top-[18px] w-[2px] bottom-0 transition-colors duration-300 ${
                    lineIsDone ? accent.lineDone : accent.lineOpen
                  }`}
                  aria-hidden="true"
                />
              )}

              {/* Timeline dot — clickable to toggle */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  toggleStep(spec.moduleId, step.key)
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

              {/* Step label — link if uncompleted + has href */}
              <div className={`flex-1 text-xs leading-snug ${isLast ? 'pb-0' : 'pb-4'}`}>
                {step.href && !done ? (
                  <Link
                    href={step.href}
                    className="hover:underline underline-offset-2"
                  >
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
