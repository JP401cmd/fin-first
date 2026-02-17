'use client'

import { useEffect, useState } from 'react'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { formatCurrency } from '@/lib/format'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

// Example transaction for visual demo
function TransactionRowDemo({
  description,
  amount,
  dailyExpenses,
  isIncome,
}: {
  description: string
  amount: number
  dailyExpenses: number
  isIncome: boolean
}) {
  const fd = calculateFreedomTime(Math.abs(amount), dailyExpenses)
  const fdStr = fd.totalDays < 1
    ? `${fd.totalDays.toFixed(1)} dagen`
    : formatFreedomTimeString(fd, 'short', true)

  return (
    <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3 last:border-b-0">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
        isIncome ? 'bg-emerald-50' : 'bg-zinc-100'
      }`}>
        <span className={`text-sm ${isIncome ? 'text-emerald-500' : 'text-zinc-500'}`}>
          {isIncome ? '↓' : '↑'}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900">{description}</p>
      </div>
      <div className="shrink-0 text-right">
        <span className={`text-sm font-semibold ${
          isIncome ? 'text-emerald-600' : 'text-zinc-900'
        }`}>
          {isIncome ? '+' : '-'}{formatCurrency(Math.abs(amount))}
        </span>
        {dailyExpenses > 0 && (
          <p className={`text-[10px] leading-tight ${
            isIncome ? 'text-emerald-500/60' : 'text-zinc-400'
          }`} data-testid="tx-freedom-time">
            {isIncome ? `${fdStr} verdiend` : fdStr}
          </p>
        )}
      </div>
    </div>
  )
}

export default function TestCashFreedomTimePage() {
  const [apiResults, setApiResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/verify-cash-freedom-time')
      .then((r) => r.json())
      .then((data) => {
        setApiResults(data.results || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Demo data
  const dailyExpenses = 2000 / 30 // €2000/month → ~€66.67/day
  const totalIncome = 4500
  const totalExpenses = 2000
  const netAmount = totalIncome - totalExpenses

  const incomeFD = calculateFreedomTime(totalIncome, dailyExpenses)
  const expensesFD = calculateFreedomTime(totalExpenses, dailyExpenses)
  const netFD = calculateFreedomTime(Math.abs(netAmount), dailyExpenses)

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-bold text-zinc-900">
        Test: Freedom-Time in Transaction Rows (#182)
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Verifies freedom-time labels on transaction rows and monthly summary cards.
      </p>

      {/* API Test Results */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-800">API Verification Tests</h2>
        {loading ? (
          <p className="mt-2 text-sm text-zinc-500">Loading...</p>
        ) : (
          <div className="mt-3 space-y-1">
            {apiResults.map((r, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                  r.pass ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
                }`}
              >
                <span className="shrink-0">{r.pass ? '✅' : '❌'}</span>
                <div>
                  <span className="font-medium">{r.name}</span>
                  <p className="text-xs opacity-70">{r.detail}</p>
                </div>
              </div>
            ))}
            <p className="mt-2 text-sm font-semibold text-zinc-700">
              {apiResults.filter((r) => r.pass).length}/{apiResults.length} tests passing
            </p>
          </div>
        )}
      </section>

      {/* Visual Demo: Monthly Summary Cards */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-zinc-800">Monthly Summary Cards (Visual Demo)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Each card shows EUR amount + freedom days equivalent below it.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-4" data-testid="monthly-summary">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 text-center">
            <p className="text-xs font-medium uppercase text-emerald-600">Inkomen</p>
            <p className="mt-1 text-xl font-bold text-emerald-600">{formatCurrency(totalIncome)}</p>
            <p className="mt-0.5 text-xs text-emerald-500/70" data-testid="income-freedom-days">
              {incomeFD.totalDays.toFixed(1)} dagen vrijheid verdiend
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 text-center">
            <p className="text-xs font-medium uppercase text-red-600">Uitgaven</p>
            <p className="mt-1 text-xl font-bold text-red-600">{formatCurrency(totalExpenses)}</p>
            <p className="mt-0.5 text-xs text-red-400/70" data-testid="expenses-freedom-days">
              {expensesFD.totalDays.toFixed(1)} dagen vrijheid
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 text-center">
            <p className="text-xs font-medium uppercase text-zinc-500">Netto</p>
            <p className={`mt-1 text-xl font-bold ${netAmount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {formatCurrency(netAmount)}
            </p>
            <p className={`mt-0.5 text-xs ${netAmount >= 0 ? 'text-emerald-500/70' : 'text-red-400/70'}`} data-testid="net-freedom-days">
              {netAmount >= 0 ? '+' : '-'}{netFD.totalDays.toFixed(1)} dagen
            </p>
          </div>
        </div>
      </section>

      {/* Visual Demo: Transaction Rows */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-zinc-800">Transaction Rows (Visual Demo)</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Each row shows the amount + subtle freedom-time label. Income shows "verdiend" suffix.
        </p>
        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <TransactionRowDemo
            description="Salaris februari"
            amount={2800}
            dailyExpenses={dailyExpenses}
            isIncome={true}
          />
          <TransactionRowDemo
            description="Albert Heijn boodschappen"
            amount={-85}
            dailyExpenses={dailyExpenses}
            isIncome={false}
          />
          <TransactionRowDemo
            description="Huur maand februari"
            amount={-1200}
            dailyExpenses={dailyExpenses}
            isIncome={false}
          />
          <TransactionRowDemo
            description="Netflix abonnement"
            amount={-15.99}
            dailyExpenses={dailyExpenses}
            isIncome={false}
          />
          <TransactionRowDemo
            description="Freelance project"
            amount={1700}
            dailyExpenses={dailyExpenses}
            isIncome={true}
          />
          <TransactionRowDemo
            description="Tankstation"
            amount={-65}
            dailyExpenses={dailyExpenses}
            isIncome={false}
          />
        </div>
      </section>

      {/* Styling verification */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-zinc-800">Styling Verification</h2>
        <ul className="mt-3 space-y-1 text-sm text-zinc-600">
          <li>✅ Freedom-time text uses <code className="bg-zinc-100 px-1 rounded">text-[10px]</code> — smaller than the amount</li>
          <li>✅ Expense labels use <code className="bg-zinc-100 px-1 rounded">text-zinc-400</code> — subtle gray</li>
          <li>✅ Income labels use <code className="bg-zinc-100 px-1 rounded">text-emerald-500/60</code> — muted green</li>
          <li>✅ Summary card labels use <code className="bg-zinc-100 px-1 rounded">/70</code> opacity — visible but not dominant</li>
          <li>✅ Labels don't clutter the UI — they appear as small secondary text below amounts</li>
        </ul>
      </section>
    </div>
  )
}
