'use client'

import { WillDots } from '@/components/app/will-dots'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'
import {
  GOAL_CATALOG_ENTRIES,
  GOAL_DEFAULT_SPEECH,
  GOAL_SPEECH_TEXT,
} from '@/lib/goals/catalog'
import type { GoalSlug } from '@/lib/goals/types'

// ── Props ──────────────────────────────────────────────────────

export interface OnboardingGoalProps {
  selectedGoal: GoalSlug | null
  onSelect: (goal: GoalSlug) => void
  onNext: () => void
  onBack: () => void
  /** Klikbare opt-out voor de news-only flow (zet activeModules=['nieuws']) */
  onNewsOnly: () => void
}

// ── Speech-bubble helper ───────────────────────────────────────

function getSpeechText(goal: GoalSlug | null): string {
  return goal ? GOAL_SPEECH_TEXT[goal] : GOAL_DEFAULT_SPEECH
}

// ── Main Component ─────────────────────────────────────────────

export function OnboardingGoal({
  selectedGoal,
  onSelect,
  onNext,
  onBack,
  onNewsOnly,
}: OnboardingGoalProps) {
  const canProceed = selectedGoal !== null

  return (
    <div className="pb-20 sm:pb-0">
      {/* Back button */}
      <button
        onClick={onBack}
        className="mb-6 flex min-h-[44px] items-center gap-1 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] active:text-[var(--ink)] transition-colors duration-150"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Terug
      </button>

      {/* Progress indicator */}
      <div className="mb-8">
        <StepProgress currentPhase="modules" />
      </div>

      <p className="label-editorial mb-2 text-[var(--ink-4)]">Jouw doel</p>

      {/* Will's speech bubble */}
      <div className="mb-6 sm:mb-8 flex items-start gap-3">
        <div className="shrink-0">
          <WillDots size={48} />
        </div>
        <SpeechBubble>{getSpeechText(selectedGoal)}</SpeechBubble>
      </div>

      {/* Section heading */}
      <h2 className="mb-4 font-display text-lg font-bold tracking-[-0.02em] text-[var(--ink)]">
        Wat wil je bereiken?
      </h2>

      {/* Goal cards grid — primary goal spans full width, others in 2-col grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GOAL_CATALOG_ENTRIES.map((goal) => {
          const isSelected = selectedGoal === goal.slug
          const isPrimary = goal.primary

          return (
            <button
              key={goal.slug}
              type="button"
              onClick={() => onSelect(goal.slug)}
              className={`group w-full cursor-pointer rounded-xl border-2 text-left transition-all duration-150 active:scale-[0.99] outline-none focus-visible:ring-2 focus-visible:ring-wil-400 focus-visible:ring-offset-2 ${
                isPrimary
                  ? 'sm:col-span-2 lg:col-span-3 p-5'
                  : 'p-4'
              } ${
                isPrimary && !isSelected
                  ? 'border-wil-200 bg-wil-50/30 hover:border-wil-300 hover:shadow-md'
                  : ''
              } ${
                isSelected
                  ? 'border-wil-500 bg-wil-50/60 shadow-sm'
                  : !isPrimary
                    ? 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)] hover:shadow-sm'
                    : ''
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Emoji icon */}
                <div
                  className={`flex shrink-0 items-center justify-center rounded-lg transition-colors ${
                    isPrimary ? 'h-14 w-14 text-2xl' : 'h-10 w-10 text-xl'
                  } ${
                    isSelected
                      ? 'bg-wil-100'
                      : isPrimary
                        ? 'bg-wil-100/60 group-hover:bg-wil-100'
                        : 'bg-[var(--subtle)] group-hover:bg-[var(--border-ed)]'
                  }`}
                  aria-hidden="true"
                >
                  {goal.emoji}
                </div>

                {/* Text content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className={`font-semibold leading-tight ${
                        isPrimary ? 'text-base' : 'text-sm'
                      } ${isSelected ? 'text-wil-900' : 'text-[var(--ink)]'}`}
                    >
                      {goal.label}
                    </h3>
                    {isPrimary && (
                      <span className="inline-flex items-center rounded-full bg-wil-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-wil-700">
                        Aanbevolen
                      </span>
                    )}
                  </div>
                  <p
                    className={`mt-0.5 font-medium ${
                      isPrimary ? 'text-sm' : 'text-xs'
                    } ${isSelected ? 'text-wil-600' : 'text-[var(--ink-3)]'}`}
                  >
                    {goal.tagline}
                  </p>
                  <p className={`mt-1 text-[var(--ink-4)] leading-snug ${
                    isPrimary ? 'text-sm' : 'text-xs'
                  }`}>
                    {goal.description}
                  </p>
                </div>

                {/* Selection indicator */}
                <div
                  className={`flex h-5 w-5 shrink-0 mt-0.5 items-center justify-center rounded-full border-2 transition-colors ${
                    isSelected
                      ? 'border-wil-500 bg-wil-500'
                      : 'border-[var(--border-ed)]'
                  }`}
                >
                  {isSelected && (
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Subtle news-only opt-out */}
      <div className="mt-5 flex justify-center">
        <button
          type="button"
          onClick={onNewsOnly}
          className="text-xs text-[var(--ink-4)] underline-offset-2 transition-colors hover:text-[var(--ink-2)] hover:underline"
        >
          Ik wil alleen financieel nieuws lezen
        </button>
      </div>

      {/* Sticky navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex gap-3 border-t border-[var(--border-ed)] bg-[var(--paper)]/95 px-4 pb-[env(safe-area-inset-bottom,12px)] pt-3 backdrop-blur-sm sm:static sm:mt-8 sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-none">
        <button
          onClick={onBack}
          className="flex-1 min-h-[44px] rounded-xl border border-[var(--border-ed)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] active:bg-[var(--subtle)] transition-colors duration-150"
        >
          Terug
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="flex-1 min-h-[44px] rounded-xl bg-wil-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Verder
        </button>
      </div>
    </div>
  )
}
