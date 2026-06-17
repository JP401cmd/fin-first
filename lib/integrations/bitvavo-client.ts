// Bitvavo read-only client.
//
// Implements the HMAC-SHA256 signing scheme documented at
// https://docs.bitvavo.com/#section/Authentication. We only ever call
// non-mutating endpoints (GET /v2/balance, GET /v2/assets, GET /v2/time) — no
// order placement, no withdrawal calls.
//
// Wire format of the signature payload (per Bitvavo docs):
//   timestamp + method + "/v2" + path + (body || "")
//
// Headers:
//   Bitvavo-Access-Key       — the public API key
//   Bitvavo-Access-Signature — hex-encoded HMAC-SHA256(secret, payload)
//   Bitvavo-Access-Timestamp — current unix epoch in ms (must be within 60s)
//   Bitvavo-Access-Window    — request-window in ms (default 10000)

import { createHmac } from 'crypto'
import { z } from 'zod'
import type { ExchangeAdapter, ExchangeBalance, ValidationResult } from './exchange-adapter'
import { classifyExchangeError } from './exchange-adapter'
import { recordContractEvent } from '../contract-events'
import { getServiceClient } from '../supabase/service'
import { fingerprintKeys } from '../parsers/shared'

const BITVAVO_BASE = 'https://api.bitvavo.com/v2'
const REQUEST_WINDOW_MS = 10_000

interface BitvavoBalanceRow {
  symbol: string
  available: string
  inOrder: string
}

const BitvavoBalanceRowSchema = z.object({
  symbol: z.string(),
  available: z.string(),
  inOrder: z.string(),
})

interface BitvavoTradeRow {
  id: string
  orderId?: string
  timestamp: number
  market: string
  side: 'buy' | 'sell'
  amount: string
  price: string
  fee: string
  feeCurrency: string
}

const BitvavoTradeRowSchema = z.object({
  id: z.string(),
  orderId: z.string().optional(),
  timestamp: z.number(),
  market: z.string(),
  side: z.enum(['buy', 'sell']),
  amount: z.string(),
  price: z.string(),
  fee: z.string(),
  feeCurrency: z.string(),
})

export interface BitvavoTrade {
  id: string
  market: string
  side: 'buy' | 'sell'
  amount: number
  price: number
  fee: number
  feeCurrency: string
  timestamp: number
}

interface BitvavoErrorBody {
  errorCode?: number
  error?: string
}

function signRequest(
  apiSecret: string,
  timestamp: number,
  method: string,
  path: string,
  body: string,
): string {
  // Path on the wire is `/v2/...`; our `path` param is everything after `/v2`.
  const payload = `${timestamp}${method.toUpperCase()}/v2${path}${body}`
  return createHmac('sha256', apiSecret).update(payload, 'utf8').digest('hex')
}

async function bitvavoGet<T>(
  path: string,
  apiKey: string,
  apiSecret: string,
): Promise<T> {
  const timestamp = Date.now()
  const signature = signRequest(apiSecret, timestamp, 'GET', path, '')

  const res = await fetch(`${BITVAVO_BASE}${path}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      'Bitvavo-Access-Key': apiKey,
      'Bitvavo-Access-Signature': signature,
      'Bitvavo-Access-Timestamp': String(timestamp),
      'Bitvavo-Access-Window': String(REQUEST_WINDOW_MS),
    },
  })

  if (!res.ok) {
    let body: BitvavoErrorBody | null = null
    try {
      body = (await res.json()) as BitvavoErrorBody
    } catch {
      // body not JSON — fall through
    }
    const detail = body?.error ?? `${res.status} ${res.statusText}`
    throw new Error(`Bitvavo ${res.status}: ${detail}`)
  }

  return (await res.json()) as T
}

// ── Markets (which trading pairs exist on Bitvavo) ─────────────────────

interface BitvavoMarketRow {
  market: string
  status: string // 'trading' | 'halted' | 'auction' | …
  base: string
  quote: string
}

const BitvavoMarketRowSchema = z.object({
  market: z.string(),
  status: z.string(),
  base: z.string(),
  quote: z.string(),
})

// ── Contract-canary helpers ────────────────────────────────────────────────

/**
 * Fire-and-forget contract-violation event.
 * Wrapped in try/catch — logging must NEVER break the sync.
 * Only key NAMES + hash reach the event store (no amounts, no values).
 *
 * Gebruikt de gedeelde SHA-256 fingerprintKeys uit lib/parsers/shared.ts
 * (vervangt de voormalige lokale DJB2-implementatie).
 */
async function emitContractViolation(
  surface: string,
  observedKeys: string[],
  knownKeys: string[],
  error: z.ZodError,
): Promise<void> {
  try {
    const sortedNames = [...observedKeys].sort()
    const fingerprint = await fingerprintKeys(observedKeys)
    const knownSet = new Set(knownKeys.map(k => k.toLowerCase()))
    const added = sortedNames.filter(k => !knownSet.has(k.toLowerCase()))
    const removed = knownKeys.filter(k => !sortedNames.map(s => s.toLowerCase()).includes(k))
    const service = getServiceClient()
    await recordContractEvent(service, {
      kind: 'contract_violation',
      surface,
      severity: 'warn',
      fingerprint,
      diff: {
        changed: error.issues.map((i: z.ZodIssue) => i.path.join('.')),
        added,
        removed,
      },
    })
  } catch {
    // Logging must never break the sync.
  }
}

/**
 * Lijst van actieve markten op Bitvavo. Publieke endpoint — geen auth nodig.
 *
 * Wordt gebruikt voor de trades-import zodat we alleen markten queriën die
 * daadwerkelijk bestaan; obscure tokens uit het account-saldo (bv. delisted
 * coins, airdrops zonder EUR-pair) zouden anders een 400/404 geven die de
 * sync stilzwijgend zou laten falen.
 */
export async function fetchAvailableMarkets(): Promise<Set<string>> {
  const res = await fetch(`${BITVAVO_BASE}/markets`, {
    method: 'GET',
    cache: 'no-store',
    // Markets-endpoint vereist geen auth; we sturen ook geen
    // Bitvavo-Access-* headers zodat een ongeldige API-key dit pad niet kan
    // breken.
  })

  if (!res.ok) {
    throw new Error(`Bitvavo markets fetch ${res.status}: ${res.statusText}`)
  }

  const rows = (await res.json()) as BitvavoMarketRow[]

  // Zod response-canary — detect API drift without ever breaking the sync.
  const parsed = z.array(BitvavoMarketRowSchema).safeParse(rows)
  if (!parsed.success) {
    const observedKeys = Object.keys(Array.isArray(rows) && rows[0] ? rows[0] as unknown as Record<string, unknown> : {})
    void emitContractViolation('bitvavo-markets', observedKeys, ['market', 'status', 'base', 'quote'], parsed.error)
    // Fall through with permissive cast — the sync must continue.
  }

  const safeRows = parsed.success ? parsed.data : (rows as BitvavoMarketRow[])
  const active = new Set<string>()
  for (const r of safeRows) {
    if (typeof r.market !== 'string') continue
    // Trade history werkt alleen voor markten die actief verhandelbaar zijn.
    // Andere statussen ('halted', 'auction', …) overslaan we — daar krijgen
    // we toch geen trade-historie van terug.
    if (r.status === 'trading') active.add(r.market.toUpperCase())
  }
  return active
}

// ── Trade history (for transaction-log import) ──────────────────────────

// Bitvavo's /v2/trades endpoint returns at most `limit` rows (default 500,
// max 1000) ordered newest-first. To page through history beyond that we
// pass `tradeIdTo=<oldest seen id>` on each subsequent call until a page
// comes back with fewer rows than the limit. The `start` filter is honoured
// server-side so re-syncs only fetch trades newer than the last persisted
// timestamp.
export async function fetchTrades(
  apiKey: string,
  apiSecret: string,
  market: string,
  options?: { since?: number; limit?: number },
): Promise<BitvavoTrade[]> {
  const limit = Math.min(Math.max(options?.limit ?? 500, 1), 1000)
  const since = options?.since ?? 0

  const collected: BitvavoTrade[] = []
  let cursor: string | null = null
  // Hard cap on pages so a runaway response can never trap the sync. 50 pages
  // × 500 rows = 25 000 trades per market — well above any realistic history.
  const MAX_PAGES = 50

  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ market, limit: String(limit) })
    if (since > 0) qs.set('start', String(since))
    if (cursor) qs.set('tradeIdTo', cursor)

    const rows = await bitvavoGet<BitvavoTradeRow[]>(`/trades?${qs.toString()}`, apiKey, apiSecret)
    if (!Array.isArray(rows) || rows.length === 0) break

    // Zod response-canary — detect API drift without ever breaking the sync.
    const parsedTrades = z.array(BitvavoTradeRowSchema).safeParse(rows)
    if (!parsedTrades.success) {
      const observedKeys = Object.keys(rows[0] ? rows[0] as unknown as Record<string, unknown> : {})
      void emitContractViolation('bitvavo-trades', observedKeys, ['id', 'orderid', 'timestamp', 'market', 'side', 'amount', 'price', 'fee', 'feecurrency'], parsedTrades.error)
      // Fall through with permissive cast — the sync must continue.
    }
    const safeRows = parsedTrades.success ? parsedTrades.data : (rows as BitvavoTradeRow[])

    for (const r of safeRows) {
      collected.push({
        id: String(r.id),
        market: String(r.market),
        side: r.side === 'sell' ? 'sell' : 'buy',
        amount: Number(r.amount) || 0,
        price: Number(r.price) || 0,
        fee: Number(r.fee) || 0,
        feeCurrency: String(r.feeCurrency ?? ''),
        timestamp: Number(r.timestamp) || 0,
      })
    }

    if (rows.length < limit) break
    cursor = String(rows[rows.length - 1].id)
  }

  return collected
}

// ── Adapter implementation ───────────────────────────────────────────────

export const bitvavoAdapter: ExchangeAdapter = {
  name: 'bitvavo',

  async validateCredentials(apiKey, apiSecret): Promise<ValidationResult> {
    try {
      // /v2/balance is the cheapest authenticated read endpoint and proves
      // both that signing works and that the key has at least "View" rights.
      await bitvavoGet<BitvavoBalanceRow[]>('/balance', apiKey, apiSecret)
      return { ok: true }
    } catch (err) {
      const { code, message } = classifyExchangeError(err)
      return { ok: false, code, error: message }
    }
  },

  async fetchBalances(apiKey, apiSecret): Promise<ExchangeBalance[]> {
    const rows = await bitvavoGet<BitvavoBalanceRow[]>('/balance', apiKey, apiSecret)

    // Zod response-canary — detect API drift without ever breaking the sync.
    const parsed = z.array(BitvavoBalanceRowSchema).safeParse(rows)
    if (!parsed.success) {
      const observedKeys = Object.keys(Array.isArray(rows) && rows[0] ? rows[0] as unknown as Record<string, unknown> : {})
      void emitContractViolation('bitvavo-balance', observedKeys, ['symbol', 'available', 'inorder'], parsed.error)
      // Fall through with permissive cast — the sync must continue.
    }

    const safeRows = parsed.success ? parsed.data : (rows as BitvavoBalanceRow[])
    return safeRows
      .map((r) => ({
        symbol: String(r.symbol).toUpperCase(),
        available: Number(r.available) || 0,
        inOrder: Number(r.inOrder) || 0,
      }))
      .filter((b) => b.available > 0 || b.inOrder > 0)
  },
}
