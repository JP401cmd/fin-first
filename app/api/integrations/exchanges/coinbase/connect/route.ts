// POST /api/integrations/exchanges/coinbase/connect
//
// Validates the supplied Coinbase Advanced Trade API key with a single
// read-only call to GET /api/v3/brokerage/accounts, then stores the encrypted
// credentials in `exchange_connections`, linked to the caller-supplied
// `linkedAssetId` (1-on-1 with assets, R1).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptField, blindIndex } from '@/lib/crypto/field-encryption'
import { getExchangeAdapter } from '@/lib/integrations/exchange-adapter'
import { validateLinkedAsset } from '@/lib/integrations/linked-asset'

const MAX_LABEL_LEN = 60
const MIN_KEY_LEN = 16
// Real EC PRIVATE KEY PEM ≈ 225 chars; Ed25519 base64 = ~88 chars. Anything
// shorter than 80 cannot be a valid Coinbase secret.
const MIN_SECRET_LEN = 80

interface ConnectBody {
  apiKey?: unknown
  apiSecret?: unknown
  label?: unknown
  linkedAssetId?: unknown
}

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: ConnectBody
  try {
    body = (await request.json()) as ConnectBody
  } catch {
    return NextResponse.json({ error: 'Ongeldig JSON-formaat' }, { status: 400 })
  }

  const apiKey = safeString(body.apiKey)
  const apiSecret = safeString(body.apiSecret)
  const label = safeString(body.label).slice(0, MAX_LABEL_LEN) || null

  if (apiKey.length < MIN_KEY_LEN) {
    return NextResponse.json({ error: 'API-key is te kort. Plak de volledige key-naam (organizations/…/apiKeys/…).' }, { status: 400 })
  }
  if (apiSecret.length < MIN_SECRET_LEN) {
    return NextResponse.json({ error: 'Private key is te kort. Plak de volledige PEM (incl. BEGIN/END-regels) of de volledige Ed25519-base64.' }, { status: 400 })
  }

  const linkCheck = await validateLinkedAsset(supabase, user.id, body.linkedAssetId)
  if (!linkCheck.ok) {
    return NextResponse.json({ error: linkCheck.message }, { status: linkCheck.status })
  }

  const adapter = getExchangeAdapter('coinbase')
  const validation = await adapter.validateCredentials(apiKey, apiSecret)
  if (!validation.ok) {
    return NextResponse.json({
      error: validation.error ?? 'Validatie mislukt',
      code: validation.code ?? 'unknown',
    }, { status: 400 })
  }

  const apiKeyHash = blindIndex(apiKey)
  const last4 = apiKey.slice(-4)

  const { data: inserted, error } = await supabase
    .from('exchange_connections')
    .insert({
      user_id: user.id,
      exchange: 'coinbase',
      api_key_encrypted: encryptField(apiKey),
      api_secret_encrypted: encryptField(apiSecret),
      api_key_hash: apiKeyHash,
      api_key_last4: last4,
      label,
      linked_asset_id: linkCheck.assetId,
    })
    .select('id, exchange, label, api_key_last4, last_synced_at, last_sync_error, created_at, linked_asset_id')
    .single()

  if (error) {
    if (error.code === '23505') {
      const msg = error.message?.toLowerCase().includes('linked_asset')
        ? 'Dit asset heeft al een exchange-koppeling. Ontkoppel de bestaande eerst.'
        : 'Deze API-key is al gekoppeld. Gebruik je bestaande koppeling of maak een nieuwe key aan.'
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    return NextResponse.json({ error: 'Kon de koppeling niet opslaan.' }, { status: 500 })
  }

  return NextResponse.json({
    connection: {
      id: inserted.id,
      exchange: inserted.exchange,
      label: inserted.label,
      apiKeyLast4: inserted.api_key_last4,
      lastSyncedAt: inserted.last_synced_at,
      lastSyncError: inserted.last_sync_error,
      createdAt: inserted.created_at,
      linkedAssetId: inserted.linked_asset_id,
    },
  }, { status: 201 })
}
