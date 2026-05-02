// CoinGecko price lookup for native crypto coins (BTC, ETH, …).
//
//   GET /api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=eur
//   →   { bitcoin: { eur: 53210.12 }, ethereum: { eur: 2890.55 } }
//
// Free Demo tier: ~30 calls/min and ~10k/month. We cache resolved prices for
// 5 minutes in-memory (same TTL as `lib/price-feed.ts`) so a burst of wallet
// syncs across users stays well within quota.
//
// `COINGECKO_API_KEY`, when present, is sent as `x-cg-demo-api-key`. Pro keys
// would use a different host + header — out of scope here.

import type { WalletChain } from '@/lib/connections-data'

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const CACHE_TTL_MS = 5 * 60 * 1000

const CHAIN_TO_COINGECKO_ID: Record<WalletChain, string> = {
  bitcoin: 'bitcoin',
  ethereum: 'ethereum',
  // Polygon's native token is MATIC.
  polygon: 'matic-network',
  // Arbitrum + Base use ETH as native gas token, so price = ethereum.
  arbitrum: 'ethereum',
  base: 'ethereum',
  solana: 'solana',
}

// Bitvavo (and most CEX) symbol → CoinGecko id. Curated for the top ~50
// liquid coins on Bitvavo. Exotic / new tokens (e.g. 2Z, AI, OPEN, USELESS,
// W, YB) are intentionally absent — they fall through to a `null` price and
// keep their last known value.
export const SYMBOL_TO_COINGECKO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  ADA: 'cardano',
  XRP: 'ripple',
  SOL: 'solana',
  DOT: 'polkadot',
  AVAX: 'avalanche-2',
  MATIC: 'matic-network',
  LINK: 'chainlink',
  UNI: 'uniswap',
  LTC: 'litecoin',
  ATOM: 'cosmos',
  ALGO: 'algorand',
  NEAR: 'near',
  FIL: 'filecoin',
  XTZ: 'tezos',
  VET: 'vechain',
  ICX: 'icon',
  SHIB: 'shiba-inu',
  DOGE: 'dogecoin',
  INJ: 'injective-protocol',
  FET: 'fetch-ai',
  TIA: 'celestia',
  APE: 'apecoin',
  HOT: 'holotoken',
  ROSE: 'oasis-network',
  LUNA2: 'terra-luna-2',
  AAVE: 'aave',
  GRT: 'the-graph',
  SAND: 'the-sandbox',
  MANA: 'decentraland',
  AXS: 'axie-infinity',
  CRO: 'crypto-com-chain',
  FTM: 'fantom',
  RUNE: 'thorchain',
  EGLD: 'elrond-erd-2',
  KSM: 'kusama',
  COMP: 'compound-governance-token',
  MKR: 'maker',
  SNX: 'havven',
  YFI: 'yearn-finance',
  BAT: 'basic-attention-token',
  ZEC: 'zcash',
  DASH: 'dash',
  ENJ: 'enjincoin',
  CHZ: 'chiliz',
  BTT: 'bittorrent',
  ZIL: 'zilliqa',
  ONE: 'harmony',
  IOTA: 'iota',
}

interface PriceCacheEntry {
  price: number
  expiresAt: number
}

const priceCache = new Map<string, PriceCacheEntry>()

function getCached(id: string): number | null {
  const hit = priceCache.get(id)
  if (!hit) return null
  if (Date.now() >= hit.expiresAt) {
    priceCache.delete(id)
    return null
  }
  return hit.price
}

function setCached(id: string, price: number): void {
  priceCache.set(id, { price, expiresAt: Date.now() + CACHE_TTL_MS })
}

interface SimplePriceResponse {
  [id: string]: { eur?: number }
}

/**
 * Returns EUR price for one or more CoinGecko ids. Hits cache first; otherwise
 * issues one request per call (the API supports comma-separated ids so a
 * single fetch can resolve every miss at once).
 */
export async function fetchEurPrices(ids: string[]): Promise<Record<string, number | null>> {
  const result: Record<string, number | null> = {}
  const misses: string[] = []

  for (const id of ids) {
    const cached = getCached(id)
    if (cached != null) {
      result[id] = cached
    } else {
      misses.push(id)
    }
  }

  if (misses.length === 0) return result

  const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(misses.join(','))}&vs_currencies=eur`
  const headers: Record<string, string> = { Accept: 'application/json' }
  const apiKey = process.env.COINGECKO_API_KEY?.trim()
  if (apiKey) headers['x-cg-demo-api-key'] = apiKey

  try {
    const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' })
    if (!res.ok) {
      for (const id of misses) result[id] = null
      return result
    }
    const body = (await res.json()) as SimplePriceResponse
    for (const id of misses) {
      const price = body[id]?.eur
      if (typeof price === 'number' && Number.isFinite(price)) {
        setCached(id, price)
        result[id] = price
      } else {
        result[id] = null
      }
    }
  } catch {
    for (const id of misses) result[id] = null
  }

  return result
}

// ── Market chart history ────────────────────────────────────────────────
//
// CoinGecko `market_chart` endpoint geeft prijs-historie als reeks van
// `[unixMs, priceEur]` paren. Wij normaliseren naar dag-buckets (laatste
// observatie per dag) zodat de output direct kan dienen als benchmark-overlay
// op een dagelijks-geaggregeerde portfolio-chart.
//
//   GET /api/v3/coins/{id}/market_chart?vs_currency=eur&days=90
//   → { prices: [[1717200000000, 53210.12], …], market_caps: …, total_volumes: … }
//
// In-memory cache met 1 uur TTL — voor benchmark-overlay is een uurlijkse
// refresh ruim genoeg (de chart zelf is dagelijks gebucketeerd) en blijven
// we comfortabel binnen de free-tier quota van CoinGecko.

interface MarketChartCacheEntry {
  series: { date: string; close: number }[]
  expiresAt: number
}

const MARKET_CHART_TTL_MS = 60 * 60 * 1000 // 1 uur
const marketChartCache = new Map<string, MarketChartCacheEntry>()

function marketChartCacheKey(id: string, days: number): string {
  return `${id}:${days}`
}

interface MarketChartResponse {
  prices?: Array<[number, number]>
}

/**
 * Haal dagelijkse close-prijzen op voor één CoinGecko-id over de afgelopen
 * `days` dagen. Output is gesorteerd op datum (oud → nieuw) met één rij per
 * kalenderdag (laatst geobserveerde prijs binnen die dag).
 *
 * Returns een lege array bij netwerkfouten of onbekende id — caller toont in
 * dat geval een fallback (geen benchmark-lijn) zonder de hele chart te breken.
 */
export async function fetchMarketChartEur(
  coingeckoId: string,
  days: number,
): Promise<{ date: string; close: number }[]> {
  const safeDays = Math.max(1, Math.min(365, Math.round(days)))
  const cacheKey = marketChartCacheKey(coingeckoId, safeDays)
  const cached = marketChartCache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return cached.series
  }

  // `interval=daily` levert één punt per dag; voor <90 dagen valt CoinGecko
  // anders terug op uur-granulariteit, wat we hier niet willen.
  const url = `${COINGECKO_BASE}/coins/${encodeURIComponent(coingeckoId)}/market_chart?vs_currency=eur&days=${safeDays}&interval=daily`
  const headers: Record<string, string> = { Accept: 'application/json' }
  const apiKey = process.env.COINGECKO_API_KEY?.trim()
  if (apiKey) headers['x-cg-demo-api-key'] = apiKey

  try {
    const res = await fetch(url, { method: 'GET', headers, cache: 'no-store' })
    if (!res.ok) return []
    const body = (await res.json()) as MarketChartResponse
    const raw = body.prices ?? []
    if (raw.length === 0) return []
    // Bucket per kalenderdag (UTC) en behoud de laatste prijs per dag —
    // dat sluit aan bij hoe `crypto_holding_prices.close_price` wordt
    // geadministreerd (één rij per dag).
    const byDate = new Map<string, number>()
    for (const [ts, price] of raw) {
      if (!Number.isFinite(price)) continue
      const date = new Date(ts).toISOString().slice(0, 10)
      byDate.set(date, price)
    }
    const series = Array.from(byDate.entries())
      .map(([date, close]) => ({ date, close }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    marketChartCache.set(cacheKey, {
      series,
      expiresAt: Date.now() + MARKET_CHART_TTL_MS,
    })
    return series
  } catch {
    return []
  }
}

export async function fetchEurPriceForChain(chain: WalletChain): Promise<number | null> {
  const id = CHAIN_TO_COINGECKO_ID[chain]
  if (!id) return null
  const map = await fetchEurPrices([id])
  return map[id] ?? null
}

/**
 * Resolve a list of crypto symbols (e.g. `["ADA", "BNB", "AVAX"]`) to their
 * EUR spot prices via CoinGecko. Symbols without a known mapping are silently
 * dropped. Result is keyed by the original uppercase symbol so callers can
 * line it up with their inputs without re-applying the symbol→id map.
 *
 * Batched in groups of 50 ids per request to stay well under the simple/price
 * URL-length limit. Hits the shared 5-minute in-memory cache used by the
 * wallet sync path.
 */
export async function fetchCoinPricesEurBatch(
  symbols: string[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  if (!symbols.length) return out

  const idToSymbol = new Map<string, string>()
  for (const raw of symbols) {
    const sym = raw.trim().toUpperCase()
    if (!sym) continue
    const id = SYMBOL_TO_COINGECKO_ID[sym]
    if (id) idToSymbol.set(id, sym)
  }

  const ids = Array.from(idToSymbol.keys())
  if (!ids.length) return out

  const BATCH_SIZE = 50
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const slice = ids.slice(i, i + BATCH_SIZE)
    const priceMap = await fetchEurPrices(slice)
    for (const id of slice) {
      const price = priceMap[id]
      const sym = idToSymbol.get(id)
      if (sym && typeof price === 'number' && Number.isFinite(price)) {
        out[sym] = price
      }
    }
  }

  return out
}
