'use client'

import { useState } from 'react'
import { FreedomDaysAnimationProvider, useFreedomDaysAnimation } from '@/components/app/freedom-days-animation'

function AnimationDemo() {
  const { triggerAnimation } = useFreedomDaysAnimation()
  const [log, setLog] = useState<string[]>([])

  function trigger(days: number) {
    triggerAnimation(days)
    setLog((prev) => [...prev, `Triggered +${days} dagen at ${new Date().toLocaleTimeString()}`])
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">
        Feature #207: Freedom Days Animation Loop
      </h1>
      <p className="mb-8 text-zinc-500">
        Test the floating &ldquo;+X vrijheidsdagen&rdquo; animation. Click buttons below to trigger animations.
      </p>

      {/* Trigger buttons */}
      <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-zinc-400 uppercase">Trigger Animation</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => trigger(1)}
            className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600"
            data-testid="trigger-1-day"
          >
            +1 dag
          </button>
          <button
            onClick={() => trigger(3.2)}
            className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600"
            data-testid="trigger-3-2-days"
          >
            +3.2 dagen
          </button>
          <button
            onClick={() => trigger(5)}
            className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600"
            data-testid="trigger-5-days"
          >
            +5 dagen
          </button>
          <button
            onClick={() => trigger(10.5)}
            className="rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white hover:bg-teal-600"
            data-testid="trigger-10-5-days"
          >
            +10.5 dagen
          </button>
        </div>
      </div>

      {/* Sample hero section */}
      <div className="mb-8 rounded-xl bg-gradient-to-br from-teal-950 via-teal-900 to-teal-950 p-8 text-white">
        <p className="mb-2 text-xs font-semibold tracking-[0.2em] text-teal-300/80 uppercase">
          Jouw wilskracht in actie
        </p>
        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-5xl font-bold tracking-tight" data-testid="demo-hero-total">
            +42
          </span>
          <span className="ml-3 text-lg text-teal-200/70">
            vrijheidsdagen gewonnen
          </span>
        </div>
        <div className="flex items-center gap-3" data-testid="demo-weekly-summary">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-800/50 px-3 py-1.5 backdrop-blur-sm">
            <span className="text-sm font-medium text-teal-200">
              Deze week: +8.4 vrijheidsdagen gewonnen
            </span>
          </div>
        </div>
      </div>

      {/* Animation log */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-zinc-400 uppercase">Animation Log</h2>
        {log.length === 0 ? (
          <p className="text-sm text-zinc-400">No animations triggered yet</p>
        ) : (
          <ul className="space-y-1">
            {log.map((entry, i) => (
              <li key={i} className="text-sm text-zinc-600">
                {entry}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Verification checklist */}
      <div className="mt-8 rounded-xl border border-teal-200 bg-teal-50 p-6">
        <h2 className="mb-4 text-sm font-semibold text-teal-700 uppercase">Verification Checklist</h2>
        <ul className="space-y-2 text-sm text-teal-800">
          <li>1. Click trigger buttons above to see floating animation</li>
          <li>2. Animation text floats up and fades out over ~2 seconds</li>
          <li>3. Shows correct &ldquo;+X dagen&rdquo; or &ldquo;+X.X dagen&rdquo; format</li>
          <li>4. Animation is non-intrusive (pointer-events-none)</li>
          <li>5. Weekly summary badge visible in hero section</li>
          <li>6. Multiple rapid triggers create separate animations</li>
        </ul>
      </div>
    </div>
  )
}

export default function TestFreedomDaysAnimation() {
  return (
    <FreedomDaysAnimationProvider>
      <AnimationDemo />
    </FreedomDaysAnimationProvider>
  )
}
