'use client'

import { useState, useMemo } from 'react'
import {
  type Debt,
  debtProjection,
  amortizationSchedule,
  simulatePayoff,
  payoffSummary,
} from '@/lib/debt-data'
import { formatCurrency } from '@/components/app/budget-shared'

/**
 * Test page for Feature #73: Debt payoff calculations use real payment data.
 *
 * This demonstrates that:
 * 1. A debt of 10 000 EUR with 500 EUR/mo payment -> ~20 months payoff
 * 2. Changing to 1 000 EUR/mo -> ~10 months payoff
 * 3. All calculations use the real debtProjection() and amortizationSchedule() functions
 */
export default function TestDebtPayoffPage() {
  const [balance, setBalance] = useState(10000)
  const [interestRate, setInterestRate] = useState(0)
  const [monthlyPayment, setMonthlyPayment] = useState(500)

  // Build a fake Debt object with the fields debtProjection() needs
  const debt: Debt = useMemo(() => ({
    id: 'test-debt',
    user_id: 'test',
    name: 'Testschuld',
    debt_type: 'personal_loan',
    original_amount: balance,
    current_balance: balance,
    interest_rate: interestRate,
    minimum_payment: monthlyPayment,
    monthly_payment: monthlyPayment,
    start_date: new Date().toISOString().split('T')[0],
    end_date: null,
    creditor: null,
    notes: null,
    is_active: true,
    sort_order: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtype: null,
    is_tax_deductible: null,
    fixed_rate_end_date: null,
    nhg: null,
    linked_asset_id: null,
    credit_limit: null,
    repayment_type: null, // default = annuity
    draagkrachtmeting_date: null,
    ownership: 'personal',
    household_id: null,
    net_worth_inclusion_pct: 100, partner_split_pct: null, tax_year: null, has_payment_plan: false,
  }), [balance, interestRate, monthlyPayment])

  const projection = useMemo(() => debtProjection(debt), [debt])
  const schedule = useMemo(
    () => amortizationSchedule(balance, interestRate, monthlyPayment),
    [balance, interestRate, monthlyPayment],
  )

  // Also run multi-debt payoff simulation (same single debt)
  const simulation = useMemo(
    () => simulatePayoff([debt], 'current', 0),
    [debt],
  )
  const simSummary = useMemo(() => payoffSummary(simulation), [simulation])

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-xl font-bold text-zinc-900">
        Test: Schuld Afloscalculatie
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Feature #73 — Debt payoff calculations use real payment data
      </p>

      {/* Input controls */}
      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700">Schuld parameters</h2>
        <div className="mt-3 grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              Saldo (EUR)
            </label>
            <input
              type="number"
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              Rente (% per jaar)
            </label>
            <input
              type="number"
              step="0.1"
              value={interestRate}
              onChange={(e) => setInterestRate(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              Maandelijkse betaling (EUR)
            </label>
            <input
              type="number"
              value={monthlyPayment}
              onChange={(e) => setMonthlyPayment(Number(e.target.value))}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Quick presets */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => { setBalance(10000); setInterestRate(0); setMonthlyPayment(500) }}
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            Scenario A: 10k / 0% / 500/m
          </button>
          <button
            onClick={() => { setBalance(10000); setInterestRate(0); setMonthlyPayment(1000) }}
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            Scenario B: 10k / 0% / 1000/m
          </button>
          <button
            onClick={() => { setBalance(10000); setInterestRate(5); setMonthlyPayment(500) }}
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            Scenario C: 10k / 5% / 500/m
          </button>
          <button
            onClick={() => { setBalance(10000); setInterestRate(5); setMonthlyPayment(1000) }}
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100"
          >
            Scenario D: 10k / 5% / 1000/m
          </button>
        </div>
      </section>

      {/* Results */}
      <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700">Resultaat (debtProjection)</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Maanden tot afgelost</p>
            <p className="mt-1 text-lg font-bold text-zinc-900" data-testid="months-to-payoff">
              {projection.isPayable ? projection.monthsToPayoff : 'Onbetaalbaar'}
            </p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Totale rente</p>
            <p className="mt-1 text-lg font-bold text-red-600">
              {projection.isPayable ? formatCurrency(projection.totalInterest) : '-'}
            </p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Aflosdatum</p>
            <p className="mt-1 text-sm font-bold text-zinc-900">
              {projection.isPayable && projection.payoffDate
                ? new Date(projection.payoffDate).toLocaleDateString('nl-NL', {
                    month: 'long',
                    year: 'numeric',
                  })
                : '-'}
            </p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Betaalbaar?</p>
            <p className={`mt-1 text-lg font-bold ${projection.isPayable ? 'text-emerald-600' : 'text-red-600'}`}>
              {projection.isPayable ? 'Ja' : 'Nee'}
            </p>
          </div>
        </div>
      </section>

      {/* Simulation results */}
      <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700">Resultaat (simulatePayoff)</h2>
        <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Totale maanden</p>
            <p className="mt-1 text-lg font-bold text-zinc-900">{simSummary.totalMonths}</p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Totale rente</p>
            <p className="mt-1 text-lg font-bold text-red-600">{formatCurrency(simSummary.totalInterest)}</p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Totaal betaald</p>
            <p className="mt-1 text-lg font-bold text-zinc-900">{formatCurrency(simSummary.totalPaid)}</p>
          </div>
          <div className="rounded-lg bg-zinc-50 p-3">
            <p className="text-xs text-zinc-500">Aflosdatum</p>
            <p className="mt-1 text-sm font-bold text-zinc-900">
              {simSummary.payoffDate
                ? new Date(simSummary.payoffDate).toLocaleDateString('nl-NL', {
                    month: 'long',
                    year: 'numeric',
                  })
                : '-'}
            </p>
          </div>
        </div>
      </section>

      {/* Amortization schedule preview */}
      <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-700">
          Aflosschema (eerste & laatste maanden)
        </h2>
        {schedule.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-400">Geen aflossing mogelijk.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-zinc-500">
                  <th className="py-1 pr-3">Maand</th>
                  <th className="py-1 pr-3">Betaling</th>
                  <th className="py-1 pr-3">Aflossing</th>
                  <th className="py-1 pr-3">Rente</th>
                  <th className="py-1">Resterend saldo</th>
                </tr>
              </thead>
              <tbody>
                {schedule.slice(0, 5).map((row) => (
                  <tr key={row.month} className="border-b border-zinc-50">
                    <td className="py-1 pr-3 text-zinc-600">{row.month}</td>
                    <td className="py-1 pr-3">{formatCurrency(row.payment)}</td>
                    <td className="py-1 pr-3 text-emerald-600">{formatCurrency(row.principal)}</td>
                    <td className="py-1 pr-3 text-red-500">{formatCurrency(row.interest)}</td>
                    <td className="py-1">{formatCurrency(row.balance)}</td>
                  </tr>
                ))}
                {schedule.length > 10 && (
                  <tr>
                    <td colSpan={5} className="py-1 text-center text-zinc-400">
                      ... {schedule.length - 10} meer rijen ...
                    </td>
                  </tr>
                )}
                {schedule.slice(-5).map((row) => (
                  <tr key={row.month} className="border-b border-zinc-50">
                    <td className="py-1 pr-3 text-zinc-600">{row.month}</td>
                    <td className="py-1 pr-3">{formatCurrency(row.payment)}</td>
                    <td className="py-1 pr-3 text-emerald-600">{formatCurrency(row.principal)}</td>
                    <td className="py-1 pr-3 text-red-500">{formatCurrency(row.interest)}</td>
                    <td className="py-1">{formatCurrency(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Verification summary */}
      <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
        <h2 className="text-sm font-semibold text-emerald-700">Verificatie</h2>
        <ul className="mt-2 space-y-1 text-xs text-zinc-700">
          <li className={projection.monthsToPayoff === 20 && balance === 10000 && monthlyPayment === 500 && interestRate === 0 ? 'text-emerald-700 font-bold' : ''}>
            {balance === 10000 && monthlyPayment === 500 && interestRate === 0
              ? `Scenario A: 10k/500pm/0% => ${projection.monthsToPayoff} maanden ${projection.monthsToPayoff === 20 ? '(CORRECT)' : '(VERWACHT: 20)'}`
              : 'Klik "Scenario A" voor verificatie 1'}
          </li>
          <li className={projection.monthsToPayoff === 10 && balance === 10000 && monthlyPayment === 1000 && interestRate === 0 ? 'text-emerald-700 font-bold' : ''}>
            {balance === 10000 && monthlyPayment === 1000 && interestRate === 0
              ? `Scenario B: 10k/1000pm/0% => ${projection.monthsToPayoff} maanden ${projection.monthsToPayoff === 10 ? '(CORRECT)' : '(VERWACHT: 10)'}`
              : 'Klik "Scenario B" voor verificatie 2'}
          </li>
          <li>
            {balance === 10000 && monthlyPayment === 500 && interestRate === 5
              ? `Scenario C: 10k/500pm/5% => ${projection.monthsToPayoff} maanden (${projection.monthsToPayoff > 20 ? 'CORRECT: meer dan 20 door rente' : 'onverwacht'})`
              : 'Klik "Scenario C" voor verificatie met rente'}
          </li>
        </ul>
      </section>
    </div>
  )
}
