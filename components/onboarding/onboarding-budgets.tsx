'use client'

import { useState, useEffect } from 'react'
import { FinnAvatar } from '@/components/app/avatars'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'
import { BudgetAmountEditor } from './budget-amount-editor'
import { getDefaultBudgets } from '@/lib/budget-data'

type SubChoice = null | 'ai' | 'manual'

export function OnboardingBudgets({
  amounts,
  onChange,
  netIncome,
  householdType,
  numberOfChildren,
  onNext,
  onBack,
}: {
  amounts: Record<string, number>
  onChange: (amounts: Record<string, number>) => void
  netIncome: number
  householdType: string
  numberOfChildren: number
  onNext: () => void
  onBack: () => void
}) {
  const [subChoice, setSubChoice] = useState<SubChoice>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiContext, setAiContext] = useState('')

  // Initialize with defaults if empty
  const hasAmounts = Object.keys(amounts).length > 0
  useEffect(() => {
    if (hasAmounts) return
    const defaults: Record<string, number> = {}
    for (const parent of getDefaultBudgets()) {
      if (parent.children) {
        for (const child of parent.children) {
          defaults[child.slug] = child.default_limit
        }
      }
    }
    onChange(defaults)
  }, [hasAmounts, onChange])

  async function handleAISuggest() {
    setAiLoading(true)
    setAiError(null)
    try {
      const res = await fetch('/api/onboarding/suggest-budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          netMonthlyIncome: netIncome,
          householdType,
          numberOfChildren,
          context: aiContext.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || 'AI niet beschikbaar')
      }
      const { amounts: suggested } = await res.json()
      onChange(suggested)
      setSubChoice('manual') // Switch to manual editor so user can review
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI-suggestie mislukt')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-6 flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Terug
      </button>

      <div className="mb-6">
        <StepProgress current="budgets" />
      </div>

      <div className="mb-6 flex items-start gap-3">
        <div className="shrink-0"><FinnAvatar size={48} /></div>
        <SpeechBubble>Nu gaan we je maandelijkse budget verdelen.</SpeechBubble>
      </div>

      {/* Sub-choice: AI or Manual */}
      {subChoice === null && (
        <div className="space-y-3">
          <button
            onClick={() => setSubChoice('ai')}
            className="group w-full rounded-xl border-2 border-zinc-200 bg-white p-5 text-left transition-all hover:border-horizon-300 hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-horizon-50 group-hover:bg-horizon-100">
                <svg className="h-5 w-5 text-horizon-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">AI-suggestie</h3>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Laat AI je budget verdelen op basis van je profiel. Je kunt daarna alles aanpassen.
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setSubChoice('manual')}
            className="group w-full rounded-xl border-2 border-zinc-200 bg-white p-5 text-left transition-all hover:border-wil-300 hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-wil-50 group-hover:bg-wil-100">
                <svg className="h-5 w-5 text-wil-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">Zelf invullen</h3>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Stel je eigen budgetbedragen in per categorie.
                </p>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* AI context + generate */}
      {subChoice === 'ai' && (
        <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6">
          <p className="text-sm text-zinc-600">
            Vertel optioneel iets meer over je situatie (woonsituatie, auto, leefstijl) zodat de AI je budget beter kan inschatten.
          </p>
          <textarea
            value={aiContext}
            onChange={(e) => setAiContext(e.target.value)}
            rows={3}
            placeholder="Bijv: Ik huur een appartement voor €950/mnd, heb geen auto, ga graag uit eten..."
            className="w-full resize-none rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
          />
          {aiError && (
            <p className="text-sm text-red-600">{aiError}</p>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => setSubChoice(null)}
              className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
            >
              Terug
            </button>
            <button
              onClick={handleAISuggest}
              disabled={aiLoading}
              className="flex-1 rounded-lg bg-horizon-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-horizon-700 disabled:opacity-50"
            >
              {aiLoading ? 'AI denkt na...' : 'Genereer suggestie'}
            </button>
          </div>
        </div>
      )}

      {/* Manual editor */}
      {subChoice === 'manual' && (
        <div className="space-y-4">
          <BudgetAmountEditor
            amounts={amounts}
            onChange={onChange}
            netIncome={netIncome}
          />

          <div className="flex gap-3">
            <button
              onClick={() => setSubChoice(null)}
              className="flex-1 rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
            >
              Terug
            </button>
            <button
              onClick={onNext}
              className="flex-1 rounded-lg bg-wil-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700"
            >
              Volgende
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
