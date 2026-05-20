'use client'

import Link from 'next/link'
import { Check, ArrowRight, X } from 'lucide-react'
import { useState, useEffect } from 'react'

/**
 * OnboardingNudges — 3-stappen checklist voor nieuwe gebruikers die nog
 * niet alle kerngegevens hebben ingevuld.
 *
 * Plan-context: R-1 "Reduceer onboarding tot 3 verplichte velden" + R-7
 * "Onboarding-orchestrator als state-machine". MVP-versie: server-side
 * checks → tonen tot user alle drie heeft afgevinkt of expliciet
 * dismisses.
 *
 * Drie stappen (in volgorde van impact):
 *  1. Geboortejaar — nodig voor leeftijd-based FIRE-berekening
 *  2. Eerste rekening — basis voor netto-vermogen
 *  3. Eerste doel — geeft de planning richting
 *
 * Component verbergt zichzelf permanent bij:
 *  - 3/3 stappen completed (van nature: niets meer te tonen)
 *  - User dismisses via X-knop (localStorage `tf-onboarding-dismissed`)
 */

const DISMISS_KEY = 'tf-onboarding-dismissed'

export function OnboardingNudges({
  hasDob,
  hasAssets,
  hasGoals,
}: {
  hasDob: boolean
  hasAssets: boolean
  hasGoals: boolean
}) {
  const [dismissed, setDismissed] = useState<boolean | null>(null)

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
    } catch {
      setDismissed(false)
    }
  }, [])

  function handleDismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // localStorage disabled — silent fail
    }
  }

  // SSR-safe: render niets totdat client-hydratatie voltooid is.
  if (dismissed === null) return null
  if (dismissed) return null

  const done = [hasDob, hasAssets, hasGoals].filter(Boolean).length
  // 3/3 = nothing left to nudge about.
  if (done === 3) return null

  const steps: Array<{
    label: string
    description: string
    href: string
    cta: string
    completed: boolean
  }> = [
    {
      label: 'Geboortejaar invullen',
      description: 'Nodig voor leeftijds-projectie en vrijheidsmoment.',
      href: '/mijn/profiel',
      cta: 'Profiel openen',
      completed: hasDob,
    },
    {
      label: 'Eerste rekening toevoegen',
      description: 'Basis voor netto-vermogen en de vier hefbomen.',
      href: '/overzicht/bezittingen',
      cta: 'Bezittingen openen',
      completed: hasAssets,
    },
    {
      label: 'Eerste doel formuleren',
      description: 'Geeft je planning concrete richting en mijlpalen.',
      href: '/toekomst?tab=doelen',
      cta: 'Doelen openen',
      completed: hasGoals,
    },
  ]

  return (
    <section
      aria-label="Onboarding voortgang"
      className="mt-4 mb-6 rounded-2xl border border-violet-100 bg-gradient-to-r from-violet-50/40 to-stone-50 p-4 sm:p-5"
    >
      <header className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-violet-700">
            Aan de slag · {done}/3 voltooid
          </div>
          <h2 className="font-serif text-base sm:text-lg text-[var(--ink)] mt-0.5">
            Drie stappen voor een compleet overzicht
          </h2>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Onboarding-nudges verbergen"
          className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[var(--ink-3)] hover:bg-[var(--subtle)] transition-colors"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </header>

      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li
            key={step.label}
            className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
              step.completed
                ? 'border-emerald-200 bg-emerald-50/40'
                : 'border-[var(--border-ed)] bg-[var(--paper)]'
            }`}
          >
            <span
              className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 ${
                step.completed
                  ? 'bg-emerald-500 text-white'
                  : 'bg-violet-100 text-violet-700'
              }`}
              aria-hidden="true"
            >
              {step.completed ? <Check className="w-4 h-4" /> : i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div
                className={`text-sm font-semibold ${
                  step.completed ? 'text-emerald-800 line-through decoration-emerald-300' : 'text-[var(--ink)]'
                }`}
              >
                {step.label}
              </div>
              <p
                className={`text-[11px] leading-snug mt-0.5 ${
                  step.completed ? 'text-emerald-700/70' : 'text-[var(--ink-3)]'
                }`}
              >
                {step.description}
              </p>
            </div>
            {!step.completed && (
              <Link
                href={step.href}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:underline shrink-0"
              >
                {step.cta}
                <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
