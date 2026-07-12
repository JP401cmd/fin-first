import { z } from 'zod'
import { tool } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import { localMonthBounds } from '@/lib/month-range'
import { buildBudgetSpendingMap, spentForBudget } from '@/lib/budget-spending'
import { sanitizeForAI, type SanitizeOptions } from '@/lib/ai/sanitize'

/**
 * Creates a lookup tool that queries real financial data from Supabase.
 * Allows the AI to query specific transactions, budgets, assets, or debts.
 *
 * PRIVACY: the tool-result is re-injected into the model in the multi-step
 * loop AFTER the one-time context sanitize in the chat route, so every free
 * string it returns (transaction description/counterparty, asset/debt/budget
 * name) is run through `sanitizeForAI` here — otherwise IBANs, e-mails and the
 * user's own name would reach the provider unfiltered. Merchant names are kept
 * (accepted residual: needed for the answer, and a business identifier).
 */
export function createLookupTool(supabase: SupabaseClient) {
  // Load the sanitize options (own name + date of birth) once per request and
  // memoise — `execute` can run multiple times within a single step-loop.
  let sanitizeOptsPromise: Promise<SanitizeOptions> | null = null
  const loadSanitizeOpts = (): Promise<SanitizeOptions> => {
    if (!sanitizeOptsPromise) {
      sanitizeOptsPromise = (async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (!user) return {}
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, date_of_birth')
            .eq('id', user.id)
            .single()
          const opts: SanitizeOptions = {}
          if (profile?.full_name) opts.names = [profile.full_name]
          if (profile?.date_of_birth) opts.dateOfBirth = profile.date_of_birth
          return opts
        } catch {
          // Fail-safe: if we cannot resolve the profile we still sanitize
          // with generic PII patterns (IBAN/BSN/e-mail/phone/address).
          return {}
        }
      })()
    }
    return sanitizeOptsPromise
  }
  const clean = (value: string | null | undefined, opts: SanitizeOptions): string | null =>
    value ? sanitizeForAI(value, opts) : (value ?? null)

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

          const opts = await loadSanitizeOpts()
          return txs.slice(0, maxResults).map((t) => ({
            date: t.date,
            amount: t.amount,
            description: clean(t.description, opts),
            counterparty: clean(t.counterparty_name, opts),
            category: clean((t.budget as { name?: string } | null)?.name, opts) ?? 'onbekend',
          }))
        }
        case 'budgets': {
          const now = new Date()
          const { start: monthStart, end: monthEnd } = localMonthBounds(now)

          // Trek gelijk met de budgets-pagina: ALLE budgetten (parent + child),
          // besteding per budget via de gedeelde aggregatie (inkomsten/transfers
          // uitgesloten, split-bedragen op hun eigen budget), en parent-rollup.
          const [budgetsRes, txRes] = await Promise.all([
            supabase
              .from('budgets')
              .select('id, name, slug, default_limit, budget_type, parent_id, is_archived')
              .eq('is_archived', false)
              .order('sort_order', { ascending: true }),
            supabase
              .from('transactions')
              .select('id, budget_id, amount, is_income, transaction_type, is_split')
              .gte('date', monthStart)
              .lt('date', monthEnd),
          ])

          const budgets = budgetsRes.data ?? []
          const txData = txRes.data ?? []

          // Splits ophalen voor split-transacties zodat per-budget bedragen kloppen.
          const splitTxIds = txData.filter((t) => t.is_split).map((t) => t.id)
          let splits: Array<{ budget_id: string | null; amount: number }> = []
          if (splitTxIds.length > 0) {
            const { data: splitData } = await supabase
              .from('transaction_splits')
              .select('budget_id, amount')
              .in('transaction_id', splitTxIds)
            splits = (splitData ?? []) as Array<{ budget_id: string | null; amount: number }>
          }

          const spendingMap = buildBudgetSpendingMap(txData, splits)

          // Child-ids per parent voor de rollup.
          const childIdsByParent: Record<string, string[]> = {}
          for (const b of budgets) {
            if (b.parent_id) {
              ;(childIdsByParent[b.parent_id] ??= []).push(b.id)
            }
          }

          let results = budgets.map((b) => {
            const spent = spentForBudget(b.id, childIdsByParent[b.id] ?? [], spendingMap)
            const limit = Number(b.default_limit)
            return {
              name: b.name,
              limit,
              spent,
              pct: limit > 0 ? Math.round((spent / limit) * 100) : 0,
            }
          })

          if (q) {
            results = results.filter(
              (r) => r.name.toLowerCase().includes(q)
            )
          }

          const opts = await loadSanitizeOpts()
          return results.slice(0, maxResults).map((r) => ({
            ...r,
            name: clean(r.name, opts) ?? r.name,
          }))
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

          const opts = await loadSanitizeOpts()
          return assets.slice(0, maxResults).map((a) => ({
            name: clean(a.name, opts) ?? a.name,
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

          const opts = await loadSanitizeOpts()
          return debts.slice(0, maxResults).map((d) => ({
            name: clean(d.name, opts) ?? d.name,
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
