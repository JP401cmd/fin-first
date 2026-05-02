// Coinbase Advanced Trade API read-only client.
//
// Authentication: JWT Bearer per
// https://docs.cdp.coinbase.com/get-started/authentication/jwt-authentication
//
// Coinbase issues two API-key flavours; we accept both:
//
//   • ES256 — "Coinbase Cloud / Advanced Trade" keys: PEM-encoded EC (P-256)
//     private key. Looks like:
//         -----BEGIN EC PRIVATE KEY-----
//         MHcCAQEE...
//         -----END EC PRIVATE KEY-----
//     (or PKCS#8 "BEGIN PRIVATE KEY"). Algorithm header `ES256`.
//
//   • Ed25519 — newer CDP keys: 64-byte base64 string (32-byte seed +
//     32-byte public key). Algorithm header `EdDSA`.
//
// JWT validity is 120 s; we mint a fresh token per call. Tokens carry a
// per-call `nonce` (random 16-byte hex) and a `uri` claim of the form
// "METHOD HOST/PATH" — the API rejects mismatched URIs so we cannot reuse
// a token across endpoints.
//
// We only ever call non-mutating endpoints (GET /api/v3/brokerage/accounts).

import { createSign, randomBytes, sign as cryptoSign, createPrivateKey } from 'crypto'
import type { ExchangeAdapter, ExchangeBalance, ValidationResult } from './exchange-adapter'
import { classifyExchangeError } from './exchange-adapter'

const COINBASE_HOST = 'api.coinbase.com'
const ACCOUNTS_PATH = '/api/v3/brokerage/accounts'
const JWT_TTL_SECONDS = 120

interface CoinbaseAccount {
  uuid: string
  name: string
  currency: string
  available_balance: { value: string; currency: string }
  hold: { value: string; currency: string }
  active?: boolean
  deleted_at?: string | null
  type?: string
  ready?: boolean
}

interface AccountsResponse {
  accounts: CoinbaseAccount[]
  has_next: boolean
  cursor?: string
  size?: number
}

interface CoinbaseErrorBody {
  error?: string
  error_details?: string
  message?: string
}

// ── JWT signing ─────────────────────────────────────────────────────────────

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function detectKeyKind(apiSecret: string): 'es256' | 'ed25519' {
  // PEM keys carry an explicit ASCII header; Ed25519 keys are bare base64.
  return apiSecret.includes('-----BEGIN') ? 'es256' : 'ed25519'
}

/**
 * DER ECDSA signatures use a SEQUENCE of two INTEGERs (r, s); JWT (RFC 7515)
 * expects fixed-width 64-byte concatenation r||s for ES256. Node's
 * `createSign` returns DER, so we transcode.
 */
function derToJoseEcdsa(der: Buffer, byteLength: number): Buffer {
  let offset = 0
  if (der[offset++] !== 0x30) throw new Error('coinbase-jwt: invalid DER (no SEQUENCE)')
  if (der[offset] & 0x80) {
    // long-form length, skip extra length bytes
    offset += 1 + (der[offset] & 0x7f)
  } else {
    offset += 1
  }
  if (der[offset++] !== 0x02) throw new Error('coinbase-jwt: invalid DER (no INTEGER r)')
  const rLen = der[offset++]
  let r = der.subarray(offset, offset + rLen)
  offset += rLen
  if (der[offset++] !== 0x02) throw new Error('coinbase-jwt: invalid DER (no INTEGER s)')
  const sLen = der[offset++]
  let s = der.subarray(offset, offset + sLen)

  // Strip leading zero padding INTEGERs use to stay positive, then left-pad
  // to byteLength so r and s are each exactly byteLength bytes.
  if (r[0] === 0x00 && r.length > byteLength) r = r.subarray(1)
  if (s[0] === 0x00 && s.length > byteLength) s = s.subarray(1)

  const out = Buffer.alloc(byteLength * 2)
  r.copy(out, byteLength - r.length)
  s.copy(out, byteLength * 2 - s.length)
  return out
}

function buildJwt(
  keyName: string,
  apiSecret: string,
  method: string,
  host: string,
  path: string,
): string {
  const kind = detectKeyKind(apiSecret)
  const now = Math.floor(Date.now() / 1000)
  const nonce = randomBytes(16).toString('hex')

  const header = {
    alg: kind === 'es256' ? 'ES256' : 'EdDSA',
    typ: 'JWT',
    kid: keyName,
    nonce,
  }
  const payload = {
    sub: keyName,
    iss: 'cdp',
    nbf: now,
    exp: now + JWT_TTL_SECONDS,
    uri: `${method.toUpperCase()} ${host}${path}`,
  }

  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`

  let signature: Buffer
  if (kind === 'es256') {
    // Node accepts both "EC PRIVATE KEY" (SEC1) and "PRIVATE KEY" (PKCS#8) PEMs.
    const keyObj = createPrivateKey({ key: apiSecret, format: 'pem' })
    const der = createSign('SHA256').update(signingInput, 'utf8').sign(keyObj)
    signature = derToJoseEcdsa(der, 32)
  } else {
    // Ed25519 key from CDP is 64 bytes base64: 32-byte seed || 32-byte pubkey.
    // Node's KeyObject expects a PKCS#8 wrapped DER for `ed25519`. Build it
    // from the seed so we don't need to ask the user to supply PEM for what
    // Coinbase ships as raw base64.
    const raw = Buffer.from(apiSecret, 'base64')
    if (raw.length < 32) throw new Error('coinbase-jwt: Ed25519 key too short')
    const seed = raw.subarray(0, 32)
    // Static PKCS#8 wrapper for Ed25519 private key (RFC 8410), then 32-byte seed.
    const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex')
    const pkcs8 = Buffer.concat([pkcs8Prefix, seed])
    const keyObj = createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' })
    signature = cryptoSign(null, Buffer.from(signingInput, 'utf8'), keyObj)
  }

  return `${signingInput}.${base64UrlEncode(signature)}`
}

// ── HTTP helper ─────────────────────────────────────────────────────────────

async function coinbaseGet<T>(
  path: string,
  apiKey: string,
  apiSecret: string,
): Promise<T> {
  const jwt = buildJwt(apiKey, apiSecret, 'GET', COINBASE_HOST, path)

  const res = await fetch(`https://${COINBASE_HOST}${path}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'User-Agent': 'TriFinity/1.0',
    },
  })

  if (!res.ok) {
    let body: CoinbaseErrorBody | null = null
    try {
      body = (await res.json()) as CoinbaseErrorBody
    } catch {
      // non-JSON
    }
    const detail = body?.error_details || body?.error || body?.message || `${res.status} ${res.statusText}`
    throw new Error(`Coinbase ${res.status}: ${detail}`)
  }

  return (await res.json()) as T
}

async function fetchAllAccounts(apiKey: string, apiSecret: string): Promise<CoinbaseAccount[]> {
  // Coinbase paginates accounts at 250 per page. Most retail users have <100
  // accounts; the loop is here so users with many fiat sub-accounts still
  // sync completely.
  const all: CoinbaseAccount[] = []
  let cursor: string | undefined
  let safety = 20
  do {
    const qs = new URLSearchParams({ limit: '250' })
    if (cursor) qs.set('cursor', cursor)
    const page = await coinbaseGet<AccountsResponse>(`${ACCOUNTS_PATH}?${qs.toString()}`, apiKey, apiSecret)
    if (Array.isArray(page.accounts)) all.push(...page.accounts)
    cursor = page.has_next ? page.cursor : undefined
    safety -= 1
  } while (cursor && safety > 0)
  return all
}

// ── Adapter implementation ──────────────────────────────────────────────────

export const coinbaseAdapter: ExchangeAdapter = {
  name: 'coinbase',

  async validateCredentials(apiKey, apiSecret): Promise<ValidationResult> {
    try {
      // Cheapest authenticated probe: list accounts with limit=1.
      await coinbaseGet<AccountsResponse>(`${ACCOUNTS_PATH}?limit=1`, apiKey, apiSecret)
      return { ok: true }
    } catch (err) {
      const { code, message } = classifyExchangeError(err)
      return { ok: false, code, error: message }
    }
  },

  async fetchBalances(apiKey, apiSecret): Promise<ExchangeBalance[]> {
    const accounts = await fetchAllAccounts(apiKey, apiSecret)
    const aggregated = new Map<string, { available: number; inOrder: number }>()
    for (const acc of accounts) {
      if (acc.deleted_at || acc.active === false) continue
      const symbol = String(acc.currency || '').toUpperCase()
      if (!symbol) continue
      const available = Number(acc.available_balance?.value) || 0
      const inOrder = Number(acc.hold?.value) || 0
      if (available <= 0 && inOrder <= 0) continue
      const cur = aggregated.get(symbol) ?? { available: 0, inOrder: 0 }
      cur.available += available
      cur.inOrder += inOrder
      aggregated.set(symbol, cur)
    }
    return Array.from(aggregated.entries()).map(([symbol, v]) => ({
      symbol,
      available: v.available,
      inOrder: v.inOrder,
    }))
  },
}
