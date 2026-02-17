'use client'

import { useState } from 'react'
import { LevelUpCelebration } from '@/components/app/level-up-celebration'
import { AnimatedProgressBar } from '@/components/app/animated-progress-bar'

const DEMO_TRANSITIONS = [
  { oldLevel: -2, newLevel: -1, label: 'Time Deficit → Time Drag (Recovery)' },
  { oldLevel: 0, newLevel: 1, label: 'The Reset → The Anchor (Recovery → Stability)' },
  { oldLevel: 1, newLevel: 2, label: 'The Anchor → Time Shield (Stability)' },
  { oldLevel: 2, newLevel: 3, label: 'Time Shield → Velocity (Stability → Momentum)' },
  { oldLevel: 3, newLevel: 4, label: 'Velocity → Autonomous (Momentum)' },
  { oldLevel: 4, newLevel: 5, label: 'Autonomous → Sovereign (Momentum → Mastery)' },
  { oldLevel: 5, newLevel: 6, label: 'Sovereign → Timeless (Mastery)' },
]

export default function TestLevelUpCelebration() {
  const [activeTransition, setActiveTransition] = useState<{ oldLevel: number; newLevel: number } | null>(null)
  const [progressValues, setProgressValues] = useState([0, 0, 0, 0])

  const triggerProgress = () => {
    setProgressValues([25, 50, 75, 100])
  }

  const resetProgress = () => {
    setProgressValues([0, 0, 0, 0])
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <h1 className="text-2xl font-bold text-zinc-900 mb-8" data-testid="test-page-title">
        Level-Up Celebration Animations — Test Page
      </h1>

      {/* Section 1: Level-up celebrations */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-zinc-700 mb-4">
          1. Sovereignty Level-Up Celebrations
        </h2>
        <p className="text-sm text-zinc-500 mb-4">
          Click a button to trigger the full-screen celebration animation.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DEMO_TRANSITIONS.map(t => (
            <button
              key={`${t.oldLevel}-${t.newLevel}`}
              data-testid={`trigger-level-${t.oldLevel}-to-${t.newLevel}`}
              onClick={() => setActiveTransition({ oldLevel: t.oldLevel, newLevel: t.newLevel })}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
            >
              <span className="font-bold">Level {t.oldLevel} → {t.newLevel}</span>
              <br />
              <span className="text-xs text-zinc-400">{t.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Section 2: Animated Progress Bars */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-zinc-700 mb-4">
          2. Animated Progress Bars
        </h2>
        <div className="flex gap-3 mb-4">
          <button
            onClick={triggerProgress}
            data-testid="trigger-progress"
            className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600 transition-colors"
          >
            Animate Progress
          </button>
          <button
            onClick={resetProgress}
            data-testid="reset-progress"
            className="rounded-lg bg-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-300 transition-colors"
          >
            Reset
          </button>
        </div>
        <div className="space-y-4 max-w-lg">
          <div>
            <p className="text-xs text-zinc-400 mb-1">Recovery (25%)</p>
            <AnimatedProgressBar
              value={progressValues[0]}
              colorClass="bg-rose-500"
              data-testid="progress-recovery"
              animateOnMount={false}
              duration={800}
            />
          </div>
          <div>
            <p className="text-xs text-zinc-400 mb-1">Stability (50%)</p>
            <AnimatedProgressBar
              value={progressValues[1]}
              colorClass="bg-blue-500"
              data-testid="progress-stability"
              animateOnMount={false}
              duration={1000}
            />
          </div>
          <div>
            <p className="text-xs text-zinc-400 mb-1">Momentum (75%)</p>
            <AnimatedProgressBar
              value={progressValues[2]}
              colorClass="bg-teal-500"
              data-testid="progress-momentum"
              animateOnMount={false}
              duration={1200}
            />
          </div>
          <div>
            <p className="text-xs text-zinc-400 mb-1">Mastery (100% + shimmer)</p>
            <AnimatedProgressBar
              value={progressValues[3]}
              colorClass="bg-amber-500"
              data-testid="progress-mastery"
              animateOnMount={false}
              duration={1400}
              shimmerOnComplete
            />
          </div>
        </div>
      </section>

      {/* Section 3: Badge shimmer preview */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-zinc-700 mb-4">
          3. Badge Shimmer Effect
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-w-lg">
          {/* Earned badge with shimmer */}
          <div
            data-testid="shimmer-badge-demo"
            className="relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 bg-amber-100 border-amber-300 animate-badge-unlock animate-badge-scale-in"
          >
            <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none animate-badge-shimmer" />
            <div className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl">🏆</div>
            <span className="text-center text-xs font-semibold leading-tight text-zinc-800">Trophy</span>
          </div>

          {/* Normal earned badge (no shimmer) */}
          <div
            data-testid="normal-badge-demo"
            className="flex flex-col items-center gap-2 rounded-xl border-2 p-4 bg-teal-100 border-teal-300"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl">🛡️</div>
            <span className="text-center text-xs font-semibold leading-tight text-zinc-800">Shield</span>
          </div>

          {/* Locked badge with progress */}
          <div
            data-testid="progress-badge-demo"
            className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 p-4"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl grayscale opacity-30">❓</div>
            <span className="text-center text-xs font-semibold leading-tight text-zinc-400">???</span>
            <div className="w-full px-1">
              <div className="h-1 overflow-hidden rounded-full bg-zinc-200">
                <div className="h-full rounded-full bg-amber-400 animate-progress-fill" style={{ width: '60%' }} />
              </div>
              <span className="mt-0.5 block text-center text-[9px] text-zinc-400">60%</span>
            </div>
          </div>

          {/* Locked badge (no progress) */}
          <div
            data-testid="locked-badge-demo"
            className="relative flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 p-4"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl grayscale opacity-30">❓</div>
            <span className="text-center text-xs font-semibold leading-tight text-zinc-400">???</span>
            <div className="absolute inset-0 flex items-center justify-center rounded-xl">
              <div className="absolute inset-0 rounded-xl bg-zinc-100/40" />
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Animation performance note */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-zinc-700 mb-4">
          4. Animation Properties
        </h2>
        <div className="rounded-lg bg-white border border-zinc-200 p-4 max-w-lg">
          <ul className="text-sm text-zinc-600 space-y-2" data-testid="animation-properties">
            <li data-testid="prop-gpu">✅ GPU-accelerated (transform, opacity only)</li>
            <li data-testid="prop-pointer">✅ pointer-events-none on particle layers</li>
            <li data-testid="prop-dismiss">✅ Quick dismiss: Escape, overlay click, X button, CTA button</li>
            <li data-testid="prop-phase-colors">✅ Phase-specific color themes (rose/blue/teal/amber)</li>
            <li data-testid="prop-confetti">✅ Confetti burst with 40 particles</li>
            <li data-testid="prop-sparkles">✅ Rising sparkles with glow effect</li>
            <li data-testid="prop-counter">✅ Animated number counter (old → new level)</li>
            <li data-testid="prop-progress">✅ Micro-animations on progress bars</li>
            <li data-testid="prop-shimmer">✅ Shimmer effect on newly unlocked badges</li>
            <li data-testid="prop-scale-in">✅ Scale-in entrance for badge cards</li>
          </ul>
        </div>
      </section>

      {/* Active celebration modal */}
      {activeTransition && (
        <LevelUpCelebration
          oldLevel={activeTransition.oldLevel}
          newLevel={activeTransition.newLevel}
          onClose={() => setActiveTransition(null)}
        />
      )}
    </div>
  )
}
