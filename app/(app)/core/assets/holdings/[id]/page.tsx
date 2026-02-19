import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowLeft, Briefcase, TrendingUp, TrendingDown, DollarSign } from 'lucide-react'
import HoldingTransactionLogClient from './transaction-log-client'
import HoldingValueChartClient from './value-chart-client'

// UUID v4 regex for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Check if the holdings table exists by trying a lightweight query.
 */
async function holdingsTableExists(supabase: Awaited<ReturnType<typeof createClient>>): Promise<boolean> {
  const { error } = await supabase.from('holdings').select('id').limit(0)
  return !error || !error.message.includes('Could not find')
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value)
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

  // Try the dedicated holdings table first, fall back to assets
  const hasTable = await holdingsTableExists(supabase)

  let holdingData: Record<string, unknown> | null = null

  if (hasTable) {
    const { data, error } = await supabase
      .from('holdings')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!error && data) {
      holdingData = data
    }
  }

  // Fallback: try the assets table if not found in holdings
  if (!holdingData) {
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!assetError && asset) {
      holdingData = {
        id: asset.id,
        name: asset.name,
        ticker: asset.ticker_symbol || null,
        asset_type: asset.asset_type,
        notes: asset.notes,
        units: 1,
        avg_purchase_price: Number(asset.purchase_value) || 0,
        current_price: Number(asset.current_value) || 0,
      }
    }
  }

  // If still not found, show the not-found page
  if (!holdingData) {
    notFound()
  }

  const name = holdingData.name as string
  const ticker = holdingData.ticker as string | null
  const units = Number(holdingData.units) || 0
  const avgPrice = Number(holdingData.avg_purchase_price) || 0
  const currentPrice = Number(holdingData.current_price) || avgPrice
  const holdingValue = currentPrice * units
  const costBasis = avgPrice * units
  const returnPct = costBasis > 0 ? ((holdingValue - costBasis) / costBasis) * 100 : 0
  const returnValue = holdingValue - costBasis

  return (
    <div className="mx-auto max-w-5xl px-4 py-8" data-testid="holding-detail-page">
      <Link
        href="/core/assets/holdings"
        className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
        data-testid="back-to-holdings-link"
      >
        <ArrowLeft className="h-4 w-4" />
        Terug naar holdings
      </Link>

      {/* Holding header with KPIs */}
      <section className="rounded-2xl border border-kern-200 bg-gradient-to-br from-kern-50 to-white p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-kern-100">
            <Briefcase className="h-6 w-6 text-kern-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-zinc-900" data-testid="holding-name">{name}</h1>
            {ticker && (
              <p className="mt-0.5 text-sm font-medium text-kern-600" data-testid="holding-ticker">{ticker}</p>
            )}
          </div>
          <Link
            href="/core/assets/holdings"
            className="rounded-lg border border-kern-200 bg-white px-3 py-1.5 text-xs font-medium text-kern-700 hover:bg-kern-50"
          >
            Alle holdings
          </Link>
        </div>

        {/* KPI cards */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4" data-testid="holding-kpis">
          <div>
            <p className="text-[10px] font-medium text-zinc-500 uppercase">Huidige waarde</p>
            <p className="mt-1 text-lg font-bold text-zinc-900" data-testid="holding-value">
              {formatCurrency(holdingValue)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium text-zinc-500 uppercase">Eenheden</p>
            <p className="mt-1 text-lg font-bold text-zinc-900" data-testid="holding-units">
              {units}
            </p>
            <p className="text-xs text-zinc-400">
              @ {formatCurrency(currentPrice)} per eenheid
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium text-zinc-500 uppercase">Gem. aankoopprijs</p>
            <p className="mt-1 text-lg font-bold text-zinc-900" data-testid="holding-avg-price">
              {formatCurrency(avgPrice)}
            </p>
            <p className="text-xs text-zinc-400">
              kostenbasis: {formatCurrency(costBasis)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium text-zinc-500 uppercase">Rendement</p>
            {costBasis > 0 ? (
              <>
                <p className={`mt-1 text-lg font-bold ${returnPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`} data-testid="holding-return">
                  {returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
                </p>
                <p className={`text-xs font-medium ${returnValue >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {returnValue >= 0 ? '+' : ''}{formatCurrency(returnValue)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-lg font-bold text-zinc-400">-</p>
            )}
          </div>
        </div>
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
