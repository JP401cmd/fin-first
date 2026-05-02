// Financial Modeling Prep (FMP) ISIN-resolver client.
//
// Looks up an ISIN and returns ticker + company name + currency. Used by the
// holdings add/edit form so users can paste an ISIN and have the rest of the
// fields auto-filled.
//
// Endpoints (verified May 2026):
//   - Primary: GET https://financialmodelingprep.com/stable/search-isin?isin=...&apikey=...
//             (modern stable endpoint, returns array with symbol/name/currency)
//   - Fallback: GET https://financialmodelingprep.com/api/v3/search?query={isin}&apikey=...
//             (legacy v3 search, accepts ISIN as free-text query)
//
// Privacy: the FMP API key is read from process.env.FMP_API_KEY and NEVER
// surfaced to the client. All callers MUST go through the server-side
// proxy at /api/integrations/market-data/isin-lookup.
//
// Quotas: free tier = 250 calls/day. We track a simple module-level counter
// that resets at UTC midnight, plus a 24-hour in-memory cache keyed by ISIN.

import { setTimeout as wait } from 'timers/promises'

// ── Types ──────────────────────────────────────────────────────────────

export interface IsinLookupResult {
  ticker: string
  name: string
  currency: string
  exchange?: string
}

export interface IsinLookupOptions {
  /** Force a network call even when the value is in cache (used by tests). */
  bypassCache?: boolean
}

export interface FmpQuotaStatus {
  callsToday: number
  dailyLimit: number
  resetAt: string
  configured: boolean
}

export class FmpQuotaExhaustedError extends Error {
  constructor(message = 'FMP daily quota exhausted') {
    super(message)
    this.name = 'FmpQuotaExhaustedError'
  }
}

export class FmpNotConfiguredError extends Error {
  constructor(message = 'FMP_API_KEY environment variable is not set') {
    super(message)
    this.name = 'FmpNotConfiguredError'
  }
}

// ── Constants ──────────────────────────────────────────────────────────

const FMP_DAILY_LIMIT = 250
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 8_000
const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/

// ── In-memory cache ────────────────────────────────────────────────────

interface CacheEntry {
  result: IsinLookupResult | null
  expiresAt: number
}

const isinCache = new Map<string, CacheEntry>()

function getCached(isin: string): { hit: true; value: IsinLookupResult | null } | { hit: false } {
  const entry = isinCache.get(isin)
  if (!entry) return { hit: false }
  if (Date.now() >= entry.expiresAt) {
    isinCache.delete(isin)
    return { hit: false }
  }
  return { hit: true, value: entry.result }
}

function setCached(isin: string, result: IsinLookupResult | null): void {
  isinCache.set(isin, { result, expiresAt: Date.now() + CACHE_TTL_MS })
  // Trim expired entries when the cache grows large.
  if (isinCache.size > 500) {
    const now = Date.now()
    for (const [k, v] of isinCache.entries()) {
      if (now >= v.expiresAt) isinCache.delete(k)
    }
  }
}

// ── Daily call counter ─────────────────────────────────────────────────

interface DailyCounter {
  utcDayKey: string
  count: number
}

let dailyCounter: DailyCounter = { utcDayKey: utcDayKey(new Date()), count: 0 }

function utcDayKey(date: Date): string {
  // YYYY-MM-DD in UTC — used to detect midnight rollover.
  return date.toISOString().slice(0, 10)
}

function rolloverIfNeeded(): void {
  const today = utcDayKey(new Date())
  if (today !== dailyCounter.utcDayKey) {
    dailyCounter = { utcDayKey: today, count: 0 }
  }
}

function incrementCounter(): void {
  rolloverIfNeeded()
  dailyCounter.count += 1
}

function nextUtcMidnightIso(): string {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0))
  return next.toISOString()
}

export function getFmpQuotaStatus(): FmpQuotaStatus {
  rolloverIfNeeded()
  return {
    callsToday: dailyCounter.count,
    dailyLimit: FMP_DAILY_LIMIT,
    resetAt: nextUtcMidnightIso(),
    configured: Boolean(process.env.FMP_API_KEY),
  }
}

// ── Validation ─────────────────────────────────────────────────────────

export function normalizeIsin(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '')
}

export function isValidIsinShape(isin: string): boolean {
  return ISIN_REGEX.test(isin)
}

// ── Fetch helpers ──────────────────────────────────────────────────────

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// FMP /stable/search-isin returns: [{ symbol, name, currency, exchangeFullName?, exchange? }]
interface FmpStableHit {
  symbol?: string
  name?: string
  currency?: string
  exchange?: string
  exchangeFullName?: string
  exchangeShortName?: string
}

// FMP legacy /api/v3/search returns: [{ symbol, name, currency, stockExchange, exchangeShortName }]
interface FmpLegacyHit {
  symbol?: string
  name?: string
  currency?: string
  stockExchange?: string
  exchangeShortName?: string
}

function mapStableHit(hit: FmpStableHit): IsinLookupResult | null {
  const ticker = (hit.symbol ?? '').trim()
  const name = (hit.name ?? '').trim()
  const currency = (hit.currency ?? '').trim().toUpperCase()
  if (!ticker || !name || !currency) return null
  const exchange = (hit.exchangeShortName ?? hit.exchange ?? hit.exchangeFullName ?? '').trim() || undefined
  return { ticker, name, currency, exchange }
}

function mapLegacyHit(hit: FmpLegacyHit): IsinLookupResult | null {
  const ticker = (hit.symbol ?? '').trim()
  const name = (hit.name ?? '').trim()
  const currency = (hit.currency ?? '').trim().toUpperCase()
  if (!ticker || !name || !currency) return null
  const exchange = (hit.exchangeShortName ?? hit.stockExchange ?? '').trim() || undefined
  return { ticker, name, currency, exchange }
}

// ── Public lookup ──────────────────────────────────────────────────────

/**
 * Resolve an ISIN to ticker/name/currency via FMP.
 *
 * Returns `null` when the ISIN is not found upstream (callers should treat
 * this as a 404 — not as an error).
 *
 * Throws `FmpNotConfiguredError` when FMP_API_KEY is missing, and
 * `FmpQuotaExhaustedError` when today's daily limit is reached.
 */
export async function lookupIsin(
  rawIsin: string,
  options: IsinLookupOptions = {},
): Promise<IsinLookupResult | null> {
  const apiKey = process.env.FMP_API_KEY
  if (!apiKey) throw new FmpNotConfiguredError()

  const isin = normalizeIsin(rawIsin)
  if (!isValidIsinShape(isin)) return null

  if (!options.bypassCache) {
    const cached = getCached(isin)
    if (cached.hit) return cached.value
  }

  rolloverIfNeeded()
  if (dailyCounter.count >= FMP_DAILY_LIMIT) {
    throw new FmpQuotaExhaustedError()
  }

  // Try the modern stable endpoint first.
  incrementCounter()
  const stableUrl = `https://financialmodelingprep.com/stable/search-isin?isin=${encodeURIComponent(isin)}&apikey=${encodeURIComponent(apiKey)}`
  const stableJson = await fetchJson<FmpStableHit[]>(stableUrl)
  if (Array.isArray(stableJson) && stableJson.length > 0) {
    for (const hit of stableJson) {
      const mapped = mapStableHit(hit)
      if (mapped) {
        setCached(isin, mapped)
        return mapped
      }
    }
  }

  // Fallback: legacy /api/v3/search accepts ISIN as a free-text query.
  // Small jitter so we don't hammer the API in case both endpoints share quota.
  await wait(50)
  if (dailyCounter.count >= FMP_DAILY_LIMIT) {
    throw new FmpQuotaExhaustedError()
  }
  incrementCounter()
  const legacyUrl = `https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(isin)}&limit=1&apikey=${encodeURIComponent(apiKey)}`
  const legacyJson = await fetchJson<FmpLegacyHit[]>(legacyUrl)
  if (Array.isArray(legacyJson) && legacyJson.length > 0) {
    for (const hit of legacyJson) {
      const mapped = mapLegacyHit(hit)
      if (mapped) {
        setCached(isin, mapped)
        return mapped
      }
    }
  }

  // Negative result — cache so we don't burn quota on the same miss.
  setCached(isin, null)
  return null
}

// ── Test helpers ───────────────────────────────────────────────────────

export function __resetFmpClientForTests(): void {
  isinCache.clear()
  dailyCounter = { utcDayKey: utcDayKey(new Date()), count: 0 }
}
