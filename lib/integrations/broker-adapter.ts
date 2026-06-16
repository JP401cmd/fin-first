// Common adapter contract for read-only stock-broker integrations.
//
// Mirrors `exchange-adapter.ts` (the crypto-exchange contract) one-to-one so
// the API routes and the cron job can stay broker-agnostic and loop over the
// appropriate adapter via `getBrokerAdapter(name)`. Where the exchange side
// returns crypto *balances* (symbol + amount), the broker side returns equity
// *positions* (ticker + units), but the shape, registry and error-classifier
// pattern are deliberately identical.
//
// All methods are pure with respect to user state — they do not touch the
// database. Persistence + encryption + audit logging happens in the route
// layer (see field-encryption + the connections routes), never here.

// The validation result type is shared with the exchange adapter so the UI's
// stale-key badge / error branching works identically for brokers and
// exchanges. Re-exported here so broker code can import everything from one
// module without reaching into the crypto namespace.
export type { ValidationResult } from './exchange-adapter'
import type { ValidationResult } from './exchange-adapter'

export type BrokerId = 'trading212'

export interface BrokerPosition {
  /** Broker instrument identifier as returned by the API (e.g. "AAPL_US_EQ"). */
  ticker: string
  /** Human-readable instrument name, when the broker exposes it. */
  name?: string
  /** ISIN, when the broker exposes instrument metadata. */
  isin?: string
  /** Instrument trading currency (ISO 4217, e.g. "USD"), when available. */
  currency?: string
  /** Number of shares/units held. */
  units: number
  /** Average price paid per unit, in the instrument currency, when available. */
  averagePrice?: number
  /** Current market price per unit, in the instrument currency, when available. */
  currentPrice?: number
}

export interface BrokerAdapter {
  name: BrokerId
  /**
   * Performs a single low-cost authenticated call (e.g. GET account info) to
   * verify the credentials work and have at least read permission. MUST NOT
   * mutate any state at the broker (no orders, no withdrawals).
   *
   * `apiSecret` is optional: Trading 212's legacy v0 keys authenticate with a
   * single key in the `Authorization` header, so the second argument is unused
   * there. It is kept in the signature to mirror the exchange contract and to
   * leave room for brokers that issue a key+secret pair.
   */
  validateCredentials(apiKey: string, apiSecret?: string): Promise<ValidationResult>
  /** Returns all open positions on the account. */
  fetchPositions(apiKey: string, apiSecret?: string): Promise<BrokerPosition[]>
}

// ── Registry ──────────────────────────────────────────────────────────────

import { trading212Adapter } from './trading212-client'

const ADAPTERS: Record<BrokerId, BrokerAdapter | null> = {
  trading212: trading212Adapter,
}

export function getBrokerAdapter(id: BrokerId): BrokerAdapter {
  const adapter = ADAPTERS[id]
  if (!adapter) {
    throw new Error(`Broker "${id}" is nog niet ondersteund.`)
  }
  return adapter
}

/**
 * Maps low-level error strings (HTTP body, network exception messages) onto
 * the stable code/message used by the UI to render the stale-key badge. Kept
 * here so every broker adapter routes through the same classification — the
 * twin of `classifyExchangeError`.
 */
export function classifyBrokerError(raw: unknown): { code: ValidationResult['code']; message: string } {
  const text = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : 'Onbekende fout'
  const lower = text.toLowerCase()
  if (lower.includes('401') || lower.includes('invalid api key') || lower.includes('apikey') || lower.includes('unauthorized') || lower.includes('invalid token') || lower.includes('jwt')) {
    return { code: 'invalid_credentials', message: 'Key ongeldig — opnieuw koppelen' }
  }
  if (lower.includes('403') || lower.includes('permission') || lower.includes('forbidden') || lower.includes('scope') || lower.includes('insufficient permissions')) {
    return { code: 'permission_denied', message: 'API-key mist leesrechten' }
  }
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('too many requests')) {
    return { code: 'rate_limited', message: 'Broker limiteert tijdelijk — probeer later' }
  }
  if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('etimedout') || lower.includes('enotfound')) {
    return { code: 'network', message: 'Netwerkfout — broker niet bereikbaar' }
  }
  return { code: 'unknown', message: text.slice(0, 200) }
}
