// POST /api/integrations/exchanges/[id]/test
//
// Decrypts the stored credentials and runs the adapter's `validateCredentials`
// against the exchange. Pure read-only — never mutates connection state, never
// upserts holdings, never writes to external_data_sources. Used by the
// beheerpagina "Test verbinding" button to give the user immediate feedback
// without triggering a full sync cycle.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptField } from '@/lib/crypto/field-encryption'
import { getExchangeAdapter, type ExchangeId } from '@/lib/integrations/exchange-adapter'

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
    return NextResponse.json({ ok: false, error: 'Koppeling-id is verplicht' }, { status: 400 })
  }

  const { data: row, error: rowError } = await supabase
    .from('exchange_connections')
    .select('id, exchange, api_key_encrypted, api_secret_encrypted')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (rowError || !row) {
    return NextResponse.json({ ok: false, error: 'Koppeling niet gevonden' }, { status: 404 })
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
    return NextResponse.json({
      ok: false,
      error: 'Kon credentials niet ontsleutelen. Verwijder de koppeling en koppel opnieuw.',
      code: 'decrypt_failed',
    }, { status: 500 })
  }

  const adapter = getExchangeAdapter(row.exchange as ExchangeId)
  const startedAt = Date.now()
  try {
    const result = await adapter.validateCredentials(apiKey, apiSecret)
    const latencyMs = Date.now() - startedAt
    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        error: result.error ?? 'Validatie mislukt',
        code: result.code ?? 'unknown',
        latencyMs,
      })
    }
    return NextResponse.json({ ok: true, latencyMs })
  } catch (err) {
    const latencyMs = Date.now() - startedAt
    const message = err instanceof Error ? err.message : 'Onbekende fout'
    return NextResponse.json({
      ok: false,
      error: message.slice(0, 200),
      code: 'unknown',
      latencyMs,
    })
  }
}
