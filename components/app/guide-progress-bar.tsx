'use client'

import { useEffect, useState } from 'react'
import { Check, Landmark, ArrowLeftRight, Zap, Compass, Sparkles } from 'lucide-react'

/* ── Types ─────────────────────── */

interface GuideProgressSteps {
  hasAssets: boolean
  hasTransactions: boolean
  hasCompletedActions: boolean
  hasFireData: boolean
  hasLifeEvents: boolean
  hasDebts: boolean
}

interface ReisStap {
  label: string
  icon: typeof Landmark
  color: string      // module accent color
  bgColor: string    // light bg for filled state
  check: (steps: GuideProgressSteps) => boolean
}

/* ── Reis-stappen definitie ─────────────────────── */

const REIS_STAPPEN: ReisStap[] = [
  {
    label: 'Bezittingen of schulden',
    icon: Landmark,
    color: 'var(--color-kern-400)',
    bgColor: 'var(--color-kern-50)',
    check: (s) => s.hasAssets || s.hasDebts,
  },
  {
    label: 'Transacties importeren',
    icon: ArrowLeftRight,
    color: 'var(--color-kern-400)',
    bgColor: 'var(--color-kern-50)',
    check: (s) => s.hasTransactions,
  },
  {
    label: 'Eerste actie afgerond',
    icon: Zap,
    color: 'var(--color-wil-400)',
    bgColor: 'var(--color-wil-50)',
    check: (s) => s.hasCompletedActions,
  },
  {
    label: 'FIRE-projectie bekeken',
    icon: Compass,
    color: 'var(--color-horizon-400)',
    bgColor: 'var(--color-horizon-50)',
    check: (s) => s.hasFireData,
  },
  {
    label: 'Levensgebeurtenis gepland',
    icon: Sparkles,
    color: 'var(--color-horizon-400)',
    bgColor: 'var(--color-horizon-50)',
    check: (s) => s.hasLifeEvents,
  },
]

/* ── Component ─────────────────────── */

function scrollToStep(stepNumber: number) {
  const el = document.getElementById(`guide-reis-${stepNumber}`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

export function GuideProgressBar() {
  const [steps, setSteps] = useState<GuideProgressSteps | null>(null)
  const [animate, setAnimate] = useState(false)

  useEffect(() => {
    async function fetchProgress() {
      try {
        const res = await fetch('/api/guide-progress')
        if (!res.ok) return
        const data = await res.json()
        if (data.steps) {
          setSteps(data.steps)
          // Trigger animation after mount
          requestAnimationFrame(() => {
            requestAnimationFrame(() => setAnimate(true))
          })
        }
      } catch {
        // Progress data is optional
      }
    }
    fetchProgress()
  }, [])

  if (!steps) return null

  const completed = REIS_STAPPEN.filter(s => s.check(steps))
  const completedCount = completed.length
  const total = REIS_STAPPEN.length

  return (
    <div className="mb-6 sticky top-[57px] z-10 -mx-4 px-4 py-2 bg-[var(--paper)]/95 backdrop-blur-sm sm:-mx-6 sm:px-6">
      {/* Label */}
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[12px] font-semibold text-[var(--ink-2)]">
          <span className="font-mono tabular-nums">{completedCount}</span> van <span className="font-mono tabular-nums">{total}</span> stappen doorlopen
        </p>
        {completedCount === total && (
          <span className="text-[11px] font-medium text-emerald-600">
            Alle stappen voltooid!
          </span>
        )}
      </div>

      {/* Segmented progress bar */}
      <div className="flex gap-1">
        {REIS_STAPPEN.map((stap, i) => {
          const isDone = stap.check(steps)
          return (
            <button
              key={i}
              type="button"
              aria-label={`Ga naar stap ${i + 1}: ${stap.label}`}
              onClick={() => scrollToStep(i + 1)}
              className="relative h-2 flex-1 rounded-full overflow-hidden cursor-pointer transition-opacity hover:opacity-80"
              style={{
                backgroundColor: 'var(--border-ed)',
              }}
            >
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  backgroundColor: isDone ? stap.color : 'transparent',
                  transform: animate && isDone ? 'scaleX(1)' : 'scaleX(0)',
                  transformOrigin: 'left',
                  transition: `transform 0.5s ease-out ${i * 0.12}s`,
                }}
              />
            </button>
          )
        })}
      </div>

      {/* Step icons row */}
      <div className="mt-2.5 flex gap-1">
        {REIS_STAPPEN.map((stap, i) => {
          const isDone = stap.check(steps)
          const Icon = stap.icon
          return (
            <button
              key={i}
              type="button"
              aria-label={`Ga naar stap ${i + 1}: ${stap.label}`}
              onClick={() => scrollToStep(i + 1)}
              className="flex flex-1 flex-col items-center gap-1 cursor-pointer group"
            >
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300 group-hover:scale-110"
                style={{
                  backgroundColor: isDone ? stap.bgColor : 'var(--subtle)',
                  color: isDone ? stap.color : 'var(--ink-4)',
                  transitionDelay: `${i * 0.12}s`,
                }}
              >
                {isDone ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Icon className="h-3 w-3" />
                )}
              </div>
              <span
                className="text-center text-[10px] sm:text-[11px] leading-tight group-hover:text-[var(--ink)]"
                style={{
                  color: isDone ? 'var(--ink-2)' : 'var(--ink-4)',
                }}
              >
                {stap.label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
