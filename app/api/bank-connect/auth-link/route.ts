import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { unauthorized } from '@/lib/api/respond'
import { isTrueLayerEnabled } from '@/lib/truelayer/feature-flag'
import { buildAuthLink } from '@/lib/truelayer/client'
import { encryptField } from '@/lib/crypto/field-encryption'

/**
 * Vertaalt een (mogelijk technische, Engelse of SDK-)fout naar een vaste,
 * Nederlandse gebruikersmelding. De rauwe details blijven in de serverlog
 * (console.error) en bereiken nooit de UI — zie bug B-04.
 */
function toDutchAuthLinkError(err: unknown): string {
  const raw = err instanceof Error ? err.message : ''
  // Bekende, herkenbare oorzaak: de bankkoppeling is (nog) niet ingericht.
  if (raw.includes('credentials niet geconfigureerd')) {
    return 'De bankkoppeling is nog niet volledig ingesteld. Probeer het later opnieuw of neem contact op met de beheerder.'
  }
  return 'Verbinding maken is niet gelukt — probeer het later opnieuw.'
}

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  if (!(await isTrueLayerEnabled(supabase))) {
    return NextResponse.json({ error: 'Bank Connect is niet ingeschakeld' }, { status: 503 })
  }

  try {
    const { provider_id, provider_name, provider_logo } = await req.json()

    if (!provider_id) {
      return NextResponse.json({ error: 'provider_id is vereist' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const redirectUri = `${appUrl}/api/bank-connect/callback`
    const state = `${user.id.slice(0, 8)}-${Date.now()}`

    // Create pending connection record. The actual tokens are filled in by
    // the OAuth callback (see app/api/bank-connect/callback/route.ts) which
    // writes the encrypted columns only. The pending row starts with an empty
    // encrypted token; the plaintext access_token column is no longer written
    // (its NOT NULL constraint is dropped by
    // supabase/migrations/*_bank_connections_access_token_drop_notnull.sql,
    // which MUST be applied to remote before this code deploys — see runbook).
    const { data: connection, error: dbError } = await supabase
      .from('bank_connections')
      .insert({
        user_id: user.id,
        provider_id,
        provider_name: provider_name || provider_id,
        provider_logo: provider_logo || null,
        access_token_encrypted: encryptField(''),
        status: 'pending',
      })
      .select('id')
      .single()

    if (dbError || !connection) {
      console.error('Failed to store connection:', dbError)
      return NextResponse.json({ error: 'Kon verbinding niet opslaan' }, { status: 500 })
    }

    // Encode connection ID in state for callback lookup
    const fullState = `${connection.id}:${state}`
    const authUrl = await buildAuthLink(supabase, redirectUri, fullState, provider_id)

    return NextResponse.json({ auth_url: authUrl })
  } catch (err) {
    console.error('TrueLayer auth-link error:', err)
    return NextResponse.json(
      { error: toDutchAuthLinkError(err) },
      { status: 500 }
    )
  }
}
