// On-chain wallet balance lookup across 6 chains.
//
// We use two transports depending on the chain:
//
//   1. Blockchair (free, no key) for BTC and ETH — proven slugs documented at
//      https://blockchair.com/api/docs.
//        GET https://api.blockchair.com/bitcoin/dashboards/address/{address}
//          → data[address].address.balance (satoshis, integer)
//        GET https://api.blockchair.com/ethereum/dashboards/address/{address}
//          → data[address].address.balance (wei, decimal string)
//
//   2. Public JSON-RPC for Polygon, Arbitrum, Base (EVM `eth_getBalance`) and
//      Solana (`getBalance`). Blockchair's docs only confirm BTC + ETH for the
//      dashboards/address endpoint; using each chain's own canonical RPC is
//      both faster and avoids depending on undocumented Blockchair slugs.
//
// All endpoints are free and require no credentials. `BLOCKCHAIR_API_KEY`, when
// set, is appended to Blockchair calls only.

import type { WalletChain } from '@/lib/connections-data'

const BLOCKCHAIR_BASE = 'https://api.blockchair.com'

const SATOSHIS_PER_BTC = 100_000_000
// 1e18 wei = 1 ETH. We divide wei (BigInt) by this scaled constant so the
// result fits cleanly in a JS Number with 6-decimal precision (plenty for UI).
const WEI_PER_ETH_MICRO = BigInt('1000000000000') // 1e18 / 1e6
const LAMPORTS_PER_SOL_MICRO = 1_000 // 1e9 / 1e6

interface ChainTransport {
  kind: 'blockchair' | 'evm-rpc' | 'solana-rpc'
  /** Blockchair URL slug, only used when kind === 'blockchair'. */
  blockchairSlug?: string
  /** RPC endpoint URL, only used for *-rpc transports. */
  rpcUrl?: string
  /** Decimals to apply when converting raw → human units (informational). */
  decimals: 8 | 9 | 18
}

const CHAIN_TRANSPORT: Record<WalletChain, ChainTransport> = {
  bitcoin: { kind: 'blockchair', blockchairSlug: 'bitcoin', decimals: 8 },
  ethereum: { kind: 'blockchair', blockchairSlug: 'ethereum', decimals: 18 },
  polygon: { kind: 'evm-rpc', rpcUrl: 'https://polygon-rpc.com', decimals: 18 },
  arbitrum: { kind: 'evm-rpc', rpcUrl: 'https://arb1.arbitrum.io/rpc', decimals: 18 },
  base: { kind: 'evm-rpc', rpcUrl: 'https://mainnet.base.org', decimals: 18 },
  solana: { kind: 'solana-rpc', rpcUrl: 'https://api.mainnet-beta.solana.com', decimals: 9 },
}

export interface WalletBalance {
  chain: WalletChain
  address: string
  /** Native balance in human units (BTC, ETH, MATIC, SOL). */
  nativeBalance: number
  fetchedAt: string
}

interface BlockchairAddressResponse {
  data?: Record<string, { address?: { balance?: number | string } }>
  context?: { code?: number; error?: string }
}

interface JsonRpcResponse<T> {
  jsonrpc?: string
  id?: number | string
  result?: T
  error?: { code?: number; message?: string }
}

function appendApiKey(url: string): string {
  const key = process.env.BLOCKCHAIR_API_KEY?.trim()
  if (!key) return url
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}key=${encodeURIComponent(key)}`
}

function weiHexToEth(hex: string): number {
  // hex like "0x1bc16d674ec80000" — parse as BigInt, scale to ETH * 1e6 to fit Number.
  let weiBig: bigint
  try {
    weiBig = BigInt(hex)
  } catch {
    return 0
  }
  const ethTimesMicro = Number(weiBig / WEI_PER_ETH_MICRO)
  return ethTimesMicro / 1_000_000
}

function weiDecimalToEth(raw: string | number): number {
  const str = typeof raw === 'string' ? raw : String(raw)
  let weiBig: bigint
  try {
    const intPart = str.split('.')[0]
    weiBig = BigInt(intPart)
  } catch {
    return 0
  }
  const ethTimesMicro = Number(weiBig / WEI_PER_ETH_MICRO)
  return ethTimesMicro / 1_000_000
}

function lamportsToSol(raw: number | string): number {
  const lamports = typeof raw === 'string' ? Number(raw) : raw
  if (!Number.isFinite(lamports)) return 0
  // Scale via integer arithmetic to avoid float drift on large balances.
  return Math.round(lamports / LAMPORTS_PER_SOL_MICRO) / 1_000_000
}

async function fetchViaBlockchair(slug: string, chain: WalletChain, address: string): Promise<number> {
  const url = appendApiKey(`${BLOCKCHAIR_BASE}/${slug}/dashboards/address/${encodeURIComponent(address)}`)
  const res = await fetch(url, { method: 'GET', cache: 'no-store' })
  if (!res.ok) {
    if (res.status === 429 || res.status === 430) throw new Error('429 rate limit')
    if (res.status === 404) throw new Error('Adres niet gevonden')
    throw new Error(`Blockchair ${res.status}`)
  }
  let body: BlockchairAddressResponse
  try {
    body = (await res.json()) as BlockchairAddressResponse
  } catch {
    throw new Error('Blockchair gaf een onleesbaar antwoord terug.')
  }
  if (body.context?.error) throw new Error(body.context.error)

  const node = body.data?.[address]
  const fallback = body.data?.[address.toLowerCase()]
  const balanceRaw = node?.address?.balance ?? fallback?.address?.balance
  if (balanceRaw === undefined || balanceRaw === null) return 0

  if (chain === 'bitcoin') {
    const sats = typeof balanceRaw === 'string' ? Number(balanceRaw) : balanceRaw
    if (!Number.isFinite(sats)) return 0
    return sats / SATOSHIS_PER_BTC
  }
  return weiDecimalToEth(balanceRaw)
}

async function fetchViaEvmRpc(rpcUrl: string, address: string): Promise<number> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getBalance',
      params: [address, 'latest'],
    }),
  })
  if (!res.ok) {
    if (res.status === 429) throw new Error('429 rate limit')
    throw new Error(`RPC ${res.status}`)
  }
  let body: JsonRpcResponse<string>
  try {
    body = (await res.json()) as JsonRpcResponse<string>
  } catch {
    throw new Error('RPC gaf een onleesbaar antwoord terug.')
  }
  if (body.error) throw new Error(body.error.message ?? 'RPC fout')
  if (typeof body.result !== 'string') return 0
  return weiHexToEth(body.result)
}

async function fetchViaSolanaRpc(rpcUrl: string, address: string): Promise<number> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: [address],
    }),
  })
  if (!res.ok) {
    if (res.status === 429) throw new Error('429 rate limit')
    throw new Error(`RPC ${res.status}`)
  }
  let body: JsonRpcResponse<{ value?: number } | number>
  try {
    body = (await res.json()) as JsonRpcResponse<{ value?: number } | number>
  } catch {
    throw new Error('Solana RPC gaf een onleesbaar antwoord terug.')
  }
  if (body.error) {
    const msg = body.error.message ?? 'RPC fout'
    if (/invalid|could not find/i.test(msg)) throw new Error('Adres niet gevonden')
    throw new Error(msg)
  }
  // getBalance returns { context, value: lamports } in modern Solana RPC, but
  // older deployments return the lamports number directly — handle both.
  const lamports = typeof body.result === 'number'
    ? body.result
    : body.result?.value ?? 0
  return lamportsToSol(lamports)
}

export async function fetchWalletBalance(chain: WalletChain, address: string): Promise<WalletBalance> {
  const transport = CHAIN_TRANSPORT[chain]
  if (!transport) {
    throw new Error(`Chain "${chain}" wordt nog niet ondersteund.`)
  }

  let nativeBalance = 0
  if (transport.kind === 'blockchair' && transport.blockchairSlug) {
    nativeBalance = await fetchViaBlockchair(transport.blockchairSlug, chain, address)
  } else if (transport.kind === 'evm-rpc' && transport.rpcUrl) {
    nativeBalance = await fetchViaEvmRpc(transport.rpcUrl, address)
  } else if (transport.kind === 'solana-rpc' && transport.rpcUrl) {
    nativeBalance = await fetchViaSolanaRpc(transport.rpcUrl, address)
  }

  return {
    chain,
    address,
    nativeBalance,
    fetchedAt: new Date().toISOString(),
  }
}

/**
 * Maps wallet-lookup errors onto the same stable shape as exchange errors so
 * the connection-card badge surfaces a consistent message regardless of source.
 */
export function classifyWalletError(raw: unknown): { code: 'not_found' | 'rate_limited' | 'network' | 'unknown'; message: string } {
  const text = raw instanceof Error ? raw.message : typeof raw === 'string' ? raw : 'Onbekende fout'
  const lower = text.toLowerCase()
  if (lower.includes('429') || lower.includes('430') || lower.includes('rate limit')) {
    return { code: 'rate_limited', message: 'Even rustig — de blockchain-bron limiteert tijdelijk. Probeer later opnieuw.' }
  }
  if (lower.includes('404') || lower.includes('niet gevonden') || lower.includes('not found')) {
    return { code: 'not_found', message: 'Adres niet gevonden op deze chain.' }
  }
  if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('etimedout') || lower.includes('enotfound')) {
    return { code: 'network', message: 'Netwerkfout — blockchain-bron niet bereikbaar.' }
  }
  return { code: 'unknown', message: text.slice(0, 200) }
}
