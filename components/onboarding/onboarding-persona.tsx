'use client'

import { WillDots } from '@/components/app/will-dots'
import { SpeechBubble } from './speech-bubble'
import { StepProgress } from './step-progress'
import {
  type PersonaId,
  MODULE_CATALOG,
  type ModuleId,
  getModuleDef,
  validateModules,
} from '@/lib/module-registry'

// ── Types ────────────────────────────────────────────────────

export interface OnboardingModulesProps {
  /** Currently highlighted persona (null = none selected, 'custom' accepted for backwards compat) */
  selectedPersona: PersonaId | 'custom' | null
  selectedModules: ModuleId[]
  onSelectPersona: (persona: PersonaId) => void
  onToggleModule: (moduleId: ModuleId, enabled: boolean) => void
  onNext: () => void
  onBack: () => void
}

// ── Persona definitions ──────────────────────────────────────

interface PersonaDef {
  id: PersonaId
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
    description: 'Al je bezittingen en schulden op één plek, met inzichten en acties.',
    emoji: '📊',
  },
  {
    id: 'pensioenplanner',
    name: 'De Pensioenplanner',
    tagline: 'Zekerheid over later',
    description: 'FIRE-projecties, toekomstscenarios en gepersonaliseerde inzichten.',
    emoji: '🔭',
  },
  {
    id: 'fire_fighter',
    name: 'De FIRE Fighter',
    tagline: 'De snelste route naar vrijheid',
    description: 'Alle modules actief — maximale inzichten voor financiële vrijheid.',
    emoji: '🔥',
  },
]

// ── Speech bubble helper ─────────────────────────────────────

function getSpeechText(persona: PersonaId | 'custom' | null): string {
  if (!persona || persona === 'custom') {
    return 'Welk profiel past het beste bij jou? Ik stel dan alvast de juiste modules in. Je kunt altijd aanpassen.'
  }
  const map: Record<PersonaId, string> = {
    budgetteerder: 'Slim! Ik activeer de budgetteringsmodule zodat je direct inzicht hebt in je uitgaven en cashflow.',
    vermogensverdeler: 'Goed plan! Met vermogensregistratie en inzicht & acties houd je overzicht en krijg je gerichte aanbevelingen.',
    pensioenplanner: 'Toekomstgericht! Ik activeer vermogen, toekomstplannen en inzichten — zo zie je wanneer jouw vrijheid begint.',
    fire_fighter: 'Volledig aan de slag! Ik activeer alle modules zodat je het maximale uit TriFinity haalt.',
  }
  return map[persona]
}

// ── Dynamic step count calculator ────────────────────────────
// Calculates how many onboarding content steps follow after module selection.

function computeRemainingSteps(modules: ModuleId[]): number {
  const has = (id: ModuleId) => modules.includes(id)

  // Special case: only nieuws selected
  if (modules.length === 1 && modules[0] === 'nieuws') return 1

  let count = 0
  // Bezittingen step: if vermogensregistratie OR budgetteren is active
  if (has('vermogensregistratie') || has('budgetteren')) count += 1
  // Budgets step: if budgetteren is active
  if (has('budgetteren')) count += 1
  // Horizon step: if toekomstplannen is active
  if (has('toekomstplannen')) count += 1
  // Preferences step: if inzicht_acties is active
  if (has('inzicht_acties')) count += 1

  return count
}

// ── Dependency label helper ──────────────────────────────────
// Returns a human-readable dependency description for a module, or null if standalone.

function getDependencyLabel(mod: { requires: ModuleId[]; requiresOneOf?: ModuleId[] }): string | null {
  const parts: string[] = []

  if (mod.requires.length > 0) {
    const labels = mod.requires.map((id) => getModuleDef(id).label)
    parts.push(`Vereist: ${labels.join(', ')}`)
  }

  if (mod.requiresOneOf && mod.requiresOneOf.length > 0) {
    const labels = mod.requiresOneOf.map((id) => getModuleDef(id).label)
    parts.push(`Vereist: ${labels.join(' of ')}`)
  }

  return parts.length > 0 ? parts.join('. ') : null
}

// ── Main Component ───────────────────────────────────────────

export function OnboardingModules({
  selectedPersona,
  selectedModules,
  onSelectPersona,
  onToggleModule,
  onNext,
  onBack,
}: OnboardingModulesProps) {
  // Compute current validation errors for the selected module set
  const { valid, errors: validationErrors } = validateModules(selectedModules)

  // User can proceed when at least one module is selected and all dependencies are valid
  const canProceed = selectedModules.length > 0 && valid

  // Remaining onboarding steps based on current module selection
  const remainingSteps = computeRemainingSteps(selectedModules)

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

      {/* Persona cards grid — 4 presets, no "custom" option */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PERSONAS.map((persona) => {
          const isSelected = selectedPersona === persona.id
          return (
            <button
              key={persona.id}
              type="button"
              onClick={() => onSelectPersona(persona.id)}
              className={`group w-full min-h-[48px] cursor-pointer rounded-xl border-2 p-4 text-left transition-all active:scale-[0.99] ${
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

      {/* Modules section — ALWAYS visible and togglable */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--ink)]">Actieve modules</h3>
          <span className="text-xs text-[var(--ink-4)]">Kies minstens één module</span>
        </div>

        {/* Module cards — vertical list with toggle checkboxes */}
        <div className="flex flex-col gap-2">
          {MODULE_CATALOG.map((mod) => {
            const isActive = selectedModules.includes(mod.id)
            const depLabel = getDependencyLabel(mod)

            return (
              <button
                key={mod.id}
                type="button"
                onClick={() => onToggleModule(mod.id, !isActive)}
                className={`group flex min-h-[44px] w-full items-start gap-3 rounded-xl border-2 p-3 text-left transition-all active:scale-[0.995] ${
                  isActive
                    ? 'border-wil-400 bg-wil-50/60'
                    : 'border-[var(--border-ed)] bg-[var(--paper)] hover:border-[var(--border-md)]'
                }`}
              >
                {/* Toggle checkbox */}
                <div
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors ${
                    isActive
                      ? 'bg-wil-500 text-white'
                      : 'border-2 border-[var(--border-md)] bg-[var(--paper)]'
                  }`}
                  aria-hidden="true"
                >
                  {isActive && (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </div>

                {/* Module info */}
                <div className="min-w-0 flex-1">
                  <span className={`text-sm font-bold ${isActive ? 'text-wil-900' : 'text-[var(--ink)]'}`}>
                    {mod.label}
                  </span>
                  <p className="mt-0.5 text-xs leading-snug text-[var(--ink-3)]">
                    {mod.description}
                  </p>
                  {depLabel && (
                    <p className="mt-1 text-[10px] font-medium text-[var(--ink-4)]">
                      {depLabel}
                    </p>
                  )}
                </div>
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

      {/* Dynamic step count indicator */}
      {selectedModules.length > 0 && remainingSteps > 0 && (
        <p className="mt-4 text-xs text-[var(--ink-4)]">
          Na deze stap volgen nog{' '}
          <span className="font-semibold">{remainingSteps} instapstap{remainingSteps !== 1 ? 'pen' : ''}</span>
          {' '}op basis van jouw keuze.
        </p>
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

// backwards compat — remove after orchestrator is updated
export const OnboardingPersona = OnboardingModules

// Re-export the props type under the old name for backwards compat
export type OnboardingPersonaProps = OnboardingModulesProps
