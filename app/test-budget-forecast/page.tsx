'use client'

import { useState } from 'react'
import { computeBudgetForecast, getConfidenceLabel, getConfidenceColors, type BudgetForecast } from '@/lib/budget-forecast'
import { TrendingUp, AlertCircle } from 'lucide-react'

const SCENARIOS = [
  {
    name: 'Boodschappen — consistent spending (high confidence)',
    budgetName: 'Boodschappen',
    monthly: [400, 420, 380, 410, 430, 415, 425, 395, 440, 405, 420, 410],
    limit: 450,
  },
  {
    name: 'Uit eten — moderate variance (medium confidence)',
    budgetName: 'Uit eten, horeca & afhalen',
    monthly: [80, 150, 60, 200, 120, 90, 180, 70, 250, 100, 160, 110],
    limit: 100,
  },
  {
    name: 'Vakantie — highly variable (low confidence)',
    budgetName: 'Vakantie & weekendjes weg',
    monthly: [0, 0, 500, 0, 0, 800, 0, 0, 0, 1200, 0, 0],
    limit: 100,
  },
  {
    name: 'Vervoer — exceeds budget limit (alert)',
    budgetName: 'Brandstof / laden & OV',
    monthly: [90, 95, 100, 105, 110, 115, 120, 130, 140, 150, 155, 160],
    limit: 80,
  },
  {
    name: 'Nieuw budget — insufficient history',
    budgetName: 'Nieuw budget',
    monthly: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 120, 150],
    limit: 200,
  },
  {
    name: 'Huur — very stable (high confidence)',
    budgetName: 'Huur / hypotheek',
    monthly: [750, 750, 750, 750, 750, 750, 750, 750, 750, 750, 750, 750],
    limit: 800,
  },
]

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function ForecastCard({ scenario }: { scenario: typeof SCENARIOS[number] }) {
  const forecast = computeBudgetForecast(scenario.monthly, scenario.limit, scenario.budgetName)

  if (!forecast.hasSufficientData) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-5" data-testid="budget-forecast-section">
        <h3 className="text-sm font-semibold text-zinc-900 mb-1">{scenario.name}</h3>
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="h-4 w-4 text-zinc-400" />
          <p className="text-xs font-semibold text-zinc-500 uppercase">Voorspelling volgende maand</p>
        </div>
        <p className="text-xs text-zinc-400 italic" data-testid="budget-forecast-insufficient">
          {forecast.message}
        </p>
        <p className="text-[10px] text-zinc-300 mt-2">
          Data: [{scenario.monthly.join(', ')}] — {forecast.monthsUsed} non-zero maanden
        </p>
      </div>
    )
  }

  const confColors = getConfidenceColors(forecast.confidence)
  const confLabel = getConfidenceLabel(forecast.confidence)

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5" data-testid="budget-forecast-section">
      <h3 className="text-sm font-semibold text-zinc-900 mb-3">{scenario.name}</h3>

      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-purple-500" />
        <p className="text-xs font-semibold text-zinc-500 uppercase">Voorspelling volgende maand</p>
      </div>

      {/* Predicted amount */}
      <div className="rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50 to-white p-4" data-testid="budget-forecast-card">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-purple-600 font-medium">Verwachte uitgaven</p>
            <p className="text-2xl font-bold text-zinc-900 mt-0.5" data-testid="budget-forecast-amount">
              {formatCurrency(forecast.predicted)}
            </p>
          </div>

          {/* Confidence indicator */}
          <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${confColors.bg} border ${confColors.border}`} data-testid="budget-forecast-confidence">
            <div className={`h-2 w-2 rounded-full ${confColors.dot}`} />
            <span className={`text-[10px] font-medium ${confColors.text}`}>
              {confLabel}
            </span>
          </div>
        </div>

        {/* Contextual message */}
        <p className="text-xs text-zinc-500 mt-2" data-testid="budget-forecast-message">
          {forecast.message}
        </p>

        {/* Confidence detail */}
        <div className="mt-2 flex items-center gap-3 text-[10px] text-zinc-400">
          <span>Gebaseerd op {forecast.monthsUsed} maanden</span>
          <span>•</span>
          <span>{forecast.confidencePercent}% betrouwbaarheid</span>
        </div>

        {/* Budget limit comparison bar */}
        {scenario.limit > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-1">
              <span>Voorspeld vs limiet ({formatCurrency(scenario.limit)})</span>
              <span>{Math.round((forecast.predicted / scenario.limit) * 100)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className={`h-full rounded-full transition-all ${
                  forecast.exceedsLimit ? 'bg-red-500' : forecast.predicted / scenario.limit > 0.8 ? 'bg-amber-400' : 'bg-purple-400'
                }`}
                style={{ width: `${Math.min((forecast.predicted / scenario.limit) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Alert when predicted exceeds limit */}
      {forecast.exceedsLimit && forecast.alertMessage && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3" data-testid="budget-forecast-alert">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-red-700" data-testid="budget-forecast-alert-message">
              {forecast.alertMessage}
            </p>
            <p className="text-[10px] text-red-500 mt-0.5">
              Limiet: {formatCurrency(scenario.limit)} — Verwacht: {formatCurrency(forecast.predicted)}
            </p>
          </div>
        </div>
      )}

      {/* Debug info */}
      <p className="text-[10px] text-zinc-300 mt-3">
        Mean: {formatCurrency(forecast.mean)} | StdDev: {formatCurrency(forecast.stdDev)} | CV: {(forecast.mean > 0 ? forecast.stdDev / forecast.mean : 0).toFixed(3)}
      </p>
    </div>
  )
}

export default function TestBudgetForecastPage() {
  const [apiResult, setApiResult] = useState<string | null>(null)

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-bold text-zinc-900 mb-2">Budget Forecast — Feature #220</h1>
        <p className="text-sm text-zinc-500 mb-6">
          Voorspelling van uitgaven volgende maand op basis van 3-6 maanden gemiddelde.
        </p>

        {/* API test button */}
        <div className="mb-6">
          <button
            onClick={async () => {
              try {
                const res = await fetch('/api/verify-budget-forecast')
                const data = await res.json()
                setApiResult(`${data.passing}/${data.total} tests passing — ${data.allPassing ? '✅ All pass' : '❌ Some failures'}`)
              } catch (err) {
                setApiResult('Error fetching API')
              }
            }}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
          >
            Run API Verification Tests
          </button>
          {apiResult && (
            <p className="mt-2 text-sm font-medium text-zinc-700" data-testid="api-result">{apiResult}</p>
          )}
        </div>

        {/* Scenarios */}
        <div className="space-y-4">
          {SCENARIOS.map((scenario, i) => (
            <ForecastCard key={i} scenario={scenario} />
          ))}
        </div>
      </div>
    </div>
  )
}
