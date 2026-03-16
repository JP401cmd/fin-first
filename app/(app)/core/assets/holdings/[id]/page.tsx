import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Briefcase, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import HoldingTransactionLogClient from './transaction-log-client'
import HoldingValueChartClient from './value-chart-client'
import { HoldingFavoriteButton } from './holding-favorite-button'
import { calculateHoldingBox3 } from '@/lib/box3-holdings'
import HoldingAlertsClient from './alerts-client'

// UUID v4 regex for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function formatCurrency(value: number, cur: string = 'EUR'): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: cur }).format(value)
}

export default async function HoldingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Validate UUID format — malformed IDs get a 404 immediately
  if (!UUID_REGEX.test(id)) {
    notFound()
  }

  // Valid UUID format — check if the holding actually exists
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    notFound()
  }

  const { data: holdingData, error } = await supabase
    .from('holdings')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !holdingData) {
    notFound()
  }

  const name = holdingData.name as string
  const ticker = holdingData.ticker as string | null
  const currency = (holdingData.currency as string) || 'EUR'
  const units = Number(holdingData.units) || 0
  const avgPrice = Number(holdingData.avg_purchase_price) || 0
  const currentPrice = Number(holdingData.current_price) || avgPrice
  const holdingValue = currentPrice * units
  const costBasis = avgPrice * units
  const returnPct = costBasis > 0 ? ((holdingValue - costBasis) / costBasis) * 100 : 0
  const returnValue = holdingValue - costBasis

  // Fetch total portfolio value for Box 3 proportional exemption calculation
  const { data: allHoldings } = await supabase
    .from('holdings')
    .select('current_price, avg_purchase_price, units')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const totalPortfolioValue = (allHoldings || []).reduce((sum, h) => {
    const price = Number(h.current_price) || Number(h.avg_purchase_price) || 0
    return sum + (price * (Number(h.units) || 0))
  }, 0)

  const box3Info = calculateHoldingBox3(holdingValue, totalPortfolioValue)

  return (
    <div className="mx-auto max-w-5xl px-4 py-8" data-testid="holding-detail-page">
      <Link
        href="/core/assets/holdings"
        className="mb-6 inline-flex items-center gap-2 text-sm text-[var(--ink-3)] hover:text-zinc-800 transition-colors"
        data-testid="back-to-holdings-link"
      >
        <ArrowLeft className="h-4 w-4" />
        Terug naar holdings
      </Link>

      {/* Holding header with KPIs */}
      <section className="rounded-[var(--r-lg)] border border-kern-200 bg-gradient-to-br from-kern-50 to-white p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--r-lg)] bg-kern-100">
            <Briefcase className="h-6 w-6 text-kern-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-[var(--ink)]" data-testid="holding-name">{name}</h1>
            {ticker && (
              <p className="mt-0.5 text-sm font-medium text-kern-600" data-testid="holding-ticker">
                {ticker}
                {currency !== 'EUR' && <span className="ml-2 rounded-full bg-kern-100 px-1.5 py-0.5 text-[10px] font-semibold text-kern-700">{currency}</span>}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <HoldingFavoriteButton holdingId={id} initialFavorite={holdingData.is_favorite ?? false} />
            <Link
              href="/core/assets/holdings"
              className="rounded-lg border border-kern-200 bg-[var(--paper)] px-3 py-1.5 text-xs font-medium text-kern-700 hover:bg-kern-50"
            >
              Alle holdings
            </Link>
          </div>
        </div>

        {/* KPI cards */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="holding-kpis">
          <div>
            <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase">Huidige waarde</p>
            <p className="mt-1 text-lg font-bold text-[var(--ink)]" data-testid="holding-value">
              {formatCurrency(holdingValue, currency)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase">Eenheden</p>
            <p className="mt-1 text-lg font-bold text-[var(--ink)]" data-testid="holding-units">
              {units}
            </p>
            <p className="text-xs text-[var(--ink-3)]">
              @ {formatCurrency(currentPrice, currency)} per eenheid
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase">Gem. aankoopprijs</p>
            <p className="mt-1 text-lg font-bold text-[var(--ink)]" data-testid="holding-avg-price">
              {formatCurrency(avgPrice, currency)}
            </p>
            <p className="text-xs text-[var(--ink-3)]">
              kostenbasis: {formatCurrency(costBasis, currency)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase">Rendement</p>
            {costBasis > 0 ? (
              <>
                <p className={`mt-1 text-lg font-bold ${returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`} data-testid="holding-return">
                  {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
                </p>
                <p className={`text-xs font-medium ${returnValue >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {returnValue >= 0 ? '+' : ''}{formatCurrency(returnValue, currency)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-lg font-bold text-[var(--ink-3)]">-</p>
            )}
          </div>
        </div>
      </section>

      {/* Box 3 belastingimpact */}
      <div className="mt-4 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase">Geschatte Box 3 heffing</p>
            <p className="mt-1 text-lg font-bold font-mono tabular-nums text-[var(--ink)]">
              {formatCurrency(box3Info.annualTax)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium text-[var(--ink-3)] uppercase">Effectief tarief</p>
            <p className="mt-1 text-sm font-bold font-mono tabular-nums text-[var(--ink)]">
              {(box3Info.effectiveRate * 100).toFixed(2)}%
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--ink-3)]">
          <span>Forfaitair rendement: <span className="font-mono tabular-nums font-medium text-[var(--ink-2)]">{(box3Info.forfaitRate * 100).toFixed(2)}%</span></span>
          <span>Heffingsvrij: <span className="font-mono tabular-nums font-medium text-[var(--ink-2)]">{formatCurrency(box3Info.allocatedExemption)}</span></span>
          <span>Belastbaar: <span className="font-mono tabular-nums font-medium text-[var(--ink-2)]">{formatCurrency(box3Info.taxableValue)}</span></span>
        </div>
      </div>

      {/* Price Alerts Section */}
      <section className="mt-6" data-testid="alerts-section">
        <HoldingAlertsClient
          holdingId={id}
          holdingName={name}
          currentPrice={currentPrice}
        />
      </section>

      {/* Value Chart Section */}
      <section className="mt-6" data-testid="value-chart-section">
        <HoldingValueChartClient holdingId={id} />
      </section>

      {/* Transaction Log Section */}
      <section className="mt-6" data-testid="transaction-log-section">
        <HoldingTransactionLogClient
          holdingId={id}
          holdingName={name}
          holdingTicker={ticker}
        />
      </section>
    </div>
  )
}
