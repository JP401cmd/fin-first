'use client'

import { useEffect, useState, useCallback } from 'react'
import { DollarSign, TrendingUp, Calendar, Clock, ChevronDown, ChevronUp, Loader2, Sun } from 'lucide-react'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatCurrencyDecimals(value: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

interface DividendRecord {
  holding_id: string
  holding_name: string
  ticker: string | null
  date: string
  amount: number
  notes: string | null
}

interface HoldingDividendSummary {
  holding_id: string
  holding_name: string
  ticker: string | null
  current_price: number
  units: number
  total_dividend_income: number
  dividend_count: number
  last_dividend_date: string | null
  last_dividend_amount: number
  projected_annual_income: number
  dividend_yield: number
  holding_value: number
  dividends: DividendRecord[]
}

interface DividendAggregate {
  total_dividend_income: number
  total_projected_annual_income: number
  monthly_dividend_income: number
  total_portfolio_value: number
  weighted_dividend_yield: number
  freedom_days_per_year: number
  daily_expenses: number
  total_dividend_count: number
}

interface DividendData {
  holdings: HoldingDividendSummary[]
  aggregate: DividendAggregate
}

/**
 * DividendTracker — Aggregate dividend dashboard for the holdings page.
 *
 * Shows:
 * - Total dividend income (all time)
 * - Projected annual dividend income
 * - Freedom-time equivalent: "Je dividendinkomsten dekken X dagen vrijheid per jaar"
 * - Per-holding dividend summary with yield
 * - Expandable dividend history per holding
 */
export default function DividendTracker() {
  const [data, setData] = useState<DividendData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedHolding, setExpandedHolding] = useState<string | null>(null)

  const loadDividends = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/dividends')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
    } catch {
      setError('Kon dividendgegevens niet laden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDividends()
  }, [loadDividends])

  if (loading) {
    return (
      <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6" data-testid="dividend-tracker-loading">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-4 w-4 text-positive" />
          <h2 className="text-sm font-semibold text-[var(--ink-2)]">Dividend Tracker</h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-positive" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-6" data-testid="dividend-tracker-error">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="h-4 w-4 text-red-500" />
          <h2 className="text-sm font-semibold text-red-700">Dividend Tracker</h2>
        </div>
        <p className="text-sm text-red-600">{error}</p>
        <button
          onClick={() => { setLoading(true); loadDividends() }}
          className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
        >
          Opnieuw proberen
        </button>
      </div>
    )
  }

  if (!data || data.aggregate.total_dividend_count === 0) {
    return (
      <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6" data-testid="dividend-tracker-empty">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-4 w-4 text-positive" />
          <h2 className="text-sm font-semibold text-[var(--ink-2)]">Dividend Tracker</h2>
        </div>
        <div className="text-center py-6">
          <DollarSign className="mx-auto h-10 w-10 text-[var(--ink-4)]" />
          <p className="mt-3 text-sm font-medium text-[var(--ink-2)]">Nog geen dividenden geregistreerd</p>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            Registreer een dividendtransactie bij een holding om je dividendinkomsten te volgen.
          </p>
        </div>
      </div>
    )
  }

  const { aggregate, holdings } = data
  const freedomDays = aggregate.freedom_days_per_year

  return (
    <div className="rounded-[var(--r-lg)] border border-positive/30 bg-[var(--paper)] p-6" data-testid="dividend-tracker">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-positive-bg">
          <DollarSign className="h-4 w-4 text-positive" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-[var(--ink-2)]">Dividend Tracker</h2>
          <p className="text-[10px] text-[var(--ink-3)]">Passief inkomen uit dividenden</p>
        </div>
      </div>

      {/* Freedom-time banner */}
      <div
        className="mb-5 rounded-[var(--r-lg)] bg-positive-bg border border-positive/30 p-4"
        data-testid="dividend-freedom-banner"
      >
        <div className="flex items-center gap-2 mb-1">
          <Sun className="h-4 w-4 text-positive" />
          <p className="text-xs font-semibold text-positive uppercase tracking-wider">Vrijheid door dividenden</p>
        </div>
        <p className="text-lg font-bold text-[var(--ink)]" data-testid="dividend-freedom-days">
          {freedomDays >= 1
            ? `Je dividendinkomsten dekken ${Math.round(freedomDays)} ${Math.round(freedomDays) === 1 ? 'dag' : 'dagen'} vrijheid per jaar`
            : aggregate.daily_expenses > 0
              ? 'Je dividendinkomsten dekken minder dan 1 dag vrijheid per jaar'
              : 'Voeg uitgaven toe om vrijheidsdagen te berekenen'
          }
        </p>
        {freedomDays >= 1 && (
          <p className="mt-1 text-xs text-positive">
            {formatCurrency(aggregate.total_projected_annual_income)} per jaar ÷ {formatCurrencyDecimals(aggregate.daily_expenses)} per dag
          </p>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-5" data-testid="dividend-kpis">
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] p-3">
          <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase">Totaal ontvangen</p>
          <p className="mt-1 text-lg font-bold text-[var(--ink)]" data-testid="dividend-total-income">
            {formatCurrency(aggregate.total_dividend_income)}
          </p>
          <p className="text-[10px] text-[var(--ink-3)]">{aggregate.total_dividend_count} uitkeringen</p>
        </div>
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] p-3">
          <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase">Verwacht per jaar</p>
          <p className="mt-1 text-lg font-bold text-positive" data-testid="dividend-projected-annual">
            {formatCurrency(aggregate.total_projected_annual_income)}
          </p>
          <p className="text-[10px] text-[var(--ink-3)]">{formatCurrency(aggregate.monthly_dividend_income)} / maand</p>
        </div>
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] p-3">
          <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase">Dividendrendement</p>
          <p className="mt-1 text-lg font-bold text-[var(--ink)]" data-testid="dividend-yield-aggregate">
            {aggregate.weighted_dividend_yield.toFixed(2)}%
          </p>
          <p className="text-[10px] text-[var(--ink-3)]">gewogen gemiddeld</p>
        </div>
        <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] p-3">
          <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase">Vrijheidsdagen</p>
          <p className="mt-1 text-lg font-bold text-positive" data-testid="dividend-freedom-days-kpi">
            {Math.round(freedomDays)}
          </p>
          <p className="text-[10px] text-[var(--ink-3)]">per jaar</p>
        </div>
      </div>

      {/* Per-holding dividend list */}
      <div className="space-y-2" data-testid="dividend-holdings-list">
        <p className="text-[10px] font-semibold text-[var(--ink-3)] uppercase tracking-wider mb-2">Per holding</p>
        {holdings
          .filter(h => h.dividend_count > 0 || h.projected_annual_income > 0)
          .map((holding) => (
            <div key={holding.holding_id} className="rounded-[var(--r-lg)] border border-[var(--border-ed)] overflow-hidden">
              {/* Holding summary row */}
              <button
                onClick={() => setExpandedHolding(
                  expandedHolding === holding.holding_id ? null : holding.holding_id
                )}
                className="w-full flex items-center gap-3 p-3 hover:bg-[var(--subtle)] transition-colors text-left"
                data-testid={`dividend-holding-${holding.holding_id}`}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-positive-bg">
                  <TrendingUp className="h-3.5 w-3.5 text-positive" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--ink)] truncate">{holding.holding_name}</p>
                  <p className="text-[11px] text-[var(--ink-3)]">
                    {holding.ticker && <span className="font-medium text-positive">{holding.ticker}</span>}
                    {holding.ticker && ' · '}
                    {holding.dividend_count} uitkering{holding.dividend_count !== 1 ? 'en' : ''}
                    {holding.dividend_yield > 0 && ` · ${holding.dividend_yield.toFixed(2)}% yield`}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {formatCurrency(holding.total_dividend_income)}
                  </p>
                  <p className="text-[10px] text-positive">
                    {formatCurrency(holding.projected_annual_income)} / jaar
                  </p>
                </div>
                <div className="shrink-0">
                  {expandedHolding === holding.holding_id ? (
                    <ChevronUp className="h-4 w-4 text-[var(--ink-3)]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[var(--ink-3)]" />
                  )}
                </div>
              </button>

              {/* Expanded dividend history */}
              {expandedHolding === holding.holding_id && (
                <div
                  className="border-t border-[var(--border-ed)] bg-[var(--subtle)] px-3 py-2 space-y-1"
                  data-testid={`dividend-history-${holding.holding_id}`}
                >
                  {/* Holding dividend stats */}
                  <div className="flex gap-3 py-2 text-[10px] text-[var(--ink-3)]">
                    <span>Waarde: {formatCurrency(holding.holding_value)}</span>
                    <span>·</span>
                    <span>Yield: {holding.dividend_yield.toFixed(2)}%</span>
                    <span>·</span>
                    <span>Verwacht: {formatCurrency(holding.projected_annual_income)} / jaar</span>
                  </div>

                  {/* Dividend history entries */}
                  {holding.dividends.length > 0 ? (
                    <div className="space-y-1">
                      {holding.dividends.map((div, i) => (
                        <div
                          key={`${div.holding_id}-${div.date}-${i}`}
                          className="flex items-center justify-between rounded-lg bg-[var(--paper)] px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3 w-3 text-[var(--ink-3)]" />
                            <span className="text-[var(--ink-2)]">
                              {new Date(div.date).toLocaleDateString('nl-NL', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })}
                            </span>
                            {div.notes && (
                              <span className="text-[var(--ink-3)] truncate max-w-[150px]">— {div.notes}</span>
                            )}
                          </div>
                          <span className="font-semibold text-positive">
                            +{formatCurrencyDecimals(div.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--ink-3)] py-2">Geen dividendhistorie</p>
                  )}
                </div>
              )}
            </div>
          ))}

        {/* Holdings without dividends */}
        {holdings.filter(h => h.dividend_count === 0 && h.projected_annual_income === 0).length > 0 && (
          <div className="mt-3 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)] p-3">
            <p className="text-[10px] font-medium text-[var(--ink-3)] mb-1">Geen dividenden</p>
            <div className="flex flex-wrap gap-1">
              {holdings
                .filter(h => h.dividend_count === 0 && h.projected_annual_income === 0)
                .map(h => (
                  <span key={h.holding_id} className="inline-block rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] text-[var(--ink-2)]">
                    {h.holding_name}
                  </span>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
