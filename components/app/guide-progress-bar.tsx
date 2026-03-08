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
    color: 'var(--kern-400, #b45309)',
    bgColor: 'var(--kern-50, #fffbeb)',
    check: (s) => s.hasAssets || s.hasDebts,
  },
  {
    label: 'Transacties importeren',
    icon: ArrowLeftRight,
    color: 'var(--kern-400, #b45309)',
    bgColor: 'var(--kern-50, #fffbeb)',
    check: (s) => s.hasTransactions,
  },
  {
    label: 'Eerste actie afgerond',
    icon: Zap,
    color: 'var(--wil-400, #2dd4bf)',
    bgColor: 'var(--wil-50, #f0fdfa)',
    check: (s) => s.hasCompletedActions,
  },
  {
    label: 'FIRE-projectie bekeken',
    icon: Compass,
    color: 'var(--horizon-400, #a855f7)',
    bgColor: 'var(--horizon-50, #faf5ff)',
    check: (s) => s.hasFireData,
  },
  {
    label: 'Levensgebeurtenis gepland',
    icon: Sparkles,
    color: 'var(--horizon-400, #a855f7)',
    bgColor: 'var(--horizon-50, #faf5ff)',
    check: (s) => s.hasLifeEvents,
  },
]

/* ── Component ─────────────────────── */

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
    <div className="mb-6">
      {/* Label */}
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-[12px] font-semibold text-[var(--ink-2)]">
          {completedCount} van {total} stappen doorlopen
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
            <div
              key={i}
              className="relative h-2 flex-1 rounded-full overflow-hidden"
              style={{
                backgroundColor: 'var(--border-ed)',
              }}
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  backgroundColor: isDone ? stap.color : 'transparent',
                  transform: animate && isDone ? 'scaleX(1)' : 'scaleX(0)',
                  transformOrigin: 'left',
                  transition: `transform 0.5s ease-out ${i * 0.12}s`,
                }}
              />
            </div>
          )
        })}
      </div>

      {/* Step icons row */}
      <div className="mt-2.5 flex gap-1">
        {REIS_STAPPEN.map((stap, i) => {
          const isDone = stap.check(steps)
          const Icon = stap.icon
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300"
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
                className="text-center text-[9px] leading-tight"
                style={{
                  color: isDone ? 'var(--ink-2)' : 'var(--ink-4)',
                }}
              >
                {stap.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
