// lib/crypto-holdings-data.ts
//
// Server-side loader voor `/core/assets/crypto`. Levert per crypto-coin een
// rij met direct bruikbare display-velden (EUR-waarde server-side berekend,
// bron-info gehydrateerd uit `exchange_connections`/`wallet_addresses`).
//
// Architectuur: laadt **alleen** uit `crypto_holdings` (de typed-tabel uit
// migratie 20260502000003). Geen fallback meer naar de polymorfe legacy
// `holdings` tabel — die is bewust hernoemd zodat oude code-paden hard
// breken in plaats van stilzwijgend lege arrays terug te geven.
//
// Bedragen: alle huidige prijzen worden in EUR geadministreerd
// (`current_price` impliciet EUR — zie schema-comment). De `currency` kolom
// die op de legacy holdings stond is dus niet meer nodig en zit niet in
// `crypto_holdings`.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ExchangeId,
  WalletChain,
} from './connections-data'
import {
  fetchMarketChartEur,
  SYMBOL_TO_COINGECKO_ID,
} from './integrations/coingecko-client'
import { convertToEUR } from './forex'
import {
  BOX3_TARIEF,
  NL_FICTIEF_BELEGGINGEN,
} from './constants'

// ── Types ──────────────────────────────────────────────────────────────

/** Bron-info voor een holding — gehydrateerd uit FK's op `crypto_holdings`. */
export type CryptoHoldingSource =
  | {
      kind: 'exchange'
      exchangeId: ExchangeId
      /** Display-label, bv. "Bitvavo · main" als de connection een label heeft. */
      exchangeLabel: string
      /** Connection-ID — caller kan hiermee een deeplink bouwen. */
      connectionId: string
    }
  | {
      kind: 'wallet'
      walletChain: WalletChain
      /** Gemaskeerd adres voor de UI: eerste 4 + '…' + laatste 4. */
      walletAddressMask: string
      walletAddressId: string
    }
  | {
      kind: 'manual'
    }

export interface CryptoHoldingRow {
  id: string
  assetId: string
  /** Naam van de parent asset — handig voor breadcrumbs en filter-UI. */
  assetName: string
  symbol: string
  /** Volledige naam ("Bitcoin", "Ethereum"); fallback op symbol als leeg. */
  name: string | null
  chain: string | null
  units: number
  unitsInOrder: number
  currentPrice: number | null
  /**
   * Gewogen gemiddelde aankoopprijs in EUR. Komt direct uit
   * `crypto_holdings.avg_purchase_price`. NULL als de positie nooit een
   * inkoopprijs kreeg (bijv. airdrop / staking-reward of bron-import zonder
   * trade-koppeling).
   */
  avgPurchasePrice: number | null
  /**
   * Server-side berekende kostenbasis = units × avgPurchasePrice. NULL als
   * `avgPurchasePrice` ontbreekt — voorkomt dat de UI "0 EUR" interpreteert
   * als "geen kosten" en daardoor 100%-rendement laat zien.
   */
  costBasisEur: number | null
  /** EUR-rendement = valueEur − costBasisEur. NULL als kostenbasis onbekend. */
  returnEur: number | null
  /** Procentueel rendement t.o.v. kostenbasis. NULL als kostenbasis ontbreekt of 0. */
  returnPct: number | null
  /** EUR-waarde, server-side berekend = units × currentPrice (0 als prijs onbekend). */
  valueEur: number
  /** Cash-saldo bij een exchange (EUR/USD/GBP). Geen koers, geen rendement. */
  isFiatBalance: boolean
  isFavorite: boolean
  /** Volledige bron-context voor bron-badge + plug-status. */
  source: CryptoHoldingSource
  lastPriceUpdate: string | null
  /** `last_synced_at` van de bron-koppeling (exchange of wallet) — NULL bij manual. */
  lastSyncedAt: string | null
  /** Laatste sync-fout van de bron. NULL als laatste run succes was of bron handmatig. */
  lastSyncError: string | null
}

/**
 * Lichte transactie-rij voor de crypto Holdings-app feed. Bevat alleen wat
 * de aggregaat-tabel nodig heeft (geen notes/external_source) plus directe
 * holding-context (symbol, name) zodat de UI niet apart hoeft te joinen.
 */
export interface CryptoTransactionRow {
  id: string
  holdingId: string
  symbol: string
  /** Coin-naam ("Bitcoin"); fallback op symbol als leeg. */
  name: string
  type: 'buy' | 'sell' | 'deposit' | 'withdrawal' | 'fee' | 'reward'
  units: number
  pricePerUnit: number | null
  totalAmount: number | null
  /** Datum als ISO-string (YYYY-MM-DD). Tijd niet relevant voor crypto-trades. */
  date: string
}

/**
 * Eén dag-snapshot van de portefeuille-waarde. Wordt geaggregeerd in
 * `loadCryptoPortfolioHistory` door per holding de eindprijs van die dag te
 * vermenigvuldigen met de huidige units (vereenvoudiging: we modelleren niet
 * de historische units-positie, alleen de waarde-evolutie tegen huidige
 * blootstelling — dat geeft de gebruiker een eerlijk beeld van wat de
 * portefeuille zou hebben gedaan, niet wat ze daadwerkelijk hadden).
 */
export interface CryptoPortfolioPoint {
  /** ISO-datum (YYYY-MM-DD). */
  date: string
  /** Geaggregeerde EUR-waarde over alle holdings op deze dag. */
  valueEur: number
}

// ── Helpers ────────────────────────────────────────────────────────────

/** Mask een wallet-adres voor de UI — voorkomt accidentele exposure in screenshots. */
function maskWalletAddress(address: string): string {
  const trimmed = address.trim()
  if (trimmed.length <= 10) return trimmed
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`
}

const EXCHANGE_DISPLAY: Record<ExchangeId, string> = {
  bitvavo: 'Bitvavo',
  kraken: 'Kraken',
  coinbase: 'Coinbase',
}

// ── Loader ─────────────────────────────────────────────────────────────

/**
 * Laad alle actieve crypto-holdings voor de ingelogde user, inclusief
 * gehydrateerde bron-info. Eén query met nested-selects op de twee FK-paden
 * — geen N+1, en geen aparte rondreis voor de parent-assetnaam.
 *
 * Sortering: op EUR-waarde aflopend, fiat-saldi worden in de UI naar onder
 * gefilterd (separate sort-pas in `asset-category-page.tsx`). Hier laten we
 * een stabiele waarde-sortering — zo blijft de loader bruikbaar voor andere
 * call-sites die fiat liever boven willen zien.
 */
export const loadCryptoHoldingsForUser = cache(
  async (supabase: SupabaseClient): Promise<CryptoHoldingRow[]> => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await supabase
      .from('crypto_holdings')
      .select(
        `
        id,
        asset_id,
        symbol,
        name,
        chain,
        units,
        units_in_order,
        avg_purchase_price,
        current_price,
        last_price_update,
        is_fiat_balance,
        is_favorite,
        source_exchange_connection_id,
        source_wallet_address_id,
        asset:assets!asset_id(id, name),
        exchange:exchange_connections!source_exchange_connection_id(
          id, exchange, label, last_synced_at, last_sync_error
        ),
        wallet:wallet_addresses!source_wallet_address_id(
          id, chain, address, last_synced_at, last_sync_error
        )
        `,
      )
      .eq('user_id', user.id)
      .eq('is_active', true)

    if (error || !data) return []

    type Row = {
      id: string
      asset_id: string
      symbol: string
      name: string | null
      chain: string | null
      units: number | string | null
      units_in_order: number | string | null
      avg_purchase_price: number | string | null
      current_price: number | string | null
      last_price_update: string | null
      is_fiat_balance: boolean | null
      is_favorite: boolean | null
      source_exchange_connection_id: string | null
      source_wallet_address_id: string | null
      asset: { id: string; name: string } | { id: string; name: string }[] | null
      exchange:
        | {
            id: string
            exchange: ExchangeId
            label: string | null
            last_synced_at: string | null
            last_sync_error: string | null
          }
        | {
            id: string
            exchange: ExchangeId
            label: string | null
            last_synced_at: string | null
            last_sync_error: string | null
          }[]
        | null
      wallet:
        | {
            id: string
            chain: WalletChain
            address: string
            last_synced_at: string | null
            last_sync_error: string | null
          }
        | {
            id: string
            chain: WalletChain
            address: string
            last_synced_at: string | null
            last_sync_error: string | null
          }[]
        | null
    }

    const rows = data as unknown as Row[]

    // Supabase nested-select retourneert per join óf een object óf een array;
    // we normaliseren naar een single record voor een schoner contract.
    function pickOne<T>(value: T | T[] | null): T | null {
      if (!value) return null
      return Array.isArray(value) ? (value[0] ?? null) : value
    }

    const result: CryptoHoldingRow[] = rows.map((r) => {
      const units = Number(r.units) || 0
      const currentPrice =
        r.current_price != null ? Number(r.current_price) : null
      const avgPurchasePrice =
        r.avg_purchase_price != null ? Number(r.avg_purchase_price) : null
      const valueEur = currentPrice != null ? units * currentPrice : 0
      // Kostenbasis: alleen rekenen als beide signalen er zijn. Een avg-prijs
      // van 0 (gratis airdrop / staking-reward) telt expliciet als "geen
      // kostenbasis" — anders zou de UI 100%-rendement laten zien voor coins
      // die nooit een aankoopprijs hadden.
      const costBasisEur =
        avgPurchasePrice != null && avgPurchasePrice > 0
          ? units * avgPurchasePrice
          : null
      const returnEur =
        costBasisEur != null && currentPrice != null
          ? valueEur - costBasisEur
          : null
      const returnPct =
        costBasisEur != null && costBasisEur > 0 && returnEur != null
          ? (returnEur / costBasisEur) * 100
          : null

      const asset = pickOne(r.asset)
      const exchange = pickOne(r.exchange)
      const wallet = pickOne(r.wallet)

      let source: CryptoHoldingSource
      let lastSyncedAt: string | null = null
      let lastSyncError: string | null = null

      if (exchange) {
        const labelSuffix = exchange.label ? ` · ${exchange.label}` : ''
        source = {
          kind: 'exchange',
          exchangeId: exchange.exchange,
          exchangeLabel: `${EXCHANGE_DISPLAY[exchange.exchange]}${labelSuffix}`,
          connectionId: exchange.id,
        }
        lastSyncedAt = exchange.last_synced_at
        lastSyncError = exchange.last_sync_error
      } else if (wallet) {
        source = {
          kind: 'wallet',
          walletChain: wallet.chain,
          walletAddressMask: maskWalletAddress(wallet.address),
          walletAddressId: wallet.id,
        }
        lastSyncedAt = wallet.last_synced_at
        lastSyncError = wallet.last_sync_error
      } else {
        source = { kind: 'manual' }
      }

      return {
        id: r.id,
        assetId: r.asset_id,
        assetName: asset?.name ?? '',
        symbol: r.symbol,
        name: r.name,
        chain: r.chain,
        units,
        unitsInOrder: Number(r.units_in_order) || 0,
        currentPrice,
        avgPurchasePrice,
        costBasisEur,
        returnEur,
        returnPct,
        valueEur,
        isFiatBalance: r.is_fiat_balance === true,
        isFavorite: r.is_favorite === true,
        source,
        lastPriceUpdate: r.last_price_update,
        lastSyncedAt,
        lastSyncError,
      }
    })

    // Stabiele sortering: hoogste waarde eerst. Fiat-balansen blijven hier
    // gewoon op waarde gesorteerd; de UI kiest waar ze visueel landen.
    result.sort((a, b) => b.valueEur - a.valueEur)

    return result
  },
)

/**
 * Filter alle crypto-holdings van de user op één parent-asset. Hergebruikt de
 * gecachte `loadCryptoHoldingsForUser`-loader (`react/cache`), zodat
 * meerdere asset-detail-opens binnen één request niet leiden tot N+1 queries.
 *
 * Bewuste keuze: in plaats van een aparte Supabase-query per asset filteren
 * we client-side. De typische user heeft <50 crypto-holdings totaal, dus de
 * extra geheugenkost is verwaarloosbaar en we delen de RLS-roundtrip met de
 * categorie-pagina-loader die al draait.
 */
export async function loadCryptoHoldingsForAsset(
  supabase: SupabaseClient,
  assetId: string,
): Promise<CryptoHoldingRow[]> {
  const all = await loadCryptoHoldingsForUser(supabase)
  return all.filter((h) => h.assetId === assetId)
}

// ── Recent transactions feed ───────────────────────────────────────────

/**
 * Laad de laatste N crypto-transacties van de user, geaggregeerd over alle
 * holdings. Gebruikt door de transactiegeschiedenis-sectie in de Holdings-app
 * (mirror van de investment-tx-log).
 *
 * Sortering: nieuwste eerst (created_at als secundaire tiebreaker zodat twee
 * trades op dezelfde dag in chronologische import-volgorde staan). De
 * `holding_id` join-payload wordt platgeslagen naar `symbol` + `name` zodat
 * de UI niet per rij hoeft te resolven.
 */
export async function loadRecentCryptoTransactions(
  supabase: SupabaseClient,
  limit = 50,
): Promise<CryptoTransactionRow[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('crypto_transactions')
    .select(
      `
      id,
      holding_id,
      type,
      units,
      price_per_unit,
      total_amount,
      date,
      holding:crypto_holdings!holding_id(symbol, name)
      `,
    )
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(500, limit)))

  if (error || !data) return []

  type Row = {
    id: string
    holding_id: string
    type: string
    units: number | string
    price_per_unit: number | string | null
    total_amount: number | string | null
    date: string
    holding: { symbol: string; name: string | null } | { symbol: string; name: string | null }[] | null
  }

  const rows = data as unknown as Row[]
  const result: CryptoTransactionRow[] = []
  for (const r of rows) {
    const holding = Array.isArray(r.holding) ? r.holding[0] : r.holding
    if (!holding) continue
    // Defensief: alleen bekende type-waardes doorlaten zodat de UI nooit een
    // onverwachte string als label hoeft te vertonen.
    const txType = r.type as CryptoTransactionRow['type']
    if (
      txType !== 'buy' &&
      txType !== 'sell' &&
      txType !== 'deposit' &&
      txType !== 'withdrawal' &&
      txType !== 'fee' &&
      txType !== 'reward'
    ) continue
    result.push({
      id: r.id,
      holdingId: r.holding_id,
      symbol: holding.symbol,
      name: holding.name?.trim() || holding.symbol,
      type: txType,
      units: Number(r.units) || 0,
      pricePerUnit: r.price_per_unit != null ? Number(r.price_per_unit) : null,
      totalAmount: r.total_amount != null ? Number(r.total_amount) : null,
      date: r.date,
    })
  }
  return result
}

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * PostgREST hanteert standaard een max-rows limiet (Supabase default = 1000).
 * Voor `crypto_holding_prices` raken we dat plafond al bij ~3 holdings × 365
 * dagen. Zonder paginatie krijgen we dan stilzwijgend alleen de oudste 1000
 * rijen — wat de waarde-evolutie chart op "30 jul 2025" laat hangen i.p.v.
 * de actuele 30 dagen te tonen.
 *
 * Deze helper haalt de volledige dataset op via opeenvolgende `.range()`
 * vensters tot een pagina minder rijen retourneert dan de page-size (laatste
 * pagina). De `applyFilters` callback bouwt de query (filters + select +
 * order); paginatie wordt eromheen geknoopt zodat de aanroep-site idiomatisch
 * blijft.
 */
type CryptoPriceRow = { holding_id: string; date: string; close_price: number | string }

// `applyFilters` ontvangt een PostgREST select-query en mag er filters/order
// op chainen. We typen de builder lokaal om de PostgREST generic-keten te
// omzeilen die anders "Type instantiation is excessively deep" triggert
// (bekend issue bij chains van .in/.gte/.order). De aanroep-sites cast'en
// éénmalig naar deze lokale shape — runtime is onveranderd.
type PriceQueryBuilder = {
  in: (column: string, values: readonly string[]) => PriceQueryBuilder
  gte: (column: string, value: string) => PriceQueryBuilder
  order: (column: string, opts: { ascending: boolean }) => PriceQueryBuilder
  range: (
    from: number,
    to: number,
  ) => Promise<{ data: unknown[] | null; error: unknown }>
}
type PriceQuery = {
  range: (
    from: number,
    to: number,
  ) => Promise<{ data: unknown[] | null; error: unknown }>
}

async function fetchAllCryptoPrices(
  supabase: SupabaseClient,
  applyFilters: (query: unknown) => unknown,
  pageSize = 1000,
  maxPages = 50,
): Promise<{ data: CryptoPriceRow[] | null; error: unknown }> {
  const all: CryptoPriceRow[] = []
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize
    const to = from + pageSize - 1
    const baseQuery = supabase
      .from('crypto_holding_prices')
      .select('holding_id, date, close_price')
    const filtered = applyFilters(baseQuery) as PriceQuery
    const { data, error } = await filtered.range(from, to)
    if (error) return { data: null, error }
    if (!data || data.length === 0) break
    all.push(...(data as CryptoPriceRow[]))
    if (data.length < pageSize) break
  }
  return { data: all, error: null }
}

// ── Portfolio history ──────────────────────────────────────────────────

/**
 * Bouw een dagelijkse waarde-tijdreeks van de hele crypto-portefeuille over
 * de afgelopen `daysBack` dagen. Algoritme:
 *   1. Haal alle close-prices uit `crypto_holding_prices` voor de actieve
 *      holdings, gefilterd op de datum-range.
 *   2. Per dag: voor elke holding nemen we de **laatst bekende** close-prijs
 *      tot en met die dag (forward-fill — voorkomt gaten op weekends en bij
 *      coins die niet elke dag een snapshot hebben).
 *   3. Vermenigvuldig met de **huidige** units (geen historische units —
 *      zie noot bij `CryptoPortfolioPoint`).
 *
 * Geeft een lege array terug als er geen koers-historie is. Caller toont dan
 * een lichte placeholder i.p.v. een "0 EUR over 30 dagen"-grafiek.
 */
export async function loadCryptoPortfolioHistory(
  supabase: SupabaseClient,
  daysBack = 30,
): Promise<CryptoPortfolioPoint[]> {
  const days = Math.max(7, Math.min(365, daysBack))
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // Eerst de holdings + units ophalen (gecached via `loadCryptoHoldingsForUser`).
  const holdings = await loadCryptoHoldingsForUser(supabase)
  const tracked = holdings.filter((h) => !h.isFiatBalance && h.units > 0)
  if (tracked.length === 0) return []

  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  const startIso = startDate.toISOString().slice(0, 10)
  const ids = tracked.map((h) => h.id)

  const { data, error } = await fetchAllCryptoPrices(supabase, (q) =>
    (q as PriceQueryBuilder)
      .in('holding_id', ids)
      .gte('date', startIso)
      .order('date', { ascending: true }),
  )

  if (error || !data || data.length === 0) return []

  const priceRows = data

  // Bouw per holding een datum→prijs map zodat de forward-fill loop O(1) is
  // per (dag, holding) lookup i.p.v. O(N) per binary search.
  const pricesByHolding = new Map<string, Map<string, number>>()
  for (const row of priceRows) {
    const map = pricesByHolding.get(row.holding_id) ?? new Map<string, number>()
    map.set(row.date, Number(row.close_price))
    pricesByHolding.set(row.holding_id, map)
  }

  // Verzamel alle unieke dagen en sorteer chronologisch.
  const allDates = new Set<string>()
  for (const m of pricesByHolding.values()) {
    for (const d of m.keys()) allDates.add(d)
  }
  const sortedDates = Array.from(allDates).sort()
  if (sortedDates.length === 0) return []

  // Per holding: state-tracker met laatst bekende prijs (forward-fill).
  const lastPriceByHolding = new Map<string, number>()
  const series: CryptoPortfolioPoint[] = []
  for (const date of sortedDates) {
    let total = 0
    for (const h of tracked) {
      const todayPrice = pricesByHolding.get(h.id)?.get(date)
      if (todayPrice != null) {
        lastPriceByHolding.set(h.id, todayPrice)
      }
      const px = lastPriceByHolding.get(h.id)
      if (px != null) total += h.units * px
    }
    series.push({ date, valueEur: total })
  }
  return series
}

// ── Per-holding sparkline series ───────────────────────────────────────
//
// Lichte loader die per holding alleen de afgelopen N dagen close-prices
// terughaalt — bedoeld voor inline sparklines in de tabel-view. Bewust géén
// forward-fill of cross-holding aggregatie; we leveren ruwe rijen en laten
// de UI-component zelf beslissen hoe ze omgaat met gaten (typische strategie:
// gewoon de aanwezige punten verbinden).
//
// Performance: één batched query met `IN (...)` over de holding-IDs +
// datum-filter. Voor 50 holdings × 7 dagen = max ~350 rijen, ruim binnen de
// PostgREST default limit. Sortering server-side op `holding_id, date ASC`
// zodat de UI direct in chronologische volgorde kan plotten zonder extra sort.

/** Eén punt op de mini-sparkline — datum + close-prijs in EUR. */
export interface CryptoSparklinePoint {
  /** ISO-datum (YYYY-MM-DD). */
  date: string
  /** Slot-koers in EUR op deze dag. */
  close: number
}

/**
 * Laad per holding-ID een chronologisch gesorteerde reeks close-prijzen over
 * de afgelopen `daysBack` dagen. Retourneert een lookup-record waarbij
 * holdings zonder enige prijs-historie ontbreken in de map (caller behandelt
 * dat als "geen data" en toont een neutrale streep).
 *
 * Edge cases:
 *   - Lege `holdingIds` → lege map (geen Supabase-roundtrip).
 *   - Query-fout → lege map (UI-component valt terug op neutrale streep).
 *   - Holdings die alleen op één dag een snapshot hebben → één-punts-array;
 *     UI rendert die als horizontale streep (zie `crypto-sparkline.tsx`).
 */
export async function loadCryptoSparklineData(
  supabase: SupabaseClient,
  holdingIds: string[],
  daysBack = 7,
): Promise<Record<string, CryptoSparklinePoint[]>> {
  if (holdingIds.length === 0) return {}

  // Window: vandaag minus `daysBack` (≥1, ≤90 cap voor defensieve query-grootte).
  const days = Math.max(1, Math.min(90, daysBack))
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  const startIso = startDate.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('crypto_holding_prices')
    .select('holding_id, date, close_price')
    .in('holding_id', holdingIds)
    .gte('date', startIso)
    .order('holding_id', { ascending: true })
    .order('date', { ascending: true })

  if (error || !data) return {}

  type Row = { holding_id: string; date: string; close_price: number | string }
  const rows = data as Row[]

  const result: Record<string, CryptoSparklinePoint[]> = {}
  for (const row of rows) {
    const list = result[row.holding_id] ?? []
    list.push({ date: row.date, close: Number(row.close_price) })
    result[row.holding_id] = list
  }
  return result
}

// ── Period returns ────────────────────────────────────────────────────────
//
// Per-period referentieprijs per holding zodat de UI in één snapshot de
// rendementen over 24u / 7d / 30d / 1j kan tonen zonder N losse fetches.
// "All" wordt afgeleid uit de eerste prijs-snapshot of de eerste-aankoop
// datum uit `crypto_transactions` — voor nu: simpel = oudste close-prijs.

export type CryptoReturnPeriod = '24h' | '7d' | '30d' | '1y' | 'all'

/** Per holding: huidige waarde + EUR/percentage rendement over één periode. */
export interface CryptoHoldingPeriodReturn {
  holdingId: string
  symbol: string
  /** Referentieprijs in EUR aan het begin van de periode; NULL = onbekend. */
  referencePrice: number | null
  /** Procentuele verandering t.o.v. de referentieprijs; NULL = niet berekenbaar. */
  changePct: number | null
  /** EUR-bedrag verschil (huidige - referentie) × units; NULL = niet berekenbaar. */
  changeEur: number | null
}

/** Aggregaat per periode over alle holdings. */
export interface CryptoPortfolioPeriodReturn {
  /** Totale waarde aan het begin van de periode (alleen tracked, niet-fiat). */
  startValue: number
  /** Totale huidige waarde (alleen tracked, niet-fiat). */
  endValue: number
  /** EUR-delta = endValue − startValue. */
  changeEur: number
  /** Procentuele delta of NULL als startValue 0/onbekend was. */
  changePct: number | null
  /** Per-holding breakdown — handig voor "top performer" voor deze periode. */
  perHolding: CryptoHoldingPeriodReturn[]
}

/** Bundle met alle perioden — één pas door de prijs-historie. */
export type CryptoPeriodReturnsBundle = Record<
  CryptoReturnPeriod,
  CryptoPortfolioPeriodReturn
>

const PERIOD_DAYS: Record<Exclude<CryptoReturnPeriod, 'all'>, number> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
  '1y': 365,
}

/**
 * Bouw voor alle vaste perioden een rendementsoverzicht. Strategie: één
 * brede query op `crypto_holding_prices` over de maximale terugblik (1 jaar),
 * vervolgens per holding de "laatst bekende close ≤ referentiedatum"
 * uitvissen via een sortering op datum. Niet O(n²) — we sorteren één keer
 * per holding en doen een lineaire scan per periode.
 *
 * Edge cases:
 *   - Geen prijs-historie of <2 datapunten → alle perioden retourneren NULL-
 *     waarden, UI toont "—".
 *   - Holding zonder prijs vóór de referentiedatum → die holding telt voor
 *     die periode niet mee (geen 100%-rendement-vertekening).
 *   - Fiat-balansen worden uitgesloten (geen rendement van toepassing).
 */
export async function loadCryptoPeriodReturns(
  supabase: SupabaseClient,
): Promise<CryptoPeriodReturnsBundle> {
  const empty = (): CryptoPortfolioPeriodReturn => ({
    startValue: 0,
    endValue: 0,
    changeEur: 0,
    changePct: null,
    perHolding: [],
  })
  const emptyBundle: CryptoPeriodReturnsBundle = {
    '24h': empty(),
    '7d': empty(),
    '30d': empty(),
    '1y': empty(),
    all: empty(),
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return emptyBundle

  const holdings = await loadCryptoHoldingsForUser(supabase)
  const tracked = holdings.filter(
    (h) => !h.isFiatBalance && h.units > 0 && h.currentPrice != null,
  )
  if (tracked.length === 0) return emptyBundle

  const ids = tracked.map((h) => h.id)
  const startWindow = new Date()
  startWindow.setDate(startWindow.getDate() - 366)
  const startIso = startWindow.toISOString().slice(0, 10)

  const { data, error } = await fetchAllCryptoPrices(supabase, (q) =>
    (q as PriceQueryBuilder)
      .in('holding_id', ids)
      .gte('date', startIso)
      .order('date', { ascending: true }),
  )

  if (error || !data) return emptyBundle

  const priceRows = data

  // Per holding een chronologisch gesorteerde array bouwen.
  const seriesByHolding = new Map<string, { date: string; price: number }[]>()
  for (const row of priceRows) {
    const list = seriesByHolding.get(row.holding_id) ?? []
    list.push({ date: row.date, price: Number(row.close_price) })
    seriesByHolding.set(row.holding_id, list)
  }

  const today = new Date()
  // Helper: vind de laatst-bekende close-prijs op-of-vóór een referentiedatum.
  // Lineaire scan vanaf het einde — voor een typische 365-rij-array kost dat
  // hooguit een paar honderd vergelijkingen per holding × periode.
  function priceOnOrBefore(
    series: { date: string; price: number }[],
    refIso: string,
  ): number | null {
    for (let i = series.length - 1; i >= 0; i--) {
      if (series[i].date <= refIso) return series[i].price
    }
    return null
  }

  function refIsoForDays(daysBack: number): string {
    const d = new Date(today)
    d.setDate(d.getDate() - daysBack)
    return d.toISOString().slice(0, 10)
  }

  function computePeriod(refIso: string | null): CryptoPortfolioPeriodReturn {
    let startValue = 0
    let endValue = 0
    const perHolding: CryptoHoldingPeriodReturn[] = []
    for (const h of tracked) {
      const series = seriesByHolding.get(h.id) ?? []
      // Voor "all" gebruiken we de oudste beschikbare prijs als referentie.
      const referencePrice =
        refIso == null
          ? series[0]?.price ?? null
          : priceOnOrBefore(series, refIso)
      const currentPrice = h.currentPrice ?? 0
      let changePct: number | null = null
      let changeEur: number | null = null
      if (referencePrice != null && referencePrice > 0) {
        startValue += h.units * referencePrice
        endValue += h.units * currentPrice
        changePct = ((currentPrice - referencePrice) / referencePrice) * 100
        changeEur = h.units * (currentPrice - referencePrice)
      }
      perHolding.push({
        holdingId: h.id,
        symbol: h.symbol,
        referencePrice,
        changePct,
        changeEur,
      })
    }
    const changeEur = endValue - startValue
    const changePct =
      startValue > 0 ? (changeEur / startValue) * 100 : null
    return { startValue, endValue, changeEur, changePct, perHolding }
  }

  return {
    '24h': computePeriod(refIsoForDays(PERIOD_DAYS['24h'])),
    '7d': computePeriod(refIsoForDays(PERIOD_DAYS['7d'])),
    '30d': computePeriod(refIsoForDays(PERIOD_DAYS['30d'])),
    '1y': computePeriod(refIsoForDays(PERIOD_DAYS['1y'])),
    all: computePeriod(null),
  }
}

// ── Realized vs unrealized P&L ────────────────────────────────────────────
//
// Weighted-average cost basis matcht de manier waarop `crypto_holdings.
// avg_purchase_price` al wordt berekend (per holding). Voor realized P&L
// passen we hetzelfde principe toe: bij elke sell-trade rekenen we
// (sell-price − running-avg-cost) × sell-units en accumuleren. Voor buys
// updaten we de running-avg-cost: (oude_units × oude_avg + nieuwe_units ×
// nieuwe_price) / totale_units.
//
// Edge cases:
//   - Trades zonder price_per_unit → genegeerd (komt voor bij deposits/
//     withdrawals; die wijzigen geen kostenbasis).
//   - Sell zonder voorafgaande buy → realized P&L 0 voor die trade (we
//     hebben geen referentie-cost).
//   - Geen transacties → realized = 0, label "Geen verkooptransacties".

/** Cost-basis methode voor realized/unrealized berekening. */
export type CryptoCostBasisMethod = 'weighted_avg' | 'fifo'

export interface CryptoRealizedPnL {
  /** Niet-gerealiseerd resultaat: huidige waarde − kostenbasis (alleen waar bekend). */
  unrealizedEur: number
  /** Gerealiseerd resultaat over alle gesloten verkopen. */
  realizedEur: number
  /** Aantal sell-transacties dat is meegenomen. 0 → label "Geen verkopen geregistreerd". */
  sellCount: number
  /** Methode die is gebruikt voor de berekening — handig voor UI-labelling. */
  method: CryptoCostBasisMethod
}

/**
 * Bereken realized + unrealized P&L over alle crypto-holdings van de user.
 *
 * Twee methodes:
 *   - `weighted_avg` (default, backwards-compat): hangt aan dezelfde weighted-
 *     average cost basis die `crypto_holdings.avg_purchase_price` ook
 *     berekent. Bij elke buy-tx wordt de gemiddelde inkoopprijs herrekend;
 *     bij sell-tx wordt (sell − avg) × units gerealiseerd. Past bij hoe het
 *     UI de hold-positie communiceert.
 *   - `fifo`: First-In-First-Out lot-tracking. Bij elke buy wordt een lot in
 *     de FIFO-queue gepushed; bij sell worden de oudste lots opgegeten tot
 *     de verkochte units gevuld zijn. Realized = sell × units − Σ(lot.price ×
 *     consumed_units). Unrealized = (currentPrice − weighted_avg(remaining
 *     lots)) × remaining_units. FIFO geeft over een langere horizon vaak een
 *     fiscaal-realistischer beeld omdat oude lots tegen lagere prijzen het
 *     eerst worden verkocht.
 *
 * Edge cases (gelijk voor beide methodes):
 *   - Trades zonder `price_per_unit` → genegeerd.
 *   - Sell zonder voorafgaande buy → realized 0 voor die trade, unit-saldo
 *     blijft minimaal 0 (we houden geen short-positie bij).
 *   - Geen trades → realized = 0, sellCount = 0, unrealized via holdings-loader.
 */
export async function loadCryptoRealizedPnL(
  supabase: SupabaseClient,
  method: CryptoCostBasisMethod = 'weighted_avg',
): Promise<CryptoRealizedPnL> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { unrealizedEur: 0, realizedEur: 0, sellCount: 0, method }
  }

  const holdings = await loadCryptoHoldingsForUser(supabase)

  // Voor weighted_avg gebruiken we de holding-row's eigen returnEur (komt
  // direct uit de DB-avg). Voor FIFO moeten we de remaining-lots queue na
  // alle sells opbouwen om een eerlijke unrealized te berekenen.
  const { data, error } = await supabase
    .from('crypto_transactions')
    .select('holding_id, type, units, price_per_unit, date, created_at')
    .eq('user_id', user.id)
    .in('type', ['buy', 'sell'])
    .order('date', { ascending: true })
    .order('created_at', { ascending: true })

  if (error || !data) {
    // Fallback: alleen holding-row unrealized doorgeven, realized 0.
    let unrealizedEur = 0
    for (const h of holdings) {
      if (h.isFiatBalance) continue
      if (h.returnEur != null) unrealizedEur += h.returnEur
    }
    return { unrealizedEur, realizedEur: 0, sellCount: 0, method }
  }

  type TxRow = {
    holding_id: string
    type: 'buy' | 'sell'
    units: number | string
    price_per_unit: number | string | null
  }
  const txRows = data as unknown as TxRow[]

  // Per-holding state: voor weighted_avg houden we { units, avgCost } bij;
  // voor FIFO houden we een queue van { units, price } lots bij. Beide
  // varianten verwerken we in dezelfde loop om twee scans te besparen.
  type FifoLot = { units: number; price: number }
  const wavgState = new Map<string, { units: number; avgCost: number }>()
  const fifoState = new Map<string, FifoLot[]>()
  let realizedEurWavg = 0
  let realizedEurFifo = 0
  let sellCount = 0

  for (const tx of txRows) {
    const price = tx.price_per_unit != null ? Number(tx.price_per_unit) : null
    const units = Number(tx.units) || 0
    if (price == null || units <= 0) continue

    // ── weighted-average pad ──
    const cur = wavgState.get(tx.holding_id) ?? { units: 0, avgCost: 0 }
    if (tx.type === 'buy') {
      const totalCost = cur.units * cur.avgCost + units * price
      const newUnits = cur.units + units
      cur.units = newUnits
      cur.avgCost = newUnits > 0 ? totalCost / newUnits : 0
    } else {
      if (cur.avgCost > 0) {
        realizedEurWavg += (price - cur.avgCost) * units
      }
      cur.units = Math.max(0, cur.units - units)
    }
    wavgState.set(tx.holding_id, cur)

    // ── FIFO pad ──
    const lots = fifoState.get(tx.holding_id) ?? []
    if (tx.type === 'buy') {
      lots.push({ units, price })
    } else {
      // Eet de oudste lots op tot we de verkochte units gevuld hebben. Lots
      // die volledig worden opgegeten verlaten de queue; de laatste lot kan
      // partieel afgenomen worden.
      let unitsLeftToSell = units
      while (unitsLeftToSell > 0 && lots.length > 0) {
        const lot = lots[0]
        const consumed = Math.min(lot.units, unitsLeftToSell)
        if (lot.price > 0) {
          realizedEurFifo += (price - lot.price) * consumed
        }
        lot.units -= consumed
        unitsLeftToSell -= consumed
        if (lot.units <= 1e-12) lots.shift()
      }
      // Sell zonder voorafgaande buy: rest van `unitsLeftToSell` wordt
      // genegeerd (we houden geen short-positie bij).
      if (units > 0) sellCount += 1
    }
    fifoState.set(tx.holding_id, lots)
  }

  // sellCount is bewust gemeenschappelijk: zelfde set verkooptransacties,
  // alleen ander cost-basis-model. We tellen één keer in het FIFO-pad omdat
  // de weighted_avg-tak alleen telt als er ook een avg > 0 is — dat
  // onderschat het werkelijke aantal verkopen. (Eerdere implementatie ging
  // mis bij sells zonder voorafgaande buy: die zouden dubbel of niet tellen.)

  // Unrealized berekenen per methode.
  let unrealizedEurWavg = 0
  for (const h of holdings) {
    if (h.isFiatBalance) continue
    if (h.returnEur != null) unrealizedEurWavg += h.returnEur
  }

  // FIFO unrealized: per holding, sum(remaining_lot.units × currentPrice)
  // − sum(remaining_lot.units × lot.price). Currentprice komt uit holdings-
  // map; ontbreekt die (geen koers) dan slaan we de holding over (matcht het
  // wavg-gedrag waar we returnEur skippen wanneer kostenbasis ontbreekt).
  const currentPriceByHoldingId = new Map<string, number>()
  for (const h of holdings) {
    if (h.currentPrice != null) currentPriceByHoldingId.set(h.id, h.currentPrice)
  }
  let unrealizedEurFifo = 0
  for (const [holdingId, lots] of fifoState.entries()) {
    const px = currentPriceByHoldingId.get(holdingId)
    if (px == null) continue
    for (const lot of lots) {
      if (lot.units <= 0 || lot.price <= 0) continue
      unrealizedEurFifo += lot.units * (px - lot.price)
    }
  }

  if (method === 'fifo') {
    return {
      unrealizedEur: unrealizedEurFifo,
      realizedEur: realizedEurFifo,
      sellCount,
      method: 'fifo',
    }
  }
  return {
    unrealizedEur: unrealizedEurWavg,
    realizedEur: realizedEurWavg,
    sellCount,
    method: 'weighted_avg',
  }
}

// ── Concentratie-risico (Herfindahl + top-3 share) ─────────────────────────
//
// Pure metric — geen IO. Berekent hoe verspreid (of geconcentreerd) het
// crypto-portfolio is volgens de Herfindahl-Hirschman index (HHI):
//
//     HHI = Σ (share_i × 100)²,  range 0..10_000
//
// Klassieke marktconcentratie-grenzen (US DoJ guideline):
//   - HHI < 1500          → verspreid
//   - 1500 ≤ HHI < 2500   → gemiddeld
//   - HHI ≥ 2500          → geconcentreerd
//
// Fiat-saldi (`isFiatBalance`) tellen niet mee: concentratie-risico gaat
// over de spreiding van crypto-posities, niet over hoeveel cash naast die
// posities staat. Holdings zonder waarde (valueEur ≤ 0) worden ook
// uitgesloten — die zijn praktisch geen positie.
//
// Edge cases:
//   - 0 actieve holdings → riskLabel = 'verspreid' (er is niets om te
//     concentreren), HHI = 0, top3SharePct = 0.
//   - 1 actieve holding → riskLabel = 'geconcentreerd', HHI = 10_000.

export type ConcentrationRiskLabel = 'verspreid' | 'gemiddeld' | 'geconcentreerd'

export interface ConcentrationMetrics {
  /** HHI op de schaal 0..10_000 (kwadraten van procent-shares). */
  hhi: number
  /** Genormaliseerd naar 0..1 voor visuele weergave (HHI / 10_000). */
  hhiNormalized: number
  /** Procentueel aandeel van de top-3 holdings in het portfolio (0..100). */
  top3SharePct: number
  /** Symbolen van de top-3 holdings, gesorteerd op waarde aflopend. */
  top3Names: string[]
  /** Grootste holding met share %, of NULL bij leeg portfolio. */
  topHolding: { symbol: string; sharePct: number } | null
  /** Risico-classificatie volgens HHI-bandbreedtes. */
  riskLabel: ConcentrationRiskLabel
  /** Aantal niet-fiat holdings met waarde > 0 dat is meegenomen. */
  holdingsCount: number
}

export function computeConcentrationMetrics(
  holdings: CryptoHoldingRow[],
): ConcentrationMetrics {
  // Filter: alleen crypto-posities met waarde tellen mee. Fiat-cash en
  // dust-balances (value 0 door ontbrekende prijs) horen niet in concentratie.
  const tracked = holdings.filter((h) => !h.isFiatBalance && h.valueEur > 0)
  const holdingsCount = tracked.length

  if (holdingsCount === 0) {
    return {
      hhi: 0,
      hhiNormalized: 0,
      top3SharePct: 0,
      top3Names: [],
      topHolding: null,
      riskLabel: 'verspreid',
      holdingsCount: 0,
    }
  }

  const totalValue = tracked.reduce((sum, h) => sum + h.valueEur, 0)
  if (totalValue <= 0) {
    return {
      hhi: 0,
      hhiNormalized: 0,
      top3SharePct: 0,
      top3Names: [],
      topHolding: null,
      riskLabel: 'verspreid',
      holdingsCount,
    }
  }

  // Sortering aflopend op waarde — zo komt top-3 er gratis uit.
  const sorted = [...tracked].sort((a, b) => b.valueEur - a.valueEur)

  // HHI = Σ (share_pct)². Bij één holding wordt dit 100² = 10_000.
  let hhi = 0
  for (const h of sorted) {
    const sharePct = (h.valueEur / totalValue) * 100
    hhi += sharePct * sharePct
  }

  const top3 = sorted.slice(0, 3)
  const top3SumValue = top3.reduce((sum, h) => sum + h.valueEur, 0)
  const top3SharePct = (top3SumValue / totalValue) * 100

  const topHoldingRaw = sorted[0]
  const topHolding = topHoldingRaw
    ? {
        symbol: topHoldingRaw.symbol,
        sharePct: (topHoldingRaw.valueEur / totalValue) * 100,
      }
    : null

  // Klassieke US DoJ HHI-grenzen: < 1500 verspreid, 1500-2500 gemiddeld, > 2500 geconcentreerd.
  const riskLabel: ConcentrationRiskLabel =
    hhi < 1500 ? 'verspreid' : hhi < 2500 ? 'gemiddeld' : 'geconcentreerd'

  return {
    hhi,
    hhiNormalized: hhi / 10_000,
    top3SharePct,
    top3Names: top3.map((h) => h.symbol),
    topHolding,
    riskLabel,
    holdingsCount,
  }
}

// ── Spread per coin (bron-verdeling per unieke symbol) ─────────────────────
//
// Pure metric — geen IO. Beantwoordt de vraag: "Voor elke coin die ik bezit,
// op welke bronnen (exchanges / wallets / handmatig) staat hij verdeeld?"
//
// Anders dan `crypto-source-breakdown` (dat totalen per bron over het hele
// portfolio toont) groepeert deze functie eerst op `symbol` en daarna binnen
// elk symbol op bron-instantie. Zo wordt zichtbaar wanneer dezelfde coin
// (BTC) op meerdere bronnen staat (Bitvavo + eigen wallet) — een vorm van
// risico-spreiding tegen exchange-lock-in.
//
// Edge cases:
//   - Fiat-balansen worden uitgesloten (geen "spread" van toepassing).
//   - Holdings met units ≤ 0 worden uitgesloten (dust / gesloten posities).
//   - Twee holdings met dezelfde symbol én dezelfde bron-instantie (bv. twee
//     `manual` rijen voor BTC) worden onder één bron-entry gecombineerd; de
//     `holdingId` van de grootste positie blijft in dat geval als deeplink.
//   - Sortering: entries op `totalValueEur` aflopend, met `sourceCount > 1`
//     altijd boven `sourceCount === 1` — zo komt echte spread eerst in beeld.

export interface CryptoSpreadEntry {
  /** Symbol als unieke key (bv. 'BTC'). */
  symbol: string
  /** Coin-naam ("Bitcoin"); fallback op symbol als leeg. */
  name: string
  /** Som van units over alle bronnen. */
  totalUnits: number
  /** Som van EUR-waarde over alle bronnen. */
  totalValueEur: number
  /** Aantal verschillende bronnen waar deze coin staat. */
  sourceCount: number
  /** Bron-verdeling, gesorteerd op valueEur aflopend. */
  sources: {
    /** Discriminator op kind — bepaalt kleur-segment in de stacked-bar. */
    kind: 'exchange' | 'wallet' | 'manual'
    /** Display-label, bv. 'Bitvavo · main' / 'ethereum · 0xab…cd' / 'Handmatig'. */
    label: string
    units: number
    valueEur: number
    /** Procentueel aandeel van deze bron binnen de coin (0..100, op units). */
    sharePct: number
    /** Holding-ID voor deeplink naar de detail-pagina. */
    holdingId: string
  }[]
}

/**
 * Bouw een per-symbol spread-overzicht uit een `CryptoHoldingRow[]`. Pure
 * functie — bedoeld om client- of server-side aan te roepen op data die al
 * via `loadCryptoHoldingsForUser` is opgehaald.
 *
 * `sharePct` wordt op **units** gebaseerd, niet op EUR-waarde — beide bronnen
 * gebruiken dezelfde markt-prijs voor dezelfde coin, dus EUR/units geven
 * identieke percentages. Units is conceptueel zuiverder als "hoeveel van
 * deze coin staat op bron X".
 */
export function computeCryptoSpread(
  holdings: CryptoHoldingRow[],
): CryptoSpreadEntry[] {
  // Filter: alleen echte crypto-posities met units. Fiat en dust eruit.
  const tracked = holdings.filter((h) => !h.isFiatBalance && h.units > 0)
  if (tracked.length === 0) return []

  // Eerste pas: groepeer per symbol. Per symbol bouwen we een map per bron-
  // instantie, zodat twee holdings met identieke symbol+bron onder één entry
  // landen (zeldzaam maar mogelijk via dubbele manuele invoer).
  type SourceBucket = {
    kind: 'exchange' | 'wallet' | 'manual'
    label: string
    units: number
    valueEur: number
    /** Holding-ID van de positie met de hoogste valueEur — voor deeplink. */
    holdingId: string
    /** Highwater valueEur — om bij merge te beslissen welke holdingId we houden. */
    leadValueEur: number
  }

  const bySymbol = new Map<
    string,
    {
      symbol: string
      name: string
      totalUnits: number
      totalValueEur: number
      sources: Map<string, SourceBucket>
    }
  >()

  for (const h of tracked) {
    const symKey = h.symbol.toUpperCase()
    let entry = bySymbol.get(symKey)
    if (!entry) {
      entry = {
        symbol: symKey,
        name: h.name?.trim() || h.symbol,
        totalUnits: 0,
        totalValueEur: 0,
        sources: new Map(),
      }
      bySymbol.set(symKey, entry)
    }
    entry.totalUnits += h.units
    entry.totalValueEur += h.valueEur

    // Bron-instantie-key: kind + stabiele identifier per bron-soort. Twee
    // holdings op dezelfde Bitvavo-connectie → één bucket; twee holdings op
    // verschillende wallets → twee buckets.
    const src = h.source
    let bucketKey: string
    let kind: SourceBucket['kind']
    let label: string
    if (src.kind === 'exchange') {
      bucketKey = `exchange:${src.connectionId}`
      kind = 'exchange'
      label = src.exchangeLabel
    } else if (src.kind === 'wallet') {
      bucketKey = `wallet:${src.walletAddressId}`
      kind = 'wallet'
      label = `${src.walletChain} · ${src.walletAddressMask}`
    } else {
      // Manual heeft geen instantie-id — alle handmatige rijen voor één coin
      // klappen onder één 'Handmatig' bucket. Dat is gewenst gedrag: voor de
      // gebruiker is "handmatig" één bron, niet N losse posten.
      bucketKey = 'manual'
      kind = 'manual'
      label = 'Handmatig'
    }

    const existing = entry.sources.get(bucketKey)
    if (existing) {
      existing.units += h.units
      existing.valueEur += h.valueEur
      // Behoud de holdingId van de grootste bijdrage — bij klik landen we op
      // de meest informatieve detail-pagina binnen die bron.
      if (h.valueEur > existing.leadValueEur) {
        existing.holdingId = h.id
        existing.leadValueEur = h.valueEur
      }
    } else {
      entry.sources.set(bucketKey, {
        kind,
        label,
        units: h.units,
        valueEur: h.valueEur,
        holdingId: h.id,
        leadValueEur: h.valueEur,
      })
    }
  }

  // Tweede pas: materialiseer entries + sorteer bron-lijsten + bereken share.
  const result: CryptoSpreadEntry[] = []
  for (const entry of bySymbol.values()) {
    const sources = Array.from(entry.sources.values())
      .map((b) => ({
        kind: b.kind,
        label: b.label,
        units: b.units,
        valueEur: b.valueEur,
        sharePct:
          entry.totalUnits > 0 ? (b.units / entry.totalUnits) * 100 : 0,
        holdingId: b.holdingId,
      }))
      .sort((a, b) => b.valueEur - a.valueEur)

    result.push({
      symbol: entry.symbol,
      name: entry.name,
      totalUnits: entry.totalUnits,
      totalValueEur: entry.totalValueEur,
      sourceCount: sources.length,
      sources,
    })
  }

  // Sorteer: gespreide coins (sourceCount > 1) bovenaan, daarbinnen op waarde.
  // Single-source coins komen daaronder, ook op waarde — zo vertelt de scroll
  // het verhaal "deze zijn echt verspreid" → "deze niet, kandidaat voor risico-
  // mitigatie".
  result.sort((a, b) => {
    const aSpread = a.sourceCount > 1 ? 1 : 0
    const bSpread = b.sourceCount > 1 ? 1 : 0
    if (aSpread !== bSpread) return bSpread - aSpread
    return b.totalValueEur - a.totalValueEur
  })

  return result
}

// ── Benchmark history (BTC / ETH overlay) ─────────────────────────────────
//
// De portfolio performance-chart kan een 2e lijn tonen die gerebaseerd is op
// de portfolio-startwaarde — handig om te zien of het portfolio BTC of ETH
// klopt. Strategie:
//
//   1. Eerst proberen we een eigen `crypto_holdings` rij voor BTC/ETH te
//      vinden (bv. user heeft zelf BTC) en de bijbehorende
//      `crypto_holding_prices` te lezen. Dat is gratis en deelt de RLS-
//      roundtrip met de bestaande prijs-loader.
//   2. Lukt dat niet (geen BTC-positie, of geen historische snapshots), dan
//      vallen we terug op CoinGecko's `market_chart` endpoint (1u-cache).
//
// Output is een chronologisch gesorteerde array van `{ date, close }` paren
// in EUR. Bij een fail-over op alle paden retourneren we een lege array —
// caller toont dan eenvoudig geen benchmark-lijn.

export type BenchmarkSymbol = 'BTC' | 'ETH'

const BENCHMARK_TO_COINGECKO_ID: Record<BenchmarkSymbol, string> = {
  BTC: SYMBOL_TO_COINGECKO_ID.BTC, // 'bitcoin'
  ETH: SYMBOL_TO_COINGECKO_ID.ETH, // 'ethereum'
}

/**
 * Laad EUR-prijshistorie voor een benchmark-coin (BTC of ETH) over de
 * afgelopen `daysBack` dagen. Resultaat is gerangschikt op datum en bevat
 * één entry per dag.
 *
 * Probeert eerst de eigen `crypto_holding_prices` (als de user toevallig BTC/
 * ETH heeft); valt terug op CoinGecko `market_chart`. Bij een mislukte
 * fallback retourneren we een lege array zodat de UI gracieus degradeert.
 */
export async function loadBenchmarkHistory(
  supabase: SupabaseClient,
  symbol: BenchmarkSymbol,
  daysBack: number,
): Promise<{ date: string; close: number }[]> {
  const days = Math.max(7, Math.min(365, daysBack))

  // ── Pad 1: eigen prijs-historie ─────────────────────────────
  // Als de user al BTC of ETH heeft, hebben we waarschijnlijk een rij in
  // `crypto_holding_prices` die exact aansluit op zijn portfolio-window.
  // Dat geeft de zuiverste vergelijking (zelfde data-bron als de portfolio-
  // chart) en kost geen extra externe API-call.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      const { data: holdingRows } = await supabase
        .from('crypto_holdings')
        .select('id, symbol')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .ilike('symbol', symbol)
        .limit(1)

      const holdingId = (holdingRows as Array<{ id: string }> | null)?.[0]?.id
      if (holdingId) {
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)
        const startIso = startDate.toISOString().slice(0, 10)
        const { data: priceRows } = await supabase
          .from('crypto_holding_prices')
          .select('date, close_price')
          .eq('holding_id', holdingId)
          .gte('date', startIso)
          .order('date', { ascending: true })
        const rows = (priceRows ?? []) as Array<{
          date: string
          close_price: number | string
        }>
        if (rows.length >= 2) {
          return rows.map((r) => ({
            date: r.date,
            close: Number(r.close_price),
          }))
        }
      }
    }
  } catch {
    // Stilzwijgend doorvallen naar de CoinGecko-fallback. Een fout op het
    // eigen-prijspad mag de benchmark-overlay niet uitschakelen.
  }

  // ── Pad 2: CoinGecko market_chart fallback ──────────────────
  const coingeckoId = BENCHMARK_TO_COINGECKO_ID[symbol]
  if (!coingeckoId) return []
  return await fetchMarketChartEur(coingeckoId, days)
}

// ── Holding price history (DCA-overlay op detail-page) ─────────────────────

/**
 * Eén dag-snapshot van een individuele holding voor de detail-page price-chart.
 * De DCA-lijn (`avg_purchase_price`) wordt door de UI er als horizontale
 * referentie overheen gelegd — niet door deze loader.
 */
export interface CryptoHoldingPricePoint {
  date: string
  close: number
}

/**
 * Laad de close-prijs-historie voor één crypto-holding over de afgelopen
 * `daysBack` dagen. Retourneert een lege array als er geen snapshots zijn —
 * de UI valt dan terug op een "Koers-historie bouwt nog op"-placeholder.
 */
export async function loadCryptoHoldingPriceHistory(
  supabase: SupabaseClient,
  holdingId: string,
  daysBack = 90,
): Promise<CryptoHoldingPricePoint[]> {
  const days = Math.max(7, Math.min(365, daysBack))
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)
  const startIso = startDate.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('crypto_holding_prices')
    .select('date, close_price')
    .eq('holding_id', holdingId)
    .gte('date', startIso)
    .order('date', { ascending: true })

  if (error || !data) return []
  const rows = data as Array<{ date: string; close_price: number | string }>
  return rows.map((r) => ({ date: r.date, close: Number(r.close_price) }))
}

// ── Portfolio volatiliteit ────────────────────────────────────────────────
//
// Berekent de dagelijkse return-volatiliteit van de hele portefeuille over
// de afgelopen N dagen (default 90). Strategie: hergebruik de bestaande
// `loadCryptoPortfolioHistory`-output (één forward-fill series), bereken
// per dag-paar de relatieve return, en vervolgens de standaarddeviatie van
// die returns.
//
// Categorisatie in de UI:
//   - daily_stdev < 2%   → "Laag"     (rustig portfolio, BTC-zwaar / stable-mix)
//   - 2% ≤ d < 5%        → "Gemiddeld" (typisch crypto-portfolio)
//   - daily_stdev ≥ 5%   → "Hoog"     (alt-zwaar / klein portfolio met spikes)
// Geannualiseerd via × √365 — de gangbare conventie in crypto (geen
// trading-week zoals op aandelenmarkten waar × √252 wordt gebruikt).
//
// Edge cases:
//   - <2 datapunten → 0,0 met `daysWithData = 0`. UI toont "—".
//   - Eén dag met value ≤ 0 → return-paar wordt overgeslagen (geen NaN).

export interface CryptoVolatilityMetric {
  /** Standaarddeviatie van dagelijkse returns × 100 (procent). */
  daily_stdev_pct: number
  /** Geannualiseerd: daily_stdev × √365 × 100. */
  annualized_pct: number
  /** Aantal return-observaties dat is meegenomen (= dagen − 1, na zero-skip). */
  daysWithData: number
}

export async function loadCryptoPortfolioVolatility(
  supabase: SupabaseClient,
  daysBack = 90,
): Promise<CryptoVolatilityMetric> {
  const empty: CryptoVolatilityMetric = {
    daily_stdev_pct: 0,
    annualized_pct: 0,
    daysWithData: 0,
  }
  const series = await loadCryptoPortfolioHistory(supabase, daysBack)
  if (series.length < 2) return empty

  // Dagelijkse returns: (v[t] − v[t-1]) / v[t-1]. Skip wanneer v[t-1] ≤ 0
  // (zou anders Infinity/NaN geven en de stdev kapot maken).
  const returns: number[] = []
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].valueEur
    const curr = series[i].valueEur
    if (prev <= 0) continue
    returns.push((curr - prev) / prev)
  }
  if (returns.length === 0) return empty

  // Sample standard deviation (n−1 in noemer) — zuiverder voor schattingen
  // op kleine reeksen. Bij n=1 vallen we terug op 0 om delen-door-nul te
  // vermijden.
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length
  let sumSq = 0
  for (const r of returns) sumSq += (r - mean) ** 2
  const variance = returns.length > 1 ? sumSq / (returns.length - 1) : 0
  const stdev = Math.sqrt(variance)

  return {
    daily_stdev_pct: stdev * 100,
    annualized_pct: stdev * Math.sqrt(365) * 100,
    daysWithData: returns.length,
  }
}

// ── Totaal transactiekosten (fees) ────────────────────────────────────────
//
// Aggregeert `fee_native` over alle crypto_transactions, geconverteerd naar
// EUR via de bestaande forex-utility. De `byExchange`-breakdown gebruikt de
// label van de gekoppelde exchange-connection (of "Wallet" / "Handmatig" als
// fallback) zodat de gebruiker direct ziet bij welke broker de meeste
// kosten vallen.
//
// Performance-noot: forex-rates worden in-memory gecached (1u TTL), dus de
// per-currency convertToEUR-call is een synchroon look-up na de eerste hit.
// Voor een typische user (≤500 trades, 1-3 fee-currencies) blijft dit ruim
// binnen request-budget.

export interface CryptoFeesSummary {
  /** Som van alle fees omgerekend naar EUR. */
  totalFeesEur: number
  /** Aantal transacties met een niet-nul fee. */
  feeCount: number
  /** Breakdown per bron-exchange/wallet, gesorteerd op EUR-bedrag aflopend. */
  byExchange: { source: string; eur: number; count: number }[]
}

export async function loadCryptoFeesSummary(
  supabase: SupabaseClient,
): Promise<CryptoFeesSummary> {
  const empty: CryptoFeesSummary = {
    totalFeesEur: 0,
    feeCount: 0,
    byExchange: [],
  }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return empty

  // Fees komen uit `fee_native` + `fee_currency`. We joinen direct op
  // crypto_holdings → exchange_connections + wallet_addresses zodat we per
  // fee-rij weten waar hij vandaan kwam (voor de breakdown). Trades zonder
  // fee (NULL of 0) tellen niet mee.
  const { data, error } = await supabase
    .from('crypto_transactions')
    .select(
      `
      fee_native,
      fee_currency,
      holding:crypto_holdings!holding_id(
        source_exchange_connection_id,
        source_wallet_address_id,
        exchange:exchange_connections!source_exchange_connection_id(exchange, label),
        wallet:wallet_addresses!source_wallet_address_id(chain)
      )
      `,
    )
    .eq('user_id', user.id)
    .gt('fee_native', 0)

  if (error || !data) return empty

  type FeeRow = {
    fee_native: number | string | null
    fee_currency: string | null
    holding:
      | {
          source_exchange_connection_id: string | null
          source_wallet_address_id: string | null
          exchange:
            | { exchange: ExchangeId; label: string | null }
            | { exchange: ExchangeId; label: string | null }[]
            | null
          wallet:
            | { chain: WalletChain }
            | { chain: WalletChain }[]
            | null
        }
      | {
          source_exchange_connection_id: string | null
          source_wallet_address_id: string | null
          exchange:
            | { exchange: ExchangeId; label: string | null }
            | { exchange: ExchangeId; label: string | null }[]
            | null
          wallet:
            | { chain: WalletChain }
            | { chain: WalletChain }[]
            | null
        }[]
      | null
  }
  const rows = data as unknown as FeeRow[]
  if (rows.length === 0) return empty

  function pickOne<T>(value: T | T[] | null): T | null {
    if (!value) return null
    return Array.isArray(value) ? (value[0] ?? null) : value
  }

  // Aggregeer per source-label. Forex-conversie zit in de bestaande
  // utility (1u in-memory cache), dus per-rij await blijft goedkoop na de
  // eerste hit per currency.
  const aggregateBySource = new Map<string, { eur: number; count: number }>()
  let totalFeesEur = 0
  let feeCount = 0

  for (const row of rows) {
    const fee = row.fee_native != null ? Number(row.fee_native) : 0
    if (!Number.isFinite(fee) || fee <= 0) continue
    const currency = (row.fee_currency ?? 'EUR').trim().toUpperCase() || 'EUR'

    // Bepaal source-label. Voorkeurvolgorde: exchange-label > wallet-chain >
    // "Handmatig". Een holding zonder bron is theoretisch een manual entry.
    const holding = pickOne(row.holding)
    let sourceLabel = 'Handmatig'
    if (holding) {
      const exchange = pickOne(holding.exchange)
      const wallet = pickOne(holding.wallet)
      if (exchange) {
        const labelSuffix = exchange.label ? ` · ${exchange.label}` : ''
        sourceLabel = `${EXCHANGE_DISPLAY[exchange.exchange]}${labelSuffix}`
      } else if (wallet) {
        sourceLabel = `Wallet · ${wallet.chain}`
      }
    }

    // Convert fee naar EUR. EUR-fees passeren als no-op; andere currencies
    // gaan via de forex-cache. Bij forex-fail (rate=null) telt de utility
    // de ruwe waarde mee als laatste-redmiddel-benadering — beter dan stil
    // op 0 EUR boeken.
    const { eurAmount } = await convertToEUR(fee, currency)
    if (!Number.isFinite(eurAmount) || eurAmount <= 0) continue

    totalFeesEur += eurAmount
    feeCount += 1
    const cur = aggregateBySource.get(sourceLabel) ?? { eur: 0, count: 0 }
    cur.eur += eurAmount
    cur.count += 1
    aggregateBySource.set(sourceLabel, cur)
  }

  const byExchange = Array.from(aggregateBySource.entries())
    .map(([source, { eur, count }]) => ({ source, eur, count }))
    .sort((a, b) => b.eur - a.eur)

  return { totalFeesEur, feeCount, byExchange }
}

// ── Box 3 belastingimpact (indicatief) ────────────────────────────────────
//
// Crypto valt in NL Box 3 onder "overige bezittingen" (niet onder bank-
// tegoeden) — fictief rendement = `NL_FICTIEF_BELEGGINGEN` (2026: 5,88%).
// De feitelijke heffing = forfait × `BOX3_TARIEF` (2026: 36%) op de waarde
// boven de drempelvrijstelling. Wij tonen de **bruto** indicatie zonder
// vrijstelling te verrekenen — die hangt af van partner, peildatum en
// overige Box 3-vermogen, en kunnen we per user pas eerlijk schatten als de
// volledige fiscale module live is.
//
// Pure functie, geen IO. Caller geeft de huidige totale crypto-waarde en
// krijgt de indicatieve jaarheffing terug + het procentuele tarief en de
// drempelvrijstelling als context-data voor de tooltip.

export interface CryptoBox3Impact {
  /** Totale crypto-waarde die als grondslag wordt gebruikt. */
  totalAssetsEur: number
  /** Fictief jaarrendement (totalAssets × forfait%). */
  fictiefRendementEur: number
  /** Indicatieve jaarheffing (fictiefRendement × tarief). */
  belastingEur: number
  /** Forfait-percentage (bv. 5.88 voor 2026). */
  ratePct: number
  /** Belastingtarief (bv. 36 voor 2026). */
  taxRatePct: number
  /** Drempelvrijstelling per persoon — informatief voor de tooltip. */
  drempelvrijstellingEur: number
}

/**
 * Drempelvrijstelling Box 3 voor 2026 — per persoon. Dit is louter een
 * disclosure-veld in de UI; de heffing wordt berekend op de **bruto**
 * crypto-waarde omdat we per user (nog) geen volledige Box 3-grondslag
 * kennen. Voor de echte aangifte tellen ook spaargeld + andere beleggingen.
 */
const NL_BOX3_DREMPELVRIJSTELLING_2026 = 57000

export function computeCryptoBox3Impact(totalEur: number): CryptoBox3Impact {
  const safeTotal = Number.isFinite(totalEur) && totalEur > 0 ? totalEur : 0
  const fictiefRendementEur = safeTotal * NL_FICTIEF_BELEGGINGEN
  const belastingEur = fictiefRendementEur * BOX3_TARIEF
  return {
    totalAssetsEur: safeTotal,
    fictiefRendementEur,
    belastingEur,
    ratePct: NL_FICTIEF_BELEGGINGEN * 100,
    taxRatePct: BOX3_TARIEF * 100,
    drempelvrijstellingEur: NL_BOX3_DREMPELVRIJSTELLING_2026,
  }
}
