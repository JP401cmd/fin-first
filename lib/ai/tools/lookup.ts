import { z } from 'zod'
import { tool } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Creates a lookup tool that queries real financial data from Supabase.
 * Allows the AI to query specific transactions, budgets, assets, or debts.
 */
export function createLookupTool(supabase: SupabaseClient) {
  return tool({
    description: 'Zoek specifieke financiële gegevens op: transacties, budgetten, assets of schulden. Gebruik dit wanneer de gebruiker vraagt naar details die niet in de context staan.',
    inputSchema: z.object({
      type: z.enum(['transactions', 'budgets', 'assets', 'debts']).describe('Welk type data op te zoeken'),
      query: z.string().optional().describe('Optionele zoekterm om te filteren (bijv. "Albert Heijn", "boodschappen")'),
      limit: z.number().optional().describe('Maximum aantal resultaten (default: 10)'),
    }),
    execute: async ({ type, query, limit }) => {
      const maxResults = limit ?? 10
      const q = query?.toLowerCase() ?? ''

      switch (type) {
        case 'transactions': {
          const queryBuilder = supabase
            .from('transactions')
            .select('date, amount, description, counterparty_name, is_income, budget:budgets(name, slug)')
            .order('date', { ascending: false })
            .limit(q ? 50 : maxResults)

          const { data } = await queryBuilder

          let txs = data ?? []
          if (q) {
            txs = txs.filter(
              (t) =>
                t.description?.toLowerCase().includes(q) ||
                t.counterparty_name?.toLowerCase().includes(q) ||
                (t.budget as { name?: string; slug?: string } | null)?.name?.toLowerCase().includes(q) ||
                (t.budget as { name?: string; slug?: string } | null)?.slug?.toLowerCase().includes(q)
            )
          }

          return txs.slice(0, maxResults).map((t) => ({
            date: t.date,
            amount: t.amount,
            description: t.description,
            counterparty: t.counterparty_name,
            category: (t.budget as { name?: string } | null)?.name ?? 'onbekend',
          }))
        }
        case 'budgets': {
          const now = new Date()
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
          const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

          const [budgetsRes, txRes] = await Promise.all([
            supabase
              .from('budgets')
              .select('id, name, slug, default_limit, budget_type, parent_id')
              .not('parent_id', 'is', null)
              .order('sort_order', { ascending: true }),
            supabase
              .from('transactions')
              .select('budget_id, amount')
              .gte('date', monthStart)
              .lt('date', monthEnd),
          ])

          const budgets = budgetsRes.data ?? []
          const txData = txRes.data ?? []

          const spendingMap: Record<string, number> = {}
          for (const t of txData) {
            if (t.budget_id) {
              spendingMap[t.budget_id] = (spendingMap[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
            }
          }

          let results = budgets.map((b) => ({
            name: b.name,
            limit: Number(b.default_limit),
            spent: spendingMap[b.id] ?? 0,
            pct: Number(b.default_limit) > 0
              ? Math.round(((spendingMap[b.id] ?? 0) / Number(b.default_limit)) * 100)
              : 0,
          }))

          if (q) {
            results = results.filter(
              (r) => r.name.toLowerCase().includes(q)
            )
          }

          return results.slice(0, maxResults)
        }
        case 'assets': {
          const queryBuilder = supabase
            .from('assets')
            .select('name, asset_type, current_value, expected_return, monthly_contribution')
            .eq('is_active', true)
            .order('current_value', { ascending: false })
            .limit(q ? 50 : maxResults)

          const { data } = await queryBuilder
          let assets = data ?? []

          if (q) {
            assets = assets.filter(
              (a) =>
                a.name.toLowerCase().includes(q) ||
                a.asset_type.toLowerCase().includes(q)
            )
          }

          return assets.slice(0, maxResults).map((a) => ({
            name: a.name,
            type: a.asset_type,
            value: a.current_value,
            return: a.expected_return,
            monthlyContribution: a.monthly_contribution,
          }))
        }
        case 'debts': {
          const queryBuilder = supabase
            .from('debts')
            .select('name, debt_type, current_balance, interest_rate, monthly_payment')
            .eq('is_active', true)
            .order('current_balance', { ascending: false })
            .limit(q ? 50 : maxResults)

          const { data } = await queryBuilder
          let debts = data ?? []

          if (q) {
            debts = debts.filter(
              (d) =>
                d.name.toLowerCase().includes(q) ||
                d.debt_type.toLowerCase().includes(q)
            )
          }

          return debts.slice(0, maxResults).map((d) => ({
            name: d.name,
            type: d.debt_type,
            balance: d.current_balance,
            rate: d.interest_rate,
            monthlyPayment: d.monthly_payment,
          }))
        }
      }
    },
  })
}
