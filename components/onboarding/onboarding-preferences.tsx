'use client'

import { useState } from 'react'
import {
  BarChart3,
  CreditCard,
  TrendingUp,
  Flame,
  CalendarCheck,
  CalendarDays,
  Calendar,
  Shield,
  Zap,
  Telescope,
  Sparkles,
  EyeOff,
  PiggyBank,
  Wallet,
  Target,
  LineChart,
  Briefcase,
  Award,
  Check,
} from 'lucide-react'
import type { LucideProps } from 'lucide-react'
import { FinnAvatar } from '@/components/app/avatars'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'
import { WIDGET_CATALOG, type WidgetPrefs, type WidgetPref } from '@/lib/widget-catalog'

// ── Types ────────────────────────────────────────────────────

export type MainGoal = 'overzicht' | 'schulden' | 'vermogen' | 'fire'
export type ActivityLevel = 'dagelijks' | 'wekelijks' | 'maandelijks'
export type ModuleInterest = 'kern' | 'wil' | 'horizon'
export type DashboardCategory = 'vermogen' | 'budgetten' | 'doelen' | 'fire' | 'beleggingen' | 'voortgang'

export interface PreferencesData {
  mainGoal: MainGoal | null
  activityLevel: ActivityLevel | null
  modules: ModuleInterest[]
  aiInsights: boolean | null
  dashboardCategories: DashboardCategory[]
}

export const INITIAL_PREFERENCES: PreferencesData = {
  mainGoal: null,
  activityLevel: null,
  modules: [],
  aiInsights: null,
  dashboardCategories: [],
}

export const DEFAULT_PREFERENCES: PreferencesData = {
  mainGoal: 'overzicht',
  activityLevel: 'wekelijks',
  modules: ['kern', 'wil', 'horizon'],
  aiInsights: true,
  dashboardCategories: ['vermogen', 'budgetten', 'doelen', 'fire', 'beleggingen', 'voortgang'],
}

// ── Question definitions ─────────────────────────────────────

interface CardOption<T extends string> {
  id: T
  label: string
  description: string
  icon: React.ComponentType<LucideProps>
}

const GOAL_OPTIONS: CardOption<MainGoal>[] = [
  { id: 'overzicht', label: 'Financieel overzicht', description: 'Grip op mijn inkomsten en uitgaven', icon: BarChart3 },
  { id: 'schulden', label: 'Schulden afbetalen', description: 'Mijn schulden zo snel mogelijk aflossen', icon: CreditCard },
  { id: 'vermogen', label: 'Vermogen opbouwen', description: 'Sparen en investeren voor de toekomst', icon: TrendingUp },
  { id: 'fire', label: 'Financiële vrijheid', description: 'Niet meer hoeven werken voor geld', icon: Flame },
]

const ACTIVITY_OPTIONS: CardOption<ActivityLevel>[] = [
  { id: 'dagelijks', label: 'Dagelijks', description: 'Elke dag even checken', icon: CalendarCheck },
  { id: 'wekelijks', label: 'Wekelijks', description: 'Een keer per week bijwerken', icon: CalendarDays },
  { id: 'maandelijks', label: 'Maandelijks', description: 'Eens per maand bekijken', icon: Calendar },
]

const MODULE_OPTIONS: CardOption<ModuleInterest>[] = [
  { id: 'kern', label: 'De Kern', description: 'Vermogen, budgetten, schulden, kas', icon: Shield },
  { id: 'wil', label: 'De Wil', description: 'Acties, doelen, aanbevelingen', icon: Zap },
  { id: 'horizon', label: 'De Horizon', description: 'Vrijheidsprojecties, simulaties, scenario\'s', icon: Telescope },
]

const AI_OPTIONS: CardOption<'ja' | 'nee'>[] = [
  { id: 'ja', label: 'Ja, graag', description: 'Persoonlijke AI-inzichten en tips', icon: Sparkles },
  { id: 'nee', label: 'Nee, liever niet', description: 'Alleen mijn eigen data tonen', icon: EyeOff },
]

const DASHBOARD_OPTIONS: CardOption<DashboardCategory>[] = [
  { id: 'vermogen', label: 'Vermogen', description: 'Netto vermogen en bezittingen', icon: PiggyBank },
  { id: 'budgetten', label: 'Budgetten', description: 'Budgetten en uitgaven', icon: Wallet },
  { id: 'doelen', label: 'Doelen', description: 'Financiele doelen en voortgang', icon: Target },
  { id: 'fire', label: 'Vrijheidsprognose', description: 'Wanneer bereik je financiële vrijheid?', icon: Flame },
  { id: 'beleggingen', label: 'Beleggingen', description: 'Portefeuille en rendement', icon: LineChart },
  { id: 'voortgang', label: 'Voortgang', description: 'Badges, streaks en niveau', icon: Award },
]

const SPEECH_BUBBLES: Record<number, string> = {
  0: 'Iedereen heeft een ander startpunt en een andere bestemming. Wat is het belangrijkste doel voor jou op dit moment? Zo stem ik je dashboard af op wat jij écht nodig hebt.',
  1: 'Sommige mensen checken dagelijks hun voortgang, anderen doen het één keer per maand. Wat past bij jou? Dit bepaalt hoe vaak je updates en samenvattingen krijgt.',
  2: 'Er zijn drie perspectieven op je financiën: je fundament, je keuzes, en je toekomst. Kies welke je het meest aanspreken — je kunt dit later altijd aanpassen.',
  3: 'Ik kan je persoonlijke tips en patronen laten zien op basis van je gegevens. Handig als je wilt leren van je eigen financiële gedrag. Geen zorgen: je data blijft privé.',
  4: 'Bijna klaar! Welke onderwerpen wil je op je startscherm zien? Kies er zoveel als je wilt — je kunt dit later altijd wijzigen in je instellingen.',
}

// ── Preference → Widget mapping ──────────────────────────────

const GOAL_WIDGETS: Record<MainGoal, string[]> = {
  overzicht: ['netto_vermogen', 'cash_flow', 'budgetten', 'spaarquote', 'maandoverzicht'],
  schulden: ['schulden', 'acties', 'volgende_stap', 'netto_vermogen', 'cash_flow'],
  vermogen: ['netto_vermogen', 'assets', 'spaarquote', 'holdings', 'vrijheidsvoortgang'],
  fire: ['fire_prognose', 'vrijheidsscenarios', 'sim_vermogenspad', 'passief_inkomen', 'netto_vermogen'],
}

const ACTIVITY_WIDGETS: Record<ActivityLevel, string[]> = {
  dagelijks: ['agenda', 'meldingen', 'streaks', 'badges', 'volgende_stap'],
  wekelijks: ['maandoverzicht', 'meldingen', 'agenda'],
  maandelijks: ['maandoverzicht'],
}

const MODULE_WIDGETS: Record<ModuleInterest, string[]> = {
  kern: ['netto_vermogen', 'cash_flow', 'budgetten', 'spaarquote', 'abonnementen', 'noodfonds', 'terugkerende_transacties', 'nibud_benchmark', 'belasting_box3'],
  wil: ['acties', 'voorstellen', 'doelen', 'volgende_stap'],
  horizon: ['fire_prognose', 'vrijheidsscenarios', 'sim_vermogenspad', 'passief_inkomen', 'veerkracht_score', 'vrijheidsmijlpalen', 'backtesting_score', 'box3_drag', 'levensgebeurtenissen'],
}

const CATEGORY_WIDGETS: Record<DashboardCategory, string[]> = {
  vermogen: ['netto_vermogen', 'assets'],
  budgetten: ['budgetten', 'nibud_benchmark', 'terugkerende_transacties'],
  doelen: ['doelen', 'vrijheidsvoortgang', 'volgende_stap'],
  fire: ['fire_prognose', 'vrijheidsscenarios', 'sim_vermogenspad'],
  beleggingen: ['holdings', 'passief_inkomen', 'box3_drag'],
  voortgang: ['jouw_pad', 'badges', 'streaks'],
}

const MAX_ONBOARDING_WIDGETS = 8

const BASELINE_WIDGETS = ['netto_vermogen', 'cash_flow', 'jouw_pad', 'vrijheidsvoortgang'] as const

export function buildWidgetPrefsFromPreferences(prefs: PreferencesData): WidgetPrefs {
  // Collect widgets in priority order (baseline → goal → activity → module → AI → category)
  // Each widget is added once; duplicates are skipped via the seen set.
  const ordered: string[] = []
  const seen = new Set<string>()

  function add(id: string) {
    if (!seen.has(id)) {
      seen.add(id)
      ordered.push(id)
    }
  }

  // 1. Always-on baseline widgets (always kept)
  for (const id of BASELINE_WIDGETS) add(id)

  // 2. Goal-driven widgets
  if (prefs.mainGoal) {
    for (const id of GOAL_WIDGETS[prefs.mainGoal]) add(id)
  }

  // 3. Activity-driven widgets
  if (prefs.activityLevel) {
    for (const id of ACTIVITY_WIDGETS[prefs.activityLevel]) add(id)
  }

  // 4. Module-driven widgets
  for (const mod of prefs.modules) {
    for (const id of MODULE_WIDGETS[mod]) add(id)
  }

  // 5. AI insights
  if (prefs.aiInsights) {
    add('ai_inzicht')
  }

  // 6. Dashboard category widgets
  for (const cat of prefs.dashboardCategories) {
    for (const id of CATEGORY_WIDGETS[cat]) add(id)
  }

  // Cap at MAX_ONBOARDING_WIDGETS — keep first N by priority order
  const enabledSet = new Set(ordered.slice(0, MAX_ONBOARDING_WIDGETS))

  // Build ordered widget prefs from catalog
  // Enabled widgets first (in catalog order), disabled widgets after
  const enabled: WidgetPref[] = []
  const disabled: WidgetPref[] = []

  for (const def of WIDGET_CATALOG) {
    const isEnabled = enabledSet.has(def.id)
    const pref: WidgetPref = {
      id: def.id,
      enabled: isEnabled,
      size: def.defaultSize,
      order: 0, // will be set below
    }
    if (isEnabled) {
      enabled.push(pref)
    } else {
      disabled.push(pref)
    }
  }

  // Assign order: enabled first, then disabled
  const all = [...enabled, ...disabled]
  for (let i = 0; i < all.length; i++) {
    all[i].order = i
  }

  return { widgets: all }
}

// ── Single-select card ──────────────────────────────────────

function SelectCard<T extends string>({
  option,
  selected,
  onSelect,
}: {
  option: CardOption<T>
  selected: boolean
  onSelect: (id: T) => void
}) {
  const Icon = option.icon
  return (
    <button
      type="button"
      onClick={() => onSelect(option.id)}
      className={`group w-full min-h-[48px] rounded-xl border-2 p-4 text-left transition-all active:scale-[0.99] ${
        selected
          ? 'border-wil-500 bg-wil-50/60 shadow-sm'
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
            {option.label}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--ink-3)]">{option.description}</p>
        </div>
        {selected && (
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-wil-500">
            <Check className="h-3.5 w-3.5 text-white" />
          </div>
        )}
      </div>
    </button>
  )
}

// ── Multi-select card ───────────────────────────────────────

function MultiSelectCard<T extends string>({
  option,
  selected,
  onToggle,
}: {
  option: CardOption<T>
  selected: boolean
  onToggle: (id: T) => void
}) {
  const Icon = option.icon
  return (
    <button
      type="button"
      onClick={() => onToggle(option.id)}
      className={`group w-full min-h-[48px] rounded-xl border-2 p-4 text-left transition-all active:scale-[0.99] ${
        selected
          ? 'border-wil-500 bg-wil-50/60 shadow-sm'
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
            {option.label}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--ink-3)]">{option.description}</p>
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
}

// ── Main Component ──────────────────────────────────────────

export function OnboardingPreferences({
  data,
  onChange,
  onNext,
  onBack,
  saving = false,
}: {
  data: PreferencesData
  onChange: (data: PreferencesData) => void
  onNext: () => void
  onBack: () => void
  saving?: boolean
}) {
  const [questionIndex, setQuestionIndex] = useState(0)

  function handleSkipDefaults() {
    onChange(DEFAULT_PREFERENCES)
    onNext()
  }

  // Check if current question has a valid answer
  function canProceed(): boolean {
    switch (questionIndex) {
      case 0: return data.mainGoal !== null
      case 1: return data.activityLevel !== null
      case 2: return data.modules.length > 0
      case 3: return data.aiInsights !== null
      case 4: return data.dashboardCategories.length > 0
      default: return false
    }
  }

  function handleNext() {
    if (questionIndex < 4) {
      setQuestionIndex(questionIndex + 1)
    } else {
      onNext()
    }
  }

  function handleBack() {
    if (questionIndex > 0) {
      setQuestionIndex(questionIndex - 1)
    } else {
      onBack()
    }
  }

  return (
    <div className="pb-20 sm:pb-0">
      <button
        onClick={handleBack}
        className="mb-6 flex min-h-[44px] items-center gap-1 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] active:text-[var(--ink)] transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Terug
      </button>

      <div className="mb-8">
        <StepProgress current="voorkeuren" />
      </div>

      <p className="label-editorial mb-2 text-[var(--ink-4)]">Voorkeuren</p>

      {/* Question progress dots */}
      <div className="mb-6 flex items-center justify-center gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === questionIndex
                ? 'w-6 bg-wil-500'
                : i < questionIndex
                  ? 'w-2 bg-wil-300'
                  : 'w-2 bg-[var(--border-ed)]'
            }`}
          />
        ))}
      </div>

      {/* Will speech bubble */}
      <div className="mb-6 sm:mb-8 flex items-start gap-3">
        <div className="shrink-0"><FinnAvatar size={48} /></div>
        <SpeechBubble>
          {SPEECH_BUBBLES[questionIndex]}
          {questionIndex === 0 && (
            <span className="mt-1 block text-xs text-[var(--ink-4)]">
              Je kunt dit ook later aanpassen in Instellingen.
            </span>
          )}
        </SpeechBubble>
      </div>

      {/* Skip with defaults link — only on first question */}
      {questionIndex === 0 && !saving && (
        <button
          type="button"
          onClick={handleSkipDefaults}
          className="mb-4 w-full text-center text-sm text-[var(--ink-4)] underline underline-offset-2 transition-colors hover:text-[var(--ink-2)]"
        >
          Standaard instellingen gebruiken
        </button>
      )}

      {/* Question 1: Hoofddoel */}
      {questionIndex === 0 && (
        <div className="space-y-3">
          <h2 className="mb-4 font-display text-lg font-bold tracking-[-0.02em] text-[var(--ink)]">Wat is je hoofddoel?</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {GOAL_OPTIONS.map((opt) => (
              <SelectCard
                key={opt.id}
                option={opt}
                selected={data.mainGoal === opt.id}
                onSelect={(id) => onChange({ ...data, mainGoal: id })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Question 2: Activiteit */}
      {questionIndex === 1 && (
        <div className="space-y-3">
          <h2 className="mb-4 font-display text-lg font-bold tracking-[-0.02em] text-[var(--ink)]">Hoe actief wil je bezig zijn?</h2>
          <div className="grid grid-cols-1 gap-3">
            {ACTIVITY_OPTIONS.map((opt) => (
              <SelectCard
                key={opt.id}
                option={opt}
                selected={data.activityLevel === opt.id}
                onSelect={(id) => onChange({ ...data, activityLevel: id })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Question 3: Modules (multi-select) */}
      {questionIndex === 2 && (
        <div className="space-y-3">
          <h2 className="mb-4 font-display text-lg font-bold tracking-[-0.02em] text-[var(--ink)]">Welke modules interesseren je?</h2>
          <div className="grid grid-cols-1 gap-3">
            {MODULE_OPTIONS.map((opt) => (
              <MultiSelectCard
                key={opt.id}
                option={opt}
                selected={data.modules.includes(opt.id)}
                onToggle={(id) => {
                  const next = data.modules.includes(id)
                    ? data.modules.filter((m) => m !== id)
                    : [...data.modules, id]
                  onChange({ ...data, modules: next })
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Question 4: AI inzichten */}
      {questionIndex === 3 && (
        <div className="space-y-3">
          <h2 className="mb-4 font-display text-lg font-bold tracking-[-0.02em] text-[var(--ink)]">Wil je AI-inzichten?</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {AI_OPTIONS.map((opt) => (
              <SelectCard
                key={opt.id}
                option={opt}
                selected={
                  (opt.id === 'ja' && data.aiInsights === true) ||
                  (opt.id === 'nee' && data.aiInsights === false)
                }
                onSelect={(id) => onChange({ ...data, aiInsights: id === 'ja' })}
              />
            ))}
          </div>
        </div>
      )}

      {/* Question 5: Dashboard categorieën (multi-select) */}
      {questionIndex === 4 && (
        <div className="space-y-3">
          <h2 className="mb-4 font-display text-lg font-bold tracking-[-0.02em] text-[var(--ink)]">Wat wil je op je dashboard?</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            {DASHBOARD_OPTIONS.map((opt) => (
              <MultiSelectCard
                key={opt.id}
                option={opt}
                selected={data.dashboardCategories.includes(opt.id)}
                onToggle={(id) => {
                  const next = data.dashboardCategories.includes(id)
                    ? data.dashboardCategories.filter((c) => c !== id)
                    : [...data.dashboardCategories, id]
                  onChange({ ...data, dashboardCategories: next })
                }}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--ink-4)]">
            Je dashboard start met maximaal 8 widgets. Je kunt er later meer aanzetten in je instellingen.
          </p>
        </div>
      )}

      {/* Sticky navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex gap-3 border-t border-[var(--border-ed)] bg-[var(--paper)]/80 px-4 pb-[env(safe-area-inset-bottom,12px)] pt-3 backdrop-blur-sm sm:static sm:mt-8 sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-none">
        <button
          onClick={handleBack}
          className="flex-1 min-h-[44px] rounded-lg border border-[var(--border-ed)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] active:bg-[var(--subtle)]"
        >
          Terug
        </button>
        <button
          onClick={handleNext}
          disabled={!canProceed() || saving}
          className="flex-1 min-h-[44px] rounded-lg bg-wil-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving
            ? 'Opslaan...'
            : questionIndex < 4
              ? 'Volgende'
              : 'Opslaan & starten'}
        </button>
      </div>
    </div>
  )
}
