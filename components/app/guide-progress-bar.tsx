'use client'

import { useEffect, useState, useRef } from 'react'
import { Check, Landmark, Receipt, Zap, Compass } from 'lucide-react'

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
  scrollTarget: number  // reis-stap number to scroll to
}

/* ── Reis-stappen definitie ─────────────────────── */

const REIS_STAPPEN: ReisStap[] = [
  {
    label: 'Weet waar je staat',
    icon: Landmark,
    color: 'var(--color-kern-400)',
    bgColor: 'var(--color-kern-50)',
    check: (s) => s.hasAssets || s.hasDebts,
    scrollTarget: 1,
  },
  {
    label: 'Begrijp je patronen',
    icon: Receipt,
    color: 'var(--color-kern-400)',
    bgColor: 'var(--color-kern-50)',
    check: (s) => s.hasTransactions,
    scrollTarget: 2,
  },
  {
    label: 'Onderneem actie',
    icon: Zap,
    color: 'var(--color-wil-400)',
    bgColor: 'var(--color-wil-50)',
    check: (s) => s.hasCompletedActions,
    scrollTarget: 3,
  },
  {
    label: 'Kijk vooruit',
    icon: Compass,
    color: 'var(--color-horizon-400)',
    bgColor: 'var(--color-horizon-50)',
    check: (s) => s.hasFireData || s.hasLifeEvents,
    scrollTarget: 4,
  },
]

/* ── Hooks ─────────────────────── */

/** Track which ReisStapSection is currently most visible in the viewport */
function useActiveStep() {
  const [activeIndex, setActiveIndex] = useState(-1)
  const ratios = useRef(new Map<string, number>())

  useEffect(() => {
    const ids = REIS_STAPPEN.map((_, i) => `guide-reis-${i + 1}`)
    const elements = ids.map(id => document.getElementById(id)).filter(Boolean) as HTMLElement[]

    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.current.set(entry.target.id, entry.intersectionRatio)
        }

        // Find the section with the highest visibility ratio
        let bestIdx = -1
        let bestRatio = 0
        for (let i = 0; i < ids.length; i++) {
          const r = ratios.current.get(ids[i]) ?? 0
          if (r > bestRatio) {
            bestRatio = r
            bestIdx = i
          }
        }

        if (bestRatio > 0) {
          setActiveIndex(bestIdx)
        }
      },
      {
        // Multiple thresholds for smooth tracking
        threshold: [0, 0.1, 0.25, 0.5, 0.75, 1],
        // Offset for the sticky header
        rootMargin: '-80px 0px -20% 0px',
      }
    )

    for (const el of elements) {
      observer.observe(el)
    }

    return () => observer.disconnect()
  }, [])

  return activeIndex
}

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
  const activeIndex = useActiveStep()

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
          const isActive = i === activeIndex
          return (
            <button
              key={i}
              type="button"
              aria-label={`Ga naar stap ${i + 1}: ${stap.label}`}
              onClick={() => scrollToStep(stap.scrollTarget)}
              className="relative flex-1 rounded-full overflow-hidden cursor-pointer transition-all hover:opacity-80"
              style={{
                backgroundColor: 'var(--border-ed)',
                height: isActive ? '4px' : '3px',
              }}
            >
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  backgroundColor: isDone ? stap.color : isActive ? stap.color : 'transparent',
                  opacity: isDone ? 1 : isActive ? 0.35 : 0,
                  transform: animate && (isDone || isActive) ? 'scaleX(1)' : 'scaleX(0)',
                  transformOrigin: 'left',
                  transition: `transform 0.5s ease-out ${i * 0.12}s, opacity 0.3s ease`,
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
          const isActive = i === activeIndex
          const Icon = stap.icon
          return (
            <button
              key={i}
              type="button"
              aria-label={`Ga naar stap ${i + 1}: ${stap.label}`}
              onClick={() => scrollToStep(stap.scrollTarget)}
              className="flex flex-1 flex-col items-center gap-1 cursor-pointer group"
            >
              <div
                className="flex items-center justify-center rounded-full transition-all duration-300 group-hover:scale-110"
                style={{
                  width: isActive ? '28px' : '24px',
                  height: isActive ? '28px' : '24px',
                  backgroundColor: isDone ? stap.bgColor : isActive ? stap.bgColor : 'var(--subtle)',
                  color: isDone ? stap.color : isActive ? stap.color : 'var(--ink-4)',
                  boxShadow: isActive ? `0 0 0 2px ${stap.color}` : 'none',
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
                className="text-center text-[10px] sm:text-[11px] leading-tight transition-colors duration-200 group-hover:text-[var(--ink)]"
                style={{
                  color: isActive ? 'var(--ink)' : isDone ? 'var(--ink-2)' : 'var(--ink-4)',
                  fontWeight: isActive ? 600 : 400,
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
