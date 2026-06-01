// lib/vaste-lasten-summary.ts
// Gedeelde bron-van-waarheid voor de vaste-lasten-samenvatting: confirmed
// recurring_transactions (amount < 0, niet 'excluded') + auto-detectie over de
// laatste 12 maanden transacties. Geëxtraheerd uit app/api/subscriptions/route.ts
// zodat zowel die API (de Vaste-lasten-pagina) als de cashflow-landingskaart
// EXACT hetzelfde totaal tonen — voorheen telde de kaart alleen confirmed rows
// en miste auto-gedetecteerde vaste lasten.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  detectRecurringTransactions,
  detectCategory,
  CATEGORY_LABELS,
  type RecurringCategory,
} from '@/lib/recurring-detection'

const SUBSCRIPTION_CATEGORIES: RecurringCategory[] = ['subscription']
const VASTE_KOSTEN_CATEGORIES: RecurringCategory[] = [
  'rent', 'mortgage', 'utility', 'insurance', 'transport', 'taxes',
  'childcare', 'housing_other', 'healthcare', 'donation', 'loan',
]

export interface VasteLastenItem {
  id: string
  name: string
  averageAmount: number
  monthlyAmount: number
  frequency: 'monthly' | 'weekly' | 'quarterly' | 'yearly'
  nextDate: string | null
  confidence: 'low' | 'medium' | 'high'
  isVariableAmount: boolean
  occurrences: number | null
  alreadyConfirmed: boolean
  category: RecurringCategory
  categoryLabel: string
  categoryOverride: string | null
}

export interface VasteLastenSummary {
  subscriptions: VasteLastenItem[]
  vasteKosten: VasteLastenItem[]
  totalMonthlySubscriptions: number
  totalMonthlyVasteKosten: number
  totalMonthly: number
  count: number
}

const EMPTY: VasteLastenSummary = {
  subscriptions: [],
  vasteKosten: [],
  totalMonthlySubscriptions: 0,
  totalMonthlyVasteKosten: 0,
  totalMonthly: 0,
  count: 0,
}

function toMonthly(amount: number, frequency: string): number {
  const abs = Math.abs(amount)
  switch (frequency) {
    case 'weekly':
      return (abs * 52) / 12
    case 'quarterly':
      return abs / 3
    case 'yearly':
      return abs / 12
    default:
      return abs // monthly
  }
}

/**
 * Detecteert vaste lasten uit de laatste 12 maanden transactie-historie +
 * confirmed recurring_transactions. Queries zijn RLS-gescoped op de ingelogde
 * gebruiker. `cache()` dedupt per request.
 */
export const loadVasteLastenSummary = cache(
  async (supabase: SupabaseClient): Promise<VasteLastenSummary> => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return EMPTY

    const now = new Date()
    const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    const startDateStr = startDate.toISOString().split('T')[0]

    const [txResult, recurringResult, budgetResult] = await Promise.all([
      supabase
        .from('transactions')
        .select('id, date, amount, description, counterparty_name, is_income, budget_id, transaction_type')
        .gte('date', startDateStr)
        .order('date', { ascending: true }),
      supabase
        .from('recurring_transactions')
        .select('id, counterparty_name, amount, name, frequency, category_override')
        .eq('is_active', true),
      supabase
        .from('budgets')
        .select('id, name, parent_id, budget_type')
        .order('sort_order', { ascending: true }),
    ])

    const transactions = txResult.data ?? []
    const existingRecurrings = recurringResult.data ?? []
    const budgets = budgetResult.data ?? []

    // Confirmed recurring items uit DB (alleen uitgaven: amount < 0), exclusief
    // door de gebruiker als 'excluded' gemarkeerde items.
    const confirmedItems: VasteLastenItem[] = existingRecurrings
      .filter((r) => Number(r.amount) < 0 && r.category_override !== 'excluded')
      .map((r) => {
        const name = r.name || r.counterparty_name || 'Onbekend'
        const autoCategory = detectCategory(r.counterparty_name ?? '', name, false)
        const category: RecurringCategory = r.category_override === 'subscription'
          ? 'subscription'
          : r.category_override === 'vaste_kosten'
            ? 'other_expense'
            : autoCategory
        return {
          id: r.id,
          name,
          averageAmount: Math.abs(Number(r.amount)),
          monthlyAmount: toMonthly(Number(r.amount), r.frequency ?? 'monthly'),
          frequency: (r.frequency ?? 'monthly') as VasteLastenItem['frequency'],
          nextDate: null,
          confidence: 'high',
          isVariableAmount: false,
          occurrences: null,
          alreadyConfirmed: true,
          category,
          categoryLabel: CATEGORY_LABELS[category],
          categoryOverride: r.category_override ?? null,
        }
      })

    if (transactions.length < 3) {
      const subs = confirmedItems.filter((i) => SUBSCRIPTION_CATEGORIES.includes(i.category))
      const vk = confirmedItems.filter(
        (i) => VASTE_KOSTEN_CATEGORIES.includes(i.category) || i.category === 'other_expense',
      )
      const totalSubs = subs.reduce((s, i) => s + i.monthlyAmount, 0)
      const totalVK = vk.reduce((s, i) => s + i.monthlyAmount, 0)
      return {
        subscriptions: subs,
        vasteKosten: vk,
        totalMonthlySubscriptions: Math.round(totalSubs * 100) / 100,
        totalMonthlyVasteKosten: Math.round(totalVK * 100) / 100,
        totalMonthly: Math.round((totalSubs + totalVK) * 100) / 100,
        count: subs.length + vk.length,
      }
    }

    const allDetected = detectRecurringTransactions(
      transactions.map((t) => ({
        id: t.id,
        date: t.date,
        amount: Number(t.amount),
        description: t.description ?? '',
        counterparty_name: t.counterparty_name ?? null,
        is_income: t.is_income ?? false,
        budget_id: t.budget_id ?? null,
        transaction_type: t.transaction_type ?? null,
      })),
      existingRecurrings,
      budgets,
    )

    const relevantCategories = [...SUBSCRIPTION_CATEGORIES, ...VASTE_KOSTEN_CATEGORIES]
    const detected = allDetected.filter(
      (d) =>
        relevantCategories.includes(d.suggestedCategory) &&
        !d.isIncome &&
        d.confidence !== 'low',
    )
    const detectedOther = allDetected.filter(
      (d) => d.suggestedCategory === 'other_expense' && !d.isIncome && d.confidence !== 'low',
    )

    const detectedItems: VasteLastenItem[] = [...detected, ...detectedOther].map((d) => ({
      id: d.key,
      name: d.counterpartyName || d.commonDescription,
      averageAmount: Math.abs(d.averageAmount),
      monthlyAmount: toMonthly(d.averageAmount, d.frequency),
      frequency: d.frequency,
      nextDate: null,
      confidence: d.confidence,
      isVariableAmount: d.isVariableAmount,
      occurrences: d.occurrences,
      alreadyConfirmed: d.alreadyExists,
      category: d.suggestedCategory,
      categoryLabel: CATEGORY_LABELS[d.suggestedCategory],
      categoryOverride: null,
    }))

    const newDetections = detectedItems.filter((s) => !s.alreadyConfirmed)
    const allItems = [
      ...confirmedItems.filter(
        (i) => relevantCategories.includes(i.category) || i.category === 'other_expense',
      ),
      ...newDetections,
    ]

    const subscriptions = allItems.filter(
      (i) =>
        i.categoryOverride === 'subscription' ||
        (!i.categoryOverride && SUBSCRIPTION_CATEGORIES.includes(i.category)),
    )
    const vasteKosten = allItems.filter(
      (i) =>
        i.categoryOverride === 'vaste_kosten' ||
        (!i.categoryOverride &&
          (VASTE_KOSTEN_CATEGORIES.includes(i.category) || i.category === 'other_expense')),
    )
    const totalSubs = subscriptions.reduce((s, i) => s + i.monthlyAmount, 0)
    const totalVK = vasteKosten.reduce((s, i) => s + i.monthlyAmount, 0)

    return {
      subscriptions,
      vasteKosten,
      totalMonthlySubscriptions: Math.round(totalSubs * 100) / 100,
      totalMonthlyVasteKosten: Math.round(totalVK * 100) / 100,
      totalMonthly: Math.round((totalSubs + totalVK) * 100) / 100,
      count: subscriptions.length + vasteKosten.length,
    }
  },
)
