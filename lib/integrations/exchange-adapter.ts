// Common adapter contract for read-only crypto exchange integrations.
//
// Every exchange-specific client (Bitvavo, Kraken, Coinbase, …) implements this
// interface so the API routes and the cron job can stay exchange-agnostic and
// loop over the appropriate adapter via `getExchangeAdapter(name)`.
//
// All methods are pure with respect to user state — they do not touch the
// database. Persistence + audit logging happens in the route layer.

export type ExchangeId = 'bitvavo' | 'kraken' | 'coinbase'

export interface ExchangeBalance {
  /** Uppercase symbol as the exchange returns it (e.g. "BTC", "ETH", "EUR"). */
  symbol: string
  /** Available (free) balance. */
  available: number
  /** Balance currently locked in open orders. */
  inOrder: number
}

export interface ValidationResult {
  ok: boolean
  /** Human-readable error in NL, suitable for surfacing in UI. */
  error?: string
  /** Stable error code for branching (e.g. "invalid_credentials", "network"). */
  code?: 'invalid_credentials' | 'permission_denied' | 'network' | 'rate_limited' | 'unknown'
}

export interface ExchangeAdapter {
  name: ExchangeId
  /**
   * Performs a single low-cost authenticated call (e.g. GET /v2/balance) to
   * verify the credentials work and have at least read permission. MUST NOT
   * mutate any state on the exchange.
   */
  validateCredentials(apiKey: string, apiSecret: string): Promise<ValidationResult>
  /** Returns all non-zero balances on the account. */
  fetchBalances(apiKey: string, apiSecret: string): Promise<ExchangeBalance[]>
}

// ── Registry ──────────────────────────────────────────────────────────────

import { bitvavoAdapter } from './bitvavo-client'
import { krakenAdapter } from './kraken-client'
import { coinbaseAdapter } from './coinbase-client'

const ADAPTERS: Record<ExchangeId, ExchangeAdapter | null> = {
  bitvavo: bitvavoAdapter,
  kraken: krakenAdapter,
  coinbase: coinbaseAdapter,
}

export function getExchangeAdapter(id: ExchangeId): ExchangeAdapter {
  const adapter = ADAPTERS[id]
  if (!adapter) {
    throw new Error(`Exchange "${id}" is nog niet ondersteund.`)
  }
  return adapter
}

/**
 * Maps low-level error strings (HTTP body, network exception messages) onto
 * the stable code/message used by the UI to render the stale-key badge. Kept
 * here so every adapter routes through the same classification.
 */
export function classifyExchangeError(raw: unknown): { code: ValidationResult['code']; message: string } {
  const text = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : 'Onbekende fout'
  const lower = text.toLowerCase()
  // Kraken error strings start with `EAPI:`, `EGeneral:`, `EService:` etc.
  // Match them before the generic checks so we surface a precise code.
  if (lower.includes('eapi:invalid key') || lower.includes('eapi:invalid signature') || lower.includes('eapi:invalid nonce')) {
    return { code: 'invalid_credentials', message: 'Key ongeldig — opnieuw koppelen' }
  }
  if (lower.includes('eapi:permission denied') || lower.includes('egeneral:permission denied')) {
    return { code: 'permission_denied', message: 'API-key mist leesrechten' }
  }
  if (lower.includes('eapi:rate limit') || lower.includes('egeneral:too many requests')) {
    return { code: 'rate_limited', message: 'Exchange limiteert tijdelijk — probeer later' }
  }
  if (lower.includes('401') || lower.includes('invalid api key') || lower.includes('apikey') || lower.includes('signature') || lower.includes('unauthorized') || lower.includes('invalid token') || lower.includes('jwt')) {
    return { code: 'invalid_credentials', message: 'Key ongeldig — opnieuw koppelen' }
  }
  if (lower.includes('403') || lower.includes('permission') || lower.includes('forbidden') || lower.includes('insufficient permissions')) {
    return { code: 'permission_denied', message: 'API-key mist leesrechten' }
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return { code: 'rate_limited', message: 'Exchange limiteert tijdelijk — probeer later' }
  }
  if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('etimedout') || lower.includes('enotfound')) {
    return { code: 'network', message: 'Netwerkfout — exchange niet bereikbaar' }
  }
  return { code: 'unknown', message: text.slice(0, 200) }
}
