// Trading 212 read-only client.
//
// Implements the public Trading 212 *legacy v0* REST API documented at
// https://t212public-api-docs.redoc.ly/ (OpenAPI: bennycode/trading212-api
// `swagger.json`). We only ever call non-mutating GET endpoints — no order
// placement, no withdrawals, no pie mutations.
//
// Authentication (legacy v0):
//   Header `Authorization: <apiKey>` — the raw API key, NO "Bearer"/"Basic"
//   prefix. The OpenAPI security scheme is `apiKey` in header `Authorization`.
//   Legacy keys are a single value (no secret); `apiSecret` is therefore
//   accepted but unused, present only to satisfy the BrokerAdapter contract.
//
//   NOTE: Trading 212 has since introduced a newer key flavour (API key +
//   secret) that authenticates with HTTP Basic over `/api/v0/equity/positions`
//   and a nested `instrument` object. This client targets the legacy v0
//   contract (`/api/v0/equity/portfolio`, flat `ticker`/`ppl` fields) on
//   purpose; swapping generations is a future adapter, not a branch here.
//
// Base URL:
//   Live : https://live.trading212.com   (real-money account)
//   Demo : https://demo.trading212.com   (paper account)
//   We target Live; the practice host is recorded for completeness.
//
// Endpoints used:
//   GET /api/v0/equity/account/info  — cheapest authenticated read; used to
//                                       validate the key. (Limited: 1 / 30s)
//   GET /api/v0/equity/portfolio     — all open positions. (Limited: 1 / 5s)
//   GET /api/v0/equity/metadata/instruments
//                                    — instrument metadata (isin/name/currency)
//                                       keyed by ticker. (Limited: 1 / 50s)
//
// Rate limits are per-endpoint and tight; the sync layer calls each at most
// once per run, so we do not implement client-side throttling here.

import type { BrokerAdapter, BrokerPosition, ValidationResult } from './broker-adapter'
import { classifyBrokerError } from './broker-adapter'

const TRADING212_BASE = 'https://live.trading212.com'
const ACCOUNT_INFO_PATH = '/api/v0/equity/account/info'
const PORTFOLIO_PATH = '/api/v0/equity/portfolio'
const INSTRUMENTS_PATH = '/api/v0/equity/metadata/instruments'

// ── API response shapes (legacy v0) ────────────────────────────────────────

interface T212AccountInfo {
  id: number
  currencyCode: string
}

interface T212Position {
  ticker: string
  quantity: number
  averagePrice: number
  currentPrice: number
  ppl: number
  fxPpl?: number | null
  initialFillDate?: string
  maxBuy?: number
  maxSell?: number
  pieQuantity?: number
  frontend?: string
}

interface T212Instrument {
  ticker: string
  type: string
  isin?: string
  currencyCode?: string
  name?: string
  shortName?: string
}

async function t212Get<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${TRADING212_BASE}${path}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      // Legacy v0: the raw key is the full Authorization value — no prefix.
      Authorization: apiKey,
      'User-Agent': 'TriFinity/1.0',
    },
  })

  if (!res.ok) {
    // Trading 212 error bodies are small JSON like `{ "code": "...", ... }`
    // when present; fall back to the status line otherwise. We surface the
    // status code in the message so classifyBrokerError can map it.
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { code?: string; message?: string } | null
      const extra = body?.message ?? body?.code
      if (extra) detail = `${res.status} ${extra}`
    } catch {
      // non-JSON body — keep the status line
    }
    throw new Error(`Trading 212 ${detail}`)
  }

  return (await res.json()) as T
}

// ── Instrument metadata (ticker → isin/name/currency) ──────────────────────

/**
 * Builds a lookup from ticker to its instrument metadata so positions can be
 * enriched with `isin`/`name`/`currency`. The portfolio endpoint only returns
 * a `ticker`, so this is the only way to surface an ISIN. The call is
 * best-effort: if it fails (e.g. its tight 1/50s rate limit was just hit) the
 * caller falls back to ticker-only positions rather than failing the sync.
 */
async function fetchInstrumentMap(apiKey: string): Promise<Map<string, T212Instrument>> {
  const rows = await t212Get<T212Instrument[]>(INSTRUMENTS_PATH, apiKey)
  const map = new Map<string, T212Instrument>()
  if (!Array.isArray(rows)) return map
  for (const row of rows) {
    if (row && typeof row.ticker === 'string') map.set(row.ticker, row)
  }
  return map
}

// ── Adapter implementation ─────────────────────────────────────────────────

export const trading212Adapter: BrokerAdapter = {
  name: 'trading212',

  async validateCredentials(apiKey): Promise<ValidationResult> {
    try {
      // account/info is the cheapest authenticated read and proves both that
      // the key is valid and that it carries at least account read rights.
      await t212Get<T212AccountInfo>(ACCOUNT_INFO_PATH, apiKey)
      return { ok: true }
    } catch (err) {
      const { code, message } = classifyBrokerError(err)
      return { ok: false, code, error: message }
    }
  },

  async fetchPositions(apiKey): Promise<BrokerPosition[]> {
    const rows = await t212Get<T212Position[]>(PORTFOLIO_PATH, apiKey)
    if (!Array.isArray(rows) || rows.length === 0) return []

    // Enrich with instrument metadata (isin/name/currency) when available.
    // Best-effort: a failure here must not lose the positions themselves.
    let instruments: Map<string, T212Instrument> = new Map()
    try {
      instruments = await fetchInstrumentMap(apiKey)
    } catch {
      // metadata unavailable — fall back to ticker-only positions
    }

    return rows
      .map((r): BrokerPosition => {
        const meta = instruments.get(r.ticker)
        return {
          ticker: String(r.ticker),
          name: meta?.name,
          isin: meta?.isin,
          currency: meta?.currencyCode,
          units: Number(r.quantity) || 0,
          averagePrice: Number.isFinite(r.averagePrice) ? Number(r.averagePrice) : undefined,
          currentPrice: Number.isFinite(r.currentPrice) ? Number(r.currentPrice) : undefined,
        }
      })
      .filter((p) => p.units !== 0)
  },
}
