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

import { OnboardingIntro } from '@/components/onboarding/onboarding-intro'
import { OnboardingIdentity } from '@/components/onboarding/onboarding-identity'
import { OnboardingBudgets } from '@/components/onboarding/onboarding-budgets'
import { OnboardingExtras } from '@/components/onboarding/onboarding-extras'
import { OnboardingPreferences, INITIAL_PREFERENCES, buildWidgetPrefsFromPreferences } from '@/components/onboarding/onboarding-preferences'
import { OnboardingSuccess } from '@/components/onboarding/onboarding-success'

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
  | 'budgets'
  | 'extras'
  | 'preferences'
  | 'saving'
  | 'success'

type Direction = 'forward' | 'back'

const FULL_STEP_ORDER: Step[] = ['intro', 'identity', 'extras', 'budgets', 'preferences', 'saving', 'success']

function getStepOrder(budgetteringMode: string): Step[] {
  if (budgetteringMode === 'none') {
    return FULL_STEP_ORDER.filter(s => s !== 'budgets')
  }
  return FULL_STEP_ORDER
}

interface State {
  step: Step
  direction: Direction
  identity: IdentityData
  budgetAmounts: Record<string, number>
  bankAccounts: BankAccountEntry[]
  assets: AssetEntry[]
  debts: DebtEntry[]
  preferences: PreferencesData
}

type Action =
  | { type: 'SET_STEP'; step: Step }
  | { type: 'SET_IDENTITY'; data: IdentityData }
  | { type: 'SET_BUDGET_AMOUNTS'; amounts: Record<string, number> }
  | { type: 'SET_BANK_ACCOUNTS'; items: BankAccountEntry[] }
  | { type: 'SET_ASSETS'; items: AssetEntry[] }
  | { type: 'SET_DEBTS'; items: DebtEntry[] }
  | { type: 'SET_PREFERENCES'; data: PreferencesData }

const initialState: State = {
  step: 'intro',
  direction: 'forward',
  identity: {
    full_name: '',
    date_of_birth: '',
    household_type: 'solo',
    number_of_children: 0,
    net_monthly_income: '',
    estimated_monthly_expenses: '',
    budgettering_mode: '',
    expected_return: 0.07,
    inflation_rate: 0.02,
    retirement_expense_method: 'essential_budgets',
    retirement_custom_amount: '',
    fire_end_strategy: 'deplete',
    fire_legacy_amount: '',
    fire_end_age: 90,
    temporal_balance: 3,
  },
  budgetAmounts: {},
  bankAccounts: [],
  assets: [],
  debts: [],
  preferences: INITIAL_PREFERENCES,
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_STEP': {
      const stepOrder = getStepOrder(state.identity.budgettering_mode)
      const oldIdx = stepOrder.indexOf(state.step)
      const newIdx = stepOrder.indexOf(action.step)
      const direction: Direction = newIdx >= oldIdx ? 'forward' : 'back'
      return { ...state, step: action.step, direction }
    }
    case 'SET_IDENTITY': {
      let newState = { ...state, identity: action.data }
      // When switching to no-budgets, clean up budget_cashflow from preferences
      if (action.data.budgettering_mode === 'none' && state.preferences.focuses.includes('budget_cashflow')) {
        newState = {
          ...newState,
          preferences: {
            ...newState.preferences,
            focuses: newState.preferences.focuses.filter(f => f !== 'budget_cashflow'),
          },
        }
      }
      return newState
    }
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

  const noBudgets = state.identity.budgettering_mode === 'none'
  const activeStepOrder = useMemo(() => getStepOrder(state.identity.budgettering_mode), [state.identity.budgettering_mode])

  // Check if already onboarded
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
        router.replace('/core')
        return
      }
      setLoading(false)
    }
    check()
  }, [supabase, router])

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

      // Determine budgettering mode from user's explicit choice in identity step
      const budgetteringMode = state.identity.budgettering_mode === 'none' ? 'none' : 'manual'

      const body: Record<string, unknown> = {
        identity: {
          ...identity,
          net_monthly_income: Number(identity.net_monthly_income),
          estimated_monthly_expenses: identity.estimated_monthly_expenses ? Number(identity.estimated_monthly_expenses) : undefined,
          budgettering_mode: undefined, // strip from identity — not a profile field
          retirement_custom_amount: identity.retirement_custom_amount ? Number(identity.retirement_custom_amount) : undefined,
          fire_legacy_amount: identity.fire_legacy_amount ? Number(identity.fire_legacy_amount) : undefined,
          fire_end_age: identity.fire_end_strategy === 'deplete' ? identity.fire_end_age : undefined,
        },
        budgetAmounts,
        widgetPrefs,
        budgetteringMode,
      }

      // Only send non-empty optional arrays
      const validBanks = bankAccounts.filter((a) => a.name && a.bank_name && a.balance)
      if (validBanks.length > 0) {
        body.bankAccounts = validBanks.map((a) => ({
          ...a,
          balance: Number(a.balance),
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
      // Go back to preferences step — all data is preserved in useReducer state
      dispatch({ type: 'SET_STEP', step: 'preferences' })
    } finally {
      setSaving(false)
    }
  }, [saving, state])

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

      <div className={`w-full max-w-[480px] sm:max-w-[640px] ${saveError ? 'mt-16' : ''}`}>
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
            <OnboardingIntro onNext={() => dispatch({ type: 'SET_STEP', step: 'identity' })} onLogout={handleLogout} />
          )}

          {state.step === 'identity' && (
            <OnboardingIdentity
              data={state.identity}
              onChange={(data) => dispatch({ type: 'SET_IDENTITY', data })}
              onNext={() => dispatch({ type: 'SET_STEP', step: 'extras' })}
              onBack={() => dispatch({ type: 'SET_STEP', step: 'intro' })}
              hideBudgets={noBudgets}
            />
          )}

          {state.step === 'extras' && (
            <OnboardingExtras
              bankAccounts={state.bankAccounts}
              assets={state.assets}
              debts={state.debts}
              onBankChange={(items) => dispatch({ type: 'SET_BANK_ACCOUNTS', items })}
              onAssetChange={(items) => dispatch({ type: 'SET_ASSETS', items })}
              onDebtChange={(items) => dispatch({ type: 'SET_DEBTS', items })}
              onNext={() => dispatch({ type: 'SET_STEP', step: noBudgets ? 'preferences' : 'budgets' })}
              onBack={() => dispatch({ type: 'SET_STEP', step: 'identity' })}
              hideBudgets={noBudgets}
            />
          )}

          {state.step === 'budgets' && (
            <OnboardingBudgets
              amounts={state.budgetAmounts}
              onChange={(amounts) => dispatch({ type: 'SET_BUDGET_AMOUNTS', amounts })}
              netIncome={Number(state.identity.net_monthly_income) || 0}
              householdType={state.identity.household_type}
              numberOfChildren={state.identity.number_of_children}
              onNext={() => dispatch({ type: 'SET_STEP', step: 'preferences' })}
              onBack={() => dispatch({ type: 'SET_STEP', step: 'extras' })}
            />
          )}

          {state.step === 'preferences' && (
            <OnboardingPreferences
              data={state.preferences}
              onChange={(data) => dispatch({ type: 'SET_PREFERENCES', data })}
              onNext={handleSaveOwnData}
              onBack={() => dispatch({ type: 'SET_STEP', step: noBudgets ? 'extras' : 'budgets' })}
              saving={saving}
              hideBudgetFocus={noBudgets}
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
            <OnboardingSuccess onDashboard={() => router.push('/core')} />
          )}
        </StepTransition>
      </div>
    </div>
  )
}
