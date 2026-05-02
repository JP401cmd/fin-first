// POST /api/integrations/wallets/[id]/test
//
// Fetches the on-chain balance for a wallet via Blockchair / RPC. Pure
// read-only — never mutates wallet state, never writes to external_data_sources,
// never updates the linked asset. Used by the beheerpagina "Test verbinding"
// button to verify that the address still resolves on its chain without
// triggering a full sync cycle.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchWalletBalance, classifyWalletError } from '@/lib/integrations/blockchair-client'
import type { WalletChain } from '@/lib/connections-data'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Niet ingelogd' }, { status: 401 })
  }

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ ok: false, error: 'Wallet-id is verplicht' }, { status: 400 })
  }

  const { data: row, error: rowError } = await supabase
    .from('wallet_addresses')
    .select('id, chain, address')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (rowError || !row) {
    return NextResponse.json({ ok: false, error: 'Wallet niet gevonden' }, { status: 404 })
  }

  const startedAt = Date.now()
  try {
    const balance = await fetchWalletBalance(row.chain as WalletChain, row.address as string)
    const latencyMs = Date.now() - startedAt
    return NextResponse.json({
      ok: true,
      balance: balance.nativeBalance,
      latencyMs,
    })
  } catch (err) {
    const latencyMs = Date.now() - startedAt
    const { message, code } = classifyWalletError(err)
    return NextResponse.json({
      ok: false,
      error: message,
      code,
      latencyMs,
    })
  }
}
