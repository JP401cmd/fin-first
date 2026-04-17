'use client'

import { useRef } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { WillDots } from '@/components/app/will-dots'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'
import type { RetirementExpenseMethod } from '@/lib/budget-utils'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import type { ModuleId } from '@/lib/module-registry'

// ── Types ────────────────────────────────────────────────────

export interface LifeEventEntry {
  name: string
  event_type: string
  target_age: number
  monthly_income_change?: number
  monthly_cost_change?: number
  one_time_cost?: number
  duration_months?: number
  is_active: boolean
}

export interface HorizonData {
  fire_end_strategy: FireEndStrategy
  fire_end_age: number                // 60-120, default 90
  fire_legacy_amount: string
  retirement_expense_method: RetirementExpenseMethod
  retirement_custom_amount: string
  temporal_balance: number            // 1-5, default 3
  life_events: LifeEventEntry[]
}

export const INITIAL_HORIZON_DATA: HorizonData = {
  fire_end_strategy: 'deplete',
  fire_end_age: 90,
  fire_legacy_amount: '',
  retirement_expense_method: 'current_income',
  retirement_custom_amount: '',
  temporal_balance: 3,
  life_events: [],
}

// ── Strategy definitions ────────────────────────────────────

interface StrategyDef {
  id: FireEndStrategy
  name: string
  description: string
  emoji: string
}

const STRATEGIES: StrategyDef[] = [
  {
    id: 'deplete',
    name: 'Vermogen opeten',
    description: 'Je vermogen raakt op bij een gekozen leeftijd. Alle berekeningen houden rekening met inflatie — je koopkracht blijft gelijk.',
    emoji: '\u23F3', // hourglass
  },
  {
    id: 'legacy',
    name: 'Nalatenschap',
    description: 'Je houdt een doelbedrag over om na te laten. Onttrekkingen zijn inflatiegecorrigeerd zodat je levensstijl op peil blijft.',
    emoji: '\uD83C\uDFDB\uFE0F', // classical building
  },
  {
    id: 'perpetual',
    name: 'Eeuwigdurend',
    description: 'Je vermogen blijft behouden en groeit mee met inflatie — je onttrekt alleen het reële rendement. Maximale zekerheid, maar vereist het meeste startkapitaal.',
    emoji: '\u267E\uFE0F', // infinity
  },
  {
    id: 'pensioen',
    name: 'Pensioenleeftijd',
    description: 'Opbouw tot AOW-leeftijd, daarna een inflatiebestendige onttrekking. Wat overblijft is je nalatenschap.',
    emoji: '\uD83C\uDF3F', // seedling
  },
]

// Expense method definitions removed from onboarding UI.
// Default is set programmatically based on active modules.
// User can change via Instellingen after onboarding.

// ── Default life events ─────────────────────────────────────

function createDefaultLifeEvents(aowAge: number): LifeEventEntry[] {
  return [
    {
      name: 'AOW',
      event_type: 'income',
      target_age: aowAge,
      monthly_income_change: 1558,
      is_active: true,
    },
    {
      name: 'Pensioen',
      event_type: 'income',
      target_age: Math.max(aowAge - 2, 60),
      monthly_income_change: 0,
      is_active: true,
    },
  ]
}

// ── Speech bubble text ──────────────────────────────────────

function getSpeechText(strategy: FireEndStrategy): string {
  const map: Record<string, string> = {
    deplete: 'Met deze strategie gebruik je je vermogen volledig tot de gekozen leeftijd. Alle bedragen worden gecorrigeerd voor inflatie — je koopkracht blijft op peil.',
    legacy: 'Je wilt iets nalaten \u2014 mooi. Ik reken uit hoeveel extra je nodig hebt, rekening houdend met inflatie zodat je levensstijl intact blijft.',
    perpetual: 'De meest conservatieve strategie. Je vermogen blijft intact en groeit mee met inflatie \u2014 je onttrekt alleen het reële rendement. Dit vereist het meeste startkapitaal.',
    pensioen: 'Je bouwt vermogen op tot je AOW-leeftijd en onttrekt daarna een inflatiebestendig bedrag. Wat overblijft gaat naar je nabestaanden.',
  }
  return map[strategy] ?? 'Kies een eindstrategie om te beginnen. Dit bepaalt hoe ik je vrijheidsdoel bereken.'
}

// ── Main Component ──────────────────────────────────────────

export function OnboardingHorizon({
  data,
  onChange,
  onNext,
  onBack,
  activeModules = [],
  aowAge = 67,
  subStep,
}: {
  data: HorizonData
  onChange: (data: HorizonData) => void
  onNext: () => void
  onBack: () => void
  activeModules?: ModuleId[]
  aowAge?: number
  subStep?: { current: number; total: number }
}) {
  const hasInitialized = useRef(false)

  // Pre-fill life events + smart defaults on first render
  if (!hasInitialized.current) {
    hasInitialized.current = true

    const patches: Partial<HorizonData> = {}

    // Pre-fill AOW and pensioen life events when empty
    if (data.life_events.length === 0) {
      patches.life_events = createDefaultLifeEvents(aowAge)
    }

    // Default retirement expense method based on active modules:
    // - If budgetteren is active → essentiële budgetten
    // - Otherwise → huidig inkomen (the existing default)
    if (activeModules.includes('budgetteren')) {
      patches.retirement_expense_method = 'essential_budgets'
    } else {
      patches.retirement_expense_method = 'current_income'
    }

    // Default temporal balance to level 3 (De Architect)
    patches.temporal_balance = 3

    if (Object.keys(patches).length > 0) {
      // Schedule update for next tick to avoid setState-during-render
      queueMicrotask(() => {
        onChange({ ...data, ...patches })
      })
    }
  }

  // ── Helpers ──────────────────────────────────────────────

  function updateLifeEvent(index: number, patch: Partial<LifeEventEntry>) {
    const updated = data.life_events.map((evt, i) =>
      i === index ? { ...evt, ...patch } : evt
    )
    onChange({ ...data, life_events: updated })
  }

  function removeLifeEvent(index: number) {
    onChange({ ...data, life_events: data.life_events.filter((_, i) => i !== index) })
  }

  function addLifeEvent() {
    const newEvent: LifeEventEntry = {
      name: '',
      event_type: 'income',
      target_age: 65,
      monthly_income_change: 0,
      is_active: true,
    }
    onChange({ ...data, life_events: [...data.life_events, newEvent] })
  }

  // Strategy requires end age for deplete and legacy
  const showEndAge = data.fire_end_strategy === 'deplete' || data.fire_end_strategy === 'legacy'
  const showLegacyAmount = data.fire_end_strategy === 'legacy'
  // Temporal balance and retirement expense method are auto-set (not shown in onboarding UI)

  return (
    <div className="pb-20 sm:pb-0">
      {/* Back button */}
      <button
        onClick={onBack}
        className="mb-6 flex min-h-[44px] items-center gap-1 text-sm text-[var(--ink-3)] hover:text-[var(--ink)] active:text-[var(--ink)] transition-colors duration-150"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Terug
      </button>

      {/* Progress indicator — phase 3 (instellen) with sub-step */}
      <div className="mb-8">
        <StepProgress currentPhase="instellen" subStep={subStep} />
      </div>

      <p className="label-editorial mb-2 text-[var(--ink-4)]">Toekomstplannen</p>

      {/* Will's speech bubble */}
      <div className="mb-6 sm:mb-8 flex items-start gap-3">
        <div className="shrink-0">
          <WillDots size={48} />
        </div>
        <SpeechBubble>
          {getSpeechText(data.fire_end_strategy)}
          <span className="mt-1 block text-xs text-[var(--ink-4)]">
            Je kunt deze instellingen later aanpassen via Instellingen.
          </span>
        </SpeechBubble>
      </div>

      {/* ── Section A: Eindstrategie ─────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 font-display text-lg font-bold tracking-[-0.02em] text-[var(--ink)]">
          Eindstrategie
        </h2>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {STRATEGIES.map((strategy) => {
            const isSelected = data.fire_end_strategy === strategy.id
            return (
              <button
                key={strategy.id}
                type="button"
                onClick={() => onChange({ ...data, fire_end_strategy: strategy.id })}
                className={`group w-full min-h-[48px] cursor-pointer rounded-xl border-2 p-4 text-left transition-all active:scale-[0.99] ${
                  isSelected
                    ? 'border-horizon-500 bg-horizon-50/60 shadow-sm'
                    : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)] hover:shadow-md'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Emoji icon */}
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl transition-colors ${
                      isSelected
                        ? 'bg-horizon-100'
                        : 'bg-[var(--subtle)] group-hover:bg-[var(--border-ed)]'
                    }`}
                    aria-hidden="true"
                  >
                    {strategy.emoji}
                  </div>

                  {/* Text content */}
                  <div className="min-w-0 flex-1">
                    <h3 className={`text-sm font-semibold leading-tight ${isSelected ? 'text-horizon-900' : 'text-[var(--ink)]'}`}>
                      {strategy.name}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--ink-4)] leading-snug">
                      {strategy.description}
                    </p>
                  </div>

                  {/* Selection indicator */}
                  <div
                    className={`flex h-5 w-5 shrink-0 mt-0.5 items-center justify-center rounded-full border-2 transition-colors ${
                      isSelected
                        ? 'border-horizon-500 bg-horizon-500'
                        : 'border-[var(--border-ed)]'
                    }`}
                  >
                    {isSelected && (
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Conditional inputs for end age and legacy amount */}
        {showEndAge && (
          <div className="mt-4 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 space-y-4">
            <div>
              <label htmlFor="ob-end-age" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                Eindleeftijd
              </label>
              <input
                id="ob-end-age"
                type="number"
                min={60}
                max={120}
                value={data.fire_end_age}
                onChange={(e) => {
                  const val = Math.min(120, Math.max(60, Number(e.target.value) || 60))
                  onChange({ ...data, fire_end_age: val })
                }}
                className="w-full sm:w-32 min-h-[44px] rounded-xl bg-[var(--subtle)] px-3 py-2.5 text-base font-mono tabular-nums text-[var(--ink)] outline-none border border-[var(--border-ed)] focus:border-horizon-500 focus:ring-1 focus:ring-horizon-500 sm:text-sm"
              />
              <p className="mt-1 text-xs text-[var(--ink-4)]">
                De leeftijd waarop je vermogen opraakt (60-120 jaar).
              </p>
            </div>

            {showLegacyAmount && (
              <div>
                <label htmlFor="ob-legacy" className="mb-1.5 block text-sm font-medium text-[var(--ink-2)]">
                  Doelbedrag nalatenschap
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--ink-4)]">&euro;</span>
                  <input
                    id="ob-legacy"
                    type="text"
                    inputMode="decimal"
                    value={data.fire_legacy_amount}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9.,]/g, '')
                      onChange({ ...data, fire_legacy_amount: val })
                    }}
                    placeholder="0"
                    autoComplete="off"
                    className="w-full rounded-xl bg-[var(--subtle)] py-2.5 pr-3 pl-7 text-base font-mono tabular-nums text-[var(--ink)] outline-none border border-[var(--border-ed)] focus:border-horizon-500 focus:ring-1 focus:ring-horizon-500 sm:text-sm"
                  />
                </div>
                <p className="mt-1 text-xs text-[var(--ink-4)]">
                  Het bedrag dat je wilt nalaten (in huidige euro&apos;s).
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Pensioenuitgaven: verwijderd uit onboarding UI.
          Default wordt automatisch gezet:
          - budgetteren actief → essential_budgets
          - anders → current_income
          Gebruiker kan dit later aanpassen via Instellingen. */}

      {/* Inflatie toelichting */}
      <div className="mb-8 flex items-start gap-3 rounded-xl border border-horizon-200 bg-horizon-50/40 p-4">
        <span className="mt-0.5 text-lg" aria-hidden="true">📊</span>
        <div className="text-xs text-[var(--ink-2)] leading-relaxed">
          <p className="font-medium text-[var(--ink)]">Inflatie zit in alle berekeningen</p>
          <p className="mt-1">
            Alle bedragen en prognoses worden automatisch gecorrigeerd voor inflatie.
            Dat betekent dat de bedragen die je ziet altijd in <strong>koopkracht van vandaag</strong> zijn
            — zo kun je appels met appels vergelijken. Je kunt het inflatiepercentage
            later aanpassen via Instellingen.
          </p>
        </div>
      </div>

      {/* ── Section B: Levensgebeurtenissen ───────────────────── */}
      <section className="mb-8">
        <h2 className="mb-4 font-display text-lg font-bold tracking-[-0.02em] text-[var(--ink)]">
          Levensgebeurtenissen
        </h2>
        <p className="mb-4 text-sm text-[var(--ink-3)]">
          Voeg verwachte inkomsten toe, zoals AOW of pensioen. Je kunt dit later verfijnen.
        </p>

        <div className="space-y-3">
          {data.life_events.map((evt, index) => (
            <div
              key={index}
              className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                {/* Event name */}
                <div className="flex-1">
                  <label
                    htmlFor={`ob-event-name-${index}`}
                    className="mb-1 block text-xs font-medium text-[var(--ink-3)]"
                  >
                    Naam
                  </label>
                  <input
                    id={`ob-event-name-${index}`}
                    type="text"
                    value={evt.name}
                    onChange={(e) => updateLifeEvent(index, { name: e.target.value })}
                    placeholder="Bijv. AOW, pensioen"
                    className="w-full rounded-lg bg-[var(--subtle)] px-3 py-2 text-sm text-[var(--ink)] outline-none border border-[var(--border-ed)] focus:border-horizon-500 focus:ring-1 focus:ring-horizon-500"
                  />
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => removeLifeEvent(index)}
                  className="mt-5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--ink-4)] transition-colors hover:bg-red-50 hover:text-red-500 active:bg-red-100"
                  aria-label={`Verwijder ${evt.name || 'gebeurtenis'}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Target age */}
                <div>
                  <label
                    htmlFor={`ob-event-age-${index}`}
                    className="mb-1 block text-xs font-medium text-[var(--ink-3)]"
                  >
                    Leeftijd
                  </label>
                  <input
                    id={`ob-event-age-${index}`}
                    type="number"
                    min={18}
                    max={120}
                    value={evt.target_age}
                    onChange={(e) =>
                      updateLifeEvent(index, {
                        target_age: Math.min(120, Math.max(18, Number(e.target.value) || 18)),
                      })
                    }
                    className="w-full rounded-lg bg-[var(--subtle)] px-3 py-2 text-sm font-mono tabular-nums text-[var(--ink)] outline-none border border-[var(--border-ed)] focus:border-horizon-500 focus:ring-1 focus:ring-horizon-500"
                  />
                </div>

                {/* Monthly income change */}
                <div>
                  <label
                    htmlFor={`ob-event-income-${index}`}
                    className="mb-1 block text-xs font-medium text-[var(--ink-3)]"
                  >
                    Maandinkomen
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-4)]">&euro;</span>
                    <input
                      id={`ob-event-income-${index}`}
                      type="text"
                      inputMode="decimal"
                      value={evt.monthly_income_change ?? ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.,]/g, '')
                        updateLifeEvent(index, { monthly_income_change: val ? Number(val) : 0 })
                      }}
                      placeholder="0"
                      autoComplete="off"
                      className="w-full rounded-lg bg-[var(--subtle)] py-2 pr-3 pl-6 text-sm font-mono tabular-nums text-[var(--ink)] outline-none border border-[var(--border-ed)] focus:border-horizon-500 focus:ring-1 focus:ring-horizon-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Add event button */}
        <button
          type="button"
          onClick={addLifeEvent}
          className="mt-3 flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] px-4 py-3 text-sm font-medium text-[var(--ink-3)] transition-colors hover:border-horizon-400 hover:text-horizon-700 active:bg-horizon-50"
        >
          <Plus className="h-4 w-4" />
          Gebeurtenis toevoegen
        </button>
      </section>

      {/* ── Sticky navigation ────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex gap-3 border-t border-[var(--border-ed)] bg-[var(--paper)]/95 px-4 pb-[env(safe-area-inset-bottom,12px)] pt-3 backdrop-blur-sm sm:static sm:mt-8 sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-none">
        <button
          onClick={onBack}
          className="flex-1 min-h-[44px] rounded-xl border border-[var(--border-ed)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] active:bg-[var(--subtle)] transition-colors duration-150"
        >
          Terug
        </button>
        <button
          onClick={onNext}
          className="flex-1 min-h-[44px] rounded-xl bg-horizon-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-horizon-700 active:bg-horizon-800"
        >
          Verder
        </button>
      </div>
    </div>
  )
}
