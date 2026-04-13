'use client'

import { WillDots } from '@/components/app/will-dots'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'
import {
  type IntentId,
  type ModuleId,
  INTENT_MODULE_PRESETS,
  MODULE_CATALOG,
} from '@/lib/module-registry'

// ── Types ────────────────────────────────────────────────────

export interface OnboardingIntentProps {
  selectedIntent: IntentId | null
  onSelect: (intent: IntentId) => void
  onNext: () => void
  onBack: () => void
}

// ── Intent definitions ──────────────────────────────────────

interface IntentDef {
  id: IntentId
  name: string
  tagline: string
  description: string
  emoji: string
  /** Whether this is the primary/prominent card */
  primary?: boolean
}

const INTENTS: IntentDef[] = [
  {
    id: 'coaching',
    name: 'Coaching',
    tagline: 'Slimmer omgaan met geld',
    description: 'Ik wil slimmer omgaan met mijn geld \u2014 met persoonlijke tips',
    emoji: '\uD83E\uDDE0',
    primary: true,
  },
  {
    id: 'grip_uitgaven',
    name: 'Grip op uitgaven',
    tagline: 'Budgetteren en besparen',
    description: 'Ik wil weten waar mijn geld naartoe gaat en bewuster uitgeven',
    emoji: '\uD83C\uDFAF',
  },
  {
    id: 'overzicht_geld',
    name: 'Overzicht over mijn geld',
    tagline: 'Vermogen bijhouden',
    description: 'Ik wil al mijn bezittingen en schulden op \u00e9\u00e9n plek zien',
    emoji: '\uD83D\uDCCA',
  },
  {
    id: 'toekomst',
    name: 'Toekomst plannen',
    tagline: 'Pensioen en FIRE',
    description: 'Ik wil weten wanneer ik financieel vrij ben en scenario\u2019s doorrekenen',
    emoji: '\uD83D\uDD2D',
  },
  {
    id: 'nieuws',
    name: 'Nieuws',
    tagline: 'Financieel nieuws',
    description: 'Ik wil op de hoogte blijven van financieel nieuws en marktinzichten',
    emoji: '\uD83D\uDCF0',
  },
  {
    id: 'alles',
    name: 'Alles',
    tagline: 'Maximale inzichten',
    description: 'Ik wil alles \u2014 budgetteren, vermogen, toekomst en meer',
    emoji: '\uD83D\uDD25',
  },
]

// ── Speech bubble helper ─────────────────────────────────────

function getSpeechText(intent: IntentId | null): string {
  if (!intent) {
    return 'Wat wil je bereiken met TriFinity? Ik stel dan de juiste modules voor je in.'
  }
  const map: Record<IntentId, string> = {
    coaching:
      'Goede keuze! Ik activeer budgetteren en inzichten zodat je direct persoonlijke tips krijgt.',
    grip_uitgaven:
      'Slim! Met de budgetmodule krijg je direct inzicht in je uitgaven en cashflow.',
    overzicht_geld:
      'Overzicht is de basis! Ik activeer vermogensregistratie zodat je alles op \u00e9\u00e9n plek ziet.',
    toekomst:
      'Toekomstgericht! Ik activeer vermogen, toekomstplannen en inzichten \u2014 zo zie je wanneer jouw vrijheid begint.',
    alles:
      'Volledig aan de slag! Ik activeer alle modules zodat je het maximale uit TriFinity haalt.',
    nieuws:
      'Je blijft op de hoogte! Ik activeer de nieuwsmodule met gepersonaliseerde financi\u00eble inzichten.',
  }
  return map[intent]
}

// ── Module preview helper ────────────────────────────────────

function ModulePreview({ intentId }: { intentId: IntentId }) {
  const activeModuleIds = INTENT_MODULE_PRESETS[intentId]

  return (
    <div className="mt-4 rounded-lg border border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2.5">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
        Modules
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {MODULE_CATALOG.map((mod) => {
          const isActive = activeModuleIds.includes(mod.id)
          return (
            <span
              key={mod.id}
              className={`text-xs ${
                isActive
                  ? 'font-medium text-[var(--ink)]'
                  : 'text-[var(--ink-4)] line-through decoration-[var(--ink-4)]/40'
              }`}
            >
              {mod.label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────

export function OnboardingIntent({
  selectedIntent,
  onSelect,
  onNext,
  onBack,
}: OnboardingIntentProps) {
  const canProceed = selectedIntent !== null

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

      {/* Progress indicator */}
      <div className="mb-8">
        <StepProgress currentPhase="modules" />
      </div>

      <p className="label-editorial mb-2 text-[var(--ink-4)]">Intentie</p>

      {/* Will's speech bubble */}
      <div className="mb-6 sm:mb-8 flex items-start gap-3">
        <div className="shrink-0">
          <WillDots size={48} />
        </div>
        <SpeechBubble>{getSpeechText(selectedIntent)}</SpeechBubble>
      </div>

      {/* Section heading */}
      <h2 className="mb-4 font-display text-lg font-bold tracking-[-0.02em] text-[var(--ink)]">
        Wat wil je bereiken?
      </h2>

      {/* Intent cards grid — coaching spans full width, others in 2-col grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {INTENTS.map((intent) => {
          const isSelected = selectedIntent === intent.id
          const isPrimary = intent.primary

          return (
            <button
              key={intent.id}
              type="button"
              onClick={() => onSelect(intent.id)}
              className={`group w-full cursor-pointer rounded-xl border-2 text-left transition-all duration-150 active:scale-[0.99] outline-none focus-visible:ring-2 focus-visible:ring-wil-400 focus-visible:ring-offset-2 ${
                isPrimary
                  ? 'sm:col-span-2 lg:col-span-3 p-5'
                  : 'p-4'
              } ${
                isPrimary && !isSelected
                  ? 'border-wil-200 bg-wil-50/30 hover:border-wil-300 hover:shadow-md'
                  : ''
              } ${
                isSelected
                  ? 'border-wil-500 bg-wil-50/60 shadow-sm'
                  : !isPrimary
                    ? 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)] hover:shadow-sm'
                    : ''
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Emoji icon */}
                <div
                  className={`flex shrink-0 items-center justify-center rounded-lg transition-colors ${
                    isPrimary ? 'h-14 w-14 text-2xl' : 'h-10 w-10 text-xl'
                  } ${
                    isSelected
                      ? 'bg-wil-100'
                      : isPrimary
                        ? 'bg-wil-100/60 group-hover:bg-wil-100'
                        : 'bg-[var(--subtle)] group-hover:bg-[var(--border-ed)]'
                  }`}
                  aria-hidden="true"
                >
                  {intent.emoji}
                </div>

                {/* Text content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className={`font-semibold leading-tight ${
                        isPrimary ? 'text-base' : 'text-sm'
                      } ${isSelected ? 'text-wil-900' : 'text-[var(--ink)]'}`}
                    >
                      {intent.name}
                    </h3>
                    {isPrimary && (
                      <span className="inline-flex items-center rounded-full bg-wil-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-wil-700">
                        Aanbevolen
                      </span>
                    )}
                  </div>
                  <p
                    className={`mt-0.5 font-medium ${
                      isPrimary ? 'text-sm' : 'text-xs'
                    } ${isSelected ? 'text-wil-600' : 'text-[var(--ink-3)]'}`}
                  >
                    {intent.tagline}
                  </p>
                  <p className={`mt-1 text-[var(--ink-4)] leading-snug ${
                    isPrimary ? 'text-sm' : 'text-xs'
                  }`}>
                    {intent.description}
                  </p>
                </div>

                {/* Selection indicator */}
                <div
                  className={`flex h-5 w-5 shrink-0 mt-0.5 items-center justify-center rounded-full border-2 transition-colors ${
                    isSelected
                      ? 'border-wil-500 bg-wil-500'
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

      {/* Module preview — shown when an intent is selected */}
      {selectedIntent && <ModulePreview intentId={selectedIntent} />}

      {/* Settings hint */}
      <p className="mt-4 text-xs text-[var(--ink-4)]">
        Je kunt modules later aanpassen in Instellingen.
      </p>

      {/* Sticky navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-10 flex gap-3 border-t border-[var(--border-ed)] bg-[var(--paper)]/95 px-4 pb-[env(safe-area-inset-bottom,12px)] pt-3 backdrop-blur-sm sm:static sm:mt-8 sm:border-t-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-0 sm:backdrop-blur-none">
        <button
          onClick={onBack}
          className="flex-1 min-h-[44px] rounded-xl border border-[var(--border-ed)] px-4 py-3 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)] active:bg-[var(--subtle)] transition-colors duration-150"
        >
          Terug
        </button>
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="flex-1 min-h-[44px] rounded-xl bg-wil-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-wil-700 active:bg-wil-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Verder
        </button>
      </div>
    </div>
  )
}
