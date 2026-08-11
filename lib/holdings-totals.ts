// lib/holdings-totals.ts
// ---------------------------------------------------------------------------
// Portefeuille-brede totalen over een set holding-rijen: marktwaarde, kostbasis,
// opbrengst en inleg. ÉÉN implementatie, gedeeld door de server-loader
// (`lib/holdings-data-loader.ts`) en `GET /api/holdings`.
//
// WAAROM GEDEELD — de twee bronnen liepen uiteen. De loader vult de eerste
// render, de route elke herlading dáárna. Rekenden ze verschillend, dan zag de
// gebruiker een bedrag veranderen door op "Prijzen vernieuwen" te klikken,
// zonder dat er iets aan zijn portefeuille was gewijzigd. Twee getallen voor
// hetzelfde feit is precies wat deze app niet mag doen.
//
// WAAROM `pnl_*` NIET GENOEG IS — de opbrengst komt bij voorkeur uit de
// canonieke aggregatie-engine (`pnl_total`/`pnl_invested`, afgeleid uit
// `investment_transactions`), want alleen die telt de posities mee die je
// inmiddels verkocht hebt: een gesloten positie heeft `units = 0` en verdwijnt
// dus mét haar resultaat uit elke som over de holding-kolommen.
//
// Maar die velden bestaan alleen wanneer er transacties zijn. Wie zijn posities
// met de hand bijhoudt — de standaardsituatie voor iedereen die nooit een
// broker-CSV importeerde — heeft ze niet. Zou de som die rijen overslaan, dan
// verdween het rendement voor precies die groep. Daarom valt deze helper PER RIJ
// terug op de holding-kolommen. Dat is daar ook de juiste uitkomst: zonder
// transacties zijn er geen verkopen, dus geen gerealiseerd resultaat dat de
// kolommen zouden missen. De twee grondslagen sluiten naadloos op elkaar aan.
// ---------------------------------------------------------------------------

/** Minimale rij-vorm. Superset-veilig: de loader- en route-rijen voldoen. */
export interface HoldingTotalsRow {
  units?: number | string | null
  avg_purchase_price?: number | string | null
  current_price?: number | string | null
  currency?: string | null
  /** Engine-opbrengst; `null`/afwezig wanneer de positie geen transacties heeft. */
  pnl_total?: number | null
  /** Engine-inleg (bruto Σ aankoopbedragen); zelfde voorwaarde. */
  pnl_invested?: number | null
}

export interface HoldingTotals {
  /** Marktwaarde van de huidige posities, in EUR. */
  totalValue: number
  /** `units × avg_purchase_price` over diezelfde posities, in EUR. */
  totalCost: number
  /**
   * Totale opbrengst over de HELE historie: gerealiseerd + ongerealiseerd +
   * dividend − kosten waar de engine 'm kent, anders `marktwaarde − kostbasis`.
   */
  totalPnL: number
  /** Bijbehorende noemer — de inleg waarover `totalPnL` is behaald. */
  totalInvested: number
}

function num(v: number | string | null | undefined): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

/**
 * Telt de vier portefeuille-totalen op over `rows`.
 *
 * @param eurRate Wisselkoers-opzoeker per valutacode. De aanroeper levert 'm
 *   (server: `getEURRateSync`), zodat deze helper puur blijft en testbaar is
 *   zonder de forex-cache. Zonder valuta op de rij geldt EUR (koers 1).
 */
export function sumHoldingTotals(
  rows: readonly HoldingTotalsRow[],
  eurRate: (currency: string) => number = () => 1,
): HoldingTotals {
  let totalValue = 0
  let totalCost = 0
  let totalPnL = 0
  let totalInvested = 0

  for (const row of rows) {
    const rate = eurRate(row.currency || 'EUR')
    const units = num(row.units)
    const avgCost = num(row.avg_purchase_price)
    const price = row.current_price != null ? num(row.current_price) : avgCost

    const value = units * price * rate
    const cost = units * avgCost * rate
    totalValue += value
    totalCost += cost

    // Engine waar beschikbaar, kolommen als terugval — zie de kop van dit
    // bestand. `pnl_invested` is de gate: zonder inleg is er geen noemer en
    // zegt een `pnl_total` van 0 niets.
    if (row.pnl_invested != null && row.pnl_total != null) {
      // GEEN `* rate`. De motor (lib/holdings-pnl-enrichment.ts →
      // lib/holdings-aggregation.ts) leest `currency` nergens: hij telt de
      // bedragen uit `investment_transactions` op zoals ze geboekt staan. Die
      // bedragen dragen hun eigen valuta, niet die van de holding-rij. Wél
      // omrekenen schaalde het rendement van een USD-genoteerde positie met de
      // dollarkoers terwijl de onderliggende boekingen in euro's stonden — een
      // kop-KPI ("Rendement sinds aankoop") die ~8% naast de waarde eronder lag.
      totalPnL += row.pnl_total
      totalInvested += row.pnl_invested
    } else {
      totalPnL += value - cost
      totalInvested += cost
    }
  }

  return { totalValue, totalCost, totalPnL, totalInvested }
}
