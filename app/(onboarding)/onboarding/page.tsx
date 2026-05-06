'use client'

import { useState, useEffect, useReducer, useCallback, useMemo, useRef } from 'react'
import './onboarding.css'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { WillDots } from '@/components/app/will-dots'
import type { IdentityData } from '@/components/onboarding/onboarding-identity'
import type { HorizonData } from '@/components/onboarding/onboarding-horizon'
import type { AssetQuickInput, DebtQuickInput } from '@/lib/quick-add/types'

import { OnboardingIntro } from '@/components/onboarding/onboarding-intro'
import { OnboardingIdentity } from '@/components/onboarding/onboarding-identity'
import { OnboardingBudgets } from '@/components/onboarding/onboarding-budgets'
import { OnboardingBezittingen } from '@/components/onboarding/onboarding-bezittingen'
import { OnboardingGoal } from '@/components/onboarding/onboarding-goal'
import { OnboardingHorizon, INITIAL_HORIZON_DATA } from '@/components/onboarding/onboarding-horizon'
import { OnboardingNieuwsOnly, type ExtractionResult } from '@/components/onboarding/onboarding-nieuws-only'
import { OnboardingSuccess } from '@/components/onboarding/onboarding-success'
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

// ── Saving progress messages ─────────────────────────────────
const SAVING_MESSAGES = [
  'Profiel wordt opgeslagen...',
  'Budgetten worden aangemaakt...',
  'Bezittingen en schulden verwerken...',
  'Dashboard wordt geconfigureerd...',
  'Bijna klaar...',
]

// ── Types ────────────────────────────────────────────────────

type Step =
  | 'intro'
  | 'identity'
  | 'goal'
  | 'bezittingen'
  | 'budgets'
  | 'horizon'
  | 'nieuws_only'
  | 'saving'
  | 'success'

type Direction = 'forward' | 'back'

/**
 * Canonical order of every step that has ever existed in the flow, used as a
 * fallback anchor when a restored `lastStep` is no longer present in the
 * active step order. Keep this in sync with the `Step` union above.
 */
const CANONICAL_STEP_ORDER: readonly Step[] = [
  'intro',
  'identity',
  'goal',
  'bezittingen',
  'budgets',
  'horizon',
  'nieuws_only',
  'saving',
  'success',
] as const

/**
 * Self-healing restore: given a previously saved `lastStep` and the currently
 * active step order, return a step the user can actually land on. When the
 * saved step is no longer present in the active order (e.g. the flow changed
 * while the user had a draft in localStorage), we anchor on the saved step's
 * position in the canonical union and walk forward to the first valid step
 * the user has not yet passed, skipping the terminal `saving` / `success`
 * placeholders. As a last resort we fall back to `'identity'` — never
 * `'intro'`, because the presence of saved data means the user is already
 * past the intro.
 */
export function _resolveRestoredStep(lastStep: string | undefined, activeStepOrder: Step[]): {
  step: Step
  healed: boolean
} {
  const terminalSteps: Step[] = ['saving', 'success']
  const isSelectable = (s: Step): boolean => !terminalSteps.includes(s)

  // No saved step at all → start at identity (user already past intro if
  // we're restoring data).
  if (!lastStep) {
    return { step: 'identity', healed: false }
  }

  // Map legacy step names to their current equivalents so old localStorage
  // drafts resolve correctly even when this function is called directly.
  const LEGACY_STEP_MAP: Record<string, string> = {
    modules: 'goal',
    persona: 'goal',
    intent: 'goal', // Legacy: intent-stap is hernoemd naar goal (mei 2026)
    extras: 'bezittingen',
    preferences: 'horizon', // Legacy: preferences-stap is verwijderd; horizon is nu de laatste content-stap
  }
  // eslint-disable-next-line no-param-reassign
  if (LEGACY_STEP_MAP[lastStep]) lastStep = LEGACY_STEP_MAP[lastStep]

  // Happy path: saved step is still in the active order and not terminal.
  if (
    (activeStepOrder as string[]).includes(lastStep) &&
    isSelectable(lastStep as Step)
  ) {
    return { step: lastStep as Step, healed: false }
  }

  // Anchor on the saved step's position in the canonical union. If the name
  // is completely unknown (e.g. a removed step that was never part of the
  // union) the index is -1 and we fall all the way through to 'identity'.
  const canonicalIdx = (CANONICAL_STEP_ORDER as readonly string[]).indexOf(lastStep)

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
  // selectable step. We intentionally skip 'intro' because the user already
  // had persisted data — sending them back to the welcome screen would feel
  // like a full reset.
  const identityFallback = activeStepOrder.find((s) => s === 'identity')
  if (identityFallback) {
    return { step: 'identity', healed: true }
  }
  const firstSelectable = activeStepOrder.find(isSelectable)
  return { step: firstSelectable ?? 'identity', healed: true }
}

/**
 * Pick a safe navigation landing spot when the user's current step is not in
 * the active step order. Skips `intro` (user already past it) and the
 * terminal `saving` / `success` placeholders. Used by `goToNext` / `goToBack`
 * as a self-healing fallback so the navigation buttons never silently no-op.
 */
export function _firstNavigationRecoveryStep(activeStepOrder: Step[]): Step {
  const recovery = activeStepOrder.find(
    (s) => s !== 'intro' && s !== 'saving' && s !== 'success'
  )
  return recovery ?? activeStepOrder[0] ?? 'identity'
}

/**
 * Compute the dynamic step order based on which modules the user selected.
 *
 * - `bezittingen` toont *altijd* (behalve in news-only-flow): registreren van
 *   bezittingen en schulden is fundament-werk dat losstaat van module-keuze.
 *   Een gebruiker activeert in deze stap óók optioneel `budgetteren` (via de
 *   cash-asset-prompt) — de step-order reageert daarna op de nieuwe
 *   activeModules en `budgets` schuift erachter.
 * - `budgets` / `horizon` blijven module-gated.
 * - News-only: enkel de vrije-tekst-stap.
 */
function computeStepOrder(selectedModules: ModuleId[]): Step[] {
  const steps: Step[] = ['intro', 'identity', 'goal']
  const has = (m: ModuleId) => selectedModules.includes(m)
  const isNewsOnly = selectedModules.length === 1 && has('nieuws')

  if (isNewsOnly) {
    steps.push('nieuws_only')
  } else {
    steps.push('bezittingen')
    if (has('budgetteren')) steps.push('budgets')
    if (has('toekomstplannen')) steps.push('horizon')
  }

  steps.push('saving', 'success')
  return steps
}

/**
 * For steps in the "instellen" phase (between modules and saving), compute a
 * sub-step indicator like "1 of 3". Returns undefined for non-instellen steps.
 */
function getSubStep(step: Step, stepOrder: Step[]): { current: number; total: number } | undefined {
  const installenSteps = stepOrder.filter(
    (s) => !['intro', 'identity', 'goal', 'saving', 'success'].includes(s)
  )
  const idx = installenSteps.indexOf(step)
  if (idx === -1) return undefined
  return { current: idx + 1, total: installenSteps.length }
}

interface State {
  step: Step
  direction: Direction
  identity: IdentityData
  /** Sinds mei 2026: outcome-georiënteerde keuze die de oude `intent` vervangt. */
  goal: GoalSlug | null
  activeModules: ModuleId[]
  horizon: HorizonData
  newsDescription: string
  extraction: ExtractionResult | null
  budgetAmounts: Record<string, number>
  quickAssets: AssetQuickInput[]
  quickDebts: DebtQuickInput[]
}

/** Data portion of state that gets persisted to localStorage (excludes step/direction) */
interface PersistedData {
  identity: IdentityData
  /** Selected goal slug — primary keuze sinds mei 2026 */
  goal: GoalSlug | null
  /** @deprecated Use goal — kept for migration from old localStorage drafts */
  intent?: IntentId | null
  /** @deprecated Use goal — kept for migration from old localStorage drafts */
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
  /** Last step the user was on (to restore position) */
  lastStep?: Step
}

type Action =
  | { type: 'SET_STEP'; step: Step }
  | { type: 'SET_IDENTITY'; data: IdentityData }
  | { type: 'SET_GOAL'; goal: GoalSlug }
  /** Opt-out vanaf de goal-stap: zet activeModules op ['nieuws'] en clear goal. */
  | { type: 'SET_NEWS_ONLY' }
  | { type: 'TOGGLE_MODULE'; moduleId: ModuleId; enabled: boolean }
  /**
   * Activeer een module zónder goal te resetten. Gebruikt door contextuele
   * opt-ins zoals de budgetteren-prompt op de bezittingen-stap: de gebruiker
   * blijft binnen z'n gekozen doel, voegt alleen één module toe.
   */
  | { type: 'ENABLE_MODULE'; moduleId: ModuleId }
  | { type: 'SET_HORIZON'; data: HorizonData }
  | { type: 'SET_NEWS_DESCRIPTION'; value: string }
  | { type: 'SET_EXTRACTION'; data: ExtractionResult | null }
  | { type: 'SET_BUDGET_AMOUNTS'; amounts: Record<string, number> }
  | { type: 'SET_QUICK_ASSETS'; items: AssetQuickInput[] }
  | { type: 'SET_QUICK_DEBTS'; items: DebtQuickInput[] }
  | { type: 'RESTORE_STATE'; data: PersistedData }

export const _initialState: State = {
  step: 'intro',
  direction: 'forward',
  goal: null,
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
}

/** Map a legacy persisted intent (or persona) onto the new GoalSlug. */
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
      const stepOrder = computeStepOrder(state.activeModules)
      const oldIdx = stepOrder.indexOf(state.step)
      const newIdx = stepOrder.indexOf(action.step)
      const direction: Direction = newIdx >= oldIdx ? 'forward' : 'back'
      return { ...state, step: action.step, direction }
    }
    case 'SET_GOAL': {
      const modules = [...GOAL_MODULE_PRESETS[action.goal]]
      return { ...state, goal: action.goal, activeModules: modules }
    }
    case 'SET_NEWS_ONLY': {
      return { ...state, goal: null, activeModules: ['nieuws'] }
    }
    case 'TOGGLE_MODULE': {
      // Always allow toggling — clear goal to null since it no longer matches a preset
      const updated = action.enabled
        ? [...state.activeModules, action.moduleId]
        : state.activeModules.filter((m) => m !== action.moduleId)
      return { ...state, goal: null, activeModules: updated }
    }
    case 'ENABLE_MODULE': {
      if (state.activeModules.includes(action.moduleId)) return state
      return { ...state, activeModules: [...state.activeModules, action.moduleId] }
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
      const restoredGoal: GoalSlug | null =
        action.data.goal ?? migrateIntentToGoal(action.data.intent, action.data.persona)
      return {
        ...state,
        step: restoredStep,
        direction: 'forward',
        identity: action.data.identity,
        goal: restoredGoal,
        activeModules: restoredModules,
        horizon: action.data.horizon ?? INITIAL_HORIZON_DATA,
        newsDescription: action.data.newsDescription ?? '',
        extraction: action.data.extraction ?? null,
        budgetAmounts: action.data.budgetAmounts,
        quickAssets: action.data.quickAssets,
        quickDebts: action.data.quickDebts,
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
      goal: state.goal,
      activeModules: state.activeModules,
      horizon: state.horizon,
      newsDescription: state.newsDescription,
      extraction: state.extraction,
      budgetAmounts: state.budgetAmounts,
      quickAssets: state.quickAssets,
      quickDebts: state.quickDebts,
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

    // Migratie: een draft van vóór de QuickAddWizard-flow heeft `bankAccounts`,
    // `assets`, `debts` met de oude shape. Die items zijn niet 1:1 te mappen
    // op de nieuwe 3-velden-input zonder data te verzinnen — dus we droppen
    // ze. De gebruiker voegt opnieuw toe via de wizard. Acceptabel voor
    // onboarding (transient draft, geen permanente data).
    const data: PersistedData = {
      identity,
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
      lastStep: parsed.lastStep,
    }

    // Map old step names to new ones
    if (data.lastStep === ('persona' as string)) data.lastStep = 'goal'
    if (data.lastStep === ('modules' as string)) data.lastStep = 'goal'
    if (data.lastStep === ('intent' as string)) data.lastStep = 'goal'
    if (data.lastStep === ('extras' as string)) data.lastStep = 'bezittingen'

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

  const activeStepOrder = useMemo(() => computeStepOrder(state.activeModules), [state.activeModules])

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

  const currentSubStep = useMemo(() => getSubStep(state.step, activeStepOrder), [state.step, activeStepOrder])

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
      if (saved && (saved.identity.full_name || saved.identity.date_of_birth)) {
        dispatch({ type: 'RESTORE_STATE', data: saved })
        setRestoredNotice(true)
        // Auto-dismiss after 4 seconds
        setTimeout(() => setRestoredNotice(false), 4000)
      }

      setLoading(false)
    }
    check()
  }, [supabase, router])

  // Persist state to localStorage on every step change (except saving/success)
  useEffect(() => {
    if (['saving', 'success'].includes(state.step)) return
    // Only save if user has entered at least some data
    if (state.step !== 'intro') {
      saveToLocalStorage(state)
    }
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
          net_monthly_income: Number(identity.net_monthly_income),
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

      // Add chosen goal — primary signal voor de doel-stappen-flow
      if (state.goal) {
        body.selectedGoalSlug = state.goal
      }

      // Add news description if present
      if (state.newsDescription) {
        body.newsDescription = state.newsDescription
      }

      // Add user-reviewed extraction data if present (avoids re-running extraction server-side)
      if (state.extraction) {
        body.extractionData = state.extraction
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
        // eslint-disable-next-line no-console
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
      if (state.goal === 'bewust-leven' || state.goal === 'noodfonds') {
        try {
          const res = await fetch('/api/ai/recommendations/initial', { method: 'POST' })
          if (!res.ok) {
            // eslint-disable-next-line no-console
            console.error('[onboarding] AI pre-generation returned', res.status, res.statusText)
          }
        } catch (err) {
          // Non-blocking: log but don't prevent onboarding from completing
          // eslint-disable-next-line no-console
          console.error('[onboarding] AI pre-generation failed:', err)
        }
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
      // the first valid non-intro step instead of silently no-op'ing.
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
    // module combination would dead-end at 90% on
    // the progress bar (the saving step never triggers the POST itself).
    if (next === 'saving') {
      handleSaveOwnData()
      return
    }
    if (idx < activeStepOrder.length - 1) {
      dispatch({ type: 'SET_STEP', step: next })
    }
  }, [activeStepOrder, state.step, handleSaveOwnData])

  const dismissError = useCallback(() => setSaveError(null), [])

  // ── Render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-ed)] border-t-[var(--ink)]" />
      </div>
    )
  }

  const showHeader = !['intro', 'success', 'saving'].includes(state.step)

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-8 sm:justify-center sm:px-6 sm:py-12">
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
              ✓ Je eerder ingevulde gegevens zijn hersteld
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

      <div className={`w-full max-w-[480px] sm:max-w-[640px] ${saveError || restoredNotice ? 'mt-16' : ''}`}>
        {/* Logo / Header */}
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
          {state.step === 'intro' && (
            <OnboardingIntro onNext={goToNext} onLogout={handleLogout} />
          )}

          {state.step === 'identity' && (
            <OnboardingIdentity
              data={state.identity}
              onChange={(data) => dispatch({ type: 'SET_IDENTITY', data })}
              onNext={goToNext}
              onBack={goToBack}
            />
          )}

          {state.step === 'goal' && (
            <OnboardingGoal
              selectedGoal={state.goal}
              onSelect={(goal) => dispatch({ type: 'SET_GOAL', goal })}
              onNext={goToNext}
              onBack={goToBack}
              onNewsOnly={() => {
                // Skip naar nieuws-only flow: zet modules op ['nieuws'] +
                // spring naar 'nieuws_only'-stap.
                dispatch({ type: 'SET_NEWS_ONLY' })
                dispatch({ type: 'SET_STEP', step: 'nieuws_only' })
              }}
            />
          )}

          {state.step === 'bezittingen' && (
            <OnboardingBezittingen
              quickAssets={state.quickAssets}
              quickDebts={state.quickDebts}
              onAssetsChange={(items) => dispatch({ type: 'SET_QUICK_ASSETS', items })}
              onDebtsChange={(items) => dispatch({ type: 'SET_QUICK_DEBTS', items })}
              onNext={goToNext}
              onBack={goToBack}
              activeModules={state.activeModules}
              onActivateBudgetteren={() => dispatch({ type: 'ENABLE_MODULE', moduleId: 'budgetteren' })}
              subStep={currentSubStep}
            />
          )}

          {state.step === 'budgets' && (
            <OnboardingBudgets
              amounts={state.budgetAmounts}
              onChange={(amounts) => dispatch({ type: 'SET_BUDGET_AMOUNTS', amounts })}
              netIncome={Number(state.identity.net_monthly_income) || 0}
              householdType={state.identity.household_type}
              numberOfChildren={state.identity.number_of_children}
              onNext={goToNext}
              onBack={goToBack}
              subStep={currentSubStep}
            />
          )}

          {state.step === 'horizon' && (
            <OnboardingHorizon
              data={state.horizon}
              onChange={(data) => dispatch({ type: 'SET_HORIZON', data })}
              onNext={goToNext}
              onBack={goToBack}
              activeModules={state.activeModules}
              subStep={currentSubStep}
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
                const destination = state.goal
                  ? getGoalFirstWinPath(state.goal)
                  : getHomePath(state.activeModules)
                router.push(destination + '?welcome=1')
              }}
              activeModules={state.activeModules}
              goal={state.goal ?? undefined}
            />
          )}
        </StepTransition>
      </div>
    </div>
  )
}
