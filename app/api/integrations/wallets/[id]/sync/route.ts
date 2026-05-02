// POST /api/integrations/wallets/[id]/sync
//
// Refreshes balance + EUR value for one wallet, mirrors the row + writes an
// audit entry. Mirrors the exchange-sync route shape so the client can call
// both with the same shape of response.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncWalletBalance } from '@/lib/integrations/wallet-sync'
import { classifyWalletError } from '@/lib/integrations/blockchair-client'
import type { WalletChain } from '@/lib/connections-data'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Wallet-id is verplicht' }, { status: 400 })
  }

  const { data: row, error: rowError } = await supabase
    .from('wallet_addresses')
    .select('id, user_id, chain, address, label, linked_asset_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (rowError || !row) {
    return NextResponse.json({ error: 'Wallet niet gevonden' }, { status: 404 })
  }

  const startedAt = new Date().toISOString()

  try {
    const outcome = await syncWalletBalance({
      supabase,
      wallet: {
        id: row.id as string,
        user_id: user.id,
        chain: row.chain as WalletChain,
        address: row.address as string,
        label: (row.label as string | null) ?? null,
        linked_asset_id: row.linked_asset_id as string,
      },
    })

    await supabase
      .from('wallet_addresses')
      .update({ last_synced_at: startedAt, last_sync_error: null })
      .eq('id', id)
      .eq('user_id', user.id)

    await supabase.from('external_data_sources').insert({
      user_id: user.id,
      source_type: 'wallet',
      source_ref_id: id,
      run_at: startedAt,
      status: 'success',
      items_synced: 1,
    })

    return NextResponse.json({
      status: 'success',
      itemsSynced: 1,
      nativeBalance: outcome.nativeBalance,
      totalEur: outcome.eurBalance,
      assetId: outcome.assetId,
      lastSyncedAt: startedAt,
    })
  } catch (err) {
    const { message } = classifyWalletError(err)

    await supabase
      .from('wallet_addresses')
      .update({ last_sync_error: message })
      .eq('id', id)
      .eq('user_id', user.id)

    await supabase.from('external_data_sources').insert({
      user_id: user.id,
      source_type: 'wallet',
      source_ref_id: id,
      run_at: startedAt,
      status: 'error',
      items_synced: 0,
      error_message: message,
    })

    return NextResponse.json({
      status: 'error',
      error: message,
    }, { status: 502 })
  }
}
