// lib/investment-holdings-data.ts
//
// Server-side loader voor `/core/assets/investment`. Levert per ISIN-positie
// een rij met direct bruikbare display-velden, waarbij non-EUR currencies
// server-side via `lib/forex.ts` worden omgerekend naar EUR-waarde.
//
// Bron: alleen `investment_holdings` (typed-tabel uit migratie
// 20260502000003). Geen fallback op legacy `holdings` — die is hernoemd.
//
// Forex-strategie: we cachen per render-cyclus de `getEURRateSync()` waarde
// per currency. Voor de overgrote meerderheid van users is alles EUR; de
// USD/GBP-paden raken de cache (of de fallback-tabel) zonder netwerk-calls
// — past binnen het server-component budget.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchBatchForexRates, getEURRateSync } from './forex'

// ── Types ──────────────────────────────────────────────────────────────

export interface InvestmentHoldingRow {
  id: string
  assetId: string
  /** Naam van de parent asset — voor breadcrumb context. */
  assetName: string
  ticker: string
  name: string | null
  isin: string | null
  exchange: string | null
  units: number
  currentPrice: number | null
  /** Native currency van het instrument (USD/EUR/GBP/...). */
  currency: string
  /** EUR-waarde, server-side: units × currentPrice × forexRate. */
  valueEur: number
  assetClass: string | null
  sector: string | null
  isFavorite: boolean
  /** Bron-tag uit CSV-import: 'degiro' | 'saxo' | 'ing' | 'trading212' | 'etoro' | NULL (manual). */
  externalSource: string | null
  lastPriceUpdate: string | null
  /** Dag-rendement-percentage (Yahoo Finance), enkel beschikbaar voor freshly-synced posities. */
  dailyChangePercent: number | null
}

// ── Loader ─────────────────────────────────────────────────────────────

/**
 * Laad alle actieve investment-holdings voor de ingelogde user. Currency-
 * conversie naar EUR gebeurt in twee passes: eerst verzamelen we de unieke
 * non-EUR currencies, dan halen we hun rates batched op (cache-first), en
 * pas dan rekenen we per rij `valueEur` uit. Bij 0 non-EUR currencies wordt
 * de batch-call helemaal overgeslagen.
 *
 * Sortering: op EUR-waarde aflopend zodat de zwaarste posities boven
 * staan — past bij krant-prioriteit (de belangrijkste post leest eerst).
 */
export const loadInvestmentHoldingsForUser = cache(
  async (supabase: SupabaseClient): Promise<InvestmentHoldingRow[]> => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
      .from('investment_holdings')
      .select(
        `
        id,
        asset_id,
        ticker,
        name,
        isin,
        exchange,
        currency,
        units,
        current_price,
        last_price_update,
        previous_close,
        daily_change_percent,
        asset_class,
        sector,
        is_favorite,
        external_source,
        asset:assets!asset_id(id, name)
        `,
      )
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (error || !data) return []

    type Row = {
      id: string
      asset_id: string
      ticker: string
      name: string | null
      isin: string | null
      exchange: string | null
      currency: string | null
      units: number | string | null
      current_price: number | string | null
      last_price_update: string | null
      previous_close: number | string | null
      daily_change_percent: number | string | null
      asset_class: string | null
      sector: string | null
      is_favorite: boolean | null
      external_source: string | null
      asset: { id: string; name: string } | { id: string; name: string }[] | null
    }

    const rows = data as unknown as Row[]

    // Verzamel unieke non-EUR currencies; pas dan eventueel de batch-fetch.
    const nonEurCurrencies = new Set<string>()
    for (const r of rows) {
      const cur = (r.currency ?? 'EUR').toUpperCase()
      if (cur !== 'EUR') nonEurCurrencies.add(cur)
    }
    if (nonEurCurrencies.size > 0) {
      // `fetchBatchForexRates` vult de in-memory cache zodat de
      // `getEURRateSync` calls hieronder vrijwel altijd een hit zijn.
      await fetchBatchForexRates(Array.from(nonEurCurrencies))
    }

    function pickOne<T>(value: T | T[] | null): T | null {
      if (!value) return null
      return Array.isArray(value) ? (value[0] ?? null) : value
    }

    const result: InvestmentHoldingRow[] = rows.map((r) => {
      const units = Number(r.units) || 0
      const currentPrice =
        r.current_price != null ? Number(r.current_price) : null
      const currency = (r.currency ?? 'EUR').toUpperCase()
      const forexRate = currency === 'EUR' ? 1 : getEURRateSync(currency)
      const valueEur =
        currentPrice != null ? units * currentPrice * forexRate : 0

      const asset = pickOne(r.asset)

      return {
        id: r.id,
        assetId: r.asset_id,
        assetName: asset?.name ?? '',
        ticker: r.ticker,
        name: r.name,
        isin: r.isin,
        exchange: r.exchange,
        units,
        currentPrice,
        currency,
        valueEur,
        assetClass: r.asset_class,
        sector: r.sector,
        isFavorite: r.is_favorite === true,
        externalSource: r.external_source,
        lastPriceUpdate: r.last_price_update,
        dailyChangePercent:
          r.daily_change_percent != null
            ? Number(r.daily_change_percent)
            : null,
      }
    })

    result.sort((a, b) => b.valueEur - a.valueEur)
    return result
  },
)

/**
 * Filter alle investment-holdings van de user op één parent-asset. Profiteert
 * van de `react/cache` rond `loadInvestmentHoldingsForUser` zodat elke
 * asset-detail-open binnen één request gratis meelift op één Supabase-fetch
 * + één forex-batch.
 */
export async function loadInvestmentHoldingsForAsset(
  supabase: SupabaseClient,
  assetId: string,
): Promise<InvestmentHoldingRow[]> {
  const all = await loadInvestmentHoldingsForUser(supabase)
  return all.filter((h) => h.assetId === assetId)
}
