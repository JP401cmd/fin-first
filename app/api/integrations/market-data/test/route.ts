// GET /api/integrations/market-data/test
//
// Smoke-test voor de publieke prijsbronnen die de app raakt:
//   • Yahoo Finance — primaire prijsbron voor stocks/ETFs/top crypto
//   • CoinGecko    — fallback voor crypto-coins die Yahoo niet kent
//
// Beide endpoints zijn rate-limited maar publiek; geen user-credentials.
// Returns per source: { ok, latencyMs, error? }. De UI rendert dit als een
// "Test" actie in het sync-rapport zodat de gebruiker bij twijfel kan zien of
// onze prijspijplijn nog werkt.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { unauthorized } from '@/lib/api/respond'
import { fetchPriceData } from '@/lib/price-feed'
import { fetchEurPrices } from '@/lib/integrations/coingecko-client'

interface SourceResult {
  ok: boolean
  latencyMs: number
  error?: string
}

async function pingYahoo(): Promise<SourceResult> {
  const startedAt = performance.now()
  try {
    const data = await fetchPriceData('BTC-EUR')
    const latencyMs = Math.round(performance.now() - startedAt)
    if (data && typeof data.price === 'number' && data.price > 0) {
      return { ok: true, latencyMs }
    }
    return { ok: false, latencyMs, error: 'Geen prijs ontvangen' }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startedAt)
    return {
      ok: false,
      latencyMs,
      error: err instanceof Error ? err.message : 'Onbekende fout',
    }
  }
}

async function pingCoinGecko(): Promise<SourceResult> {
  const startedAt = performance.now()
  try {
    const result = await fetchEurPrices(['bitcoin'])
    const latencyMs = Math.round(performance.now() - startedAt)
    const price = result?.bitcoin
    if (typeof price === 'number' && price > 0) {
      return { ok: true, latencyMs }
    }
    return { ok: false, latencyMs, error: 'Geen prijs ontvangen' }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startedAt)
    return {
      ok: false,
      latencyMs,
      error: err instanceof Error ? err.message : 'Onbekende fout',
    }
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  const [yahoo, coingecko] = await Promise.all([pingYahoo(), pingCoinGecko()])

  return NextResponse.json(
    { yahoo, coingecko },
    { headers: { 'cache-control': 'no-store' } },
  )
}
