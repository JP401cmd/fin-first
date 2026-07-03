'use client'

import { useState, useEffect, useReducer, useCallback, useMemo, useRef } from 'react'
import './onboarding.css'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { WillDots } from '@/components/app/will-dots'
import type { IdentityData } from '@/components/onboarding/onboarding-identity'
import type { HorizonData } from '@/components/onboarding/onboarding-horizon'
import type { AssetQuickInput, DebtQuickInput } from '@/lib/quick-add/types'

import { OnboardingIdentity } from '@/components/onboarding/onboarding-identity'
import { OnboardingInkomen, parseBedragInput } from '@/components/onboarding/onboarding-inkomen'
import { OnboardingBezittingen } from '@/components/onboarding/onboarding-bezittingen'
import { OnboardingSchulden } from '@/components/onboarding/onboarding-schulden'
import {
  OnboardingPensioen,
  INITIAL_PENSION_DRAFT,
  type PensionDraft,
} from '@/components/onboarding/onboarding-pensioen'
import { OnboardingSpaardoel } from '@/components/onboarding/onboarding-spaardoel'
import {
  OnboardingUitgavenPensioen,
  INITIAL_RETIREMENT_EXPENSE,
  type RetirementExpenseState,
} from '@/components/onboarding/onboarding-uitgaven-pensioen'
import { OnboardingKlaar } from '@/components/onboarding/onboarding-klaar'
import { applyPensionParseResult } from '@/lib/pension/apply-parse-result'
import type { PensionParseResult } from '@/app/api/pension/parse/route'
import { SPAARDOEL_PRESETS, type SpaardoelPresetKey } from '@/lib/onboarding-presets'
import { INITIAL_HORIZON_DATA } from '@/components/onboarding/onboarding-horizon'
import { OnboardingSuccess } from '@/components/onboarding/onboarding-success'
import { WelcomePopup } from '@/components/onboarding/welcome-popup'
import { type PersonaId, type IntentId, type ModuleId, ALL_MODULES } from '@/lib/module-registry'
import type { GoalSlug } from '@/lib/goals/types'
import { INTENT_TO_GOAL_FALLBACK, isGoalSlug } from '@/lib/goals/catalog'

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
 * Active step union — begeleide één-vraag-tegelijk flow (Boldin-stijl, jun 2026).
 *
 * De grove 5-staps-iteratie is vervangen door micro-stappen, gegroepeerd per
 * onderwerp:
 *   · Profiel    → `naam`, `geboortedatum`   (één veld per scherm)
 *   · Inkomen    → `inkomen`, `uitgaven`     (spaarquote-preview op `uitgaven`)
 *   · Bezittingen→ `bezittingen`             (begeleide ja/nee-enumeratie)
 *   · Schulden   → `schulden`                (begeleide ja/nee + altijd-uitgang)
 *   · Pensioen   → `pensioen`                (schatting / upload / overslaan)
 *   · Spaardoel  → `spaardoel`
 *   · Klaar      → `klaar`
 * Plus de twee terminal-stappen `saving`/`success`.
 *
 * De ja/nee-loops binnen `bezittingen`/`schulden`/`pensioen` zijn zelf-bevattende
 * sub-machines in hun eigen component; de orchestrator ziet ze als één stap.
 * De voortgang loopt PER GROEP (zie `STEP_GROUP_INDEX`), niet per micro-vraag.
 *
 * Legacy step-namen (`identity`, `intro`, `goal`, `doel`, `nieuws_only`,
 * `budgets`, `horizon`) leven nog in `CANONICAL_STEP_ORDER`/`LEGACY_STEP_MAP`
 * zodat self-healing restore werkt op oude localStorage-drafts.
 */
type Step =
  | 'naam'
  | 'geboortedatum'
  | 'inkomen'
  | 'uitgaven'
  | 'uitgaven_pensioen'
  | 'bezittingen'
  | 'schulden'
  | 'pensioen'
  | 'spaardoel'
  | 'klaar'
  | 'saving'
  | 'success'

type Direction = 'forward' | 'back'

/**
 * Voortgang per GROEP (1-indexed) i.p.v. per micro-vraag. De ja/nee-loops maken
 * het aantal vragen variabel, dus een "3/27" zou misleidend zijn — we tonen de
 * groep-index ("BEZITTINGEN" = 3/7). Meerdere micro-stappen in dezelfde groep
 * delen hetzelfde nummer.
 */
const STEP_GROUP_INDEX: Record<Step, number> = {
  naam: 1,
  geboortedatum: 1,
  inkomen: 2,
  uitgaven: 2,
  // Zelfde groep (2) als inkomen/uitgaven — geen extra groep-nummer, de
  // voortgangsbalk blijft 7 groepen. De prefill is afgeleid van de net-
  // ingevoerde maanduitgaven, dus onderwerpelijk hoort 'm hier.
  uitgaven_pensioen: 2,
  bezittingen: 3,
  schulden: 4,
  pensioen: 5,
  spaardoel: 6,
  klaar: 7,
  saving: 7,
  success: 7,
}
const TOTAL_GROUPS = 7

/**
 * Canonical order of every step that has ever existed in the flow, used as a
 * fallback anchor when a restored `lastStep` is no longer present in the
 * active step order. Bevat zowel de legacy step-namen als de nieuwe micro-
 * stappen — drafts uit een oudere flow blijven herstelbaar.
 */
const CANONICAL_STEP_ORDER: readonly string[] = [
  // legacy → nieuw vervangers
  'intro',         // → naam (legacy)
  'doel',          // → naam (verwijderd jun 2026)
  'identity',      // → naam (gesplitst jun 2026)
  'goal',          // → naam (legacy)
  'naam',
  'geboortedatum',
  'inkomen',
  'uitgaven',
  'uitgaven_pensioen', // toegevoegd jun 2026 — expliciete pensioenuitgave-prefill
  'bezittingen',
  'schulden',
  'pensioen',
  'spaardoel',     // toegevoegd mei 2026 — laagdrempelige spaardoel-keuze
  'budgets',       // → klaar (legacy)
  'horizon',       // → klaar (legacy)
  'klaar',
  'nieuws_only',   // → naam (verwijderd jun 2026, samen met de doel-stap)
  'saving',
  'success',
] as const

/**
 * Map a legacy lastStep name to the closest current equivalent. Wordt door
 * `_resolveRestoredStep` toegepast vóór de membership-check zodat een draft
 * die opgeslagen is met een verwijderde/hernoemde step-naam alsnog landt op
 * een bestaande stap zonder dat we 'm naar het begin terug hoeven te zetten.
 */
const LEGACY_STEP_MAP: Record<string, Step> = {
  // pre-mei 2026 step-namen
  modules: 'naam',
  persona: 'naam',
  intent: 'naam',
  extras: 'bezittingen',
  preferences: 'klaar',
  // fase 3 (mei 2026): intro/goal/budgets/horizon zijn niet meer actief
  intro: 'naam',
  goal: 'naam',
  budgets: 'klaar',
  horizon: 'klaar',
  // jun 2026: doel-stap ("Waar help ik je mee?") + news-only-pad verwijderd
  doel: 'naam',
  nieuws_only: 'naam',
  // jun 2026 (deze wijziging): identity gesplitst in naam + geboortedatum,
  // inkomen gesplitst in inkomen + uitgaven. Een draft op de oude
  // gecombineerde stappen heelt naar de eerste micro-stap ervan.
  identity: 'naam',
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

  // No saved step at all → start at naam (de eerste content-stap).
  if (!lastStep) {
    return { step: 'naam', healed: false }
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

  // Last resort: `naam` (de eerste content-stap) if it's in the active order,
  // otherwise the first selectable step.
  const naamFallback = activeStepOrder.find((s) => s === 'naam')
  if (naamFallback) {
    return { step: 'naam', healed: true }
  }
  const firstSelectable = activeStepOrder.find(isSelectable)
  return { step: firstSelectable ?? 'naam', healed: true }
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
  return recovery ?? activeStepOrder[0] ?? 'naam'
}

/**
 * Compute the step order. Sinds jun 2026 statisch: de doel-stap en het
 * news-only-pad zijn verwijderd, alle 5 content-stappen zijn altijd actief.
 * Module-gating gebeurt buiten onboarding (abonnement + user-toggles op
 * /mijn) — alle modules staan na onboarding default aan.
 */
function computeStepOrder(): Step[] {
  return [
    'naam',
    'geboortedatum',
    'inkomen',
    'uitgaven',
    'uitgaven_pensioen',
    'bezittingen',
    'schulden',
    'pensioen',
    'spaardoel',
    'klaar',
    'saving',
    'success',
  ]
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
   * Restant van de verwijderde doel-stap (jun 2026). Nieuwe gebruikers
   * kiezen geen doelen meer; het veld blijft bestaan zodat restored drafts
   * hun eerdere keuze behouden (server slaat 'm op als `selected_goal_slugs`).
   */
  selectedGoals: GoalSlug[]
  /** Sinds jun 2026 altijd `ALL_MODULES` — modules staan default aan. */
  activeModules: ModuleId[]
  horizon: HorizonData
  budgetAmounts: Record<string, number>
  quickAssets: AssetQuickInput[]
  quickDebts: DebtQuickInput[]
  /** Stap v. — spaardoel-keuze. Skipped + presetKey=null = niet weggeschreven. */
  spaardoel: SpaardoelState
  /**
   * Uitgaven-na-pensioen-keuze (groep 2, ná uitgaven). Maakt de impliciete
   * 80%-server-default expliciet. Skipped → niets meesturen, server-default wint.
   */
  retirementExpense: RetirementExpenseState
  /**
   * Pensioen-keuze (schatting / upload / overslaan). De daadwerkelijke
   * `life_events`-write gebeurt bij de eind-save via `applyPensionParseResult`,
   * los van het save-own-data POST-contract.
   */
  pension: PensionDraft
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
  budgetAmounts: Record<string, number>
  quickAssets: AssetQuickInput[]
  quickDebts: DebtQuickInput[]
  /** Spaardoel-keuze van stap v. — optioneel zodat oude drafts blijven werken. */
  spaardoel?: SpaardoelState
  /** Uitgaven-na-pensioen-keuze — optioneel zodat oude drafts (zonder de stap) werken. */
  retirementExpense?: RetirementExpenseState
  /** Pensioen-keuze — optioneel zodat oude drafts (zonder pensioen-stap) werken. */
  pension?: PensionDraft
  /** Last step the user was on (to restore position) */
  lastStep?: Step
  /** Fields deferred via "Later invullen" — optioneel, oude drafts kennen dit veld niet. */
  deferredFields?: DeferredFieldKey[]
}

type Action =
  | { type: 'SET_STEP'; step: Step }
  | { type: 'SET_IDENTITY'; data: IdentityData }
  | { type: 'SET_HORIZON'; data: HorizonData }
  | { type: 'SET_BUDGET_AMOUNTS'; amounts: Record<string, number> }
  | { type: 'SET_QUICK_ASSETS'; items: AssetQuickInput[] }
  | { type: 'SET_QUICK_DEBTS'; items: DebtQuickInput[] }
  /**
   * Vervang de complete spaardoel-substate per dispatch — eenvoudiger dan
   * partial-update-acties want de child levert telkens de volledige shape.
   */
  | { type: 'SET_SPAARDOEL'; data: SpaardoelState }
  /** Vervang de complete uitgaven-na-pensioen-substate per dispatch. */
  | { type: 'SET_RETIREMENT_EXPENSE'; data: RetirementExpenseState }
  /** Vervang de complete pensioen-substate per dispatch (child levert de volledige shape). */
  | { type: 'SET_PENSION'; data: PensionDraft }
  /**
   * Track een overgeslagen veld via "Later invullen" (feature #830).
   * Idempotent: voegt de key alleen toe als hij er nog niet in zit.
   */
  | { type: 'DEFER_FIELD'; key: DeferredFieldKey }
  | { type: 'RESTORE_STATE'; data: PersistedData }

export const _initialState: State = {
  step: 'naam',
  direction: 'forward',
  selectedGoals: [],
  activeModules: [...ALL_MODULES],
  identity: {
    full_name: '',
    date_of_birth: '',
    household_type: 'solo',
    number_of_children: 0,
    net_monthly_income: '',
    estimated_yearly_income: '',
    estimated_monthly_expenses: '',
  },
  horizon: INITIAL_HORIZON_DATA,
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
  retirementExpense: INITIAL_RETIREMENT_EXPENSE,
  pension: INITIAL_PENSION_DRAFT,
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

export function _reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_STEP': {
      const stepOrder = computeStepOrder()
      const oldIdx = stepOrder.indexOf(state.step)
      const newIdx = stepOrder.indexOf(action.step)
      const direction: Direction = newIdx >= oldIdx ? 'forward' : 'back'
      return { ...state, step: action.step, direction }
    }
    case 'SET_IDENTITY':
      return { ...state, identity: action.data }
    case 'SET_HORIZON':
      return { ...state, horizon: action.data }
    case 'SET_BUDGET_AMOUNTS':
      return { ...state, budgetAmounts: action.amounts }
    case 'SET_QUICK_ASSETS':
      return { ...state, quickAssets: action.items }
    case 'SET_QUICK_DEBTS':
      return { ...state, quickDebts: action.items }
    case 'SET_SPAARDOEL':
      return { ...state, spaardoel: action.data }
    case 'SET_RETIREMENT_EXPENSE':
      return { ...state, retirementExpense: action.data }
    case 'SET_PENSION':
      return { ...state, pension: action.data }
    case 'DEFER_FIELD': {
      // Idempotent: voeg alleen toe als de key er nog niet in zit.
      if (state.deferredFields.includes(action.key)) return state
      return { ...state, deferredFields: [...state.deferredFields, action.key] }
    }
    case 'RESTORE_STATE': {
      const { step: restoredStep, healed } = _resolveRestoredStep(
        action.data.lastStep,
        computeStepOrder()
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
        // Merge over de initial-shape zodat velden die een oude draft nog
        // niet kent (estimated_yearly_income) altijd een string zijn —
        // anders worden de controlled inputs uncontrolled.
        identity: { ..._initialState.identity, ...action.data.identity },
        selectedGoals: restoredGoals,
        // Sinds jun 2026 kiest de gebruiker geen modules meer in onboarding —
        // negeer wat een oude draft had (incl. news-only) en zet alles aan.
        activeModules: [...ALL_MODULES],
        horizon: action.data.horizon ?? INITIAL_HORIZON_DATA,
        budgetAmounts: action.data.budgetAmounts,
        quickAssets: action.data.quickAssets,
        quickDebts: action.data.quickDebts,
        // Ontbrekend `spaardoel` in een legacy draft → val terug op de
        // _initialState-shape. Geen migratie nodig — het is een nieuw veld
        // dat oude drafts gewoon niet kennen.
        spaardoel: action.data.spaardoel ?? _initialState.spaardoel,
        // Uitgaven-na-pensioen — optioneel; oude drafts (vóór deze stap) kennen
        // het veld niet en vallen veilig terug op de initiële shape. Bij die
        // default (skipped=false, leeg bedrag) stuurt de save niets expliciets
        // mee → de impliciete 80%-server-default blijft werken.
        retirementExpense: action.data.retirementExpense ?? _initialState.retirementExpense,
        // Pensioen — optioneel; oude drafts (vóór de pensioen-stap) kennen het
        // veld niet en vallen terug op de initiële shape.
        pension: action.data.pension ?? _initialState.pension,
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
      budgetAmounts: state.budgetAmounts,
      quickAssets: state.quickAssets,
      quickDebts: state.quickDebts,
      spaardoel: state.spaardoel,
      retirementExpense: state.retirementExpense,
      pension: state.pension,
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
        estimated_yearly_income: '',
        estimated_monthly_expenses: (old.estimated_monthly_expenses as string) ?? '',
      } as IdentityData
    } else {
      identity = parsed.identity as IdentityData
    }

    // Migratie inkomensveld. Sinds jun 2026 (deze wijziging) is het inkomen
    // per MAAND uitgevraagd: `net_monthly_income` is het primaire invoerveld,
    // `estimated_yearly_income` (×12) blijft de canonieke spiegel.
    //
    // Drie soorten drafts moeten correct herstellen:
    //  (a) nieuw — `net_monthly_income` gevuld: leid jaar daaruit af (×12).
    //  (b) tussenperiode — alleen `estimated_yearly_income` (jaar-vraag):
    //      leid maand daaruit af (÷12) zodat de gebruiker zijn invoer terugziet
    //      in het nu maand-gebonden veld.
    //  (c) heel oud — alleen legacy `net_monthly_income`: valt onder (a).
    const cleanNumber = (s: string) =>
      Number(String(s).replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'))
    const monthlyVal = identity.net_monthly_income
      ? cleanNumber(identity.net_monthly_income)
      : NaN
    const yearlyVal = identity.estimated_yearly_income
      ? cleanNumber(identity.estimated_yearly_income)
      : NaN
    if (isFinite(monthlyVal) && monthlyVal > 0) {
      // (a)/(c): maandbedrag aanwezig → spiegel het canonieke jaarinkomen.
      identity = {
        ...identity,
        estimated_yearly_income: String(Math.round(monthlyVal * 12)),
      }
    } else if (isFinite(yearlyVal) && yearlyVal > 0) {
      // (b): alleen jaarbedrag → leid het maandbedrag af voor het invoerveld.
      identity = {
        ...identity,
        net_monthly_income: String(Math.round(yearlyVal / 12)),
      }
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

    // Uitgaven-na-pensioen: oude drafts kennen het veld niet. Lichte shape-
    // guard — alleen overnemen wat we exact verwachten; anders valt
    // RESTORE_STATE terug op de initiële shape (skipped=false, leeg bedrag →
    // impliciete server-default blijft werken).
    let retirementExpense: RetirementExpenseState | undefined = undefined
    if (parsed.retirementExpense && typeof parsed.retirementExpense === 'object') {
      const rawR = parsed.retirementExpense as Record<string, unknown>
      const method =
        rawR.method === 'custom_amount' || rawR.method === 'current_income'
          ? rawR.method
          : 'custom_amount'
      retirementExpense = {
        method,
        customAmount: typeof rawR.customAmount === 'string' ? rawR.customAmount : '',
        skipped: rawR.skipped === true,
      }
    }

    // Pensioen: oude drafts kennen het veld niet. Lichte shape-guard — neem
    // alleen over wat we herkennen; RESTORE_STATE valt anders terug op de
    // initiële shape. `parseResult` wordt verbatim overgenomen (JSON uit de
    // mijnpensioen-mapper of de AI-route) of genegeerd als 't geen object is.
    let pension: PensionDraft | undefined = undefined
    if (parsed.pension && typeof parsed.pension === 'object') {
      const rawP = parsed.pension as Record<string, unknown>
      const mode = rawP.mode === 'estimate' || rawP.mode === 'upload' ? rawP.mode : null
      pension = {
        mode,
        grossMonthly: typeof rawP.grossMonthly === 'string' ? rawP.grossMonthly : '',
        startAge: typeof rawP.startAge === 'string' ? rawP.startAge : '',
        parseResult:
          rawP.parseResult && typeof rawP.parseResult === 'object'
            ? (rawP.parseResult as PensionParseResult)
            : null,
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
      budgetAmounts: parsed.budgetAmounts && typeof parsed.budgetAmounts === 'object' ? parsed.budgetAmounts : {},
      quickAssets: Array.isArray(parsed.quickAssets) ? parsed.quickAssets : [],
      quickDebts: Array.isArray(parsed.quickDebts) ? parsed.quickDebts : [],
      spaardoel,
      retirementExpense,
      pension,
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

/**
 * Zet de pensioen-keuze van de pensioen-stap om naar een `PensionParseResult`
 * — exact het contract dat `applyPensionParseResult` (life_events) consumeert,
 * zodat schatting én upload via één deterministisch pad lopen.
 *
 * - `upload` → het reeds geparste resultaat (mijnpensioen JSON / AI-PDF).
 * - `estimate` → één synthetische ouderdomspensioen-regeling uit het bruto
 *   maandbedrag (+ optionele ingangsleeftijd, default 67, geklemd 50–75).
 * - Niets ingevuld / overgeslagen → `null` (geen write).
 */
export function buildPensionParseResult(p: PensionDraft): PensionParseResult | null {
  if (p.mode === 'upload' && p.parseResult) return p.parseResult
  if (p.mode === 'estimate') {
    const gross = parseBedragInput(p.grossMonthly)
    if (!isFinite(gross) || gross <= 0) return null
    const parsedAge = p.startAge ? parseInt(p.startAge, 10) : NaN
    const ingangLeeftijd =
      isFinite(parsedAge) && parsedAge >= 50 && parsedAge <= 75 ? parsedAge : 67
    return {
      aowBedrag: null,
      regelingen: [
        {
          fondsNaam: 'Geschat pensioen',
          brutoBedrag: Math.round(gross),
          ingangLeeftijd,
          isGeindexeerd: false,
          type: 'ouderdomspensioen',
        },
      ],
      nabestaandenpensioen: null,
      samenvatting: 'Handmatige schatting in onboarding',
    }
  }
  return null
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
  // User-id wordt in het check-effect gezet (na getUser) en bij de eind-save
  // gebruikt voor de auth.uid()-gescopede pensioen-write (life_events).
  const userIdRef = useRef<string | null>(null)
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

  const activeStepOrder = useMemo(() => computeStepOrder(), [])

  // Voortgang PER GROEP (niet per micro-vraag): de ja/nee-loops in
  // bezittingen/schulden/pensioen maken het aantal vragen variabel, dus we
  // tonen de groep-index ("BEZITTINGEN" = 3/7) i.p.v. een misleidende "3/27".
  const totalContentSteps = TOTAL_GROUPS
  const currentContentStep = useMemo(
    () => STEP_GROUP_INDEX[state.step] ?? 1,
    [state.step],
  )

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
      userIdRef.current = user.id

      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single()

      if (profile?.onboarding_completed) {
        clearLocalStorage()
        router.replace('/overzicht')
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

      // Maandinkomen (stap 3) is sinds jun 2026 het uitgevraagde veld
      // (`net_monthly_income`). We sturen het maandbedrag naar
      // profiles.net_monthly_income (de server zet dit, mits > 0, als
      // handmatige bron 'eigen bedrag' in het blok "Instellingen & toekomst"
      // op /overzicht/cashflow → drijft de spaarquote/FIRE-prognose via
      // resolveSavingsSource, ook zonder transacties). Valt terug op een
      // eventueel reeds gevuld canoniek jaarveld (÷12) voor herstelde oude
      // drafts die alleen dat nog hadden.
      const rawMonthly = identity.net_monthly_income
        ? parseBedragInput(identity.net_monthly_income)
        : NaN
      const monthlyIncome = isFinite(rawMonthly) && rawMonthly > 0
        ? Math.round(rawMonthly)
        : (() => {
            const yearly = identity.estimated_yearly_income
              ? parseBedragInput(identity.estimated_yearly_income)
              : NaN
            return isFinite(yearly) && yearly > 0 ? Math.round(yearly / 12) : 0
          })()
      // Canonieke jaarwaarde (maand × 12) — historisch de "opgeslagen" client-
      // grootheid waar downstream-afleidingen omheen geschreven zijn. De
      // server-body consumeert het maandbedrag direct; we houden de jaarwaarde
      // hier expliciet zodat de maand→jaar-relatie op één plek verankerd is.
      const estimatedYearlyIncome = monthlyIncome > 0 ? monthlyIncome * 12 : 0
      void estimatedYearlyIncome
      const monthlyExpenses = identity.estimated_monthly_expenses
        ? parseBedragInput(identity.estimated_monthly_expenses)
        : NaN

      const body: Record<string, unknown> = {
        identity: {
          full_name: identity.full_name,
          date_of_birth: identity.date_of_birth,
          household_type: identity.household_type,
          number_of_children: identity.number_of_children,
          net_monthly_income: monthlyIncome,
          estimated_monthly_expenses: isFinite(monthlyExpenses) && monthlyExpenses > 0
            ? Math.round(monthlyExpenses)
            : undefined,
        },
        budgetAmounts,
        idempotencyKey,
        activeModules: state.activeModules.length > 0 ? state.activeModules : undefined,
      }

      // Add horizon data if toekomstplannen is active.
      // (`toekomstplannen` zit in ALL_MODULES en RESTORE_STATE forceert
      // activeModules=ALL_MODULES, dus dit blok draait altijd — horizonData
      // valt nooit gated weg.)
      if (state.activeModules.includes('toekomstplannen')) {
        // Uitgaven-na-pensioen-keuze (nieuwe onboarding-stap) bepaalt de
        // retirement-velden. Consume-only: we leggen alleen de keuze vast — de
        // horizon-kernel + computeRetirementExpenses blijven de rekenbron.
        //
        // Bij SKIP sturen we de retirement-velden bewust NIET mee (undefined):
        // dan vult de server via resolveRetirementExpenseDefaults de impliciete
        // 80%-default in (op basis van de ingevoerde maanduitgaven). Zo is "later
        // bepalen" geen current_income-keuze maar een zachte, realistische default.
        const re = state.retirementExpense
        let retirementMethod:
          | 'essential_budgets'
          | 'custom_amount'
          | 'current_income'
          | undefined = undefined
        let retirementCustom: number | undefined = undefined
        if (!re.skipped) {
          retirementMethod = re.method
          if (re.method === 'custom_amount') {
            const parsed = re.customAmount ? parseBedragInput(re.customAmount) : NaN
            // Leeg/ongeldig bedrag bij custom_amount → laat het expliciete
            // bedrag weg; de server-default vult dan 80% in. Geen 0 wegschrijven.
            retirementCustom = isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined
          }
          // 'current_income' ("zelfde als nu") → methode meesturen, geen bedrag.
        }

        body.horizonData = {
          fire_end_strategy: state.horizon.fire_end_strategy,
          fire_end_age: state.horizon.fire_end_age,
          fire_legacy_amount: state.horizon.fire_legacy_amount ? Number(state.horizon.fire_legacy_amount) : undefined,
          retirement_expense_method: retirementMethod,
          retirement_custom_amount: retirementCustom,
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

      // ── Pensioen-write (los van het save-own-data POST-contract) ──────────
      // De pensioen-keuze (schatting of upload) rijdt op het bestaande
      // `applyPensionParseResult`-pad → `life_events`, met de anon RLS-client
      // .eq('user_id', auth.uid())-gescoped (geen service-role, geen nieuwe
      // exposure). Best-effort: een mislukte pensioen-write mag de geslaagde
      // onboarding-save niet terugdraaien — we loggen en gaan door.
      try {
        const pensionResult = buildPensionParseResult(state.pension)
        if (pensionResult && userIdRef.current) {
          const outcome = await applyPensionParseResult({
            supabase,
            userId: userIdRef.current,
            parseResult: pensionResult,
            existingPensionCount: 0,
          })
          if (outcome.error) {
            console.warn(`[onboarding] pensioen opslaan mislukt: ${outcome.error}`)
          }
        }
      } catch (pensionErr) {
        console.warn('[onboarding] pensioen opslaan mislukt', pensionErr)
      }

      // NB: geen AI pre-generatie meer hier. Dat endpoint
      // (/api/ai/recommendations/initial) zit achter de 'ai'-subscriptie, die
      // een net-geonboarde gebruiker (active_subscriptions = []) per definitie
      // niet heeft — de call gaf dus gegarandeerd 403 en een console-error.
      // AI-aanbevelingen worden on-demand gegenereerd waar de gebruiker écht
      // AI-toegang heeft (bv. de roadmap-modal), niet blind bij onboarding.

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
      } else if (err instanceof TypeError && err.message.startsWith('Failed to fetch')) {
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

  // Maandinkomen voor recap + spaardoel-suggesties: sinds jun 2026 wordt het
  // inkomen per MAAND uitgevraagd, dus `net_monthly_income` is de primaire
  // bron. Valt terug op het canonieke jaarinkomen (÷12) voor herstelde oude
  // drafts waarin alleen dat gevuld was.
  const netMonthlyIncomeForKlaar = useMemo(() => {
    const monthly = state.identity.net_monthly_income
      ? parseBedragInput(state.identity.net_monthly_income)
      : NaN
    if (isFinite(monthly) && monthly > 0) return Math.round(monthly)
    const yearly = state.identity.estimated_yearly_income
      ? parseBedragInput(state.identity.estimated_yearly_income)
      : NaN
    return isFinite(yearly) && yearly > 0 ? Math.round(yearly / 12) : 0
  }, [state.identity.net_monthly_income, state.identity.estimated_yearly_income])

  // Maanduitgaven (stap 3) — zelfde NL-parse als de save-payload.
  const monthlyExpensesParsed = useMemo(() => {
    const n = state.identity.estimated_monthly_expenses
      ? parseBedragInput(state.identity.estimated_monthly_expenses)
      : NaN
    return isFinite(n) && n > 0 ? Math.round(n) : 0
  }, [state.identity.estimated_monthly_expenses])

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
          {/* ── Profiel-groep: naam + geboortedatum (één veld per scherm) ── */}
          {state.step === 'naam' && (
            <OnboardingIdentity
              data={state.identity}
              onChange={(data) => dispatch({ type: 'SET_IDENTITY', data })}
              onNext={goToNext}
              field="naam"
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {state.step === 'geboortedatum' && (
            <OnboardingIdentity
              data={state.identity}
              onChange={(data) => dispatch({ type: 'SET_IDENTITY', data })}
              onNext={goToNext}
              onBack={goToBack}
              field="dob"
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {/* ── Inkomen-groep: maandinkomen + uitgaven (preview op uitgaven) ── */}
          {(state.step === 'inkomen' || state.step === 'uitgaven') && (
            <OnboardingInkomen
              data={{
                net_monthly_income: state.identity.net_monthly_income,
                estimated_monthly_expenses: state.identity.estimated_monthly_expenses,
              }}
              onChange={(income) =>
                dispatch({
                  type: 'SET_IDENTITY',
                  data: { ...state.identity, ...income },
                })
              }
              onNext={goToNext}
              onBack={goToBack}
              field={state.step === 'inkomen' ? 'inkomen' : 'uitgaven'}
              onSkipIncome={
                state.step === 'inkomen'
                  ? () => {
                      // "Later invullen" defer-pad (feature #829): wis beide
                      // velden en sla de hele inkomen-groep over (naar
                      // bezittingen). De gebruiker vult dit later aan via
                      // /overzicht/cashflow.
                      dispatch({
                        type: 'SET_IDENTITY',
                        data: {
                          ...state.identity,
                          net_monthly_income: '',
                          estimated_yearly_income: '',
                          estimated_monthly_expenses: '',
                        },
                      })
                      dispatch({ type: 'DEFER_FIELD', key: 'income' })
                      dispatch({ type: 'SET_STEP', step: 'bezittingen' })
                    }
                  : undefined
              }
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {/* ── Uitgaven na pensioen — expliciete 80%-prefill (optioneel) ── */}
          {state.step === 'uitgaven_pensioen' && (
            <OnboardingUitgavenPensioen
              data={state.retirementExpense}
              onChange={(data) => dispatch({ type: 'SET_RETIREMENT_EXPENSE', data })}
              monthlyExpenses={monthlyExpensesParsed}
              monthlyIncome={netMonthlyIncomeForKlaar}
              onNext={goToNext}
              onBack={goToBack}
              onSkip={() => {
                // "Kan altijd later nog" — markeer skipped en wis een eventueel
                // bewerkt bedrag, zodat de save niets expliciets meestuurt en de
                // impliciete 80%-server-default het overneemt.
                dispatch({
                  type: 'SET_RETIREMENT_EXPENSE',
                  data: { method: 'custom_amount', customAmount: '', skipped: true },
                })
                goToNext()
              }}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {/* ── Bezittingen — begeleide ja/nee-enumeratie ── */}
          {state.step === 'bezittingen' && (
            <OnboardingBezittingen
              quickAssets={state.quickAssets}
              quickDebts={state.quickDebts}
              onAssetsChange={handleAssetsChange}
              onDebtsChange={handleDebtsChange}
              onNext={() => {
                // Track deferral when the user finishes the bezittingen section
                // without having added any asset (feature #830).
                if (state.quickAssets.length === 0) {
                  dispatch({ type: 'DEFER_FIELD', key: 'assets' })
                }
                goToNext()
              }}
              onBack={goToBack}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
              bankConnected={bankConnected}
              bankError={bankError}
            />
          )}

          {/* ── Schulden — begeleide ja/nee met altijd-uitgang ── */}
          {state.step === 'schulden' && (
            <OnboardingSchulden
              quickDebts={state.quickDebts}
              onDebtsChange={handleDebtsChange}
              onNext={goToNext}
              onBack={goToBack}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {/* ── Pensioen — schatting / upload / overslaan (optioneel) ── */}
          {state.step === 'pensioen' && (
            <OnboardingPensioen
              data={state.pension}
              onChange={(data) => dispatch({ type: 'SET_PENSION', data })}
              samenwonend={state.identity.household_type !== 'solo'}
              onNext={goToNext}
              onBack={goToBack}
              onSkip={() => {
                // "Kan altijd later nog" — wis de keuze en ga door (deferred).
                dispatch({ type: 'SET_PENSION', data: INITIAL_PENSION_DRAFT })
                goToNext()
              }}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
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
              monthlyExpenses={monthlyExpensesParsed}
              selectedGoals={state.selectedGoals}
              currentStep={currentContentStep}
              totalSteps={totalContentSteps}
            />
          )}

          {state.step === 'klaar' && (
            <OnboardingKlaar
              netMonthlyIncome={netMonthlyIncomeForKlaar}
              netWorth={netWorthForKlaar}
              assets={state.quickAssets}
              debts={state.quickDebts}
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
                // Hard navigation: voorkomt stale-read redirect-loop in (app)/layout.tsx
                // direct na het wegschrijven van `onboarding_completed = true`. Bij een
                // soft-navigation kan de server-layout de nét-geschreven row missen en
                // redirecten naar /onboarding, wat de Suspense-fallback laat knipperen
                // tot een browser-refresh de sessie opnieuw aligneert.
                window.location.assign('/toekomst')
              }}
            />
          )}
        </StepTransition>
      </div>
    </div>
  )
}
