'use client'

import { WillDots } from '@/components/app/will-dots'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'
import {
  type PersonaId,
  PERSONA_MODULE_PRESETS,
  MODULE_CATALOG,
  type ModuleId,
  validateModules,
} from '@/lib/module-registry'

// ── Types ────────────────────────────────────────────────────

export interface OnboardingPersonaProps {
  selectedPersona: PersonaId | 'custom' | null
  selectedModules: ModuleId[]
  onSelectPersona: (persona: PersonaId | 'custom') => void
  onToggleModule: (moduleId: ModuleId, enabled: boolean) => void
  onNext: () => void
  onBack: () => void
}

// ── Persona definitions ──────────────────────────────────────

interface PersonaDef {
  id: PersonaId | 'custom'
  name: string
  tagline: string
  description: string
  emoji: string
}

const PERSONAS: PersonaDef[] = [
  {
    id: 'budgetteerder',
    name: 'De Budgetteerder',
    tagline: 'Grip op je uitgaven',
    description: 'Inzicht in cashflow, budgetten en je spaarquote.',
    emoji: '🎯',
  },
  {
    id: 'vermogensverdeler',
    name: 'De Vermogensverdeler',
    tagline: 'Overzicht over alles',
    description: 'Al je bezittingen en schulden op één plek.',
    emoji: '📊',
  },
  {
    id: 'pensioenplanner',
    name: 'De Pensioenplanner',
    tagline: 'Zekerheid over later',
    description: 'FIRE-projecties en toekomstscenarios voor jouw pensioen.',
    emoji: '🔭',
  },
  {
    id: 'fire_fighter',
    name: 'De FIRE Fighter',
    tagline: 'De snelste route naar vrijheid',
    description: 'Alle modules actief — maximale inzichten voor financiële vrijheid.',
    emoji: '🔥',
  },
  {
    id: 'custom',
    name: 'Eigen selectie',
    tagline: 'Kies zelf je modules',
    description: 'Stel zelf samen welke onderdelen voor jou relevant zijn.',
    emoji: '✦',
  },
]

// ── Speech bubble helper ─────────────────────────────────────

function getSpeechText(persona: PersonaId | 'custom' | null): string {
  if (!persona) {
    return 'Welk profiel past het beste bij jou? Ik stel dan alvast de juiste modules in. Je kunt dit later altijd aanpassen.'
  }
  const map: Record<PersonaId | 'custom', string> = {
    budgetteerder: 'Slim! Ik activeer de budgetteringsmodule zodat je direct inzicht hebt in je uitgaven en cashflow.',
    vermogensverdeler: 'Goed plan! Met vermogensregistratie houd je al je bezittingen en schulden overzichtelijk bij.',
    pensioenplanner: 'Toekomstgericht! Ik activeer vermogen én toekomstplannen — zo zie je wanneer jouw vrijheid begint.',
    fire_fighter: 'Volledig aan de slag! Ik activeer alle modules zodat je het maximale uit TriFinity haalt.',
    custom: 'Jij kiest! Selecteer hieronder de modules die je wilt activeren. Let op de afhankelijkheden.',
  }
  return map[persona]
}

// ── Main Component ───────────────────────────────────────────

export function OnboardingPersona({
  selectedPersona,
  selectedModules,
  onSelectPersona,
  onToggleModule,
  onNext,
  onBack,
}: OnboardingPersonaProps) {
  // Compute current validation errors for the selected module set
  const { valid, errors: validationErrors } = validateModules(selectedModules)

  // Whether the user can proceed: a persona must be chosen and modules must be valid
  const canProceed = selectedPersona !== null && valid

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
        <StepProgress current="persona" />
      </div>

      <p className="label-editorial mb-2 text-[var(--ink-4)]">Profiel</p>

      {/* Will's speech bubble */}
      <div className="mb-6 sm:mb-8 flex items-start gap-3">
        <div className="shrink-0">
          <WillDots size={48} />
        </div>
        <SpeechBubble>
          {getSpeechText(selectedPersona)}
          <span className="mt-1 block text-xs text-[var(--ink-4)]">
            Je kunt modules later aanpassen via Instellingen.
          </span>
        </SpeechBubble>
      </div>

      {/* Section heading */}
      <h2 className="mb-4 font-display text-lg font-bold tracking-[-0.02em] text-[var(--ink)]">
        Welk profiel past bij jou?
      </h2>

      {/* Persona cards grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PERSONAS.map((persona) => {
          const isSelected = selectedPersona === persona.id
          return (
            <button
              key={persona.id}
              type="button"
              onClick={() => onSelectPersona(persona.id)}
              className={`group w-full min-h-[48px] rounded-xl border-2 p-4 text-left transition-all active:scale-[0.99] ${
                isSelected
                  ? 'border-wil-500 bg-wil-50/60 shadow-sm'
                  : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)] hover:shadow-md'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Emoji icon */}
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl transition-colors ${
                    isSelected
                      ? 'bg-wil-100'
                      : 'bg-[var(--subtle)] group-hover:bg-[var(--border-ed)]'
                  }`}
                  aria-hidden="true"
                >
                  {persona.emoji}
                </div>

                {/* Text content */}
                <div className="min-w-0 flex-1">
                  <h3 className={`text-sm font-semibold leading-tight ${isSelected ? 'text-wil-900' : 'text-[var(--ink)]'}`}>
                    {persona.name}
                  </h3>
                  <p className={`mt-0.5 text-xs font-medium ${isSelected ? 'text-wil-600' : 'text-[var(--ink-3)]'}`}>
                    {persona.tagline}
                  </p>
                  <p className="mt-1 text-xs text-[var(--ink-4)] leading-snug">
                    {persona.description}
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

      {/* Active modules section — shown once a persona is selected */}
      {selectedPersona !== null && (
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--ink)]">Actieve modules</h3>
            {selectedPersona === 'custom' && (
              <span className="text-xs text-[var(--ink-4)]">Kies minstens één basismodule</span>
            )}
          </div>

          {/* Module pills */}
          <div className="flex flex-wrap gap-2">
            {MODULE_CATALOG.map((mod) => {
              const isActive = selectedModules.includes(mod.id)
              const isCustom = selectedPersona === 'custom'

              // For non-custom personas, modules are display-only (not toggleable)
              if (!isCustom) {
                return (
                  <span
                    key={mod.id}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? 'border-wil-300 bg-wil-50 text-wil-700'
                        : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-4)]'
                    }`}
                  >
                    {isActive && (
                      <svg className="h-3 w-3 text-wil-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                      </svg>
                    )}
                    {mod.label}
                  </span>
                )
              }

              // Custom mode: modules are toggleable buttons
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => onToggleModule(mod.id, !isActive)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all active:scale-[0.97] ${
                    isActive
                      ? 'border-wil-400 bg-wil-50 text-wil-700 hover:bg-wil-100'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-[var(--border-md)] hover:text-[var(--ink)]'
                  }`}
                  title={mod.description}
                >
                  {isActive && (
                    <svg className="h-3 w-3 text-wil-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                    </svg>
                  )}
                  {mod.label}
                </button>
              )
            })}
          </div>

          {/* Dependency validation errors */}
          {validationErrors.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="mb-1 text-xs font-semibold text-amber-800">Let op:</p>
              <ul className="space-y-0.5">
                {validationErrors.map((err, i) => (
                  <li key={i} className="text-xs text-amber-700">
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Sticky navigation — same pattern as all other steps */}
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
