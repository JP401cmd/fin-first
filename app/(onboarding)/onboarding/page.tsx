'use client'

import { useState, useEffect, useReducer, useCallback, useMemo } from 'react'
import './onboarding.css'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { WillDots } from '@/components/app/will-dots'
import type { IdentityData } from '@/components/onboarding/onboarding-identity'
import type { BankAccountEntry } from '@/components/onboarding/mini-bank-form'
import type { AssetEntry } from '@/components/onboarding/mini-asset-form'
import type { DebtEntry } from '@/components/onboarding/mini-debt-form'
import type { PreferencesData } from '@/components/onboarding/onboarding-preferences'
import type { HorizonData } from '@/components/onboarding/onboarding-horizon'

import { OnboardingIntro } from '@/components/onboarding/onboarding-intro'
import { OnboardingIdentity } from '@/components/onboarding/onboarding-identity'
import { OnboardingBudgets } from '@/components/onboarding/onboarding-budgets'
import { OnboardingExtras } from '@/components/onboarding/onboarding-extras'
import { OnboardingPreferences, INITIAL_PREFERENCES, buildWidgetPrefsFromPreferences } from '@/components/onboarding/onboarding-preferences'
import { OnboardingModules } from '@/components/onboarding/onboarding-persona'
import { OnboardingHorizon, INITIAL_HORIZON_DATA } from '@/components/onboarding/onboarding-horizon'
import { OnboardingNieuwsOnly } from '@/components/onboarding/onboarding-nieuws-only'
import { OnboardingSuccess } from '@/components/onboarding/onboarding-success'
import { type PersonaId, type ModuleId, PERSONA_MODULE_PRESETS, getHomePath } from '@/lib/module-registry'

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
  | 'modules'
  | 'bezittingen'
  | 'budgets'
  | 'horizon'
  | 'preferences'
  | 'nieuws_only'
  | 'saving'
  | 'success'

type Direction = 'forward' | 'back'

/**
 * Compute the dynamic step order based on which modules the user selected.
 * Steps are only included when the corresponding module is active.
 * Special case: if only 'nieuws' is selected, show a single nieuws_only step.
 */
function computeStepOrder(selectedModules: ModuleId[]): Step[] {
  const steps: Step[] = ['intro', 'identity', 'modules']
  const has = (m: ModuleId) => selectedModules.includes(m)
  const isNewsOnly = selectedModules.length === 1 && has('nieuws')

  if (isNewsOnly) {
    steps.push('nieuws_only')
  } else {
    if (has('vermogensregistratie') || has('budgetteren')) steps.push('bezittingen')
    if (has('budgetteren')) steps.push('budgets')
    if (has('toekomstplannen')) steps.push('horizon')
    if (has('inzicht_acties')) steps.push('preferences')
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
    (s) => !['intro', 'identity', 'modules', 'saving', 'success'].includes(s)
  )
  const idx = installenSteps.indexOf(step)
  if (idx === -1) return undefined
  return { current: idx + 1, total: installenSteps.length }
}

interface State {
  step: Step
  direction: Direction
  identity: IdentityData
  persona: PersonaId | null
  selectedModules: ModuleId[]
  horizon: HorizonData
  newsDescription: string
  budgetAmounts: Record<string, number>
  bankAccounts: BankAccountEntry[]
  assets: AssetEntry[]
  debts: DebtEntry[]
  preferences: PreferencesData
}

/** Data portion of state that gets persisted to localStorage (excludes step/direction) */
interface PersistedData {
  identity: IdentityData
  persona: PersonaId | null
  selectedModules: ModuleId[]
  horizon?: HorizonData
  newsDescription?: string
  budgetAmounts: Record<string, number>
  bankAccounts: BankAccountEntry[]
  assets: AssetEntry[]
  debts: DebtEntry[]
  preferences: PreferencesData
  /** Last step the user was on (to restore position) */
  lastStep?: Step
}

type Action =
  | { type: 'SET_STEP'; step: Step }
  | { type: 'SET_IDENTITY'; data: IdentityData }
  | { type: 'SET_PERSONA'; persona: PersonaId }
  | { type: 'TOGGLE_MODULE'; moduleId: ModuleId; enabled: boolean }
  | { type: 'SET_HORIZON'; data: HorizonData }
  | { type: 'SET_NEWS_DESCRIPTION'; value: string }
  | { type: 'SET_BUDGET_AMOUNTS'; amounts: Record<string, number> }
  | { type: 'SET_BANK_ACCOUNTS'; items: BankAccountEntry[] }
  | { type: 'SET_ASSETS'; items: AssetEntry[] }
  | { type: 'SET_DEBTS'; items: DebtEntry[] }
  | { type: 'SET_PREFERENCES'; data: PreferencesData }
  | { type: 'RESTORE_STATE'; data: PersistedData }

const initialState: State = {
  step: 'intro',
  direction: 'forward',
  persona: null,
  selectedModules: [],
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
  budgetAmounts: {},
  bankAccounts: [],
  assets: [],
  debts: [],
  preferences: INITIAL_PREFERENCES,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_STEP': {
      const stepOrder = computeStepOrder(state.selectedModules)
      const oldIdx = stepOrder.indexOf(state.step)
      const newIdx = stepOrder.indexOf(action.step)
      const direction: Direction = newIdx >= oldIdx ? 'forward' : 'back'
      return { ...state, step: action.step, direction }
    }
    case 'SET_PERSONA': {
      const modules = [...PERSONA_MODULE_PRESETS[action.persona]]
      return { ...state, persona: action.persona, selectedModules: modules }
    }
    case 'TOGGLE_MODULE': {
      // Always allow toggling — clear persona to null since it no longer matches a preset
      const updated = action.enabled
        ? [...state.selectedModules, action.moduleId]
        : state.selectedModules.filter((m) => m !== action.moduleId)
      return { ...state, persona: null, selectedModules: updated }
    }
    case 'SET_IDENTITY':
      return { ...state, identity: action.data }
    case 'SET_HORIZON':
      return { ...state, horizon: action.data }
    case 'SET_NEWS_DESCRIPTION':
      return { ...state, newsDescription: action.value }
    case 'SET_BUDGET_AMOUNTS':
      return { ...state, budgetAmounts: action.amounts }
    case 'SET_BANK_ACCOUNTS':
      return { ...state, bankAccounts: action.items }
    case 'SET_ASSETS':
      return { ...state, assets: action.items }
    case 'SET_DEBTS':
      return { ...state, debts: action.items }
    case 'SET_PREFERENCES':
      return { ...state, preferences: action.data }
    case 'RESTORE_STATE': {
      const restoredStep = action.data.lastStep && !['saving', 'success'].includes(action.data.lastStep)
        ? action.data.lastStep
        : 'identity'
      return {
        ...state,
        step: restoredStep as Step,
        direction: 'forward',
        identity: action.data.identity,
        persona: action.data.persona ?? null,
        selectedModules: action.data.selectedModules ?? [],
        horizon: action.data.horizon ?? INITIAL_HORIZON_DATA,
        newsDescription: action.data.newsDescription ?? '',
        budgetAmounts: action.data.budgetAmounts,
        bankAccounts: action.data.bankAccounts,
        assets: action.data.assets,
        debts: action.data.debts,
        preferences: action.data.preferences,
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
      persona: state.persona,
      selectedModules: state.selectedModules,
      horizon: state.horizon,
      newsDescription: state.newsDescription,
      budgetAmounts: state.budgetAmounts,
      bankAccounts: state.bankAccounts,
      assets: state.assets,
      debts: state.debts,
      preferences: state.preferences,
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

    const data: PersistedData = {
      identity,
      persona: parsed.persona ?? null,
      selectedModules: Array.isArray(parsed.selectedModules) ? parsed.selectedModules : [],
      horizon,
      newsDescription: parsed.newsDescription,
      budgetAmounts: parsed.budgetAmounts && typeof parsed.budgetAmounts === 'object' ? parsed.budgetAmounts : {},
      bankAccounts: Array.isArray(parsed.bankAccounts) ? parsed.bankAccounts : [],
      assets: Array.isArray(parsed.assets) ? parsed.assets : [],
      debts: Array.isArray(parsed.debts) ? parsed.debts : [],
      preferences: parsed.preferences ?? INITIAL_PREFERENCES,
      lastStep: parsed.lastStep,
    }

    // Map old step names to new ones
    if (data.lastStep === ('persona' as string)) data.lastStep = 'modules'
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
  const [state, dispatch] = useReducer(reducer, initialState)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveProgress, setSaveProgress] = useState(0)
  const [saveMessageIdx, setSaveMessageIdx] = useState(0)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [restoredNotice, setRestoredNotice] = useState(false)

  const activeStepOrder = useMemo(() => computeStepOrder(state.selectedModules), [state.selectedModules])

  const goToNext = useCallback(() => {
    const idx = activeStepOrder.indexOf(state.step)
    if (idx < activeStepOrder.length - 1) {
      dispatch({ type: 'SET_STEP', step: activeStepOrder[idx + 1] })
    }
  }, [activeStepOrder, state.step])

  const goToBack = useCallback(() => {
    const idx = activeStepOrder.indexOf(state.step)
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
      const { identity, budgetAmounts, bankAccounts, assets, debts, preferences } = state

      // Build widget prefs from user preferences
      const widgetPrefs = buildWidgetPrefsFromPreferences(preferences)

      // Generate idempotency key to prevent duplicate saves on retry
      const idempotencyKey = crypto.randomUUID()

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
        widgetPrefs,
        idempotencyKey,
        activeModules: state.selectedModules.length > 0 ? state.selectedModules : undefined,
      }

      // Add horizon data if toekomstplannen is active
      if (state.selectedModules.includes('toekomstplannen')) {
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

      // Add news description if present
      if (state.newsDescription) {
        body.newsDescription = state.newsDescription
      }

      // Derive budgettering mode from modules
      const budgetteringMode = state.selectedModules.includes('budgetteren') ? 'manual' : 'none'
      body.budgetteringMode = budgetteringMode

      // Only send non-empty optional arrays
      const validBanks = bankAccounts.filter((a) => a.name && a.bank_name && a.balance)
      if (validBanks.length > 0) {
        body.bankAccounts = validBanks.map((a) => ({
          ...a,
          balance: Number(a.balance),
          has_budget_tracking: a.has_budget_tracking,
        }))
      }

      const validAssets = assets.filter((a) => a.name && a.current_value)
      if (validAssets.length > 0) {
        body.assets = validAssets.map((a) => ({
          name: a.name,
          asset_type: a.asset_type,
          current_value: Number(a.current_value),
          purchase_value: Number(a.purchase_value) || Number(a.current_value),
          expected_return: Number(a.expected_return) || 0,
          monthly_contribution: Number(a.monthly_contribution) || 0,
          institution: a.institution || undefined,
          subtype: a.subtype || undefined,
          risk_profile: a.risk_profile || undefined,
          tax_benefit: a.tax_benefit || undefined,
          is_liquid: a.is_liquid,
          lock_end_date: a.lock_end_date || undefined,
          ticker_symbol: a.ticker_symbol || undefined,
          rental_income: a.rental_income ? Number(a.rental_income) : undefined,
          woz_value: a.woz_value ? Number(a.woz_value) : undefined,
          retirement_provider_type: a.retirement_provider_type || undefined,
          depreciation_rate: a.depreciation_rate ? Number(a.depreciation_rate) : undefined,
          address_postcode: a.address_postcode || undefined,
          address_house_number: a.address_house_number || undefined,
        }))
      }

      const validDebts = debts.filter((d) => d.name && d.current_balance)
      if (validDebts.length > 0) {
        body.debts = validDebts.map((d) => ({
          name: d.name,
          debt_type: d.debt_type,
          original_amount: Number(d.original_amount) || Number(d.current_balance),
          current_balance: Number(d.current_balance),
          interest_rate: Number(d.interest_rate) || 0,
          minimum_payment: Number(d.minimum_payment) || Number(d.monthly_payment) || 0,
          monthly_payment: Number(d.monthly_payment) || 0,
          creditor: d.creditor || undefined,
          subtype: d.subtype || undefined,
          repayment_type: d.repayment_type || undefined,
          is_tax_deductible: d.is_tax_deductible || undefined,
          fixed_rate_end_date: d.fixed_rate_end_date || undefined,
          nhg: d.nhg || undefined,
          credit_limit: d.credit_limit ? Number(d.credit_limit) : undefined,
          draagkrachtmeting_date: d.draagkrachtmeting_date || undefined,
        }))
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
        throw new Error(data.error || 'Opslaan mislukt')
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

          {state.step === 'modules' && (
            <OnboardingModules
              selectedPersona={state.persona}
              selectedModules={state.selectedModules}
              onSelectPersona={(p) => dispatch({ type: 'SET_PERSONA', persona: p })}
              onToggleModule={(id, enabled) => dispatch({ type: 'TOGGLE_MODULE', moduleId: id, enabled })}
              onNext={goToNext}
              onBack={goToBack}
            />
          )}

          {state.step === 'bezittingen' && (
            <OnboardingExtras
              bankAccounts={state.bankAccounts}
              assets={state.assets}
              debts={state.debts}
              onBankChange={(items) => dispatch({ type: 'SET_BANK_ACCOUNTS', items })}
              onAssetChange={(items) => dispatch({ type: 'SET_ASSETS', items })}
              onDebtChange={(items) => dispatch({ type: 'SET_DEBTS', items })}
              onNext={goToNext}
              onBack={goToBack}
              activeModules={state.selectedModules}
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
              activeModules={state.selectedModules}
              subStep={currentSubStep}
            />
          )}

          {state.step === 'preferences' && (
            <OnboardingPreferences
              data={state.preferences}
              onChange={(data) => dispatch({ type: 'SET_PREFERENCES', data })}
              onNext={handleSaveOwnData}
              onBack={goToBack}
              saving={saving}
              activeModules={state.selectedModules}
              subStep={currentSubStep}
            />
          )}

          {state.step === 'nieuws_only' && (
            <OnboardingNieuwsOnly
              description={state.newsDescription}
              onChange={(value) => dispatch({ type: 'SET_NEWS_DESCRIPTION', value })}
              onNext={handleSaveOwnData}
              onBack={goToBack}
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
                router.push(getHomePath(state.selectedModules))
              }}
              activeModules={state.selectedModules}
            />
          )}
        </StepTransition>
      </div>
    </div>
  )
}
