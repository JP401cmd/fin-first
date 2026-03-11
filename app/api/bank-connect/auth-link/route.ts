import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isTrueLayerEnabled } from '@/lib/truelayer/feature-flag'
import { buildAuthLink } from '@/lib/truelayer/client'

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    // Create pending connection record
    const { data: connection, error: dbError } = await supabase
      .from('bank_connections')
      .insert({
        user_id: user.id,
        provider_id,
        provider_name: provider_name || provider_id,
        provider_logo: provider_logo || null,
        access_token: '', // Will be filled after OAuth callback
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
      { error: err instanceof Error ? err.message : 'Verbinding maken mislukt' },
      { status: 500 }
    )
  }
}
