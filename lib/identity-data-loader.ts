// lib/identity-data-loader.ts
// Server-side data loader for the Identity page.
// Follows the same pattern as core-data-loader.ts and will-data-loader.ts.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeSovereigntyLevel } from '@/lib/feature-phases'
import { NL_SWR } from '@/lib/horizon-data'

// ── Result type ────────────────────────────────────────────────

export interface IdentityPageData {
  // Profile
  fullName: string
  dateOfBirth: string | null
  householdType: string
  temporalBalance: number
  isDemoUser: boolean

  // Sovereignty
  sovereigntyLevel: number
  financialData: {
    netWorth: number
    monthsCovered: number
    freedomPct: number
    hasConsumerDebt: boolean
  }

  // Check-in timeline
  completedMonths: string[]
}

// ── Loader ─────────────────────────────────────────────────────

export const loadIdentityData = cache(async (supabase: SupabaseClient): Promise<IdentityPageData> => {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Not authenticated')
  }

  // Profile data
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, household_type, temporal_balance, is_demo_user, date_of_birth')
    .eq('id', user.id)
    .single()

  const fullName = profile?.full_name ?? ''
  const householdType = profile?.household_type ?? 'solo'
  const temporalBalance = profile?.temporal_balance ?? 3
  const isDemoUser = profile?.is_demo_user ?? false
  const dateOfBirth = profile?.date_of_birth ?? null

  // Financial data for sovereignty level
  const nowD = new Date()
  const currentMonthStart = new Date(Date.UTC(nowD.getFullYear(), nowD.getMonth(), 1)).toISOString().split('T')[0]
  const prev3MonthStart = new Date(Date.UTC(nowD.getFullYear(), nowD.getMonth() - 3, 1)).toISOString().split('T')[0]

  const [assetsRes, debtsRes, txRes] = await Promise.all([
    supabase.from('assets').select('current_value').eq('is_active', true),
    supabase.from('debts').select('current_balance, debt_type').eq('is_active', true),
    supabase.from('transactions').select('amount, is_income').gte('date', prev3MonthStart).lt('date', currentMonthStart),
  ])

  const totalAssets = (assetsRes.data ?? []).reduce((s, a) => s + Number(a.current_value), 0)
  const debts = debtsRes.data ?? []
  const totalDebts = debts.reduce((s, d) => s + Number(d.current_balance), 0)
  const netWorth = totalAssets - totalDebts

  const expenses = (txRes.data ?? [])
    .filter(t => !t.is_income)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
  const months = Math.max(1, 3)
  const monthlyExpenses = expenses / months
  const monthsCovered = monthlyExpenses > 0 ? netWorth / monthlyExpenses : 0

  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = yearlyExpenses > 0 ? yearlyExpenses / NL_SWR : 0
  const freedomPct = fireTarget > 0 ? (netWorth / fireTarget) * 100 : 0

  const consumerDebtTypes = ['personal_loan', 'credit_card', 'revolving_credit', 'payment_plan', 'car_loan']
  const hasConsumerDebt = debts.some(d => consumerDebtTypes.includes(d.debt_type) && Number(d.current_balance) > 0)

  const sovereigntyLevel = computeSovereigntyLevel(netWorth, monthlyExpenses, freedomPct, hasConsumerDebt)

  // Check-in timeline (read directly from app_settings, same as the API route does)
  const { data: checkinRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', `monthly_checkin_${user.id}`)
    .maybeSingle()

  let completedMonths: string[] = []
  if (checkinRow?.value) {
    try {
      const parsed = typeof checkinRow.value === 'string' ? JSON.parse(checkinRow.value) : checkinRow.value
      completedMonths = parsed.completedMonths || []
    } catch { /* graceful fallback */ }
  }

  return {
    fullName,
    dateOfBirth,
    householdType,
    temporalBalance,
    isDemoUser,
    sovereigntyLevel,
    financialData: {
      netWorth,
      monthsCovered,
      freedomPct,
      hasConsumerDebt,
    },
    completedMonths,
  }
})
