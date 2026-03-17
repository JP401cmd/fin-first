'use client'

import { useState, useCallback } from 'react'
import '../(onboarding)/onboarding/onboarding.css'

type Direction = 'forward' | 'back'

const STEPS = ['intro', 'identity', 'extras', 'budgets', 'preferences'] as const
type Step = typeof STEPS[number]

const STEP_LABELS: Record<Step, string> = {
  intro: 'Welkom',
  identity: 'Profiel',
  extras: 'Startpunt',
  budgets: 'Budgetten',
  preferences: 'Voorkeuren',
}

function StepTransition({ direction, children }: {
  direction: Direction
  children: React.ReactNode
}) {
  return (
    <div className={direction === 'forward' ? 'step-enter-forward' : 'step-enter-back'}>
      {children}
    </div>
  )
}

export default function TestOnboardingTransition() {
  const [step, setStep] = useState<Step>('intro')
  const [direction, setDirection] = useState<Direction>('forward')
  const [log, setLog] = useState<string[]>([])

  const goTo = useCallback((target: Step) => {
    const oldIdx = STEPS.indexOf(step)
    const newIdx = STEPS.indexOf(target)
    const dir: Direction = newIdx >= oldIdx ? 'forward' : 'back'
    setDirection(dir)
    setStep(target)
    setLog(prev => [...prev, `${step} → ${target} (${dir})`])
  }, [step])

  const stepIdx = STEPS.indexOf(step)
  const canBack = stepIdx > 0
  const canNext = stepIdx < STEPS.length - 1

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">Onboarding Transition Test</h1>
      <p className="mb-6 text-sm text-zinc-500">Test slide/fade animations between onboarding steps</p>

      {/* Step indicator */}
      <div className="mb-6 flex gap-2">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => goTo(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              s === step
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
            }`}
          >
            {i + 1}. {STEP_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Animated content area */}
      <div className="w-full max-w-[480px]">
        <StepTransition key={step} direction={direction}>
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
            <div className="mb-4 text-4xl">
              {step === 'intro' && '👋'}
              {step === 'identity' && '👤'}
              {step === 'extras' && '🏦'}
              {step === 'budgets' && '📊'}
              {step === 'preferences' && '⚙️'}
            </div>
            <h2 className="mb-2 text-xl font-bold text-zinc-900">
              Stap {stepIdx + 1}: {STEP_LABELS[step]}
            </h2>
            <p className="text-sm text-zinc-500">
              {step === 'intro' && 'Welkom bij TriFinity onboarding!'}
              {step === 'identity' && 'Vul je persoonlijke gegevens in.'}
              {step === 'extras' && 'Voeg je bankrekeningen, bezittingen en schulden toe.'}
              {step === 'budgets' && 'Stel je maandelijkse budgetten in.'}
              {step === 'preferences' && 'Kies je dashboard voorkeuren.'}
            </p>
            <p className="mt-3 text-xs text-zinc-400">
              Richting: <span className="font-mono font-medium">{direction}</span>
            </p>
          </div>
        </StepTransition>

        {/* Navigation buttons */}
        <div className="mt-6 flex justify-between">
          <button
            onClick={() => canBack && goTo(STEPS[stepIdx - 1])}
            disabled={!canBack}
            className="min-h-[44px] rounded-xl border border-zinc-200 bg-white px-6 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-30"
          >
            ← Terug
          </button>
          <button
            onClick={() => canNext && goTo(STEPS[stepIdx + 1])}
            disabled={!canNext}
            className="min-h-[44px] rounded-xl bg-zinc-900 px-6 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-30"
          >
            Volgende →
          </button>
        </div>
      </div>

      {/* Transition log */}
      {log.length > 0 && (
        <div className="mt-8 w-full max-w-[480px] rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Transition Log</h3>
          <div className="max-h-40 overflow-y-auto">
            {log.map((entry, i) => (
              <p key={i} className="font-mono text-xs text-zinc-600">{entry}</p>
            ))}
          </div>
        </div>
      )}

      {/* Test checklist */}
      <div className="mt-6 w-full max-w-[480px] rounded-xl border border-zinc-200 bg-white p-4 text-left">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Verificatie Checklist</h3>
        <ul className="space-y-1 text-xs text-zinc-600">
          <li>✅ Forward: slide van rechts (translateX 20px → 0) + fade-in</li>
          <li>✅ Back: slide van links (translateX -20px → 0) + fade-in</li>
          <li>✅ Duur: 250ms ease-out</li>
          <li>✅ CSS keyframe animaties (geen zware library)</li>
          <li>✅ prefers-reduced-motion: animaties uitgeschakeld</li>
          <li>✅ Geen exit animatie (oude stap verdwijnt instant)</li>
        </ul>
      </div>
    </div>
  )
}
