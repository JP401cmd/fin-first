// Kraken read-only client.
//
// Implements the signing scheme documented at
// https://docs.kraken.com/api/docs/rest-api/get-account-balance.
//
// Wire format (POST application/x-www-form-urlencoded):
//   URI path : `/0/private/Balance`
//   Body     : `nonce=<ms-epoch>`
//   API-Sign : base64( HMAC_SHA512(
//                base64-decode(secret),
//                uriPath || SHA256(nonce || postData)
//              ) )
//   Headers  : API-Key, API-Sign, Content-Type
//
// We only ever call /0/private/Balance — purely read-only. No order placement,
// no withdrawals. Kraken returns an envelope `{ error: string[], result: {...} }`
// where a populated `error` array means the request failed even with HTTP 200.
//
// Asset-name normalisation: Kraken uses the legacy ISO-4217-like prefixes
// `X` for crypto and `Z` for fiat on certain four-letter codes. We strip the
// prefix so downstream sync sees the canonical symbol (BTC, ETH, EUR …):
//   XXBT → BTC,  XETH → ETH,  XLTC → LTC,  XXRP → XRP,  XXDG → XDG,
//   ZEUR → EUR,  ZUSD → USD,  ZGBP → GBP,  ZJPY → JPY,  ZCAD → CAD,  ZAUD → AUD.
// Newer listings (SOL, ADA, MATIC, …) come through unprefixed and pass through
// unchanged. Staking-derivative suffixes (`.S`, `.M`, `.B`, `.F`) are dropped
// so e.g. `ETH.S` rolls up into the ETH balance.

import { createHash, createHmac } from 'crypto'
import type { ExchangeAdapter, ExchangeBalance, ValidationResult } from './exchange-adapter'
import { classifyExchangeError } from './exchange-adapter'

const KRAKEN_BASE = 'https://api.kraken.com'
const BALANCE_PATH = '/0/private/Balance'

interface KrakenEnvelope<T> {
  error: string[]
  result: T
}

type KrakenBalanceResult = Record<string, string>

function signRequest(
  apiSecret: string,
  uriPath: string,
  nonce: string,
  postData: string,
): string {
  // Kraken's algorithm: HMAC-SHA512(base64-decoded secret, uriPath || SHA256(nonce || postData))
  const sha256 = createHash('sha256').update(nonce + postData, 'utf8').digest()
  const message = Buffer.concat([Buffer.from(uriPath, 'utf8'), sha256])
  const secretBytes = Buffer.from(apiSecret, 'base64')
  return createHmac('sha512', secretBytes).update(message).digest('base64')
}

async function krakenPrivatePost<T>(
  path: string,
  apiKey: string,
  apiSecret: string,
): Promise<T> {
  // Kraken requires a strictly increasing nonce per key. Millisecond epoch is
  // sufficient for our once-per-sync cadence; if a user double-clicks "sync"
  // within the same ms, the second call gets a fresh ms by the time it
  // serialises. We deliberately do not append randomness — Kraken's nonce
  // window prefers monotonic integers.
  const nonce = String(Date.now())
  const postData = `nonce=${nonce}`
  const signature = signRequest(apiSecret, path, nonce, postData)

  const res = await fetch(`${KRAKEN_BASE}${path}`, {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'API-Key': apiKey,
      'API-Sign': signature,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'TriFinity/1.0',
    },
    body: postData,
  })

  let body: KrakenEnvelope<T> | null = null
  try {
    body = (await res.json()) as KrakenEnvelope<T>
  } catch {
    // Fall through — non-JSON body
  }

  if (!res.ok) {
    const detail = body?.error?.join('; ') || `${res.status} ${res.statusText}`
    throw new Error(`Kraken ${res.status}: ${detail}`)
  }

  if (!body) {
    throw new Error('Kraken: lege response')
  }

  if (body.error && body.error.length > 0) {
    // Surface Kraken's own error strings (e.g. "EAPI:Invalid key",
    // "EAPI:Invalid signature") so classifyExchangeError can map them.
    throw new Error(`Kraken: ${body.error.join('; ')}`)
  }

  return body.result
}

// ── Symbol normalisation ─────────────────────────────────────────────────

const PREFIX_STRIP_4: Record<string, string> = {
  XXBT: 'BTC',
  XETH: 'ETH',
  XLTC: 'LTC',
  XXRP: 'XRP',
  XXDG: 'XDG',
  XXLM: 'XLM',
  XXMR: 'XMR',
  XZEC: 'ZEC',
  XETC: 'ETC',
  XREP: 'REP',
  XMLN: 'MLN',
  ZEUR: 'EUR',
  ZUSD: 'USD',
  ZGBP: 'GBP',
  ZJPY: 'JPY',
  ZCAD: 'CAD',
  ZAUD: 'AUD',
  ZCHF: 'CHF',
}

export function normalizeKrakenSymbol(raw: string): string {
  const upper = raw.toUpperCase()
  // Strip staking/yield suffixes (`.S`, `.M`, `.B`, `.F`, `.HOLD`) so balances
  // roll up into the underlying asset.
  const base = upper.split('.')[0]
  if (PREFIX_STRIP_4[base]) return PREFIX_STRIP_4[base]
  // Generic 4-char fallback for legacy `X<3>` / `Z<3>` codes that aren't in
  // the explicit table above (rare — most modern listings are unprefixed).
  if (base.length === 4 && (base[0] === 'X' || base[0] === 'Z')) {
    return base.slice(1)
  }
  return base
}

// ── Adapter implementation ───────────────────────────────────────────────

export const krakenAdapter: ExchangeAdapter = {
  name: 'kraken',

  async validateCredentials(apiKey, apiSecret): Promise<ValidationResult> {
    try {
      await krakenPrivatePost<KrakenBalanceResult>(BALANCE_PATH, apiKey, apiSecret)
      return { ok: true }
    } catch (err) {
      const { code, message } = classifyExchangeError(err)
      return { ok: false, code, error: message }
    }
  },

  async fetchBalances(apiKey, apiSecret): Promise<ExchangeBalance[]> {
    const result = await krakenPrivatePost<KrakenBalanceResult>(BALANCE_PATH, apiKey, apiSecret)

    // Kraken returns `{ "XXBT": "0.123", "ZEUR": "100.0", ... }`. There is no
    // separate "in order" field on /Balance; locked funds appear in the same
    // total. We surface everything as `available` and leave `inOrder` at 0
    // (the sync layer just sums the two).
    const aggregated = new Map<string, number>()
    for (const [rawSymbol, value] of Object.entries(result)) {
      const amount = Number(value)
      if (!Number.isFinite(amount) || amount <= 0) continue
      const symbol = normalizeKrakenSymbol(rawSymbol)
      aggregated.set(symbol, (aggregated.get(symbol) ?? 0) + amount)
    }

    return Array.from(aggregated.entries()).map(([symbol, available]) => ({
      symbol,
      available,
      inOrder: 0,
    }))
  },
}
