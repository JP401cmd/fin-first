'use client'

import { useEffect, useState } from 'react'
import HoldingTransactionLog from '@/components/app/holding-transaction-log'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

export default function TestHoldingTxLogPage() {
  const [tests, setTests] = useState<TestResult[]>([])
  const [passing, setPassing] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-holding-tx-log')
      .then(res => res.json())
      .then(data => {
        setTests(data.tests || [])
        setPassing(data.passing || 0)
        setTotal(data.total || 0)
      })
      .catch(() => setTests([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-2xl font-bold text-zinc-900">Feature #228: Transaction Log per Holding</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Buy, sell, dividend events per holding with running P&L calculation.
      </p>

      {/* Verification tests */}
      <section className="mt-6">
        <h2 className="text-lg font-semibold text-zinc-800">Verificatie</h2>
        {loading ? (
          <div className="mt-4 flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
            <span className="text-sm text-zinc-500">Tests laden...</span>
          </div>
        ) : (
          <>
            <div className="mt-2 flex items-center gap-2">
              <span className={`text-lg font-bold ${passing === total ? 'text-emerald-600' : 'text-amber-600'}`}>
                {passing}/{total}
              </span>
              <span className="text-sm text-zinc-500">tests geslaagd</span>
            </div>
            <div className="mt-3 space-y-1.5">
              {tests.map((t, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 rounded-lg border p-2.5 ${
                    t.pass ? 'border-emerald-100 bg-emerald-50/50' : 'border-red-100 bg-red-50/50'
                  }`}
                >
                  <span className="shrink-0 text-sm">{t.pass ? '✅' : '❌'}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-zinc-800">{t.name}</p>
                    <p className="text-[11px] text-zinc-500">{t.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Demo: Transaction log with mock holding ID */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-800">Demo: Transaction Log Component</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Hieronder staat het transactielogboek component met een demo holding ID.
          De component zal &quot;Nog geen transacties&quot; tonen omdat dit een demo ID is.
        </p>
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4">
          <HoldingTransactionLog
            holdingId="00000000-0000-0000-0000-000000000000"
            holdingName="Demo Holding (VWRL)"
            holdingTicker="VWRL"
          />
        </div>
      </section>
    </div>
  )
}
