'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/components/app/budget-shared'

type TestResult = {
  step: string
  status: 'pass' | 'fail' | 'pending' | 'running'
  detail: string
}

export default function TestDividendAccumulationPage() {
  const [authenticated, setAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [results, setResults] = useState<TestResult[]>([])
  const [running, setRunning] = useState(false)
  const [holdingId, setHoldingId] = useState<string | null>(null)

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setAuthenticated(!!user)
      setLoading(false)
    }
    checkAuth()
  }, [])

  const runTest = useCallback(async () => {
    setRunning(true)
    const testResults: TestResult[] = []
    let createdHoldingId: string | null = null

    function addResult(step: string, status: TestResult['status'], detail: string) {
      testResults.push({ step, status, detail })
      setResults([...testResults])
    }

    try {
      // ── Step 1: Create a test holding ──
      addResult('1. Create test holding for dividends', 'running', 'Creating DIVIDEND_TEST_76...')

      const createRes = await fetch('/api/holdings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'DIVIDEND_TEST_76',
          ticker: 'DIV76',
          units: 100,
          avg_purchase_price: 25,
          current_price: 30,
          notes: 'Feature #76 test: dividend accumulation',
        }),
      })

      if (!createRes.ok) {
        const err = await createRes.json()
        addResult('1. Create test holding', 'fail', `Failed: ${err.error || createRes.status}`)
        setRunning(false)
        return
      }

      const createData = await createRes.json()
      createdHoldingId = createData.holding?.id
      setHoldingId(createdHoldingId)
      addResult(
        '1. Create test holding for dividends',
        'pass',
        `Created DIVIDEND_TEST_76: ${createdHoldingId?.slice(0, 8)}... (100 units @ EUR 25, source: ${createData.source})`
      )

      // ── Step 2: Record first dividend of EUR 50 ──
      addResult('2. Record dividend of EUR 50', 'running', 'Posting dividend transaction...')

      const div1Res = await fetch('/api/holding-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holding_id: createdHoldingId,
          type: 'dividend',
          units: 1,
          price_per_unit: 50,
          date: '2026-01-15',
          notes: 'Q4 2025 dividend - test',
        }),
      })

      if (!div1Res.ok) {
        const err = await div1Res.json()
        addResult('2. Record dividend of EUR 50', 'fail', `Failed: ${err.error || div1Res.status}`)
        await cleanup(createdHoldingId)
        setRunning(false)
        return
      }

      const div1Data = await div1Res.json()
      const div1Amount = div1Data.transaction?.total_amount
      addResult(
        '2. Record dividend of EUR 50',
        div1Amount === 50 ? 'pass' : 'fail',
        `Transaction recorded: total_amount=${formatCurrency(div1Amount)}, type=${div1Data.transaction?.type}, source=${div1Data.source}`
      )

      // ── Step 3: Verify first dividend appears in transaction history ──
      addResult('3. Verify dividend appears in history', 'running', 'Fetching transaction list...')

      const hist1Res = await fetch(`/api/holding-transactions?holding_id=${createdHoldingId}`)
      const hist1Data = await hist1Res.json()
      const txList1 = hist1Data.transactions || []
      const dividendTxs1 = txList1.filter((tx: { type: string }) => tx.type === 'dividend')

      const found1 = dividendTxs1.length === 1 && dividendTxs1[0].total_amount === 50
      addResult(
        '3. Verify dividend appears in history',
        found1 ? 'pass' : 'fail',
        `Found ${dividendTxs1.length} dividend(s), total_amount: ${dividendTxs1[0]?.total_amount ?? 'N/A'} (expected 50), source: ${hist1Data.source}`
      )

      // ── Step 4: Record second dividend of EUR 75 ──
      addResult('4. Record second dividend of EUR 75', 'running', 'Posting second dividend...')

      const div2Res = await fetch('/api/holding-transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holding_id: createdHoldingId,
          type: 'dividend',
          units: 1,
          price_per_unit: 75,
          date: '2026-02-15',
          notes: 'Q1 2026 dividend - test',
        }),
      })

      if (!div2Res.ok) {
        const err = await div2Res.json()
        addResult('4. Record second dividend of EUR 75', 'fail', `Failed: ${err.error || div2Res.status}`)
        await cleanup(createdHoldingId)
        setRunning(false)
        return
      }

      const div2Data = await div2Res.json()
      const div2Amount = div2Data.transaction?.total_amount
      addResult(
        '4. Record second dividend of EUR 75',
        div2Amount === 75 ? 'pass' : 'fail',
        `Transaction recorded: total_amount=${formatCurrency(div2Amount)}, type=${div2Data.transaction?.type}`
      )

      // ── Step 5: Verify total dividend income shows EUR 125 ──
      addResult('5. Verify total dividend income = EUR 125', 'running', 'Fetching transaction history...')

      const hist2Res = await fetch(`/api/holding-transactions?holding_id=${createdHoldingId}`)
      const hist2Data = await hist2Res.json()
      const txList2 = hist2Data.transactions || []
      const dividendTxs2 = txList2.filter((tx: { type: string }) => tx.type === 'dividend')
      const totalDividendIncome = dividendTxs2.reduce((sum: number, tx: { total_amount: number }) => sum + tx.total_amount, 0)

      const step5Pass = dividendTxs2.length === 2 && totalDividendIncome === 125
      addResult(
        '5. Verify total dividend income = EUR 125',
        step5Pass ? 'pass' : 'fail',
        `Dividend count: ${dividendTxs2.length} (expected 2), total: ${formatCurrency(totalDividendIncome)} (expected EUR 125), source: ${hist2Data.source}`
      )

      // ── Step 6: Verify holding units unchanged (dividends don't affect units) ──
      addResult('6. Verify holding units unchanged after dividends', 'running', 'Re-fetching holding...')

      const listRes = await fetch('/api/holdings')
      const listData = await listRes.json()
      const found = (listData.holdings || []).find((h: { id: string }) => h.id === createdHoldingId)

      if (!found) {
        addResult('6. Verify holding units unchanged', 'fail', 'Holding not found in list')
      } else {
        const step6Pass = found.units === 100
        addResult(
          '6. Verify holding units unchanged after dividends',
          step6Pass ? 'pass' : 'fail',
          `Units: ${found.units} (expected 100 - dividends should NOT change units), avg_price: ${formatCurrency(found.avg_purchase_price)}`
        )
      }

      // ── Step 7: Verify data persists after "refresh" (re-fetch) ──
      addResult('7. Verify data persists after refresh', 'running', 'Re-fetching all data...')

      // Small delay to simulate refresh
      await new Promise(resolve => setTimeout(resolve, 500))

      const refreshRes = await fetch(`/api/holding-transactions?holding_id=${createdHoldingId}`)
      const refreshData = await refreshRes.json()
      const refreshTxs = refreshData.transactions || []
      const refreshDividends = refreshTxs.filter((tx: { type: string }) => tx.type === 'dividend')
      const refreshTotal = refreshDividends.reduce((sum: number, tx: { total_amount: number }) => sum + tx.total_amount, 0)

      const step7Pass = refreshDividends.length === 2 && refreshTotal === 125
      addResult(
        '7. Verify data persists after refresh',
        step7Pass ? 'pass' : 'fail',
        `After refresh: ${refreshDividends.length} dividends, total: ${formatCurrency(refreshTotal)} (expected EUR 125), source: ${refreshData.source}`
      )

      // ── Cleanup ──
      addResult('Cleanup', 'running', 'Deleting test holding...')
      await cleanup(createdHoldingId)
      addResult('Cleanup', 'pass', 'Test holding DIVIDEND_TEST_76 deleted')

    } catch (err) {
      addResult('Error', 'fail', err instanceof Error ? err.message : 'Unknown error')
      if (createdHoldingId) {
        await cleanup(createdHoldingId)
      }
    }

    setRunning(false)
  }, [])

  async function cleanup(id: string | null) {
    if (id) {
      try {
        // First delete any holding transactions associated with this holding
        const txRes = await fetch(`/api/holding-transactions?holding_id=${id}`)
        if (txRes.ok) {
          const txData = await txRes.json()
          for (const tx of (txData.transactions || [])) {
            await fetch(`/api/holding-transactions?id=${tx.id}`, { method: 'DELETE' })
          }
        }
        // Then delete the holding itself
        await fetch(`/api/holdings?id=${id}`, { method: 'DELETE' })
      } catch {
        // ignore
      }
    }
  }

  const testSteps = results.filter(r => !r.step.startsWith('Cleanup') && r.step !== 'Error')
  const passed = testSteps.filter(r => r.status === 'pass').length
  const total = testSteps.length
  const allPassed = total >= 7 && testSteps.every(r => r.status === 'pass')

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-bold text-zinc-900">Test: Dividend Accumulation (#76)</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Verifies: create holding &rarr; record dividend EUR 50 &rarr; verify in history &rarr; record dividend EUR 75 &rarr; verify total = EUR 125 &rarr; verify units unchanged &rarr; verify persistence
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
            Please log in first, then visit this page to run the test.
          </p>
          <a href="/login?redirectTo=/test-dividend-accumulation" className="mt-3 inline-block rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700">
            Log in
          </a>
        </div>
      )}

      {!loading && authenticated && (
        <>
          <button
            onClick={runTest}
            disabled={running}
            className="mt-6 rounded-lg bg-amber-600 px-6 py-3 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {running ? 'Running test...' : 'Run Dividend Accumulation Test'}
          </button>

          {results.length > 0 && (
            <div className={`mt-6 rounded-xl border p-6 ${allPassed ? 'border-emerald-200 bg-emerald-50' : 'border-zinc-200 bg-white'}`}>
              <p className={`text-lg font-bold ${allPassed ? 'text-emerald-800' : 'text-zinc-900'}`}>
                {allPassed ? `ALL ${total} STEPS PASSED` : running ? 'Running...' : `${passed}/${total} steps passed`}
              </p>
              <div className="mt-4 space-y-3">
                {results.map((r, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className={`mt-0.5 inline-block h-5 w-5 shrink-0 rounded-full text-center text-xs font-bold leading-5 ${
                      r.status === 'pass' ? 'bg-emerald-100 text-emerald-700' :
                      r.status === 'fail' ? 'bg-red-100 text-red-700' :
                      r.status === 'running' ? 'bg-amber-100 text-amber-700' :
                      'bg-zinc-100 text-zinc-400'
                    }`}>
                      {r.status === 'pass' ? '\u2713' : r.status === 'fail' ? '\u2717' : r.status === 'running' ? '\u2026' : '\u2022'}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{r.step}</p>
                      <p className="text-xs text-zinc-500">{r.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
