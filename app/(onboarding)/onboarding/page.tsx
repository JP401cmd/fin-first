'use client'

import { useState, useEffect, useReducer } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { IdentityData } from '@/components/onboarding/onboarding-identity'
import type { BankAccountEntry } from '@/components/onboarding/mini-bank-form'
import type { AssetEntry } from '@/components/onboarding/mini-asset-form'
import type { DebtEntry } from '@/components/onboarding/mini-debt-form'

import { OnboardingIntro } from '@/components/onboarding/onboarding-intro'
import { OnboardingIdentity } from '@/components/onboarding/onboarding-identity'
import { OnboardingBudgets } from '@/components/onboarding/onboarding-budgets'
import { OnboardingExtras } from '@/components/onboarding/onboarding-extras'
import { OnboardingSuccess } from '@/components/onboarding/onboarding-success'

// ── Types ────────────────────────────────────────────────────

type Step =
  | 'intro'
  | 'identity'
  | 'budgets'
  | 'extras'
  | 'saving'
  | 'success'

interface State {
  step: Step
  identity: IdentityData
  budgetAmounts: Record<string, number>
  bankAccounts: BankAccountEntry[]
  assets: AssetEntry[]
  debts: DebtEntry[]
}

type Action =
  | { type: 'SET_STEP'; step: Step }
  | { type: 'SET_IDENTITY'; data: IdentityData }
  | { type: 'SET_BUDGET_AMOUNTS'; amounts: Record<string, number> }
  | { type: 'SET_BANK_ACCOUNTS'; items: BankAccountEntry[] }
  | { type: 'SET_ASSETS'; items: AssetEntry[] }
  | { type: 'SET_DEBTS'; items: DebtEntry[] }

const initialState: State = {
  step: 'intro',
  identity: {
    full_name: '',
    date_of_birth: '',
    household_type: 'solo',
    number_of_children: 0,
    net_monthly_income: '',
    expected_return: 0.07,
    inflation_rate: 0.02,
    retirement_expense_method: 'essential_budgets',
    retirement_custom_amount: '',
    fire_end_strategy: 'deplete',
  },
  budgetAmounts: {},
  bankAccounts: [],
  assets: [],
  debts: [],
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step }
    case 'SET_IDENTITY':
      return { ...state, identity: action.data }
    case 'SET_BUDGET_AMOUNTS':
      return { ...state, budgetAmounts: action.amounts }
    case 'SET_BANK_ACCOUNTS':
      return { ...state, bankAccounts: action.items }
    case 'SET_ASSETS':
      return { ...state, assets: action.items }
    case 'SET_DEBTS':
      return { ...state, debts: action.items }
    default:
      return state
  }
}

// ── Main Component ───────────────────────────────────────────

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()
  const [state, dispatch] = useReducer(reducer, initialState)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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
        router.replace('/dashboard')
        return
      }
      setLoading(false)
    }
    check()
  }, [supabase, router])

  // ── Handlers ─────────────────────────────────────────────────

  async function handleSaveOwnData() {
    // Prevent double-submit: if already saving, ignore subsequent calls
    if (saving) return
    setSaving(true)
    dispatch({ type: 'SET_STEP', step: 'saving' })

    try {
      const { identity, budgetAmounts, bankAccounts, assets, debts } = state

      const body: Record<string, unknown> = {
        identity: {
          ...identity,
          net_monthly_income: Number(identity.net_monthly_income),
          retirement_custom_amount: identity.retirement_custom_amount ? Number(identity.retirement_custom_amount) : undefined,
        },
        budgetAmounts,
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

      const res = await fetch('/api/onboarding/save-own-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Opslaan mislukt')
      }

      dispatch({ type: 'SET_STEP', step: 'success' })
    } catch (err) {
      dispatch({ type: 'SET_STEP', step: 'budgets' })
    } finally {
      setSaving(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
      </div>
    )
  }

  const showHeader = !['intro', 'success', 'saving'].includes(state.step)

  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-8 sm:justify-center sm:px-6 sm:py-12">
      <div className="w-full max-w-[480px] sm:max-w-[640px]">
        {/* Logo / Header */}
        {showHeader && (
          <div className="mb-10 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 via-teal-400 to-purple-500">
              <span className="text-2xl font-black text-white">T</span>
            </div>
            <h1 className="text-3xl font-bold text-zinc-900">TriFinity</h1>
          </div>
        )}

        {state.step === 'intro' && (
          <OnboardingIntro onNext={() => dispatch({ type: 'SET_STEP', step: 'identity' })} />
        )}

        {state.step === 'identity' && (
          <OnboardingIdentity
            data={state.identity}
            onChange={(data) => dispatch({ type: 'SET_IDENTITY', data })}
            onNext={() => dispatch({ type: 'SET_STEP', step: 'extras' })}
            onBack={() => dispatch({ type: 'SET_STEP', step: 'intro' })}
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
            onNext={() => dispatch({ type: 'SET_STEP', step: 'budgets' })}
            onSkip={() => dispatch({ type: 'SET_STEP', step: 'budgets' })}
            onBack={() => dispatch({ type: 'SET_STEP', step: 'identity' })}
          />
        )}

        {state.step === 'budgets' && (
          <OnboardingBudgets
            amounts={state.budgetAmounts}
            onChange={(amounts) => dispatch({ type: 'SET_BUDGET_AMOUNTS', amounts })}
            netIncome={Number(state.identity.net_monthly_income) || 0}
            householdType={state.identity.household_type}
            numberOfChildren={state.identity.number_of_children}
            onNext={handleSaveOwnData}
            onBack={() => dispatch({ type: 'SET_STEP', step: 'extras' })}
            saving={saving}
          />
        )}

        {state.step === 'saving' && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-teal-600" />
            <p className="text-sm text-zinc-600">Je gegevens worden opgeslagen...</p>
          </div>
        )}

        {state.step === 'success' && (
          <OnboardingSuccess onDashboard={() => router.push('/dashboard')} />
        )}
      </div>
    </div>
  )
}
