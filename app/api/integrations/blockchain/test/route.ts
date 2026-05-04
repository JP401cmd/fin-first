// GET /api/integrations/blockchain/test
//
// Smoke-test voor de publieke blockchain-bronnen die door wallet-sync worden
// aangesproken. Geen credentials, geen per-user staat — wél belangrijk voor
// de sync-betrouwbaarheid: als bv. de Polygon RPC down is, mislukken alle
// MATIC-wallet-syncs stilzwijgend.
//
//   • Blockchair (`/stats`)         — BTC + ETH wallet balances
//   • Polygon RPC (eth_blockNumber)
//   • Arbitrum RPC (eth_blockNumber)
//   • Base RPC (eth_blockNumber)
//   • Solana RPC (getSlot)
//
// Returns per source: { ok, latencyMs, error? }.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface SourceResult {
  ok: boolean
  latencyMs: number
  error?: string
}

const PING_TIMEOUT_MS = 8000

async function pingJsonRpc(url: string, method: string): Promise<SourceResult> {
  const startedAt = performance.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
      cache: 'no-store',
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    })
    const latencyMs = Math.round(performance.now() - startedAt)
    if (!res.ok) {
      return { ok: false, latencyMs, error: `HTTP ${res.status}` }
    }
    const body = (await res.json()) as { result?: unknown; error?: { message?: string } }
    if (body.error) {
      return { ok: false, latencyMs, error: body.error.message ?? 'RPC error' }
    }
    if (body.result === undefined || body.result === null) {
      return { ok: false, latencyMs, error: 'Geen result-veld' }
    }
    return { ok: true, latencyMs }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startedAt)
    return {
      ok: false,
      latencyMs,
      error: err instanceof Error ? err.message : 'Onbekende fout',
    }
  }
}

async function pingBlockchair(): Promise<SourceResult> {
  const startedAt = performance.now()
  try {
    // /stats is een lichte publieke endpoint die alleen netwerkstats retourneert
    // — geen rate-limit-impact en exacte gradient van API-beschikbaarheid.
    const res = await fetch('https://api.blockchair.com/stats', {
      cache: 'no-store',
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
    })
    const latencyMs = Math.round(performance.now() - startedAt)
    if (!res.ok) {
      return { ok: false, latencyMs, error: `HTTP ${res.status}` }
    }
    const body = (await res.json()) as { context?: { code?: number; error?: string } }
    if (body.context?.error) {
      return { ok: false, latencyMs, error: body.context.error }
    }
    return { ok: true, latencyMs }
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startedAt)
    return {
      ok: false,
      latencyMs,
      error: err instanceof Error ? err.message : 'Onbekende fout',
    }
  }
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const [blockchair, polygon, arbitrum, base, solana] = await Promise.all([
    pingBlockchair(),
    pingJsonRpc('https://polygon-rpc.com', 'eth_blockNumber'),
    pingJsonRpc('https://arb1.arbitrum.io/rpc', 'eth_blockNumber'),
    pingJsonRpc('https://mainnet.base.org', 'eth_blockNumber'),
    pingJsonRpc('https://api.mainnet-beta.solana.com', 'getSlot'),
  ])

  return NextResponse.json(
    { blockchair, polygon, arbitrum, base, solana },
    { headers: { 'cache-control': 'no-store' } },
  )
}
