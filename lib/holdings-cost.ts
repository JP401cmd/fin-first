// lib/holdings-cost.ts
// ---------------------------------------------------------------------------
// Kostprijs per bezit uit de holdings-motor — ÉÉN home, twee consumenten.
//
// Stond tot 27-08-2026 als private helper in lib/assets-data-loader.ts en had
// daarmee precies één lezer: de kop-KPI op /overzicht/bezittingen. De vier
// rendement-widgets op /overzicht deden ondertussen hun eigen aftrekking op
// `assets.purchase_value` — het met de hand ingetypte getal dat deze motor nu
// juist vervangt. Kaart H7 ("Vier verschillende rendement-percentages") trok
// die tweede/derde implementatie terug naar deze bron; daarvoor moest de
// loader uit het assets-pagina-bestand naar een eigen module, zodat óók
// lib/dashboard-data-loader.ts hem kan aanroepen zonder de hele
// bezittingenpagina-loader te importeren.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js'
import { sumHoldingTotals, type HoldingTotalsRow } from './holdings-totals'
import { fetchBatchForexRates, getEURRateSync } from './forex'
import type { AssetHoldingsCost } from './asset-return'

/**
 * Kostbasis per bezit-ID over `investment_holdings` + `crypto_holdings`.
 *
 * RLS scoopt tot de eigen rijen; een bezit dat hier ontbreekt valt in
 * `buildAssetReturnBreakdown` zichtbaar terug op `purchase_value`. Falen is
 * non-fataal (lege map) — de pagina toont dan het oude, zwakkere getal in
 * plaats van niets.
 *
 * Valuta: dezelfde strategie als `lib/investment-holdings-data.ts` — batch-fetch
 * van de non-EUR koersen zodat `getEURRateSync` in de sommatie een cache-hit is.
 * Kostprijs en waarde lopen zo over dezelfde koers; een rate op alleen de waarde
 * zou het rendement met de wisselkoers laten meebewegen.
 */
export async function loadHoldingsCostByAssetId(
  supabase: SupabaseClient,
): Promise<Record<string, AssetHoldingsCost>> {
  type Row = HoldingTotalsRow & { asset_id: string | null }

  // `!inner` + de twee asset-filters spiegelen de gate van GET /api/holdings:
  // alleen bezittingen die de portfolio-tracker DAADWERKELIJK gebruiken leveren
  // een kostprijs. Zonder die gate rekende deze rollup door op holdings van een
  // bezit waarvoor `has_holdings_tracking` inmiddels uit staat — het scherm waar
  // die posities te zien zijn is dan onbereikbaar en `current_value` wordt met de
  // hand onderhouden, dus "kostprijs uit je posities" zou naar posities wijzen
  // die de app weigert te tonen. Die populatie bestaat echt; zie
  // scripts/cleanup-orphaned-holdings.sql (asset_not_tracking / asset_archived).
  // `assets!inner(...)` zonder FK-naam-hint: beide tabellen hebben precies één
  // foreign key naar `assets` (`*_asset_id_fkey`), dus de relatie is eenduidig.
  // Zelfde vorm als `transactions!inner(...)` in lib/budgets-data-loader.ts —
  // `!inner` is wat de asset-filters de PARENT-rijen laat wegfilteren; zonder
  // die hint nult PostgREST alleen de embed en blijft de holding-rij staan.
  const columns = 'asset_id, units, avg_purchase_price, current_price'
  const assetJoin = 'assets!inner(has_holdings_tracking, is_active)'
  const [investmentRes, cryptoRes] = await Promise.all([
    supabase
      .from('investment_holdings')
      .select(`${columns}, currency, ${assetJoin}`)
      .eq('is_active', true)
      .eq('assets.has_holdings_tracking', true)
      .eq('assets.is_active', true),
    supabase
      .from('crypto_holdings')
      .select(`${columns}, ${assetJoin}`)
      .eq('is_active', true)
      .eq('assets.has_holdings_tracking', true)
      .eq('assets.is_active', true),
  ])

  // Een gefaalde query levert een lege map en dus stil de OUDE, foute grondslag
  // (terugval op `purchase_value`) — precies het getal dat deze motor moest
  // vervangen. Non-fataal blijft juist (liever een zwakker getal dan een lege
  // pagina), maar het mag niet ongemerkt gebeuren.
  for (const [bron, res] of [['investment', investmentRes], ['crypto', cryptoRes]] as const) {
    if (res.error) {
      console.error(`[assets-loader:holdings-cost:${bron}] ${res.error.message}`)
    }
  }

  // ROW-NIVEAU KOSTPRIJS-POORT — `avg_purchase_price` is nullable zonder default
  // en drie ingestion-paden laten 'm leeg: wallet-sync schrijft 'm nooit,
  // exchange-sync alleen bij INSERT, broker-sync valt terug op null. In
  // `sumHoldingTotals` wordt `num(null)` 0, dus zo'n rij draagt géén kostprijs
  // maar wél volle marktwaarde — precies de "0 telt als gratis"-fout die deze
  // motor moest wegnemen, één laag lager dan de guard op assetniveau.
  // Die rijen gaan er hier volledig uit, aan BEIDE kanten: de resulterende
  // `value` is de marktwaarde die de kostprijs daadwerkelijk DEKT, zodat
  // `buildAssetReturnBreakdown` kan zien of er een gat zit.
  const covered = (r: Row) => {
    const units = Number(r.units)
    if (!Number.isFinite(units) || units === 0) return false
    const avg = r.avg_purchase_price == null ? NaN : Number(r.avg_purchase_price)
    return Number.isFinite(avg) && avg > 0
  }

  const rows = [
    ...((investmentRes.data ?? []) as unknown as Row[]),
    ...((cryptoRes.data ?? []) as unknown as Row[]),
  ].filter(covered)
  if (rows.length === 0) return {}

  const nonEur = new Set<string>()
  for (const r of rows) {
    const cur = (r.currency ?? 'EUR').toUpperCase()
    if (cur !== 'EUR') nonEur.add(cur)
  }
  if (nonEur.size > 0) await fetchBatchForexRates(Array.from(nonEur))

  const byAsset = new Map<string, Row[]>()
  for (const r of rows) {
    if (!r.asset_id) continue
    const bucket = byAsset.get(r.asset_id)
    if (bucket) bucket.push(r)
    else byAsset.set(r.asset_id, [r])
  }

  const rate = (currency: string) => {
    const cur = (currency || 'EUR').toUpperCase()
    return cur === 'EUR' ? 1 : getEURRateSync(cur)
  }

  const result: Record<string, AssetHoldingsCost> = {}
  for (const [assetId, assetRows] of byAsset) {
    const totals = sumHoldingTotals(assetRows, rate)
    result[assetId] = { cost: totals.totalCost, value: totals.totalValue }
  }
  return result
}
