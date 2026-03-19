'use client'

import {
  Wallet,
  TrendingUp,
  Flame,
  Target,
  BarChart3,
  Check,
} from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import { WillDots } from '@/components/app/will-dots'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'
import { WIDGET_CATALOG, type WidgetPrefs, type WidgetPref } from '@/lib/widget-catalog'
import { buildDashboardLayout, type FocusChoice, type AutoDashboardAnswers } from '@/lib/auto-dashboard-builder'

// ── Types ────────────────────────────────────────────────────

export interface PreferencesData {
  focuses: FocusChoice[]
}

export const INITIAL_PREFERENCES: PreferencesData = { focuses: [] }
export const DEFAULT_PREFERENCES: PreferencesData = { focuses: ['overview'] }

// ── Focus options ───────────────────────────────────────────

interface FocusOption {
  id: FocusChoice
  label: string
  description: string
  icon: React.ComponentType<LucideProps>
}

const FOCUS_OPTIONS: FocusOption[] = [
  { id: 'budget_cashflow', label: 'Budgetten & cashflow', description: 'Grip op inkomsten, uitgaven en abonnementen', icon: Wallet },
  { id: 'assets_investments', label: 'Vermogen & beleggen', description: 'Bezittingen, portefeuille en rendement', icon: TrendingUp },
  { id: 'fire_freedom', label: 'FIRE & vrijheid', description: 'Vrijheidsprojecties, simulaties en mijlpalen', icon: Flame },
  { id: 'goals_actions', label: 'Doelen & acties', description: 'Financiële doelen en concrete stappen', icon: Target },
  { id: 'overview', label: 'Totaaloverzicht', description: 'Een breed dashboard met de belangrijkste metrics', icon: BarChart3 },
]

// ── Widget prefs builder (uses auto-dashboard-builder) ──────

export function buildWidgetPrefsFromPreferences(prefs: PreferencesData): WidgetPrefs {
  const focuses = prefs.focuses.length > 0 ? prefs.focuses : ['overview' as FocusChoice]

  const answers: AutoDashboardAnswers = {
    focuses,
    modulePreference: 'balanced',
    gridSize: 'medium',
    detailLevel: 'balanced',
    selectedBudgetFavIds: [],
  }

  const enabledPrefs = buildDashboardLayout(answers, WIDGET_CATALOG, {}, [])
  const enabledIds = new Set(enabledPrefs.map(p => p.id))

  // Add disabled catalog widgets to produce a complete WidgetPrefs object
  const disabled: WidgetPref[] = []
  for (const def of WIDGET_CATALOG) {
    if (!enabledIds.has(def.id)) {
      disabled.push({ id: def.id, enabled: false, size: def.defaultSize, order: 0 })
    }
  }

  const all = [...enabledPrefs, ...disabled]
  for (let i = 0; i < all.length; i++) {
    all[i] = { ...all[i], order: i }
  }

  return { widgets: all }
}

// ── Speech bubble text ──────────────────────────────────────

function getSpeechText(focuses: FocusChoice[]): string {
  if (focuses.length === 0) {
    return 'Bijna klaar! Kies maximaal twee onderwerpen die je het meest interesseren. Zo stel ik een dashboard samen dat past bij jouw situatie.'
  }
  if (focuses.includes('overview')) {
    return 'Een breed overzicht — goed plan! Dan zorg ik voor een gebalanceerd dashboard met de belangrijkste metrics uit alle modules.'
  }
  const labels: Record<FocusChoice, string> = {
    budget_cashflow: 'budgetten en cashflow',
    assets_investments: 'vermogen en beleggen',
    fire_freedom: 'financiële vrijheid',
    goals_actions: 'doelen en acties',
    overview: 'totaaloverzicht',
  }
  const chosen = focuses.map(f => labels[f]).join(' en ')
  return `Goede keuze! Ik richt je dashboard in met extra aandacht voor ${chosen}. De rest blijft beschikbaar in je instellingen.`
}

// ── Main Component ──────────────────────────────────────────

export function OnboardingPreferences({
  data,
  onChange,
  onNext,
  onBack,
  saving = false,
  hideBudgetFocus = false,
}: {
  data: PreferencesData
  onChange: (data: PreferencesData) => void
  onNext: () => void
  onBack: () => void
  saving?: boolean
  hideBudgetFocus?: boolean
}) {
  function handleSkipDefaults() {
    onChange(DEFAULT_PREFERENCES)
    onNext()
  }

  function handleToggleFocus(id: FocusChoice) {
    const current = data.focuses
    if (current.includes(id)) {
      onChange({ ...data, focuses: current.filter(f => f !== id) })
    } else if (current.length < 2) {
      onChange({ ...data, focuses: [...current, id] })
    }
  }

  const canProceed = data.focuses.length > 0

  return (
    <div className="pb-20 sm:pb-0">
      <button
        onClick={onBack}
        className="mb-6 flex min-h-[44px] items-center gap-1 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] active:text-[var(--ink)] transition-colors duration-150"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Terug
      </button>

      <div className="mb-8">
        <StepProgress current="voorkeuren" hideBudgets={hideBudgetFocus} />
      </div>

      <p className="label-editorial mb-2 text-[var(--ink-4)]">Voorkeuren</p>

      {/* Speech bubble */}
      <div className="mb-6 sm:mb-8 flex items-start gap-3">
        <div className="shrink-0"><WillDots size={48} /></div>
        <SpeechBubble>
          {getSpeechText(data.focuses)}
          <span className="mt-1 block text-xs text-[var(--ink-4)]">
            Je kunt dit later altijd aanpassen in Instellingen.
          </span>
        </SpeechBubble>
      </div>

      {/* Skip with defaults link */}
      {!saving && (
        <button
          type="button"
          onClick={handleSkipDefaults}
          className="mb-4 w-full text-center text-sm text-[var(--ink-4)] underline underline-offset-2 transition-colors hover:text-[var(--ink-2)]"
        >
          Standaard instellingen gebruiken
        </button>
      )}

      {/* Focus selection */}
      <div className="space-y-3">
        <h2 className="mb-4 font-display text-lg font-bold tracking-[-0.02em] text-[var(--ink)]">
          Wat vind je belangrijk?
        </h2>
        <p className="text-sm text-[var(--ink-3)]">Kies maximaal 2 onderwerpen</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {FOCUS_OPTIONS.filter(opt => !(hideBudgetFocus && opt.id === 'budget_cashflow')).map((opt) => {
            const selected = data.focuses.includes(opt.id)
            const atMax = !selected && data.focuses.length >= 2
            const Icon = opt.icon
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleToggleFocus(opt.id)}
                disabled={atMax}
                className={`group w-full min-h-[48px] rounded-xl border-2 p-4 text-left transition-all active:scale-[0.99] ${
                  selected
                    ? 'border-wil-500 bg-wil-50/60 shadow-sm'
                    : atMax
                      ? 'border-[var(--border-ed)] bg-[var(--paper)] opacity-50 cursor-not-allowed'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)] hover:shadow-md'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      selected ? 'bg-wil-100' : 'bg-[var(--subtle)] group-hover:bg-[var(--border-ed)]'
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${selected ? 'text-wil-600' : 'text-[var(--ink-3)]'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className={`text-sm font-semibold ${selected ? 'text-wil-900' : 'text-[var(--ink)]'}`}>
                      {opt.label}
                    </h3>
                    <p className="mt-0.5 text-xs text-[var(--ink-3)]">{opt.description}</p>
                  </div>
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                      selected ? 'border-wil-500 bg-wil-500' : 'border-[var(--border-ed)]'
                    }`}
                  >
                    {selected && <Check className="h-3.5 w-3.5 text-white" />}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Sticky navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex gap-3 border-t border-[var(--border-ed)] bg-[var(--paper)]/95 px-4 pb-[env(safe-area-inset-bottom,12px)] pt-3 backdrop-blur-sm sm:static sm:mt-8 sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-none">
        <button
          onClick={onBack}
          disabled={saving}
          className="flex-1 min-h-[44px] rounded-xl border border-[var(--border-ed)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] active:bg-[var(--subtle)] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Terug
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed || saving}
          className="flex-1 min-h-[44px] rounded-xl bg-wil-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Opslaan...' : 'Opslaan & starten'}
        </button>
      </div>
    </div>
  )
}
