// POST /api/integrations/brokers/trading212/connect
//
// Validates the supplied API key with a single read-only call to the broker,
// then stores the encrypted credential in `broker_connections`, linked to the
// caller-supplied `linkedAssetId` (1-on-1 with an investment asset).
//
// Mirrors exchanges/bitvavo/connect exactly. The only structural differences:
//   • Trading 212 legacy keys are a single value — no secret. We store
//     `api_secret_encrypted = null`.
//   • The linked asset must be an INVESTMENT account (validateLinkedInvestmentAsset),
//     not a crypto asset.
//
// Security:
//   • The plaintext key leaves the request body and is immediately handed to
//     the encrypt-helper. It is never logged, never returned in any response,
//     and never stored in plaintext.
//   • The response only echoes public-safe fields (id, broker, label,
//     api_key_last4, timestamps, linkedAssetId). No secrets, no hash.
//   • Duplicate keys per (user, broker) are rejected via the blind-index
//     unique constraint on `api_key_hash`. An asset with an existing
//     connection is rejected via the unique index on linked_asset_id.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptField, blindIndex } from '@/lib/crypto/field-encryption'
import { getBrokerAdapter } from '@/lib/integrations/broker-adapter'
import { validateLinkedInvestmentAsset } from '@/lib/integrations/linked-asset'

// This route lives under the literal `trading212/` folder (mirroring the
// literal `bitvavo/` exchange folder), so there is no `[broker]` route param to
// read — the broker is fixed to 'trading212'. getBrokerAdapter is still routed
// through (rather than referencing the adapter directly) to keep the validate/
// connect/sync trio consistent and to surface the "not supported" 400 path.
const BROKER = 'trading212' as const

const MAX_LABEL_LEN = 60
const MIN_KEY_LEN = 16

interface ConnectBody {
  apiKey?: unknown
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

  // Resolve the adapter first — getBrokerAdapter throws for an unknown broker.
  let adapter
  try {
    adapter = getBrokerAdapter(BROKER)
  } catch {
    return NextResponse.json({ error: 'Broker wordt niet ondersteund.' }, { status: 400 })
  }

  const apiKey = safeString(body.apiKey)
  const label = safeString(body.label).slice(0, MAX_LABEL_LEN) || null

  if (apiKey.length < MIN_KEY_LEN) {
    return NextResponse.json({ error: 'API-key is te kort. Controleer of je de volledige key hebt geplakt.' }, { status: 400 })
  }

  // Ownership + asset_type === 'investment' enforced BEFORE we validate or
  // persist anything. Non-owner → 403, wrong type → 400, missing → 404.
  const linkCheck = await validateLinkedInvestmentAsset(supabase, user.id, body.linkedAssetId)
  if (!linkCheck.ok) {
    return NextResponse.json({ error: linkCheck.message }, { status: linkCheck.status })
  }

  const validation = await adapter.validateCredentials(apiKey)
  if (!validation.ok) {
    return NextResponse.json({
      error: validation.error ?? 'Validatie mislukt',
      code: validation.code ?? 'unknown',
    }, { status: 400 })
  }

  // Versleutelen kan falen als de server-side encryptie-sleutel ontbreekt of
  // misgeconfigureerd is. Vang dat af met een NETTE JSON-fout. Geen
  // detail/credentials loggen of teruggeven.
  let apiKeyHash: string
  let apiKeyEncrypted: string | null
  try {
    apiKeyHash = blindIndex(apiKey)
    apiKeyEncrypted = encryptField(apiKey)
  } catch {
    // Bewust alléén een message loggen (nooit het error-object of de credentials).
    console.error('[broker/connect] encryption failed')
    return NextResponse.json({ error: 'Kon de koppeling niet beveiligen. Probeer het later opnieuw.' }, { status: 500 })
  }
  // Tripwire: encryptField geeft voor niet-lege input nooit null, maar maak de
  // write-kant net zo defensief als de read-kant — en dit narrow't het type
  // terug naar string voor de insert.
  if (!apiKeyEncrypted) {
    return NextResponse.json({ error: 'Kon de koppeling niet beveiligen. Probeer het later opnieuw.' }, { status: 500 })
  }
  const last4 = apiKey.slice(-4)

  const { data: inserted, error } = await supabase
    .from('broker_connections')
    .insert({
      user_id: user.id,
      broker: adapter.name,
      api_key_encrypted: apiKeyEncrypted,
      // Trading 212 legacy keys have no secret — store null.
      api_secret_encrypted: null,
      api_key_hash: apiKeyHash,
      api_key_last4: last4,
      label,
      linked_asset_id: linkCheck.assetId,
    })
    .select('id, broker, label, api_key_last4, last_synced_at, last_sync_error, created_at, linked_asset_id')
    .single()

  if (error) {
    if (error.code === '23505') {
      const msg = error.message?.toLowerCase().includes('linked_asset')
        ? 'Dit asset heeft al een broker-koppeling. Ontkoppel de bestaande eerst.'
        : 'Deze API-key is al gekoppeld. Gebruik je bestaande koppeling of maak een nieuwe key aan.'
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    return NextResponse.json({ error: 'Kon de koppeling niet opslaan.' }, { status: 500 })
  }

  return NextResponse.json({
    connection: {
      id: inserted.id,
      broker: inserted.broker,
      label: inserted.label,
      apiKeyLast4: inserted.api_key_last4,
      lastSyncedAt: inserted.last_synced_at,
      lastSyncError: inserted.last_sync_error,
      createdAt: inserted.created_at,
      linkedAssetId: inserted.linked_asset_id,
    },
  }, { status: 201 })
}
