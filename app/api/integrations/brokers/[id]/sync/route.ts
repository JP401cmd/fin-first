// POST /api/integrations/brokers/[id]/sync
//
// Decrypts the stored credential, hits the broker, upserts investment holdings,
// and writes an audit row to `external_data_sources`. The connection's
// `last_synced_at` and `last_sync_error` are updated alongside the audit log so
// the UI badge always matches the most recent sync. Mirrors
// exchanges/[id]/sync but simpler — brokers have no trades-import pass.
//
// Privacy: never echoes the decrypted key. The response only contains a summary
// (status, counts, totalEur, error) suitable for the koppelingen UI.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptField } from '@/lib/crypto/field-encryption'
import { getBrokerAdapter, classifyBrokerError, type BrokerId } from '@/lib/integrations/broker-adapter'
import { syncBrokerPositions } from '@/lib/integrations/broker-sync'

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
    return NextResponse.json({ error: 'Koppeling-id is verplicht' }, { status: 400 })
  }

  const { data: row, error: rowError } = await supabase
    .from('broker_connections')
    .select('id, broker, api_key_encrypted, linked_asset_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (rowError || !row) {
    return NextResponse.json({ error: 'Koppeling niet gevonden' }, { status: 404 })
  }

  let apiKey: string
  try {
    const k = decryptField(row.api_key_encrypted as string)
    if (!k) throw new Error('decrypt returned null')
    apiKey = k
  } catch {
    return NextResponse.json({ error: 'Kon credentials niet ontsleutelen. Verwijder de koppeling en koppel opnieuw.' }, { status: 500 })
  }

  const adapter = getBrokerAdapter(row.broker as BrokerId)
  const startedAt = new Date().toISOString()

  try {
    const outcome = await syncBrokerPositions({
      supabase,
      userId: user.id,
      assetId: row.linked_asset_id as string,
      connectionId: id,
      adapter,
      apiKey,
    })

    await supabase
      .from('broker_connections')
      .update({ last_synced_at: startedAt, last_sync_error: null })
      .eq('id', id)
      .eq('user_id', user.id)

    await supabase.from('external_data_sources').insert({
      user_id: user.id,
      source_type: 'broker',
      source_ref_id: id,
      run_at: startedAt,
      status: 'success',
      items_synced: outcome.itemsSynced,
      error_message: null,
    })

    return NextResponse.json({
      status: 'success',
      itemsSynced: outcome.itemsSynced,
      itemsDeactivated: outcome.itemsDeactivated,
      assetId: outcome.assetId,
      totalEur: outcome.totalValueEur,
      lastSyncedAt: startedAt,
    })
  } catch (err) {
    const { message } = classifyBrokerError(err)

    await supabase
      .from('broker_connections')
      .update({ last_sync_error: message })
      .eq('id', id)
      .eq('user_id', user.id)

    await supabase.from('external_data_sources').insert({
      user_id: user.id,
      source_type: 'broker',
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
