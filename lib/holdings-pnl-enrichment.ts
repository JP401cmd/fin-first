// lib/holdings-pnl-enrichment.ts
// ---------------------------------------------------------------------------
// Server-side P&L-verrijking voor de holdings-LIJST. Verrijkt een set
// investment-holdings met opbrengst-cijfers (gerealiseerd/ongerealiseerd/
// totaal) zónder een eigen som te schrijven: het hergebruikt de canonieke
// aggregatie-engine `computePositionFromTransactions` + `valuePosition`
// (lib/holdings-aggregation.ts) — consume, don't recompute.
//
// Waarom hier en niet in de engine-file: de batch-laag (één DB-query voor
// álle holdings) is data-loading, geen rekenwerk. De engine blijft puur
// (transacties → positie). Deze module koppelt ze: één `.in(holding_id, ids)`
// query (GEEN N+1), groeperen per holding, engine draaien, P&L teruggeven.
//
// Consumenten: `loadHoldingsData` (server-initial-render) en `GET
// /api/holdings` (client-hydratie). Beide krijgen identieke getallen omdat ze
// dezelfde helper op dezelfde engine draaien.
//
// Currency: de P&L wordt afgeleid uit `investment_transactions` in de
// transactie-eigen valuta (de engine sommeert prijzen × eenheden zoals
// opgeslagen). Dat spiegelt de full-page detail-route
// (app/(app)/core/assets/investment/[holdingId]/page.tsx), die de totaal-
// P&L óók in de holding-valuta toont. De lijst formatteert met `useFc()`
// (EUR-locale); gesloten posities zijn vrijwel altijd in EUR.
// ---------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  computePositionFromTransactions,
  valuePosition,
  type PositionTransaction,
} from '@/lib/holdings-aggregation'

/** Per-holding P&L-cijfers die aan een lijst-rij worden gehangen. Alle EUR-
 *  velden in de transactie-eigen valuta; `null` waar geen zinvolle waarde is. */
export interface HoldingPnL {
  /** Totale winst/verlies = gerealiseerd + ongerealiseerd (engine). */
  totalPnL: number
  /** Gerealiseerde winst/verlies (incl. dividend, − kosten). */
  realizedPnL: number
  /** Ongerealiseerde winst/verlies op de resterende positie. */
  unrealizedPnL: number
  /** Bruto inleg (Σ aankoopbedragen) — noemer voor het rendement-%. */
  totalInvested: number
  /** Som dividend-uitkeringen. */
  dividends: number
  /** Som transactiekosten. */
  totalFees: number
  /** totalPnL / totalInvested × 100 (guard tegen /0 → null). */
  totalPnLPct: number | null
  /** Engine-oordeel: positie volledig gesloten (netUnits === 0). */
  isClosed: boolean
}

/** Minimale holding-vorm die de helper nodig heeft om P&L te koppelen. */
interface HoldingForPnL {
  id: string
  current_price?: number | string | null
}

/** Ruwe transactie-rij zoals PostgREST 'm levert (NUMERIC → string). */
interface RawInvestmentTx {
  holding_id: string
  type: string
  units: number | string | null
  price_per_unit: number | string | null
  total_amount: number | string | null
  date: string | null
}

/**
 * Haalt in ÉÉN batch-query de transacties van alle gegeven holdings op,
 * groepeert per holding en leidt de P&L af via de canonieke engine.
 *
 * Koppeling: `investment_transactions.holding_id` → `investment_holdings.id`
 * (FK uit migratie 20260502000003, regel 173). We selecteren bewust geen
 * `fees`-kolom: die bestaat niet op `investment_transactions`; de engine
 * behandelt afwezige fees als 0. Mirror van de select in de detail-route
 * (`app/api/investment/holdings/[id]/detail/route.ts`).
 *
 * @returns Map<holdingId, HoldingPnL>. Holdings zónder transacties komen NIET
 *   in de map voor (de aanroeper valt dan terug op de holding-kolommen).
 */
export async function loadHoldingsPnL(
  supabase: SupabaseClient,
  holdings: readonly HoldingForPnL[],
  userId: string,
): Promise<Map<string, HoldingPnL>> {
  const result = new Map<string, HoldingPnL>()

  const ids = holdings.map((h) => h.id).filter((id): id is string => !!id)
  if (ids.length === 0) return result

  // Eén batch-query — absoluut geen query-per-holding (N+1). RLS dwingt
  // user-scoping af; de expliciete user_id-filter is een tweede slot.
  //
  // BEWUST GÉÉN .limit() hier: dit is een MULTI-holding batch (`.in(...)`), dus
  // een rij-cap zou over álle holdings sámen tellen en de laatste holdings in de
  // set partiële (= foute) transacties geven. Dit pad is de volledige-historie-
  // REFERENTIE; de per-holding detail-route en full-page cappen op
  // HOLDINGS_TX_AGG_LIMIT (5000) om diezelfde feitelijk-volledige set te
  // benaderen. Divergentie kan alleen bij >5000 transacties op één positie —
  // ruim buiten elk realistisch account; daar prevaleert deze referentie.
  const { data: txRows, error } = await supabase
    .from('investment_transactions')
    .select('holding_id, type, units, price_per_unit, total_amount, date')
    .in('holding_id', ids)
    .eq('user_id', userId)

  // Bij een fout (bv. tabel ontbreekt in een oude omgeving) geven we een
  // lege map terug: de lijst valt netjes terug op de holding-kolommen.
  if (error || !txRows) return result

  // Groepeer transacties per holding.
  const byHolding = new Map<string, PositionTransaction[]>()
  for (const raw of txRows as RawInvestmentTx[]) {
    const hid = raw.holding_id
    if (!hid) continue
    const list = byHolding.get(hid) ?? []
    list.push({
      type: raw.type,
      units: raw.units ?? 0,
      price_per_unit: raw.price_per_unit ?? 0,
      total_amount: raw.total_amount ?? null,
      date: raw.date ?? null,
    })
    byHolding.set(hid, list)
  }

  // Per holding: engine draaien (canonieke som) + waarderen op current_price.
  const priceById = new Map<string, number | null>()
  for (const h of holdings) {
    const p =
      h.current_price != null && Number.isFinite(Number(h.current_price))
        ? Number(h.current_price)
        : null
    priceById.set(h.id, p)
  }

  for (const [hid, txs] of byHolding.entries()) {
    const agg = computePositionFromTransactions(txs)
    const valued = valuePosition(agg, priceById.get(hid) ?? null)
    const totalPnLPct =
      valued.totalInvested > 0
        ? (valued.totalPnL / valued.totalInvested) * 100
        : null
    result.set(hid, {
      totalPnL: valued.totalPnL,
      realizedPnL: valued.realizedPnL,
      unrealizedPnL: valued.unrealizedPnL,
      totalInvested: valued.totalInvested,
      dividends: valued.dividends,
      totalFees: valued.totalFees,
      totalPnLPct,
      isClosed: valued.isClosed,
    })
  }

  return result
}

/**
 * Hangt de P&L-velden op elke holding-rij (plain object). Holdings zonder
 * transacties krijgen `null`-P&L-velden; de aanroeper houdt de bestaande
 * `units`-kolom als open/dicht-detectie. Waar transacties bestaan is de
 * engine-`isClosed` leidend en wordt 'm meegestuurd als `pnl_is_closed`.
 *
 * De velden krijgen een `pnl_`-prefix in de loader-output zodat ze niet
 * botsen met bestaande holding-kolommen en additief blijven.
 */
export function attachPnLToHoldings<T extends { id: string }>(
  rows: readonly T[],
  pnlMap: Map<string, HoldingPnL>,
): Array<T & PnLRowFields> {
  return rows.map((row) => {
    const pnl = pnlMap.get(row.id)
    return {
      ...row,
      pnl_total: pnl ? pnl.totalPnL : null,
      pnl_realized: pnl ? pnl.realizedPnL : null,
      pnl_unrealized: pnl ? pnl.unrealizedPnL : null,
      pnl_invested: pnl ? pnl.totalInvested : null,
      pnl_dividends: pnl ? pnl.dividends : null,
      pnl_fees: pnl ? pnl.totalFees : null,
      pnl_total_pct: pnl ? pnl.totalPnLPct : null,
      pnl_is_closed: pnl ? pnl.isClosed : null,
    }
  })
}

/** De P&L-velden die `attachPnLToHoldings` aan elke rij toevoegt. */
export interface PnLRowFields {
  pnl_total: number | null
  pnl_realized: number | null
  pnl_unrealized: number | null
  pnl_invested: number | null
  pnl_dividends: number | null
  pnl_fees: number | null
  pnl_total_pct: number | null
  pnl_is_closed: boolean | null
}
