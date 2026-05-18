'use client'

import { useState, useEffect, useReducer, useCallback, useMemo, useRef } from 'react'
import './onboarding.css'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { WillDots } from '@/components/app/will-dots'
import type { IdentityData } from '@/components/onboarding/onboarding-identity'
import type { HorizonData } from '@/components/onboarding/onboarding-horizon'
import type { AssetQuickInput, DebtQuickInput } from '@/lib/quick-add/types'

import { OnboardingDoel } from '@/components/onboarding/onboarding-doel'
import { OnboardingIdentity } from '@/components/onboarding/onboarding-identity'
import { OnboardingInkomen } from '@/components/onboarding/onboarding-inkomen'
import { OnboardingBezittingen } from '@/components/onboarding/onboarding-bezittingen'
import { OnboardingSpaardoel } from '@/components/onboarding/onboarding-spaardoel'
import { OnboardingKlaar } from '@/components/onboarding/onboarding-klaar'
import type { PensionParseData } from '@/components/onboarding/onboarding-upo-section'
import { SPAARDOEL_PRESETS, type SpaardoelPresetKey } from '@/lib/onboarding-presets'
import { INITIAL_HORIZON_DATA } from '@/components/onboarding/onboarding-horizon'
import { OnboardingNieuwsOnly, type ExtractionResult } from '@/components/onboarding/onboarding-nieuws-only'
import { OnboardingSuccess } from '@/components/onboarding/onboarding-success'
import { WelcomePopup } from '@/components/onboarding/welcome-popup'
import { type PersonaId, type IntentId, type ModuleId, getHomePath } from '@/lib/module-registry'
import type { GoalSlug } from '@/lib/goals/types'
import {
  GOAL_MODULE_PRESETS,
  INTENT_TO_GOAL_FALLBACK,
  getGoalFirstWinPath,
  isGoalSlug,
} from '@/lib/goals/catalog'

// ── localStorage key for persisting onboarding data ──────────
const ONBOARDING_STORAGE_KEY = 'trifinity_onboarding_draft'

// ── localStorage key voor de "is de welkomstpopup al gezien?"-flag.
// Bewust een aparte key buiten het draft-payload: de flag moet ook
// overleven nadat de draft gewist is (bij voltooiing, of bij een
// nieuwe sessie die op een andere stap verder gaat dan stap 1). Een
// nieuwe gebruiker ziet 'm één keer; daarna nooit meer.
const WELCOME_SEEN_STORAGE_KEY = 'trifinity_onboarding_welcome_seen'

// ── Saving progress messages ─────────────────────────────────
const SAVING_MESSAGES = [
  'Profiel wordt opgeslagen...',
  'Budgetten worden aangemaakt...',
  'Bezittingen en schulden verwerken...',
  'Dashboard wordt geconfigureerd...',
  'Bijna klaar...',
]

// ── Types ────────────────────────────────────────────────────

/**
 * Active step union sinds de onboarding-redesign (mei 2026, fase 3):
 * 6 content-stappen (doel → identity → inkomen → bezittingen → spaardoel
 * → klaar) plus de twee terminal-stappen `saving`/`success`, en het
 * news-only-pad.
 *
 * Stap `spaardoel` is in mei 2026 toegevoegd tussen `bezittingen` en
 * `klaar`: laagdrempelig één spaardoel laten kiezen vlak voor de afronding
 * (zie `components/onboarding/onboarding-spaardoel.tsx`).
 *
 * Legacy step-namen (`intro`, `goal`, `budgets`, `horizon`) zijn uit de
 * actieve flow verwijderd — ze leven nog in `CANONICAL_STEP_ORDER` zodat
 * self-healing restore werkt op oude localStorage-drafts.
 */
type Step =
  | 'doel'
  | 'identity'
  | 'inkomen'
  | 'bezittingen'
  | 'spaardoel'
  | 'klaar'
  | 'nieuws_only'
  | 'saving'
  | 'success'

type Direction = 'forward' | 'back'

/**
 * Canonical order of every step that has ever existed in the flow, used as a
 * fallback anchor when a restored `lastStep` is no longer present in the
 * active step order. Bevat zowel de legacy step-namen (intro/goal/budgets/
 * horizon) als de nieuwe — drafts uit een oudere flow blijven herstelbaar.
 */
const CANONICAL_STEP_ORDER: readonly string[] = [
  // legacy → nieuw vervangers
  'intro',       // → doel
  'doel',
  'identity',
  'goal',        // → doel (legacy)
  'inkomen',
  'bezittingen',
  'spaardoel',   // toegevoegd mei 2026 — laagdrempelige spaardoel-keuze
  'budgets',     // → klaar (legacy)
  'horizon',     // → klaar (legacy)
  'klaar',
  'nieuws_only',
  'saving',
  'success',
] as const

/**
 * Map a legacy lastStep name to the closest current equivalent. Wordt door
 * `_resolveRestoredStep` toegepast vóór de membership-check zodat een draft
 * die opgeslagen is met een verwijderde step-naam alsnog landt op een
 * bestaande stap zonder dat we 'm naar identity terug hoeven te zetten.
 */
const LEGACY_STEP_MAP: Record<string, Step> = {
  // pre-mei 2026 step-namen
  modules: 'doel',
  persona: 'doel',
  intent: 'doel',
  extras: 'bezittingen',
  preferences: 'klaar',
  // fase 3 (mei 2026): intro/goal/budgets/horizon zijn niet meer actief
  intro: 'doel',
  goal: 'doel',
  budgets: 'klaar',
  horizon: 'klaar',
}

/**
 * Self-healing restore: given a previously saved `lastStep` and the currently
 * active step order, return a step the user can actually land on. When the
 * saved step is no longer present in the active order (e.g. the flow changed
 * while the user had a draft in localStorage), we anchor on the saved step's
 * position in the canonical union and walk forward to the first valid step
 * the user has not yet passed, skipping the terminal `saving` / `success`
 * placeholders. As a last resort we fall back to `'identity'` — never the
 * eerste stap, because the presence of saved data means the user is already
 * past the welcome screen.
 */
export function _resolveRestoredStep(lastStep: string | undefined, activeStepOrder: Step[]): {
  step: Step
  healed: boolean
} {
  const terminalSteps: Step[] = ['saving', 'success']
  const isSelectable = (s: Step): boolean => !terminalSteps.includes(s)

  // No saved step at all → start at identity (user already past doel if
  // we're restoring data with at least the user's name in it).
  if (!lastStep) {
    return { step: 'identity', healed: false }
  }

  // Map legacy step names to their current equivalents before checking
  // membership in the active order.
  let resolved = lastStep
  if (LEGACY_STEP_MAP[resolved]) resolved = LEGACY_STEP_MAP[resolved]

  // Happy path: saved step is still in the active order and not terminal.
  if (
    (activeStepOrder as string[]).includes(resolved) &&
    isSelectable(resolved as Step)
  ) {
    // Een mapping naar een andere step (bv. budgets → klaar) telt nog steeds
    // als healed — de user kreeg een andere step terug dan opgeslagen was.
    const healed = resolved !== lastStep
    return { step: resolved as Step, healed }
  }

  // Anchor on the saved step's position in the canonical union. If the name
  // is completely unknown the index is -1 and we fall through to identity.
  const canonicalIdx = CANONICAL_STEP_ORDER.indexOf(resolved)

  if (canonicalIdx >= 0) {
    // Walk forward through the active order and take the first selectable
    // step whose canonical position is >= the saved step's canonical
    // position. This lands us on the first step the user has not yet passed.
    for (const candidate of activeStepOrder) {
      if (!isSelectable(candidate)) continue
      const candidateIdx = CANONICAL_STEP_ORDER.indexOf(candidate)
      if (candidateIdx >= canonicalIdx) {
        return { step: candidate, healed: true }
      }
    }
  }

  // Last resort: identity if it's in the active order, otherwise the first
  // selectable step. We intentionally skip 'doel' (the first content-stap)
  // because the user already had persisted data — sending them back to the
  // goal-keuze would feel like a full reset.
  const identityFallback = activeStepOrder.find((s) => s === 'identity')
  if (identityFallback) {
    return { step: 'identity', healed: true }
  }
  const firstSelectable = activeStepOrder.find(isSelectable)
  return { step: firstSelectable ?? 'identity', healed: true }
}

/**
 * Pick a safe navigation landing spot when the user's current step is not in
 * the active step order. Skips terminal `saving` / `success` placeholders.
 * Used by `goToNext` / `goToBack` as a self-healing fallback so the
 * navigation buttons never silently no-op.
 */
export function _firstNavigationRecoveryStep(activeStepOrder: Step[]): Step {
  const recovery = activeStepOrder.find(
    (s) => s !== 'saving' && s !== 'success'
  )
  return recovery ?? activeStepOrder[0] ?? 'identity'
}

/**
 * Compute the dynamic step order. Sinds de redesign (mei 2026):
 *
 * - Happy-path: alle 5 content-stappen zijn altijd actief, ongeacht
 *   module-keuze. Module-gating gebeurt buiten onboarding (eerste-win-pad +
 *   module-tabs op de detailpagina's).
 * - News-only: `doel → nieuws_only` (de doel-stap toont een opt-out-link
 *   die `SET_NEWS_ONLY` dispatcht en direct naar `nieuws_only` springt).
 *
 * We blijven `activeModules` als signaal gebruiken om news-only te
 * detecteren — niet omdat onboarding modules gate't, maar omdat de
 * downstream save-flow weet hoe news-only verschilt van een gewone flow.
 */
function computeStepOrder(selectedModules: ModuleId[]): Step[] {
  const isNewsOnly = selectedModules.length === 1 && selectedModules[0] === 'nieuws'

  if (isNewsOnly) {
    return ['doel', 'nieuws_only', 'saving', 'success']
  }

  return ['doel', 'identity', 'inkomen', 'bezittingen', 'spaardoel', 'klaar', 'saving', 'success']
}

/**
 * Spaardoel-keuze van stap v. — orchestrator-state. De child-component
 * (`OnboardingSpaardoel`) bezit z'n eigen logica voor pre-fill en
 * validatie; orchestrator slaat alleen de complete shape op.
 */
interface SpaardoelState {
  presetKey: SpaardoelPresetKey | null
  name: string
  target_value: string
  /** 'YYYY-MM' of '' wanneer leeg. */
  target_date: string
  /** True wanneer de gebruiker bewust heeft geskipt — gating voor insert. */
  skipped: boolean
}

/**
 * Keys for fields deferred via "Later invullen" during onboarding.
 * Tracked so we can surface targeted post-onboarding suggestions
 * via the coach-bubble (feature #830).
 */
type DeferredFieldKey = 'income' | 'assets' | 'spaardoel'

interface State {
  step: Step
  direction: Direction
  identity: IdentityData
  /**
   * Sinds mei 2026 (fase 3): multi-select. De gebruiker mag 1+ goals kiezen
   * op stap 1 — `activeModules` is de unie van alle gekozen `GOAL_MODULE_PRESETS`.
   * De primaire goal (eerste in array) bepaalt `getGoalFirstWinPath`.
   */
  selectedGoals: GoalSlug[]
  activeModules: ModuleId[]
  horizon: HorizonData
  newsDescription: string
  extraction: ExtractionResult | null
  budgetAmounts: Record<string, number>
  quickAssets: AssetQuickInput[]
  quickDebts: DebtQuickInput[]
  /** Stap v. — spaardoel-keuze. Skipped + presetKey=null = niet weggeschreven. */
  spaardoel: SpaardoelState
  /** Parsed UPO pension data — null when nothing uploaded. Optional enrichment. */
  pensionData: PensionParseData | null
  /**
   * Velden die de gebruiker expliciet heeft overgeslagen via "Later invullen"
   * (feature #830). Na onboarding worden ze als suggesties aangeboden via de
   * coach-bubble of het next-step-mechanisme.
   */
  deferredFields: DeferredFieldKey[]
}

/** Data portion of state that gets persisted to localStorage (excludes step/direction) */
interface PersistedData {
  identity: IdentityData
  /** Selected goal-slugs — primaire keuze sinds mei 2026 (fase 3) */
  selectedGoals: GoalSlug[]
  /** @deprecated Use selectedGoals — kept for migration from older drafts */
  goal?: GoalSlug | null
  /** @deprecated Use selectedGoals — kept for migration from old localStorage drafts */
  intent?: IntentId | null
  /** @deprecated Use selectedGoals — kept for migration from old localStorage drafts */
  persona?: PersonaId | null
  activeModules: ModuleId[]
  /** @deprecated Use activeModules — kept for migration from old localStorage drafts */
  selectedModules?: ModuleId[]
  horizon?: HorizonData
  newsDescription?: string
  extraction?: ExtractionResult | null
  budgetAmounts: Record<string, number>
  quickAssets: AssetQuickInput[]
  quickDebts: DebtQuickInput[]
  /** Spaardoel-keuze van stap v. — optioneel zodat oude drafts blijven werken. */
  spaardoel?: SpaardoelState
  /** Parsed UPO pension data — optioneel, oude drafts kennen dit veld niet. */
  pensionData?: PensionParseData | null
  /** Last step the user was on (to restore position) */
  lastStep?: Step
  /** Fields deferred via "Later invullen" — optioneel, oude drafts kennen dit veld niet. */
  deferredFields?: DeferredFieldKey[]
}

type Action =
  | { type: 'SET_STEP'; step: Step }
  | { type: 'SET_IDENTITY'; data: IdentityData }
  /**
   * Vervangt de oude single-goal action. `goals` is een array — caller mag
   * 0+ goals doorgeven; lege array zet `activeModules` op `[]` zodat de
   * volgende-knop disabled wordt door de `OnboardingDoel`-component.
   */
  | { type: 'SET_GOAL'; goals: GoalSlug[] }
  /** Opt-out vanaf de doel-stap: zet activeModules op ['nieuws'] en clear goals. */
  | { type: 'SET_NEWS_ONLY' }
  | { type: 'SET_HORIZON'; data: HorizonData }
  | { type: 'SET_NEWS_DESCRIPTION'; value: string }
  | { type: 'SET_EXTRACTION'; data: ExtractionResult | null }
  | { type: 'SET_BUDGET_AMOUNTS'; amounts: Record<string, number> }
  | { type: 'SET_QUICK_ASSETS'; items: AssetQuickInput[] }
  | { type: 'SET_QUICK_DEBTS'; items: DebtQuickInput[] }
  /**
   * Vervang de complete spaardoel-substate per dispatch — eenvoudiger dan
   * partial-update-acties want de child levert telkens de volledige shape.
   */
  | { type: 'SET_SPAARDOEL'; data: SpaardoelState }
  /** UPO pension parse result — set on successful parse, null on remove. */
  | { type: 'SET_PENSION_DATA'; data: PensionParseData | null }
  /**
   * Track een overgeslagen veld via "Later invullen" (feature #830).
   * Idempotent: voegt de key alleen toe als hij er nog niet in zit.
   */
  | { type: 'DEFER_FIELD'; key: DeferredFieldKey }
  | { type: 'RESTORE_STATE'; data: PersistedData }

export const _initialState: State = {
  step: 'doel',
  direction: 'forward',
  selectedGoals: [],
  activeModules: [],
  identity: {
    full_name: '',
    date_of_birth: '',
    household_type: 'solo',
    number_of_children: 0,
    net_monthly_income: '',
    estimated_monthly_expenses: '',
  },
  horizon: INITIAL_HORIZON_DATA,
  newsDescription: '',
  extraction: null,
  budgetAmounts: {},
  quickAssets: [],
  quickDebts: [],
  spaardoel: {
    presetKey: null,
    name: '',
    target_value: '',
    target_date: '',
    skipped: false,
  },
  pensionData: null,
  deferredFields: [],
}

/**
 * Map een legacy persisted intent (of persona) onto a new GoalSlug. Wordt
 * door `loadFromLocalStorage` / `RESTORE_STATE` gebruikt om oude drafts te
 * heelen — single-goal-output, caller wraps in array.
 */
function migrateIntentToGoal(
  intent: IntentId | null | undefined,
  persona: PersonaId | null | undefined,
): GoalSlug | null {
  if (intent && intent in INTENT_TO_GOAL_FALLBACK) {
    return INTENT_TO_GOAL_FALLBACK[intent]
  }
  if (persona) {
    const personaToGoal: Record<PersonaId, GoalSlug | null> = {
      budgetteerder: 'grip-uitgaven',
      vermogensverdeler: 'vermogen-overzicht',
      pensioenplanner: 'eerder-stoppen',
      fire_fighter: 'eerder-stoppen',
    }
    return personaToGoal[persona] ?? null
  }
  return null
}

/**
 * Bereken `activeModules` als unie van alle goals' `GOAL_MODULE_PRESETS`.
 * Volgorde-stabiel: behoudt de eerste-occurrence-volgorde over de
 * geselecteerde goals, zodat `getHomePath` (die de eerste module pakt)
 * een voorspelbaar resultaat geeft bij multi-select.
 */
function resolveModulesForGoals(goals: GoalSlug[]): ModuleId[] {
  const seen = new Set<ModuleId>()
  const merged: ModuleId[] = []
  for (const goal of goals) {
    for (const m of GOAL_MODULE_PRESETS[goal]) {
      if (!seen.has(m)) {
        seen.add(m)
        merged.push(m)
      }
    }
  }
  return merged
}

export function _reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_STEP': {
      const stepOrder = computeStepOrder(state.activeModules)
      const oldIdx = stepOrder.indexOf(state.step)
      const newIdx = stepOrder.indexOf(action.step)
      const direction: Direction = newIdx >= oldIdx ? 'forward' : 'back'
      return { ...state, step: action.step, direction }
    }
    case 'SET_GOAL': {
      // Multi-select: bouw activeModules als unie van alle gekozen goals.
      const modules = resolveModulesForGoals(action.goals)
      return { ...state, selectedGoals: action.goals, activeModules: modules }
    }
    case 'SET_NEWS_ONLY': {
      return { ...state, selectedGoals: [], activeModules: ['nieuws'] }
    }
    case 'SET_IDENTITY':
      return { ...state, identity: action.data }
    case 'SET_HORIZON':
      return { ...state, horizon: action.data }
    case 'SET_NEWS_DESCRIPTION':
      return { ...state, newsDescription: action.value }
    case 'SET_EXTRACTION':
      return { ...state, extraction: action.data }
    case 'SET_BUDGET_AMOUNTS':
      return { ...state, budgetAmounts: action.amounts }
    case 'SET_QUICK_ASSETS':
      return { ...state, quickAssets: action.items }
    case 'SET_QUICK_DEBTS':
      return { ...state, quickDebts: action.items }
    case 'SET_SPAARDOEL':
      return { ...state, spaardoel: action.data }
    case 'SET_PENSION_DATA':
      return { ...state, pensionData: action.data }
    case 'DEFER_FIELD': {
      // Idempotent: voeg alleen toe als de key er nog niet in zit.
      if (state.deferredFields.includes(action.key)) return state
      return { ...state, deferredFields: [...state.deferredFields, action.key] }
    }
    case 'RESTORE_STATE': {
      const restoredModules = action.data.activeModules ?? action.data.selectedModules ?? []
      // Recompute the active step order for the restored module selection so
      // we can validate `lastStep` against the flow the user will actually
      // see. The user's saved module choice — not the in-memory state —
      // defines which steps are reachable.
      const restoredStepOrder = computeStepOrder(restoredModules)
      const { step: restoredStep, healed } = _resolveRestoredStep(
        action.data.lastStep,
        restoredStepOrder
      )
      if (healed) {
        // Surface self-healing restores in logs so we can monitor how often
        // legacy drafts are encountered after flow changes.
        console.warn(
          `[onboarding] lastStep ${action.data.lastStep ?? '(none)'} not in active order, falling back to ${restoredStep}`
        )
      }
      // Migrate single-goal drafts naar de nieuwe multi-select array.
      // Volgorde: nieuwe array > legacy single-goal > legacy intent/persona.
      let restoredGoals: GoalSlug[] = []
      if (Array.isArray(action.data.selectedGoals) && action.data.selectedGoals.length > 0) {
        restoredGoals = action.data.selectedGoals.filter(isGoalSlug)
      } else if (action.data.goal) {
        restoredGoals = [action.data.goal]
      } else {
        const migrated = migrateIntentToGoal(action.data.intent, action.data.persona)
        if (migrated) restoredGoals = [migrated]
      }
      return {
        ...state,
        step: restoredStep,
        direction: 'forward',
        identity: action.data.identity,
        selectedGoals: restoredGoals,
        activeModules: restoredModules,
        horizon: action.data.horizon ?? INITIAL_HORIZON_DATA,
        newsDescription: action.data.newsDescription ?? '',
        extraction: action.data.extraction ?? null,
        budgetAmounts: action.data.budgetAmounts,
        quickAssets: action.data.quickAssets,
        quickDebts: action.data.quickDebts,
        // Ontbrekend `spaardoel` in een legacy draft → val terug op de
        // _initialState-shape. Geen migratie nodig — het is een nieuw veld
        // dat oude drafts gewoon niet kennen.
        spaardoel: action.data.spaardoel ?? _initialState.spaardoel,
        // UPO pension data — optioneel, oude drafts kennen dit veld niet.
        pensionData: action.data.pensionData ?? null,
        // Deferred fields — optioneel, oude drafts kennen dit veld niet.
        deferredFields: Array.isArray(action.data.deferredFields)
          ? action.data.deferredFields
          : [],
      }
    }
    default:
      return state
  }
}

// ── Step transition wrapper ──────────────────────────────

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

// ── localStorage helpers ─────────────────────────────────────

function saveToLocalStorage(state: State) {
  try {
    const data: PersistedData = {
      identity: state.identity,
      selectedGoals: state.selectedGoals,
      activeModules: state.activeModules,
      horizon: state.horizon,
      newsDescription: state.newsDescription,
      extraction: state.extraction,
      budgetAmounts: state.budgetAmounts,
      quickAssets: state.quickAssets,
      quickDebts: state.quickDebts,
      spaardoel: state.spaardoel,
      pensionData: state.pensionData,
      deferredFields: state.deferredFields,
      lastStep: state.step,
    }
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(data))
  } catch {
    // localStorage may be full or unavailable — silently ignore
  }
}

function loadFromLocalStorage(): PersistedData | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (!raw) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- migration requires flexible typing
    const parsed = JSON.parse(raw) as Record<string, any>
    // Basic validation: identity must exist
    if (!parsed.identity || typeof parsed.identity !== 'object') return null

    // Migration: old format had FIRE params and budgettering_mode on identity
    let identity: IdentityData
    let horizon: HorizonData | undefined = parsed.horizon

    if ('budgettering_mode' in parsed.identity) {
      const old = parsed.identity as Record<string, unknown>
      if (!horizon) {
        horizon = {
          fire_end_strategy: (old.fire_end_strategy as string) ?? 'deplete',
          fire_end_age: (old.fire_end_age as number) ?? 90,
          fire_legacy_amount: String(old.fire_legacy_amount ?? ''),
          retirement_expense_method: (old.retirement_expense_method as string) ?? 'current_income',
          retirement_custom_amount: String(old.retirement_custom_amount ?? ''),
          temporal_balance: (old.temporal_balance as number) ?? 3,
          life_events: [],
        } as HorizonData
      }
      identity = {
        full_name: (old.full_name as string) ?? '',
        date_of_birth: (old.date_of_birth as string) ?? '',
        household_type: (old.household_type as string) ?? 'solo',
        number_of_children: (old.number_of_children as number) ?? 0,
        net_monthly_income: (old.net_monthly_income as string) ?? '',
        estimated_monthly_expenses: (old.estimated_monthly_expenses as string) ?? '',
      } as IdentityData
    } else {
      identity = parsed.identity as IdentityData
    }

    // Migratie selectedGoals: nieuwe shape > legacy single `goal` > leeg array.
    // De daadwerkelijke intent/persona-fallback gebeurt in `RESTORE_STATE`
    // omdat dat dichter bij waar de array daadwerkelijk wordt gezet leeft.
    let selectedGoals: GoalSlug[] = []
    if (Array.isArray(parsed.selectedGoals)) {
      selectedGoals = parsed.selectedGoals.filter(isGoalSlug)
    } else if (parsed.goal && isGoalSlug(parsed.goal)) {
      selectedGoals = [parsed.goal]
    }

    // Migratie: een draft van vóór de QuickAddWizard-flow heeft `bankAccounts`,
    // `assets`, `debts` met de oude shape. Die items zijn niet 1:1 te mappen
    // op de nieuwe 3-velden-input zonder data te verzinnen — dus we droppen
    // ze. De gebruiker voegt opnieuw toe via de wizard. Acceptabel voor
    // onboarding (transient draft, geen permanente data).
    //
    // Spaardoel: oude drafts kennen het veld niet — defensieve parse die
    // alleen overneemt wat we exact verwachten (presetKey-validatie tegen
    // de bekende set). Faalt validatie, dan landt RESTORE_STATE op de
    // _initialState-shape.
    const validPresetKeys: ReadonlyArray<SpaardoelPresetKey> = [
      'noodfonds', 'vakantie', 'auto', 'aanbetaling', 'groei', 'custom',
    ]
    let spaardoel: SpaardoelState | undefined = undefined
    if (parsed.spaardoel && typeof parsed.spaardoel === 'object') {
      const raw = parsed.spaardoel as Record<string, unknown>
      const presetKey = typeof raw.presetKey === 'string' && (validPresetKeys as readonly string[]).includes(raw.presetKey)
        ? (raw.presetKey as SpaardoelPresetKey)
        : null
      spaardoel = {
        presetKey,
        name: typeof raw.name === 'string' ? raw.name : '',
        target_value: typeof raw.target_value === 'string' ? raw.target_value : '',
        target_date: typeof raw.target_date === 'string' ? raw.target_date : '',
        skipped: raw.skipped === true,
      }
    }

    const data: PersistedData = {
      identity,
      selectedGoals,
      goal: isGoalSlug(parsed.goal) ? parsed.goal : null,
      intent: parsed.intent ?? null,
      persona: parsed.persona ?? null,
      activeModules: Array.isArray(parsed.activeModules) ? parsed.activeModules : (Array.isArray(parsed.selectedModules) ? parsed.selectedModules : []),
      selectedModules: Array.isArray(parsed.selectedModules) ? parsed.selectedModules : [],
      horizon,
      newsDescription: parsed.newsDescription,
      extraction: parsed.extraction ?? null,
      budgetAmounts: parsed.budgetAmounts && typeof parsed.budgetAmounts === 'object' ? parsed.budgetAmounts : {},
      quickAssets: Array.isArray(parsed.quickAssets) ? parsed.quickAssets : [],
      quickDebts: Array.isArray(parsed.quickDebts) ? parsed.quickDebts : [],
      spaardoel,
      pensionData: parsed.pensionData ?? null,
      deferredFields: Array.isArray(parsed.deferredFields) ? parsed.deferredFields : [],
      lastStep: parsed.lastStep,
    }

    // Legacy step-namen worden door `_resolveRestoredStep` zelf gemapt;
    // hier laten we ze ongemoeid zodat de healed-flag in RESTORE_STATE
    // accuraat aangeeft of er een mapping heeft plaatsgevonden.

    return data
  } catch {
    return null
  }
}

function clearLocalStorage() {
  try {
    localStorage.removeItem(ONBOARDING_STORAGE_KEY)
  } catch {
    // silently ignore
  }
}

/**
 * Parse de spaardoel-target_value string (NL-locale display met thousand-
 * separators) naar een Number. Wordt in twee plekken gebruikt:
 *   1. Bij het samenstellen van de recap-prop voor `OnboardingKlaar`.
 *   2. Bij het samenstellen van de API-payload in `handleSaveOwnData`.
 * Eén helper voorkomt duplicate-parsing met afwijkende regex tussen UI en
 * server-call.
 */
function parseSpaardoelAmount(s: string): number {
  if (!s) return 0
  const cleaned = s.replace(/\./g, '').replace(',', '.')
  const n = Number(cleaned)
  return isFinite(n) && n > 0 ? n : 0
}

// ── Module-tint wrapper-style ───────────────────────────────
// Onboarding leeft buiten een specifieke module (de gebruiker is modules
// aan het kiezen), maar de stappen-componenten consumeren --module-active-*
// tokens voor kicker-strepen, italic-em en voortgangsbalk. Default is `kern`
// — warm, mensgericht. We zetten alle shades expliciet zodat de componenten
// geen fallback hoeven te kennen.
const KERN_MODULE_TINT_STYLE = {
  '--module-active-50': 'var(--color-kern-50)',
  '--module-active-100': 'var(--color-kern-100)',
  '--module-active-200': 'var(--color-kern-200)',
  '--module-active-300': 'var(--color-kern-300)',
  '--module-active-400': 'var(--color-kern-400)',
  '--module-active-500': 'var(--color-kern-500)',
  '--module-active-600': 'var(--color-kern-600)',
  '--module-active-700': 'var(--color-kern-700)',
  '--module-active-800': 'var(--color-kern-800)',
  '--module-active-900': 'var(--color-kern-900)',
  '--module-active-950': 'var(--color-kern-950)',
} as React.CSSProperties

// ── Main Component ───────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [state, dispatch] = useReducer(_reducer, _initialState)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const idempotencyKeyRef = useRef<string | null>(null)
  const [saveProgress, setSaveProgress] = useState(0)
  const [saveMessageIdx, setSaveMessageIdx] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [restoredNotice, setRestoredNotice] = useState(false)

  // PSD2 bank connect return state — detected via query params from callback redirect.
  // Uses useState instead of useSearchParams to avoid Suspense boundary requirement.
  const [bankConnected, setBankConnected] = useState(false)
  const [bankError, setBankError] = useState(false)
  // Welkomstpopup: alleen tonen bij eerste binnenkomst, niet bij restored-draft
  // (de gebruiker is dan al terug-bezig en de begroeting voelt op dat moment
  // als ruis). De show-beslissing wordt in de check-effect onderaan genomen
  // — initial false zodat SSR en eerste paint geen popup tonen.
  const [showWelcomePopup, setShowWelcomePopup] = useState(false)

  const activeStepOrder = useMemo(() => computeStepOrder(state.activeModules), [state.activeModules])

  // Content-stappen voor de voortgangsbalk (excl. saving/success).
  // We typen het als `Step[]` zodat `indexOf` `state.step` (incl. terminal
  // stappen) accepteert — de terminal-stappen zitten niet in de array en
  // krijgen daardoor automatisch idx === -1 → fallback naar 1.
  const contentSteps = useMemo<Step[]>(
    () => activeStepOrder.filter((s) => s !== 'saving' && s !== 'success'),
    [activeStepOrder],
  )
  const totalContentSteps = contentSteps.length
  const currentContentStep = useMemo(() => {
    const idx = contentSteps.indexOf(state.step)
    return idx === -1 ? 1 : idx + 1
  }, [contentSteps, state.step])

  const goToBack = useCallback(() => {
    const idx = activeStepOrder.indexOf(state.step)
    if (idx === -1) {
      // Same self-heal path as goToNext — keep the user moving instead of
      // silently dead-ending on an orphaned step.
      const fallback = _firstNavigationRecoveryStep(activeStepOrder)
      console.warn(
        `[onboarding] goToBack: step ${state.step} not in active order, falling back to ${fallback}`
      )
      dispatch({ type: 'SET_STEP', step: fallback })
      return
    }
    if (idx > 0) {
      dispatch({ type: 'SET_STEP', step: activeStepOrder[idx - 1] })
    }
  }, [activeStepOrder, state.step])

  // Check if already onboarded + restore from localStorage
  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single()

      if (profile?.onboarding_completed) {
        clearLocalStorage()
        router.replace('/core')
        return
      }

      // Try to restore previously entered data from localStorage
      const saved = loadFromLocalStorage()
      const hasRestoredDraft = Boolean(
        saved && (saved.identity.full_name || saved.identity.date_of_birth),
      )
      if (hasRestoredDraft && saved) {
        dispatch({ type: 'RESTORE_STATE', data: saved })
        setRestoredNotice(true)
        // Auto-dismiss after 4 seconds
        setTimeout(() => setRestoredNotice(false), 4000)
      }

      // PSD2 bank connect return: force step to bezittingen so the user sees
      // the success/error message inline. The bank_connected/bank_error params
      // come from the callback redirect after OAuth completion.
      const urlParams = new URLSearchParams(window.location.search)
      const isBankConnected = urlParams.get('bank_connected') === '1'
      const isBankError = urlParams.get('bank_error') === '1'
      if (isBankConnected || isBankError) {
        setBankConnected(isBankConnected)
        setBankError(isBankError)
        dispatch({ type: 'SET_STEP', step: 'bezittingen' })
      }

      // Welkomstpopup-beslissing: alleen tonen voor een nieuwe gebruiker die
      // (a) de popup nog niet eerder gezien heeft EN (b) geen draft heeft die
      // gerestored is. Een restored-draft betekent dat de gebruiker al midden
      // in onboarding zit — een begroetende popup zou daar verwarrend zijn.
      let welcomeSeen = false
      try {
        welcomeSeen = localStorage.getItem(WELCOME_SEEN_STORAGE_KEY) === 'true'
      } catch {
        // localStorage onbereikbaar (privacy-modus) — toon de popup dan maar
        // gewoon; bij volgende sessie verschijnt 'm opnieuw, geen kwaad.
      }
      if (!welcomeSeen && !hasRestoredDraft) {
        setShowWelcomePopup(true)
      }

      setLoading(false)
    }
    check()
  }, [supabase, router])

  // Welkomstpopup wegklikken: zet de flag in localStorage zodat hij niet
  // terugkomt bij een refresh tijdens dezelfde onboarding-sessie. Het is
  // geen kritiek pad — bij localStorage-fail loggen we niets en valt de
  // popup gewoon nog een keer in beeld bij volgende sessie.
  const dismissWelcomePopup = useCallback(() => {
    try {
      localStorage.setItem(WELCOME_SEEN_STORAGE_KEY, 'true')
    } catch {
      // ignore — popup verschijnt eventueel opnieuw, acceptabel
    }
    setShowWelcomePopup(false)
  }, [])

  // Persist state to localStorage on every step change (except saving/success).
  // We slaan ook op stap 1 (`doel`) op, anders zou een gebruiker die alleen
  // doelen kiest en daarna afhaakt z'n keuze verliezen.
  useEffect(() => {
    if (['saving', 'success'].includes(state.step)) return
    saveToLocalStorage(state)
  }, [state])

  // ── Handlers ─────────────────────────────────────────────────

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }, [supabase])

  // Animate progress bar and rotating messages during save
  useEffect(() => {
    if (state.step !== 'saving') return
    // Progress bar animation: ramp from 0 to 90% over ~3s
    const progressTimer = setInterval(() => {
      setSaveProgress((prev) => {
        if (prev >= 90) { clearInterval(progressTimer); return 90 }
        return prev + 3
      })
    }, 100)
    // Rotate messages every 800ms
    const messageTimer = setInterval(() => {
      setSaveMessageIdx((prev) => (prev + 1) % SAVING_MESSAGES.length)
    }, 800)
    return () => { clearInterval(progressTimer); clearInterval(messageTimer) }
  }, [state.step])

  const handleSaveOwnData = useCallback(async () => {
    // Prevent double-submit: if already saving, ignore subsequent calls
    if (saving) return
    setSaving(true)
    setSaveProgress(0)
    setSaveMessageIdx(0)
    setSaveError(null)
    dispatch({ type: 'SET_STEP', step: 'saving' })

    try {
      const { identity, budgetAmounts, quickAssets, quickDebts } = state

      // Stable idempotency key: reuse across retries so the server can
      // detect duplicate submissions.  Only generate once per session.
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = crypto.randomUUID()
      }
      const idempotencyKey = idempotencyKeyRef.current

      const body: Record<string, unknown> = {
        identity: {
          full_name: identity.full_name,
          date_of_birth: identity.date_of_birth,
          household_type: identity.household_type,
          number_of_children: identity.number_of_children,
          net_monthly_income: identity.net_monthly_income ? Number(identity.net_monthly_income) : 0,
          estimated_monthly_expenses: identity.estimated_monthly_expenses ? Number(identity.estimated_monthly_expenses) : undefined,
        },
        budgetAmounts,
        idempotencyKey,
        activeModules: state.activeModules.length > 0 ? state.activeModules : undefined,
      }

      // Add horizon data if toekomstplannen is active
      if (state.activeModules.includes('toekomstplannen')) {
        body.horizonData = {
          fire_end_strategy: state.horizon.fire_end_strategy,
          fire_end_age: state.horizon.fire_end_age,
          fire_legacy_amount: state.horizon.fire_legacy_amount ? Number(state.horizon.fire_legacy_amount) : undefined,
          retirement_expense_method: state.horizon.retirement_expense_method,
          retirement_custom_amount: state.horizon.retirement_custom_amount ? Number(state.horizon.retirement_custom_amount) : undefined,
          temporal_balance: state.horizon.temporal_balance,
          life_events: state.horizon.life_events,
        }
      }

      // Add chosen goals — primary signal voor de doel-stappen-flow.
      // Server accepteert array (`selectedGoalSlugs`) sinds fase 3. We sturen
      // ook `selectedGoalSlug` (eerste van de array) voor backward-compat
      // met oudere server-deploys die nog niet het array-veld kennen.
      if (state.selectedGoals.length > 0) {
        body.selectedGoalSlugs = state.selectedGoals
        body.selectedGoalSlug = state.selectedGoals[0]
      }

      // Add spaardoel-keuze van stap v. — alleen wanneer de gebruiker
      // bewust een preset heeft gekozen, een naam heeft ingevuld, en een
      // positief bedrag heeft. Skip-flow zet `skipped: true` en wist de
      // velden, dus dit blok wordt dan automatisch overgeslagen.
      if (
        !state.spaardoel.skipped
        && state.spaardoel.presetKey
        && state.spaardoel.name.trim()
      ) {
        const amount = parseSpaardoelAmount(state.spaardoel.target_value)
        if (amount > 0) {
          const preset = SPAARDOEL_PRESETS[state.spaardoel.presetKey]
          body.onboardingGoal = {
            name: state.spaardoel.name.trim(),
            target_value: amount,
            // `<input type="month">` levert 'YYYY-MM' — voeg '-01' toe voor
            // een geldige ISO-date die Supabase `date`-kolom accepteert.
            target_date: state.spaardoel.target_date
              ? `${state.spaardoel.target_date}-01`
              : null,
            goal_type: preset.goalType,
            icon: preset.icon,
            color: preset.color,
          }
        }
      }

      // Add deferred fields for post-onboarding suggestions (feature #830)
      if (state.deferredFields.length > 0) {
        body.deferredFields = state.deferredFields
      }

      // Add news description if present
      if (state.newsDescription) {
        body.newsDescription = state.newsDescription
      }

      // Add user-reviewed extraction data if present (avoids re-running extraction server-side)
      if (state.extraction) {
        body.extractionData = state.extraction
      }

      // Add parsed UPO pension data if present — server uses this to
      // create pension life events and override AOW monthly amount.
      if (state.pensionData) {
        body.pensionData = state.pensionData
      }

      // Derive budgettering mode from modules
      const budgetteringMode = state.activeModules.includes('budgetteren') ? 'manual' : 'none'
      body.budgetteringMode = budgetteringMode

      // QuickAddInput-shape: 3 velden per item. De server roept
      // buildAssetDraft / buildDebtDraft aan om volledige rijen te bouwen —
      // dezelfde logica als de Server Action op /core.
      if (quickAssets.length > 0) {
        body.quickAssets = quickAssets
      }
      if (quickDebts.length > 0) {
        body.quickDebts = quickDebts
      }

      // Timeout after 30 seconds (allows time for batched DB operations including retry cleanup)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      const res = await fetch('/api/onboarding/save-own-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!res.ok) {
        const data = await res.json()
        console.error(`[onboarding-save] server rejected payload (status ${res.status}): ${JSON.stringify(data)}`)
        // Build a human-readable summary of Zod field errors when present
        let detail = ''
        if (data?.details?.fieldErrors && typeof data.details.fieldErrors === 'object') {
          const fields = Object.entries(data.details.fieldErrors as Record<string, string[]>)
            .filter(([, msgs]) => Array.isArray(msgs) && msgs.length > 0)
            .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
          if (fields.length > 0) detail = ` — ${fields.join('; ')}`
        }
        throw new Error(`${data.error || 'Opslaan mislukt'}${detail}`)
      }

      // Pre-generate AI recommendations for goals waar /will het primaire
      // landingspad is — anders is de pagina leeg bij eerste bezoek.
      const aiPregenGoals: GoalSlug[] = ['bewust-leven', 'noodfonds']
      if (state.selectedGoals.some((g) => aiPregenGoals.includes(g))) {
        // Fire-and-forget: AI-recommendations renderen progressief op de Wil-pagina
        // via polling. Blokkeer onboarding-success niet op deze LLM-call (typisch 5-15s).
        fetch('/api/ai/recommendations/initial', { method: 'POST' })
          .then((res) => {
            if (!res.ok) {
              console.error('[onboarding] AI pre-generation returned', res.status, res.statusText)
            }
          })
          .catch((err) => {
            console.error('[onboarding] AI pre-generation failed:', err)
          })
      }

      // Complete the progress bar
      setSaveProgress(100)
      await new Promise((r) => setTimeout(r, 400))

      // Clear localStorage — onboarding is complete
      clearLocalStorage()

      dispatch({ type: 'SET_STEP', step: 'success' })
    } catch (err) {
      let message: string
      if (err instanceof DOMException && err.name === 'AbortError') {
        message = 'De server reageert niet. Controleer je internetverbinding en probeer het opnieuw.'
      } else if (err instanceof TypeError && err.message === 'Failed to fetch') {
        message = 'Geen internetverbinding. Controleer je netwerk en probeer het opnieuw.'
      } else {
        message = err instanceof Error ? err.message : 'Onbekende fout bij opslaan'
      }
      setSaveError(message)
      // Go back to last content step before saving — all data is preserved in useReducer state
      const contentSteps = activeStepOrder.filter(s => !['saving', 'success'].includes(s))
      dispatch({ type: 'SET_STEP', step: contentSteps[contentSteps.length - 1] })
    } finally {
      setSaving(false)
    }
  }, [saving, state, activeStepOrder])

  // Defined after handleSaveOwnData so the safety-net branch below can call it
  // without tripping the no-use-before-define rule. goToNext is wired into
  // every step's <OnboardingX onNext={goToNext} /> prop, so the user-click
  // handlers see the latest closure on every render.
  const goToNext = useCallback(() => {
    const idx = activeStepOrder.indexOf(state.step)
    if (idx === -1) {
      // Self-heal: current step is no longer in the active order (e.g. the
      // user had a draft pointing at a step that was removed). Dispatch to
      // the first valid step instead of silently no-op'ing.
      const fallback = _firstNavigationRecoveryStep(activeStepOrder)
      console.warn(
        `[onboarding] goToNext: step ${state.step} not in active order, falling back to ${fallback}`
      )
      dispatch({ type: 'SET_STEP', step: fallback })
      return
    }
    const next = activeStepOrder[idx + 1]
    // Safety net: if the next step is 'saving', invoke the actual save handler
    // instead of just dispatching to the saving screen. Without this, any
    // module combination would dead-end at 90% on the progress bar (the
    // saving step never triggers the POST itself).
    if (next === 'saving') {
      handleSaveOwnData()
      return
    }
    if (idx < activeStepOrder.length - 1) {
      dispatch({ type: 'SET_STEP', step: next })
    }
  }, [activeStepOrder, state.step, handleSaveOwnData])

  const dismissError = useCallback(() => setSaveError(null), [])

  // Helper voor stap 4 → handlers de orchestrator nodig heeft.
  const handleAssetsChange = useCallback(
    (items: AssetQuickInput[]) => dispatch({ type: 'SET_QUICK_ASSETS', items }),
    [],
  )
  const handleDebtsChange = useCallback(
    (items: DebtQuickInput[]) => dispatch({ type: 'SET_QUICK_DEBTS', items }),
    [],
  )

  // Voor stap 5 → recap: cumulatief netto vermogen. `null` als de gebruiker
  // bezittingen + schulden bewust heeft overgeslagen (recap toont dan "—").
  const netWorthForKlaar = useMemo(() => {
    const hasAny = state.quickAssets.length + state.quickDebts.length > 0
    if (!hasAny) return null
    const totalAssets = state.quickAssets.reduce((s, a) => s + (Number(a.current_value) || 0), 0)
    const totalDebts = state.quickDebts.reduce((s, d) => s + (Number(d.current_balance) || 0), 0)
    return totalAssets - totalDebts
  }, [state.quickAssets, state.quickDebts])

  const netMonthlyIncomeForKlaar = useMemo(() => {
    const raw = state.identity.net_monthly_income
    if (!raw) return 0
    const cleaned = raw.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')
    const n = Number(cleaned)
    return isFinite(n) && n > 0 ? n : 0
  }, [state.identity.net_monthly_income])

  // ── Render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-ed)] border-t-[var(--ink)]" />
      </div>
    )
  }

  // De nieuwe shell heeft z'n eigen sticky voortgangsbalk en back-affordance;
  // de logo/logout-strip blijft daarboven actief voor alle content-stappen.
  // Verbergen alleen op `saving`/`success` — daar is het visuele eindpunt
  // genoeg, en de uitloggen-knop hoort niet bij een eindscherm.
  const showHeader = !['saving', 'success'].includes(state.step)

  return (
    <div
      className="flex min-h-screen flex-col items-center px-4 py-8 sm:justify-center sm:px-6 sm:py-12"
      style={KERN_MODULE_TINT_STYLE}
    >
      {/* ── Welkomstpopup ─────────────────────────────────────────
          Eén keer per nieuwe gebruiker, vóór stap 1. Niet voor restored
          drafts (zie check-effect). Sluit alleen via primary CTA of ESC. */}
      {showWelcomePopup && <WelcomePopup onDismiss={dismissWelcomePopup} />}

      {/* ── Sticky error banner ─────────────────────────────────── */}
      {saveError && (
        <div
          className="fixed inset-x-0 top-0 z-50 border-b border-red-200 bg-red-50 px-4 py-3 shadow-sm"
          role="alert"
          aria-live="assertive"
        >
          <div className="mx-auto flex max-w-[640px] items-start gap-3">
            <div className="mt-0.5 flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800">Er ging iets mis</p>
              <p className="mt-0.5 text-sm text-red-600">{saveError}</p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                onClick={handleSaveOwnData}
                disabled={saving}
                className="min-h-[36px] rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? 'Bezig...' : 'Opnieuw proberen'}
              </button>
              <button
                onClick={dismissError}
                className="rounded-lg p-1.5 text-red-400 hover:bg-red-100 hover:text-red-600"
                aria-label="Sluiten"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Restored data notice ──────────────────────────────────── */}
      {restoredNotice && !saveError && (
        <div
          className="fixed inset-x-0 top-0 z-40 border-b border-green-200 bg-green-50 px-4 py-2.5 shadow-sm"
          role="status"
        >
          <div className="mx-auto flex max-w-[640px] items-center justify-between gap-3">
            <p className="text-sm text-green-700">
              {'✓'} Je eerder ingevulde gegevens zijn hersteld
            </p>
            <button
              onClick={() => setRestoredNotice(false)}
              className="-mr-1 flex h-[44px] w-[44px] items-center justify-center rounded-lg text-green-400 hover:bg-green-100 hover:text-green-600 sm:mr-0 sm:h-auto sm:w-auto sm:p-1"
              aria-label="Sluiten"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <div className={`w-full max-w-[480px] sm:max-w-[640px] lg:max-w-none ${saveError || restoredNotice ? 'mt-16' : ''}`}>
        {/* Logo / Header — staat boven de shell-progressbar omdat dat z'n
            eigen sticky-rij heeft. Logout-knop blijft beschikbaar voor alle
            content-stappen. */}
        {showHeader && (
          <div className="relative mb-10 sm:mb-12 text-center">
            <h1 className="font-display text-4xl font-bold tracking-tight text-[var(--ink)]">
              <span className="lowercase">t</span>ri<span className="lowercase">f</span>inity<span className="text-kern-500">.</span>
            </h1>
            <button
              onClick={handleLogout}
              className="absolute right-0 top-0 text-xs text-[var(--ink-4)] transition-colors hover:text-[var(--ink-2)]"
            >
              Uitloggen
            </button>
          </div>
        )}

        <StepTransition key={state.step} direction={state.direction}>
          {state.step === 'doel' && (
            <OnboardingDoel
              selectedGoals={state.selectedGoals}
              onChange={(goals) => dispatch({ type: 'SET_GOAL', goals })}
              onNext={goToNext}
              onNewsOnly={() => {
                // Skip naar nieuws-only flow: zet modules op ['nieuws'] +
                // spring naar 'nieuws_only'-stap.
                dispatch({ type: 'SET_NEWS_ONLY' })
                dispatch({ type: 'SET_STEP', step: 'nieuws_only' })
              }}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {state.step === 'identity' && (
            <OnboardingIdentity
              data={state.identity}
              onChange={(data) => dispatch({ type: 'SET_IDENTITY', data })}
              onNext={goToNext}
              onBack={goToBack}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {state.step === 'inkomen' && (
            <OnboardingInkomen
              data={{
                household_type: state.identity.household_type,
                number_of_children: state.identity.number_of_children,
                net_monthly_income: state.identity.net_monthly_income,
              }}
              onChange={(income) =>
                dispatch({
                  type: 'SET_IDENTITY',
                  data: { ...state.identity, ...income },
                })
              }
              onNext={goToNext}
              onBack={goToBack}
              onSkipIncome={() => {
                // "Later invullen" defer-pad (feature #829): wis het
                // inkomensveld en ga door naar de volgende stap. De
                // gebruiker vult dit later aan via Instellingen.
                dispatch({
                  type: 'SET_IDENTITY',
                  data: { ...state.identity, net_monthly_income: '' },
                })
                // Track deferral for post-onboarding suggestions (feature #830)
                dispatch({ type: 'DEFER_FIELD', key: 'income' })
                goToNext()
              }}
              pensionData={state.pensionData}
              onPensionParsed={(data) => dispatch({ type: 'SET_PENSION_DATA', data })}
              onPensionRemoved={() => dispatch({ type: 'SET_PENSION_DATA', data: null })}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {state.step === 'bezittingen' && (
            <OnboardingBezittingen
              quickAssets={state.quickAssets}
              quickDebts={state.quickDebts}
              onAssetsChange={handleAssetsChange}
              onDebtsChange={handleDebtsChange}
              onNext={() => {
                // Track deferral when user proceeds without adding any
                // assets or debts (feature #830). The bezittingen step shows
                // "Later invullen" as button text when the list is empty.
                if (state.quickAssets.length === 0 && state.quickDebts.length === 0) {
                  dispatch({ type: 'DEFER_FIELD', key: 'assets' })
                }
                goToNext()
              }}
              onBack={goToBack}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
              requireCashAccount={state.activeModules.includes('budgetteren')}
              bankConnected={bankConnected}
              bankError={bankError}
            />
          )}

          {state.step === 'spaardoel' && (
            <OnboardingSpaardoel
              data={state.spaardoel}
              onChange={(data) => dispatch({ type: 'SET_SPAARDOEL', data })}
              onNext={goToNext}
              onBack={goToBack}
              onSkip={() => {
                // Skip = één klik, geen confirm. Zet `skipped: true` en
                // wis pre-fill-velden zodat een per ongeluk eerder
                // ingevulde naam/bedrag niet alsnog wordt weggeschreven
                // door handleSaveOwnData.
                dispatch({
                  type: 'SET_SPAARDOEL',
                  data: {
                    presetKey: null,
                    name: '',
                    target_value: '',
                    target_date: '',
                    skipped: true,
                  },
                })
                // Track deferral for post-onboarding suggestions (feature #830)
                dispatch({ type: 'DEFER_FIELD', key: 'spaardoel' })
                goToNext()
              }}
              monthlyIncome={netMonthlyIncomeForKlaar}
              monthlyExpenses={
                Number(state.identity.estimated_monthly_expenses) || 0
              }
              selectedGoals={state.selectedGoals}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {state.step === 'klaar' && (
            <OnboardingKlaar
              selectedGoals={state.selectedGoals}
              netMonthlyIncome={netMonthlyIncomeForKlaar}
              netWorth={netWorthForKlaar}
              spaardoel={
                state.spaardoel.skipped
                  || !state.spaardoel.presetKey
                  || !state.spaardoel.name.trim()
                  ? null
                  : {
                      presetKey: state.spaardoel.presetKey,
                      label: state.spaardoel.name.trim(),
                      amount: parseSpaardoelAmount(state.spaardoel.target_value),
                    }
              }
              onAddMore={() => dispatch({ type: 'SET_STEP', step: 'bezittingen' })}
              onFinish={handleSaveOwnData}
              onBack={goToBack}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {state.step === 'nieuws_only' && (
            <OnboardingNieuwsOnly
              description={state.newsDescription}
              onChange={(value) => dispatch({ type: 'SET_NEWS_DESCRIPTION', value })}
              onNext={handleSaveOwnData}
              onBack={goToBack}
              extraction={state.extraction}
              onExtractionChange={(data) => dispatch({ type: 'SET_EXTRACTION', data })}
              profileContext={{
                age: state.identity.date_of_birth
                  ? Math.floor((Date.now() - new Date(state.identity.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
                  : undefined,
                householdType: state.identity.household_type,
                monthlyIncome: state.identity.net_monthly_income ? Number(state.identity.net_monthly_income) : undefined,
                monthlyExpenses: state.identity.estimated_monthly_expenses ? Number(state.identity.estimated_monthly_expenses) : undefined,
              }}
            />
          )}

          {state.step === 'saving' && (
            <div className="flex min-h-[60vh] flex-col items-center justify-center sm:min-h-0">
              <div className="w-full max-w-sm rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] shadow-sm p-8 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center">
                  <div className="animate-pulse">
                    <WillDots size={64} />
                  </div>
                </div>
                <p className="mb-4 text-sm font-medium text-[var(--ink-2)] transition-opacity duration-300">
                  {SAVING_MESSAGES[saveMessageIdx]}
                </p>
                {/* Progress bar */}
                <div className="mx-auto h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                  <div
                    className="h-full rounded-full bg-[var(--ink)] transition-all duration-300 ease-out"
                    style={{ width: `${saveProgress}%` }}
                  />
                </div>
                <p className="mt-2 font-mono text-xs tabular-nums text-[var(--ink-4)]">{saveProgress}%</p>
              </div>
            </div>
          )}

          {state.step === 'success' && (
            <OnboardingSuccess
              onDashboard={() => {
                clearLocalStorage()
                // Primaire goal (eerste in array) bepaalt het first-win-pad;
                // fallback naar getHomePath als er geen goals zijn (news-only).
                const primaryGoal = state.selectedGoals[0]
                const destination = primaryGoal
                  ? getGoalFirstWinPath(primaryGoal)
                  : getHomePath(state.activeModules)
                // Hard navigation: voorkomt stale-read redirect-loop in (app)/layout.tsx
                // direct na het wegschrijven van `onboarding_completed = true`. Bij een
                // soft-navigation kan de server-layout de nét-geschreven row missen en
                // redirecten naar /onboarding, wat de Suspense-fallback laat knipperen
                // tot een browser-refresh de sessie opnieuw aligneert.
                window.location.assign(destination + '?welcome=1')
              }}
              activeModules={state.activeModules}
              goal={state.selectedGoals[0]}
            />
          )}
        </StepTransition>
      </div>
    </div>
  )
}
