/**
 * KPI-context builder — maakt uit een set assets/debts/holdings de Maps die
 * `computeAssetKpi` en `computeDebtKpi` nodig hebben.
 *
 * Gedeeld tussen `core-data-loader` (Kern-landing aggregaten) en de
 * categorie-pagina's (per-item strips). Eén plek voor de logica voorkomt
 * dat kalibratie tussen de twee oppervlakken uit de pas loopt.
 */
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Asset } from './asset-data'
import type { Debt } from './debt-data'
import type { AssetKpiContext } from './asset-kpi'
import type { DebtKpiContext } from './debt-kpi'

/**
 * Subset van het holdings-row dat de KPI-functies gebruiken. Houdt de
 * `Record<string, unknown>` bewust — de loader doet 'select *' en geeft
 * de raw rij door, dus we kunnen ze niet sterker typen zonder een
 * codegen-stap. KPI-functies pakken alleen de velden die ze nodig hebben
 * en doen Number-coërcies zelf.
 */
export type HoldingLite = Record<string, unknown>

/**
 * Cash-stats per asset. Twee bron-varianten: transactiegebaseerd (cash mét
 * actief budgetteren via bank-account-koppeling) of waarderingsgebaseerd
 * (cash zónder budgetteren — handmatige rekeningen die via `valuations`
 * worden bijgewerkt).
 *
 * Door één gedeeld type te gebruiken met een `kind`-discriminant blijft de
 * `kpiCash`-renderlogica simpel: één switch op `kind` voor passende labels.
 */
export type CashAssetStats =
  | {
      kind: 'transaction'
      /** Laatste transactiedatum (ISO yyyy-mm-dd) — `null` als geen activiteit in venster. */
      lastDate: string | null
      /** Som van alle bedragen in de huidige maand (positief = netto inkomst). */
      monthlyChangeEur: number
      /** Grootste enkelvoudige uitgave deze maand (positief getal — €). */
      biggestExpenseEur: number
      /** Optioneel label/tegenpartij voor de hoogste uitgave. */
      biggestExpenseLabel?: string
    }
  | {
      kind: 'revaluation'
      /** Datum van de laatste handmatige herwaardering (`valuations.valuation_date`). */
      lastDate: string | null
      /** Saldo-mutatie deze maand: `current_value` − value bij maandstart. */
      monthlyChangeEur: number
    }

export interface KpiContextInput {
  assets: ReadonlyArray<Pick<Asset, 'id' | 'asset_type' | 'current_value' | 'linked_asset_id'>>
  debts: ReadonlyArray<Pick<Debt, 'id' | 'debt_type' | 'current_balance' | 'linked_asset_id'>>
  /** Holdings-rijen met minimaal `asset_id`. */
  holdings?: ReadonlyArray<HoldingLite>
  /** Pre-berekende cash-stats per asset_id (alleen voor cash-assets). */
  cashStatsByAssetId?: ReadonlyMap<string, CashAssetStats> | Record<string, CashAssetStats>
  /** Referentiedatum voor looptijd-berekeningen. */
  now?: Date
}

export interface KpiContextBundle {
  asset: AssetKpiContext
  debt: DebtKpiContext
}

/**
 * Bouw de gedeelde KPI-context uit een set assets, debts en holdings.
 *
 * - `holdingsByAssetId`: groepeert holdings per asset_id voor investment/crypto
 * - `linkedAssetValueByDebtId`: voor mortgage LTV — debt → marktwaarde van
 *   het gekoppelde asset (eigen huis)
 * - `linkedDebtBalanceByAssetId`: voor eigen huis overwaarde — asset →
 *   som van current_balance van schulden die hierop linken (typisch hypotheek)
 * - `cashStatsByAssetId`: voor cash-KPI (laatste transactie, maandmutatie,
 *   hoogste uitgave) — wordt door de loader server-side berekend.
 */
export function buildKpiContext({
  assets,
  debts,
  holdings = [],
  cashStatsByAssetId,
  now,
}: KpiContextInput): KpiContextBundle {
  // 1. Holdings-by-asset-id
  const holdingsByAssetId = new Map<string, HoldingLite[]>()
  for (const h of holdings) {
    const assetId = h.asset_id as string | null | undefined
    if (!assetId) continue
    const list = holdingsByAssetId.get(assetId) ?? []
    list.push(h)
    holdingsByAssetId.set(assetId, list)
  }

  // 2. Asset-id → marktwaarde (lookup voor mortgage LTV)
  const assetValueById = new Map<string, number>()
  for (const a of assets) {
    const val = Number(a.current_value)
    if (isFinite(val) && val > 0) assetValueById.set(a.id, val)
  }

  // 3. Voor elke debt met linked_asset_id → marktwaarde van die asset
  const linkedAssetValueByDebtId = new Map<string, number>()
  for (const d of debts) {
    if (!d.linked_asset_id) continue
    const val = assetValueById.get(d.linked_asset_id)
    if (val != null && val > 0) linkedAssetValueByDebtId.set(d.id, val)
  }

  // 4. Voor elke asset → som balance van debts die hierop linken (overwaarde)
  const linkedDebtBalanceByAssetId = new Map<string, number>()
  for (const d of debts) {
    if (!d.linked_asset_id) continue
    const balance = Number(d.current_balance)
    if (!isFinite(balance) || balance <= 0) continue
    const prev = linkedDebtBalanceByAssetId.get(d.linked_asset_id) ?? 0
    linkedDebtBalanceByAssetId.set(d.linked_asset_id, prev + balance)
  }

  // Normaliseer cashStatsByAssetId — accepteert zowel Map als Record.
  let cashStatsMap: Map<string, CashAssetStats> | undefined
  if (cashStatsByAssetId) {
    cashStatsMap = cashStatsByAssetId instanceof Map
      ? new Map(cashStatsByAssetId)
      : new Map(Object.entries(cashStatsByAssetId))
  }

  return {
    asset: {
      holdingsByAssetId,
      linkedDebtBalanceByAssetId,
      cashStatsByAssetId: cashStatsMap,
      now,
    },
    debt: {
      linkedAssetValueByDebtId,
      now,
    },
  }
}

/**
 * Server-side raw rijen voor de KPI-context op categorie-pagina's. We
 * projecteren alleen de velden die de KPI-functies gebruiken — niet de
 * volledige asset/debt-rij — zodat de wire-payload compact blijft. Het
 * resultaat wordt door de client-component aan `buildKpiContext` gevoed.
 */
export interface KpiContextRefs {
  assets: Array<{ id: string; asset_type: string; current_value: number; linked_asset_id: string | null }>
  debts: Array<{ id: string; debt_type: string; current_balance: number; linked_asset_id: string | null }>
  holdings: Array<{
    asset_id: string
    units: number
    current_price: number | null
    avg_purchase_price: number | null
    daily_change_percent: number | null
  }>
  /**
   * Cash-stats per asset_id — alleen aanwezig voor cash-assets met een
   * actieve, gekoppelde bank_account die ook transactiehistorie heeft. Wordt
   * gebruikt door `kpiCash` (laatste tx, maandmutatie) en `aggCash` (totaal +
   * hoogste uitgave). Een leeg object is een geldige output: dan vallen de
   * cash-KPI's terug op rente.
   */
  cashStats: Record<string, CashAssetStats>
}

/**
 * Lichtgewicht loader voor de KPI-context op categorie-pagina's.
 *
 * Doet 3 selectieve queries (assets, debts, holdings) met alleen de
 * velden die de KPI-functies nodig hebben. Wordt gebruikt door
 * `app/(app)/core/assets/[type]/page.tsx` en `app/(app)/core/debts/[type]/page.tsx`
 * om aan de "andere kant" van de relatie te komen — bv. een asset-pagina
 * heeft de gekoppelde debts nodig voor overwaarde, een debt-pagina heeft
 * de gekoppelde assets nodig voor LTV.
 *
 * Cache via React `cache()` zorgt voor request-level dedup als meerdere
 * server-componenten in dezelfde request deze loader aanroepen.
 */
export const loadKpiContextRefs = cache(async (supabase: SupabaseClient): Promise<KpiContextRefs> => {
  // Na de tabel-split (migratie 20260502000003) zitten holdings in twee
  // typed-tabellen. We querien beide parallel en mergen daarna.
  // Investment-holdings worden alleen meegenomen wanneer het parent-asset
  // `has_holdings_tracking=true` heeft (de tracker-toggle); crypto-holdings
  // hebben geen equivalent — die worden 1-op-1 onderhouden door de
  // exchange-sync, dus alle actieve crypto-rijen tellen mee.
  const [assetsResult, debtsResult, invHoldingsResult, cryHoldingsResult, cashStats] = await Promise.all([
    supabase
      .from('assets')
      .select('id, asset_type, current_value, linked_asset_id')
      .eq('is_active', true),
    supabase
      .from('debts')
      .select('id, debt_type, current_balance, linked_asset_id')
      .eq('is_active', true),
    supabase
      .from('investment_holdings')
      .select('asset_id, units, current_price, avg_purchase_price, daily_change_percent, asset:assets!asset_id(has_holdings_tracking)')
      .eq('is_active', true),
    supabase
      .from('crypto_holdings')
      .select('asset_id, units, current_price, avg_purchase_price')
      .eq('is_active', true),
    loadCombinedCashStats(supabase).catch(() => ({} as Record<string, CashAssetStats>)),
  ])

  const assets = (assetsResult.data ?? []).map((a) => ({
    id: a.id as string,
    asset_type: a.asset_type as string,
    current_value: Number(a.current_value) || 0,
    linked_asset_id: (a.linked_asset_id as string | null) ?? null,
  }))

  const debts = (debtsResult.data ?? []).map((d) => ({
    id: d.id as string,
    debt_type: d.debt_type as string,
    current_balance: Number(d.current_balance) || 0,
    linked_asset_id: (d.linked_asset_id as string | null) ?? null,
  }))

  // Investment holdings: filter op tracker-toggle, strip joined asset weg.
  const invHoldings = (invHoldingsResult.data ?? [])
    .filter((h) => {
      const asset = (h as Record<string, unknown>).asset as { has_holdings_tracking?: boolean } | null
      return asset?.has_holdings_tracking === true && (h as Record<string, unknown>).asset_id != null
    })
    .map((h) => ({
      asset_id: (h as Record<string, unknown>).asset_id as string,
      units: Number((h as Record<string, unknown>).units) || 0,
      current_price: (h as Record<string, unknown>).current_price != null ? Number((h as Record<string, unknown>).current_price) : null,
      avg_purchase_price: (h as Record<string, unknown>).avg_purchase_price != null ? Number((h as Record<string, unknown>).avg_purchase_price) : null,
      daily_change_percent: (h as Record<string, unknown>).daily_change_percent != null ? Number((h as Record<string, unknown>).daily_change_percent) : null,
    }))

  // Crypto holdings: geen tracker-filter — alle actieve rijen tellen mee.
  // `daily_change_percent` bestaat (nog) niet op crypto_holdings; we leveren
  // null zodat de KPI-functie automatisch op de fallback-paden valt
  // (purchase vs current).
  const cryHoldings = (cryHoldingsResult.data ?? [])
    .filter((h) => (h as Record<string, unknown>).asset_id != null)
    .map((h) => ({
      asset_id: (h as Record<string, unknown>).asset_id as string,
      units: Number((h as Record<string, unknown>).units) || 0,
      current_price: (h as Record<string, unknown>).current_price != null ? Number((h as Record<string, unknown>).current_price) : null,
      avg_purchase_price: (h as Record<string, unknown>).avg_purchase_price != null ? Number((h as Record<string, unknown>).avg_purchase_price) : null,
      daily_change_percent: null as number | null,
    }))

  const holdings = [...invHoldings, ...cryHoldings]

  return { assets, debts, holdings, cashStats }
})

// ── Cash-stats loader ──────────────────────────────────────────

/**
 * Bouw `CashAssetStats` per cash-asset uit de transactions-tabel.
 *
 * Pad: `cash asset` → `bank_accounts.linked_asset_id` → `transactions.account_id`.
 * Cash-assets zonder gekoppelde bankrekening krijgen géén entry — de KPI-strip
 * valt dan op de UI-laag terug op een rente-fallback (of vervalt volledig).
 *
 * Wij querieën transactions van de laatste **90 dagen** zodat we zowel de
 * maandmutatie kunnen berekenen (subset deze kalendermaand) als de "X dagen
 * geleden"-KPI kunnen bepalen voor rekeningen die deze maand nog niet bewogen.
 */
export const loadCashAssetStats = cache(async (
  supabase: SupabaseClient,
): Promise<Record<string, CashAssetStats>> => {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
    .toISOString()
    .split('T')[0]
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  // 1. Bank_accounts → cash_asset.id mapping
  const { data: bankRows, error: bankErr } = await supabase
    .from('bank_accounts')
    .select('id, linked_asset_id')
    .eq('is_active', true)
    .not('linked_asset_id', 'is', null)
  if (bankErr || !bankRows || bankRows.length === 0) return {}

  const accountToAsset = new Map<string, string>()
  for (const row of bankRows) {
    const linked = row.linked_asset_id as string | null
    if (linked) accountToAsset.set(row.id as string, linked)
  }
  if (accountToAsset.size === 0) return {}

  // 2. Transactions van laatste 90 dagen voor deze accounts
  const accountIds = Array.from(accountToAsset.keys())
  const { data: txRows, error: txErr } = await supabase
    .from('transactions')
    .select('account_id, amount, date, description, counterparty_name')
    .in('account_id', accountIds)
    .gte('date', ninetyDaysAgo)
    .order('date', { ascending: false })
  if (txErr || !txRows) return {}

  // 3. Aggregeer per asset_id
  const stats: Record<string, CashAssetStats> = {}
  for (const tx of txRows) {
    const accId = tx.account_id as string | null
    if (!accId) continue
    const assetId = accountToAsset.get(accId)
    if (!assetId) continue

    const amount = Number(tx.amount)
    const date = tx.date as string
    if (!isFinite(amount) || !date) continue

    let s = stats[assetId]
    if (!s) {
      s = {
        kind: 'transaction',
        lastDate: null,
        monthlyChangeEur: 0,
        biggestExpenseEur: 0,
        biggestExpenseLabel: undefined,
      }
      stats[assetId] = s
    }

    // Het bouwen van de stats hierboven garandeert kind === 'transaction',
    // maar de discriminated union vereist een type-assertion bij assignment.
    const tx_s = s as Extract<CashAssetStats, { kind: 'transaction' }>

    // Laatste transactie — date is desc-gesorteerd, dus eerste hit per asset wint.
    if (!tx_s.lastDate || date > tx_s.lastDate) {
      tx_s.lastDate = date
    }

    // Mutatie deze maand (income+, expense−)
    if (date >= monthStart) {
      tx_s.monthlyChangeEur += amount

      // Hoogste uitgave deze maand (negatief amount → positieve abs)
      if (amount < 0) {
        const absAmt = Math.abs(amount)
        if (absAmt > tx_s.biggestExpenseEur) {
          tx_s.biggestExpenseEur = absAmt
          // Label: counterparty bij voorkeur, anders eerste 30 chars van description.
          const cp = tx.counterparty_name as string | null
          const desc = tx.description as string | null
          const label = cp?.trim() || desc?.trim() || undefined
          tx_s.biggestExpenseLabel = label ? label.slice(0, 30) : undefined
        }
      }
    }
  }

  return stats
})

/**
 * Bouw `CashAssetStats` (kind: 'revaluation') voor cash-assets zonder
 * bank-koppeling (handmatige rekeningen). Bron: de `valuations`-tabel.
 *
 * Per asset:
 *   - `lastDate` = laatste `valuation_date`
 *   - `monthlyChangeEur` = `current_value` − value bij maandstart
 *
 * "Value bij maandstart" = de meest recente valuation vóór de eerste van de
 * huidige maand. Als er geen valuation vóór de maand is, gaan we ervan uit
 * dat het asset deze maand is aangemaakt en gebruiken we de eerste
 * waardering deze maand als baseline (delta = 0 in dat geval).
 */
export const loadCashRevaluationStats = cache(async (
  supabase: SupabaseClient,
): Promise<Record<string, CashAssetStats>> => {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1))
    .toISOString()
    .split('T')[0]

  // 1. Welke cash-assets hebben GEEN bank-koppeling? Die vallen onder
  //    de revaluation-track. We pakken alleen actieve assets.
  const [cashAssetsRes, bankRows] = await Promise.all([
    supabase
      .from('assets')
      .select('id, current_value')
      .eq('is_active', true)
      .eq('asset_type', 'cash'),
    supabase
      .from('bank_accounts')
      .select('linked_asset_id')
      .eq('is_active', true)
      .not('linked_asset_id', 'is', null),
  ])
  if (cashAssetsRes.error || !cashAssetsRes.data) return {}

  const linkedIds = new Set<string>()
  for (const row of bankRows.data ?? []) {
    const id = row.linked_asset_id as string | null
    if (id) linkedIds.add(id)
  }

  const handmatigeAssets = cashAssetsRes.data.filter((a) => !linkedIds.has(a.id as string))
  if (handmatigeAssets.length === 0) return {}

  const assetIds = handmatigeAssets.map((a) => a.id as string)
  const valueById = new Map<string, number>()
  for (const a of handmatigeAssets) {
    valueById.set(a.id as string, Number(a.current_value) || 0)
  }

  // 2. Alle valuations voor deze assets — desc op datum zodat we per asset
  //    het laatste record als eerste tegenkomen.
  const { data: valRows } = await supabase
    .from('valuations')
    .select('entity_id, valuation_date, value')
    .eq('entity_type', 'asset')
    .in('entity_id', assetIds)
    .order('valuation_date', { ascending: false })

  const stats: Record<string, CashAssetStats> = {}

  // Verzamel per asset: laatste valuation_date en baseline (laatste vóór monthStart).
  const lastByAsset = new Map<string, string>()
  const baselineByAsset = new Map<string, number>()

  for (const row of valRows ?? []) {
    const assetId = row.entity_id as string
    const date = row.valuation_date as string
    const value = Number(row.value) || 0

    if (!lastByAsset.has(assetId)) {
      lastByAsset.set(assetId, date)
    }

    // Eerste record (desc) met date < monthStart wordt de baseline.
    if (date < monthStart && !baselineByAsset.has(assetId)) {
      baselineByAsset.set(assetId, value)
    }
  }

  for (const assetId of assetIds) {
    const lastDate = lastByAsset.get(assetId) ?? null
    const baseline = baselineByAsset.get(assetId)
    const current = valueById.get(assetId) ?? 0
    const monthlyChange = baseline != null ? current - baseline : 0
    stats[assetId] = {
      kind: 'revaluation',
      lastDate,
      monthlyChangeEur: monthlyChange,
    }
  }

  return stats
})

/**
 * Combineer transactie- en herwaarderings-stats. Beide loaders draaien
 * parallel; cash-assets zonder bank-koppeling krijgen valuation-based
 * stats, cash-assets mét bank-koppeling krijgen transaction-based stats.
 * Bij dubbele asset-id wint de transaction-stat (mocht dat ooit gebeuren).
 */
export async function loadCombinedCashStats(
  supabase: SupabaseClient,
): Promise<Record<string, CashAssetStats>> {
  const [txStats, revalStats] = await Promise.all([
    loadCashAssetStats(supabase).catch(() => ({} as Record<string, CashAssetStats>)),
    loadCashRevaluationStats(supabase).catch(() => ({} as Record<string, CashAssetStats>)),
  ])
  return { ...revalStats, ...txStats }
}
