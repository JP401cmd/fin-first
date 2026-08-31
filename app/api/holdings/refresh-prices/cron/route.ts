import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { fetchPriceData } from '@/lib/price-feed'
import { buildClassificationUpdate } from '@/lib/holdings-classification'
import { fetchCoinPricesEurBatch } from '@/lib/integrations/coingecko-client'
import { fetchBatchForexRates } from '@/lib/forex'
import {
  syncAssetValueFromInvestmentHoldings,
  syncAssetValueFromCryptoHoldings,
} from '@/lib/holdings-sync'
import { syncAllExchangeConnections } from '@/lib/integrations/exchange-cron'
import { syncAllWalletAddresses } from '@/lib/integrations/wallet-cron'
import { recordJobRun } from '@/lib/job-runs'
import { probeIntegrations } from '@/lib/integrations/health-probe'
import { unauthorized } from '@/lib/api/respond'

/**
 * GET /api/holdings/refresh-prices/cron
 *
 * Scheduled endpoint for automatic price updates across all users.
 * Designed to be called by:
 * - Vercel Cron Jobs (see vercel.json)
 * - Supabase pg_cron / Edge Function
 * - External cron service (cron-job.org, etc.)
 *
 * Uses service role key (not user auth) to update prices for ALL users.
 * Protected by CRON_SECRET environment variable.
 *
 * Behaviour (post-P2):
 * - Loops over BOTH `investment_holdings` and `crypto_holdings`.
 * - Investment side uses Yahoo Finance, deduplicating tickers across users.
 * - Crypto side tries Yahoo `{symbol}-EUR` first, falls back to a single
 *   batched CoinGecko request for the long-tail symbols Yahoo can't price.
 * - Persists day-close in `investment_holding_prices` / `crypto_holding_prices`.
 * - Syncs parent asset values from the typed rollup helpers.
 *
 * Schema (werkelijkheid): dit endpoint draait 1×/dag om 18:00 UTC (zie
 * `vercel.json`) — vaker mag niet op het Vercel-plan waarop we draaien. Tussen
 * de dagelijkse runs door verversen gebruikers hun eigen holdings met de
 * handmatige "Prijzen vernieuwen"-knop (POST /api/holdings/refresh-prices).
 */
export const maxDuration = 60

export async function GET(request: Request) {
  const startTime = Date.now()

  // ── Auth: verify CRON_SECRET ──────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const url = new URL(request.url)
  const querySecret = url.searchParams.get('secret')

  const isProduction = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

  // In productie is een geconfigureerd secret verplicht — een ontbrekend
  // secret mag dit service-role-endpoint niet openbaar maken (fail-closed).
  if (!cronSecret && isProduction) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 },
    )
  }

  const isAuthorized =
    !cronSecret || // dev mode zonder secret
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret

  if (!isAuthorized) {
    return unauthorized()
  }

  // ── Supabase service role client ──────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({
      error: 'SUPABASE_SERVICE_ROLE_KEY not configured',
      description: 'This endpoint requires the service role key to update prices for all users.',
      manual_trigger: 'Users can manually refresh via the "Prijzen vernieuwen" button on the holdings page.',
    }, { status: 500 })
  }

  // Cast to the loosely-typed `SupabaseClient` so the helpers below can call
  // `.from('investment_holdings')` without the strict default-schema generics
  // collapsing the row shape to `never`.
  const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey) as unknown as SupabaseClient
  const startedAt = new Date(startTime).toISOString()

  try {
    // ── Step 1: Investment holdings refresh ───────────────────────
    const investmentSummary = await refreshInvestmentHoldings(supabase)

    // ── Step 2: Crypto holdings refresh ───────────────────────────
    const cryptoSummary = await refreshCryptoHoldings(supabase)

    // ── Step 3: Sync exchange connections (W1.2) ──────────────────
    // Runs AFTER price refresh so the asset-value rollup inside each sync
    // sees the latest crypto quotes. Failures here never abort the cron;
    // they are recorded in `external_data_sources`.
    let exchangeResult
    try {
      exchangeResult = await syncAllExchangeConnections(supabase)
    } catch (err) {
      exchangeResult = {
        total: 0, ok: 0, failed: 0, skipped: 0,
        errors: [{ connectionId: '*', error: err instanceof Error ? err.message : 'unknown' }],
      }
    }

    // ── Step 4: Sync on-chain wallet addresses (W1.3) ─────────────
    let walletResult
    try {
      walletResult = await syncAllWalletAddresses(supabase)
    } catch (err) {
      walletResult = {
        total: 0, ok: 0, failed: 0,
        errors: [{ walletId: '*', error: err instanceof Error ? err.message : 'unknown' }],
      }
    }

    const summary = {
      investment: investmentSummary,
      crypto: cryptoSummary,
      exchanges: exchangeResult,
      wallets: walletResult,
    }
    const hadErrors =
      investmentSummary.errors > 0 ||
      cryptoSummary.errors > 0 ||
      (exchangeResult?.failed ?? 0) > 0 ||
      (walletResult?.failed ?? 0) > 0

    await recordJobRun(supabase, {
      job: 'holdings-prices',
      status: 'success',
      startedAt,
      summary,
      error: hadErrors ? 'Eén of meer deeltaken faalden — zie samenvatting' : null,
    })

    // ── Stap 5: Integraties health-probe (meelift) ────────────────────────────
    // Wordt uitgevoerd nádat de prijs-refresh al is gelogd, zodat een probe-fout
    // de prijsverversing NOOIT rood maakt. Eigen try/catch; eigen job-run-rij.
    try {
      const probeStartedAt = new Date().toISOString()
      const probeResults = await probeIntegrations()
      const probed = probeResults.length
      const ok = probeResults.filter((r) => r.ok === true).length
      const failed = probeResults.filter((r) => r.ok === false).length
      const perId = Object.fromEntries(
        probeResults.map((r) => [r.id, r.ok === true ? r.latencyMs ?? 'ok' : (r.code ?? 'error')])
      )
      await recordJobRun(supabase, {
        job: 'integraties-health',
        status: failed === 0 ? 'success' : 'error',
        startedAt: probeStartedAt,
        summary: { probed, ok, failed, perId },
        error: failed > 0 ? `${failed} van ${probed} probe(s) gefaald` : null,
      })
    } catch {
      // Probe-fout nooit naar buiten laten lekken — prijs-refresh blijft leidend.
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary,
      duration_ms: Date.now() - startTime,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    await recordJobRun(supabase, { job: 'holdings-prices', status: 'error', startedAt, error: message })
    return NextResponse.json({
      error: message,
      duration_ms: Date.now() - startTime,
    }, { status: 500 })
  }
}

interface BucketSummary {
  total: number
  unique_tickers: number
  updated: number
  stale: number
  skipped: number
  errors: number
  assets_synced: number
  /**
   * Aantal posities dat in deze ronde een assetklasse, geografie of beurs kreeg.
   * Het 52-weeks bereik telt bewust NIET mee — dat is een koersveld dat élke
   * ronde ververst wordt, dus meetellen zou deze teller gelijkmaken aan
   * `updated` en daarmee betekenisloos maken.
   */
  classified: number
}

async function refreshInvestmentHoldings(supabase: SupabaseClient): Promise<BucketSummary> {
  const summary: BucketSummary = { total: 0, unique_tickers: 0, updated: 0, stale: 0, skipped: 0, errors: 0, assets_synced: 0, classified: 0 }

  const { data: rows, error } = await supabase
    .from('investment_holdings')
    // `asset_class, geography, exchange` meelezen is noodzakelijk, niet extra:
    // zonder de huidige waarde kun je "nog leeg" niet onderscheiden van "de
    // gebruiker heeft dit zelf ingevuld", en zou de feed een handmatige keuze
    // overschrijven. Het 52-weeks bereik hoeft NIET meegelezen: dat is een
    // koersveld dat elke ronde onvoorwaardelijk vervangen wordt.
    // `units` is nodig voor de rollup-selectie hieronder: een gesloten positie
    // (0 stuks) mag haar bezit nooit een rollup naar €0 bezorgen. `currency`
    // dient om de FX-cache te warmen vóór de rollup naar euro rekent.
    .select('id, user_id, asset_id, ticker, isin, current_price, units, currency, asset_class, geography, exchange')
    .eq('is_active', true)
    .or('ticker.neq.null,isin.neq.null')

  if (error || !rows) return summary
  summary.total = rows.length

  // Deduplicate tickers to minimise Yahoo calls.
  const tickerToHoldings = new Map<string, Array<typeof rows[number]>>()
  for (const h of rows) {
    const t = ((h.ticker as string | null) || (h.isin as string | null) || '').trim().toUpperCase()
    if (!t) {
      summary.skipped++
      continue
    }
    const list = tickerToHoldings.get(t) ?? []
    list.push(h)
    tickerToHoldings.set(t, list)
  }
  summary.unique_tickers = tickerToHoldings.size

  const tickers = Array.from(tickerToHoldings.keys())
  const priceResults = new Map<string, Awaited<ReturnType<typeof fetchPriceData>>>()
  for (const t of tickers) {
    const data = await fetchPriceData(t)
    priceResults.set(t, data)
    if (data?.source === 'yahoo_finance') {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  // ── Rollup-kandidaten: elke LOPENDE positie, ongeacht de koers-uitkomst ──
  // `assets.current_value` is de weggeschreven kopie van Σ holdings, geen eigen
  // feit. Zolang alleen geslaagde koers-updates een rollup aanjoegen, bleef die
  // kopie eeuwig hangen voor posities die de feed niet kan prijzen — de
  // holdings-pagina toonde dan Σ holdings en élk vermogens-oppervlak het oude
  // getal (kaart UR2-12). Gesloten posities (0 stuks) tellen bewust niet mee:
  // die zouden een geldige waarde naar €0 kunnen wissen (WF-BEZIT-21).
  const assetsToSync = new Set<string>()
  for (const h of rows) {
    const assetId = h.asset_id as string | null
    if (assetId && h.user_id && Math.abs(Number(h.units) || 0) >= 1e-9) {
      assetsToSync.add(`${assetId}:${h.user_id as string}`)
    }
  }

  for (const [ticker, holdings] of tickerToHoldings.entries()) {
    const priceData = priceResults.get(ticker)
    if (!priceData) {
      summary.stale += holdings.length
      continue
    }

    const today = new Date().toISOString().slice(0, 10)
    for (const h of holdings) {
      const updateFields: Record<string, unknown> = {
        current_price: priceData.price,
        last_price_update: new Date().toISOString(),
      }
      if (priceData.previousClose !== null) updateFields.previous_close = priceData.previousClose
      if (priceData.dailyChangePercent !== null) updateFields.daily_change_percent = priceData.dailyChangePercent
      if (priceData.currency) updateFields.currency = priceData.currency
      // 52-weeks bereik: koersveld, geen classificatie — elke ronde opnieuw uit
      // de verse feed (het bereik schuift dagelijks op), maar nooit een bestaande
      // waarde met `null` overschrijven als de feed niets levert. Deze route
      // rekent — anders dan de handmatige refresh — niets naar EUR om; het
      // bereik blijft dus in dezelfde valuta als de `current_price` die hier
      // wordt weggeschreven, en dat is precies de bedoeling.
      if (priceData.fiftyTwoWeekHigh !== null) updateFields.fifty_two_week_high = priceData.fiftyTwoWeekHigh
      if (priceData.fiftyTwoWeekLow !== null) updateFields.fifty_two_week_low = priceData.fiftyTwoWeekLow

      // Classificatie langs exact dezelfde regel als de handmatige refresh.
      // Zonder dit vulde de portefeuille-verdeling alleen voor wie zélf op
      // "Prijzen vernieuwen" drukte — de nachtelijke ronde raakt dezelfde
      // posities maar liet ze ongeclassificeerd, en dat verschil is aan de
      // buitenkant niet te zien.
      const classification = buildClassificationUpdate(priceData, h)
      Object.assign(updateFields, classification)
      if (Object.keys(classification).length > 0) summary.classified++

      const { error: upErr } = await supabase
        .from('investment_holdings')
        .update(updateFields)
        .eq('id', h.id as string)

      if (upErr) {
        summary.errors++
        continue
      }
      summary.updated++

      await supabase
        .from('investment_holding_prices')
        .upsert(
          {
            holding_id: h.id as string,
            date: today,
            close_price: priceData.price,
            currency: priceData.currency || 'EUR',
            source: 'yahoo_finance',
          },
          { onConflict: 'holding_id,date' },
        )
    }
  }

  // Warm de FX-cache vóór de rollup: `syncAssetValueFromInvestmentHoldings`
  // gebruikt `getEURRateSync`, dat zónder verse cache op de hardgecodeerde
  // FALLBACK_RATES terugvalt. Eén batch-call per ronde; EUR-only portefeuilles
  // (de meeste) doen hier niets.
  const foreignCurrencies = Array.from(new Set(
    rows
      .map((h) => ((h.currency as string | null) || 'EUR').trim().toUpperCase())
      .filter((c) => c !== 'EUR'),
  ))
  if (foreignCurrencies.length > 0) {
    try {
      await fetchBatchForexRates(foreignCurrencies)
    } catch {
      // Koersen niet op te halen → de helper valt terug op FALLBACK_RATES.
      // Nooit de hele ronde laten klappen op een wisselkoers.
    }
  }

  // Roll up parent assets — via de CANONIEKE helper, niet via een eigen som.
  // De inline kopie die hier stond liet `getEURRateSync` weg: een positie in USD
  // of GBP werd door de nachtelijke ronde ONGECONVERTEERD naar
  // `assets.current_value` geschreven, terwijl de handmatige refresh én de
  // getoonde marktwaarde (`sumHoldingTotals`) wél naar euro rekenen. Twee sommen
  // voor hetzelfde feit, met de valuta-koers als verschil.
  for (const key of assetsToSync) {
    const [assetId, userId] = key.split(':')
    const { synced } = await syncAssetValueFromInvestmentHoldings(supabase, assetId, userId)
    if (synced) summary.assets_synced++
  }

  return summary
}

async function refreshCryptoHoldings(supabase: SupabaseClient): Promise<BucketSummary> {
  const summary: BucketSummary = { total: 0, unique_tickers: 0, updated: 0, stale: 0, skipped: 0, errors: 0, assets_synced: 0, classified: 0 }

  const { data: rows, error } = await supabase
    .from('crypto_holdings')
    // `units` is nodig voor de rollup-selectie hieronder — zie de
    // investment-kant: een gesloten positie mag geen rollup naar €0 aanjagen.
    .select('id, user_id, asset_id, symbol, current_price, units, is_fiat_balance')
    .eq('is_active', true)

  if (error || !rows) return summary
  summary.total = rows.length

  // Group by symbol for one Yahoo + one CoinGecko fetch per symbol.
  const symbolToHoldings = new Map<string, Array<typeof rows[number]>>()
  for (const h of rows) {
    if ((h.is_fiat_balance as boolean | null) === true) {
      summary.skipped++
      continue
    }
    const sym = ((h.symbol as string | null) || '').trim().toUpperCase()
    if (!sym) {
      summary.skipped++
      continue
    }
    const list = symbolToHoldings.get(sym) ?? []
    list.push(h)
    symbolToHoldings.set(sym, list)
  }
  summary.unique_tickers = symbolToHoldings.size

  const symbols = Array.from(symbolToHoldings.keys())
  const yahooResults = new Map<string, Awaited<ReturnType<typeof fetchPriceData>>>()
  const yahooMisses: string[] = []

  for (const sym of symbols) {
    const data = await fetchPriceData(`${sym}-EUR`)
    yahooResults.set(sym, data)
    if (!data) yahooMisses.push(sym)
    if (data?.source === 'yahoo_finance') {
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }

  const cgPrices = yahooMisses.length > 0
    ? await fetchCoinPricesEurBatch(yahooMisses)
    : {}

  // Rollup-kandidaten: zie de investment-kant. Fiat-saldi tellen hier bewust
  // WEL mee — `syncAssetValueFromCryptoHoldings` rekent ze in de bezit-waarde
  // mee (het totaal op de exchange), ook al krijgen ze geen koers.
  const assetsToSync = new Set<string>()
  for (const h of rows) {
    const assetId = h.asset_id as string | null
    if (assetId && h.user_id && Math.abs(Number(h.units) || 0) >= 1e-9) {
      assetsToSync.add(`${assetId}:${h.user_id as string}`)
    }
  }
  const today = new Date().toISOString().slice(0, 10)

  for (const [sym, holdings] of symbolToHoldings.entries()) {
    const yahooData = yahooResults.get(sym) ?? null
    const yahooPrice = yahooData?.price ?? null
    const yahooPriceValid = typeof yahooPrice === 'number' && Number.isFinite(yahooPrice) && yahooPrice > 0

    let price: number | null = null
    let source: 'yahoo_finance' | 'coingecko' | null = null
    if (yahooPriceValid) {
      price = yahooPrice
      source = 'yahoo_finance'
    } else {
      const cg = cgPrices[sym]
      if (typeof cg === 'number' && Number.isFinite(cg) && cg > 0) {
        price = cg
        source = 'coingecko'
      }
    }

    if (price == null || source == null) {
      summary.stale += holdings.length
      continue
    }

    for (const h of holdings) {
      const { error: upErr } = await supabase
        .from('crypto_holdings')
        .update({
          current_price: price,
          last_price_update: new Date().toISOString(),
        })
        .eq('id', h.id as string)

      if (upErr) {
        summary.errors++
        continue
      }
      summary.updated++

      await supabase
        .from('crypto_holding_prices')
        .upsert(
          {
            holding_id: h.id as string,
            date: today,
            close_price: price,
            currency: 'EUR',
            source,
          },
          { onConflict: 'holding_id,date' },
        )
    }
  }

  // Roll up parent assets — via de canonieke helper (zie de investment-kant).
  for (const key of assetsToSync) {
    const [assetId, userId] = key.split(':')
    const { synced } = await syncAssetValueFromCryptoHoldings(supabase, assetId, userId)
    if (synced) summary.assets_synced++
  }

  return summary
}
