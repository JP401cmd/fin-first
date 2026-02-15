'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type VerificationResult = {
  budget_id: string
  budget_name: string
  budget_type: string
  parent_name: string
  spending_from_budgets_page: number
  sum_of_matching_transactions: number
  match: boolean
  transaction_count: number
  transactions: { id: string; amount: number; abs_amount: number; date: string; description: string }[]
}

export default function TestBudgetVerifyPage() {
  const [results, setResults] = useState<VerificationResult[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [monthDate] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    async function verify() {
      try {
        const supabase = createClient()

        // Check auth
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setAuthenticated(false)
          setLoading(false)
          return
        }
        setAuthenticated(true)

        const monthStart = monthDate.toISOString().split('T')[0]
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1).toISOString().split('T')[0]

        // Fetch budgets (same as budgets page)
        const { data: budgets, error: budgetErr } = await supabase
          .from('budgets')
          .select('*')
          .order('sort_order', { ascending: true })

        if (budgetErr) throw new Error(`Budget fetch error: ${budgetErr.message}`)

        // Fetch ALL transactions for the month (same query as budgets page line 49-54)
        const { data: txData, error: txErr } = await supabase
          .from('transactions')
          .select('id, budget_id, amount, date, description, counterparty_name')
          .gte('date', monthStart)
          .lt('date', monthEnd)
          .order('date', { ascending: false })

        if (txErr) throw new Error(`Transaction fetch error: ${txErr.message}`)

        const transactions = txData ?? []
        const allBudgets = budgets ?? []

        // Step 1: Calculate spending map (EXACTLY as budgets page does)
        const spendingMap: Record<string, number> = {}
        for (const t of transactions) {
          if (t.budget_id) {
            spendingMap[t.budget_id] = (spendingMap[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
          }
        }

        // Step 2: For each child budget, independently verify by filtering transactions
        const parents = allBudgets.filter(b => !b.parent_id)
        const children = allBudgets.filter(b => b.parent_id)

        const verificationResults: VerificationResult[] = []

        for (const child of children) {
          const parent = parents.find(p => p.id === child.parent_id)
          const spentFromMap = spendingMap[child.id] ?? 0

          // Independently filter and sum transactions for verification
          const matchingTx = transactions.filter(t => t.budget_id === child.id)
          const independentSum = matchingTx.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)

          verificationResults.push({
            budget_id: child.id,
            budget_name: child.name,
            budget_type: child.budget_type ?? 'expense',
            parent_name: parent?.name ?? 'Unknown',
            spending_from_budgets_page: parseFloat(spentFromMap.toFixed(2)),
            sum_of_matching_transactions: parseFloat(independentSum.toFixed(2)),
            match: Math.abs(spentFromMap - independentSum) < 0.01,
            transaction_count: matchingTx.length,
            transactions: matchingTx.map(t => ({
              id: t.id,
              amount: Number(t.amount),
              abs_amount: Math.abs(Number(t.amount)),
              date: t.date,
              description: t.description ?? '',
            })),
          })
        }

        // Also add parent-level aggregation verification
        for (const parent of parents) {
          const parentChildren = children.filter(c => c.parent_id === parent.id)
          if (parentChildren.length === 0) continue

          const parentSpentFromMap = parentChildren.reduce((sum, c) => sum + (spendingMap[c.id] ?? 0), 0)
          const parentMatchingTx = transactions.filter(t => parentChildren.some(c => c.id === t.budget_id))
          const parentIndependentSum = parentMatchingTx.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)

          verificationResults.push({
            budget_id: parent.id,
            budget_name: `[PARENT] ${parent.name}`,
            budget_type: parent.budget_type ?? 'expense',
            parent_name: '—',
            spending_from_budgets_page: parseFloat(parentSpentFromMap.toFixed(2)),
            sum_of_matching_transactions: parseFloat(parentIndependentSum.toFixed(2)),
            match: Math.abs(parentSpentFromMap - parentIndependentSum) < 0.01,
            transaction_count: parentMatchingTx.length,
            transactions: [],
          })
        }

        setResults(verificationResults)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    verify()
  }, [monthDate])

  const allMatch = results.every(r => r.match)
  const withSpending = results.filter(r => r.transaction_count > 0)
  const monthLabel = monthDate.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold text-zinc-900">Budget Spending Verification</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Verifies that budget actual amounts match the sum of linked transactions for {monthLabel}
      </p>

      {loading && (
        <div className="mt-8 flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
        </div>
      )}

      {!loading && !authenticated && (
        <div className="mt-8 rounded-xl border border-yellow-200 bg-yellow-50 p-6">
          <p className="font-medium text-yellow-800">Not authenticated</p>
          <p className="mt-1 text-sm text-yellow-600">
            Please log in first, then visit this page to verify budget-transaction matching.
          </p>
          <a href="/login?redirectTo=/test-budget-verify" className="mt-3 inline-block rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700">
            Log in
          </a>
        </div>
      )}

      {error && (
        <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="font-medium text-red-800">Error</p>
          <p className="mt-1 text-sm text-red-600">{error}</p>
        </div>
      )}

      {!loading && authenticated && (
        <>
          {/* Summary */}
          <div className={`mt-6 rounded-xl border p-6 ${allMatch ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
            <p className={`text-lg font-bold ${allMatch ? 'text-emerald-800' : 'text-red-800'}`}>
              {allMatch ? 'ALL BUDGETS MATCH' : 'MISMATCH DETECTED'}
            </p>
            <p className="mt-1 text-sm text-zinc-600">
              {results.length} budget categories checked, {withSpending.length} have spending,{' '}
              {results.filter(r => !r.match).length} mismatches
            </p>
          </div>

          {/* Budgets with spending */}
          {withSpending.length > 0 && (
            <div className="mt-6">
              <h2 className="text-lg font-semibold text-zinc-900">Budgets with Spending</h2>
              <div className="mt-3 space-y-3">
                {withSpending.map(r => (
                  <div key={r.budget_id} className={`rounded-xl border p-4 ${r.match ? 'border-zinc-200 bg-white' : 'border-red-300 bg-red-50'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-zinc-900">{r.budget_name}</p>
                        <p className="text-xs text-zinc-500">{r.parent_name} / {r.budget_type}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${r.match ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {r.match ? 'MATCH' : 'MISMATCH'}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-zinc-500">Budget page shows</p>
                        <p className="font-mono font-bold">&euro;{r.spending_from_budgets_page.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Transaction sum</p>
                        <p className="font-mono font-bold">&euro;{r.sum_of_matching_transactions.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">Transactions</p>
                        <p className="font-mono font-bold">{r.transaction_count}</p>
                      </div>
                    </div>
                    {r.transactions.length > 0 && r.transactions.length <= 10 && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-700">Show transactions</summary>
                        <div className="mt-2 space-y-1">
                          {r.transactions.map(tx => (
                            <div key={tx.id} className="flex items-center justify-between rounded bg-zinc-50 px-3 py-1 text-xs">
                              <span>{tx.date} — {tx.description}</span>
                              <span className="font-mono">&euro;{tx.abs_amount.toFixed(2)} (raw: {tx.amount.toFixed(2)})</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Budgets without spending */}
          {results.filter(r => r.transaction_count === 0).length > 0 && (
            <details className="mt-6">
              <summary className="cursor-pointer text-sm font-medium text-zinc-500 hover:text-zinc-700">
                {results.filter(r => r.transaction_count === 0).length} budgets with no spending (click to expand)
              </summary>
              <div className="mt-2 space-y-1">
                {results.filter(r => r.transaction_count === 0).map(r => (
                  <div key={r.budget_id} className="flex items-center justify-between rounded-lg border border-zinc-100 px-4 py-2 text-sm">
                    <span className="text-zinc-600">{r.budget_name}</span>
                    <span className="text-xs text-zinc-400">&euro;0.00</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  )
}
