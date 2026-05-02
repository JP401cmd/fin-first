// POST /api/integrations/exchanges/[id]/sync
//
// Decrypts the stored credentials, hits the exchange, upserts holdings, and
// writes an audit row to `external_data_sources`. The connection's
// `last_synced_at` and `last_sync_error` are updated atomically with the
// audit log so the UI badge always matches the most recent sync.
//
// Privacy: never echoes the decrypted key/secret. The response only contains
// a summary (status, counts, totalEur, error) suitable for the koppelingen UI.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptField } from '@/lib/crypto/field-encryption'
import { getExchangeAdapter, classifyExchangeError, type ExchangeId } from '@/lib/integrations/exchange-adapter'
import { syncExchangeBalances } from '@/lib/integrations/exchange-sync'

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
    .from('exchange_connections')
    .select('id, exchange, label, api_key_encrypted, api_secret_encrypted, linked_asset_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (rowError || !row) {
    return NextResponse.json({ error: 'Koppeling niet gevonden' }, { status: 404 })
  }

  let apiKey: string
  let apiSecret: string
  try {
    const k = decryptField(row.api_key_encrypted as string)
    const s = decryptField(row.api_secret_encrypted as string)
    if (!k || !s) throw new Error('decrypt returned null')
    apiKey = k
    apiSecret = s
  } catch {
    return NextResponse.json({ error: 'Kon credentials niet ontsleutelen. Verwijder de koppeling en koppel opnieuw.' }, { status: 500 })
  }

  const exchange = row.exchange as ExchangeId
  const adapter = getExchangeAdapter(exchange)
  const startedAt = new Date().toISOString()

  try {
    const outcome = await syncExchangeBalances({
      supabase,
      userId: user.id,
      assetId: row.linked_asset_id as string,
      connectionId: id,
      adapter,
      apiKey,
      apiSecret,
    })

    // Trade-import kan stilzwijgend hebben gefaald terwijl balances wél
    // werden gesynced (bv. API-key zonder "Trade History" permissie). We
    // beschouwen de overall sync dan als partial: balances zijn up-to-date,
    // maar de transactie-historie ontbreekt. De gebruiker krijgt dat te
    // zien via `last_sync_error` op de connectie en de `external_data_sources`-
    // audit-log, zodat de stille faalmodus die deze bug veroorzaakte niet
    // meer kan optreden.
    const partialTradesFailure =
      outcome.tradesFetchErrorCount > 0 && outcome.tradesImported === 0
    const partialErrorMessage = partialTradesFailure
      ? `Saldi gesynced, maar transactie-historie kon niet worden opgehaald (${outcome.tradesFetchErrorCount} markt(en) gefaald). Voorbeeld: ${outcome.tradesFetchSampleError ?? 'onbekende fout'}`
      : null

    await supabase
      .from('exchange_connections')
      .update({ last_synced_at: startedAt, last_sync_error: partialErrorMessage })
      .eq('id', id)
      .eq('user_id', user.id)

    await supabase.from('external_data_sources').insert({
      user_id: user.id,
      source_type: 'exchange',
      source_ref_id: id,
      run_at: startedAt,
      status: partialTradesFailure ? 'partial' : 'success',
      items_synced: outcome.itemsSynced,
      error_message: partialErrorMessage,
    })

    return NextResponse.json({
      status: partialTradesFailure ? 'partial' : 'success',
      itemsSynced: outcome.itemsSynced,
      itemsDeactivated: outcome.itemsDeactivated,
      tradesImported: outcome.tradesImported,
      tradesFetchErrorCount: outcome.tradesFetchErrorCount,
      tradesWarning: partialErrorMessage ?? undefined,
      assetId: outcome.assetId,
      totalEur: outcome.totalValueEur,
      lastSyncedAt: startedAt,
    })
  } catch (err) {
    const { message } = classifyExchangeError(err)

    await supabase
      .from('exchange_connections')
      .update({ last_sync_error: message })
      .eq('id', id)
      .eq('user_id', user.id)

    await supabase.from('external_data_sources').insert({
      user_id: user.id,
      source_type: 'exchange',
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
