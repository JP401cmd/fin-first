'use client'

import { useState, useEffect } from 'react'
import { User, Users, Briefcase, Sunset } from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import { FinnAvatar } from '@/components/app/avatars'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'
import { BudgetAmountEditor } from './budget-amount-editor'
import { getDefaultBudgets } from '@/lib/budget-data'
import { BUDGET_TEMPLATES, type BudgetTemplate } from '@/lib/budget-templates'

const TEMPLATE_ICONS: Record<string, React.ComponentType<LucideProps>> = {
  User,
  Users,
  Briefcase,
  Sunset,
}

type SubChoice = null | 'ai' | 'manual' | 'template'

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
  const [selectedTemplate, setSelectedTemplate] = useState<BudgetTemplate | null>(null)

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

  function handleTemplateSelect(template: BudgetTemplate) {
    setSelectedTemplate(template)
    // Pre-fill amounts from template
    const budgets = template.getBudgets()
    const newAmounts: Record<string, number> = {}
    for (const parent of budgets) {
      if (parent.children) {
        for (const child of parent.children) {
          newAmounts[child.slug] = child.default_limit
        }
      }
    }
    onChange(newAmounts)
    setSubChoice('manual') // Go to manual editor so user can review/adjust
  }

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
        <StepProgress current="budgetten" />
      </div>

      <div className="mb-6 flex items-start gap-3">
        <div className="shrink-0"><FinnAvatar size={48} /></div>
        <SpeechBubble>Nu gaan we je maandelijkse budget verdelen.</SpeechBubble>
      </div>

      {/* Sub-choice: AI or Manual */}
      {subChoice === null && (
        <div className="space-y-3">
          <button
            onClick={() => setSubChoice('template')}
            className="group w-full rounded-xl border-2 border-zinc-200 bg-white p-5 text-left transition-all hover:border-kern-300 hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-kern-50 group-hover:bg-kern-100">
                <svg className="h-5 w-5 text-kern-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">Start met een template</h3>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Kies een startpunt dat past bij jouw situatie. Je kunt daarna alles aanpassen.
                </p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setSubChoice('ai')}
            className="group w-full rounded-xl border-2 border-zinc-200 bg-white p-5 text-left transition-all hover:border-[var(--border-md)] hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--subtle)] group-hover:bg-[var(--border-ed)]">
                <svg className="h-5 w-5 text-[var(--ink-3)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
            className="group w-full rounded-xl border-2 border-zinc-200 bg-white p-5 text-left transition-all hover:border-[var(--border-md)] hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--subtle)] group-hover:bg-[var(--border-ed)]">
                <svg className="h-5 w-5 text-[var(--ink-3)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
        <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6">
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

      {/* Template selection */}
      {subChoice === 'template' && (
        <div className="space-y-3">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            Kies een template
          </p>
          {BUDGET_TEMPLATES.map((template) => {
            const TemplateIcon = TEMPLATE_ICONS[template.icon] ?? User
            return (
            <button
              key={template.id}
              onClick={() => handleTemplateSelect(template)}
              className="group w-full rounded-xl border-2 border-zinc-200 bg-white p-4 text-left transition-all hover:border-kern-300 hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-kern-50 group-hover:bg-kern-100">
                  <TemplateIcon className="h-5 w-5 text-kern-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900">{template.name}</h3>
                  <p className="text-xs text-zinc-500">{template.description}</p>
                </div>
                <svg className="ml-auto h-4 w-4 text-zinc-400 group-hover:text-kern-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </div>
            </button>
          )})}
          <button
            onClick={() => setSubChoice(null)}
            className="w-full rounded-lg border border-[var(--border-md)] px-4 py-2.5 text-sm font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)]"
          >
            Terug
          </button>
        </div>
      )}

      {/* Manual editor */}
      {subChoice === 'manual' && (
        <div className="space-y-4">
          {selectedTemplate && (
            <div className="flex items-center gap-2 rounded-lg border border-kern-200 bg-kern-50 px-3 py-2 text-[11px] text-kern-700">
              <svg className="h-3.5 w-3.5 shrink-0 text-kern-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
              <span>Template: <strong>{selectedTemplate.name}</strong> — Pas de bedragen aan naar jouw situatie</span>
            </div>
          )}
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
              className="flex-1 rounded-lg bg-kern-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-kern-700"
            >
              Volgende
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
