import { z } from 'zod'
import { tool } from 'ai'
import { getTestTransactions } from '@/lib/transaction-data'
import { getDefaultBudgets, getMockSpending } from '@/lib/budget-data'
import { getDefaultAssets } from '@/lib/asset-data'
import { getDefaultDebts } from '@/lib/debt-data'

/**
 * Lookup tool for searching financial data on demand.
 * Allows the AI to query specific transactions, budgets, or assets.
 */
export const lookupTool = tool({
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
        let txs = getTestTransactions()
        if (q) {
          txs = txs.filter(
            (t) =>
              t.description.toLowerCase().includes(q) ||
              t.counterparty_name.toLowerCase().includes(q) ||
              t.budgetSlug.toLowerCase().includes(q)
          )
        }
        return txs.slice(0, maxResults).map((t) => ({
          date: t.date,
          amount: t.amount,
          description: t.description,
          counterparty: t.counterparty_name,
          category: t.budgetSlug,
        }))
      }
      case 'budgets': {
        const budgets = getDefaultBudgets()
        const spending = getMockSpending(0)
        const results: { name: string; limit: number; spent: number; pct: number }[] = []
        for (const parent of budgets) {
          for (const child of parent.children ?? []) {
            if (q && !child.name.toLowerCase().includes(q) && !child.slug.toLowerCase().includes(q)) continue
            const spent = spending[child.name] ?? 0
            results.push({
              name: child.name,
              limit: child.default_limit,
              spent,
              pct: child.default_limit > 0 ? Math.round((spent / child.default_limit) * 100) : 0,
            })
          }
        }
        return results.slice(0, maxResults)
      }
      case 'assets': {
        let assets = getDefaultAssets()
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
        let debts = getDefaultDebts()
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
