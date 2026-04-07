import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isTrueLayerEnabled } from '@/lib/truelayer/feature-flag'
import { getBaseUrls, getAccountBalance, refreshAccessToken } from '@/lib/truelayer/client'
import { decryptField, encryptField } from '@/lib/crypto/field-encryption'

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
    const { connection_account_id } = await req.json()

    if (!connection_account_id) {
      return NextResponse.json({ error: 'connection_account_id is vereist' }, { status: 400 })
    }

    const { data: connAccount } = await supabase
      .from('bank_connection_accounts')
      .select('*, bank_connections(*)')
      .eq('id', connection_account_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!connAccount) {
      return NextResponse.json({ error: 'Account niet gevonden' }, { status: 404 })
    }

    const connection = connAccount.bank_connections

    // Dual-read: prefer encrypted column, fall back to plaintext.
    let accessToken: string = decryptField(connection.access_token_encrypted ?? null) ?? connection.access_token
    const refreshTokenPlaintext: string | null =
      decryptField(connection.refresh_token_encrypted ?? null) ?? connection.refresh_token ?? null
    const tokenExpiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null

    if (tokenExpiresAt && tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
      if (!refreshTokenPlaintext) {
        return NextResponse.json({ error: 'Token verlopen, verbind opnieuw' }, { status: 401 })
      }

      const newTokens = await refreshAccessToken(supabase, refreshTokenPlaintext)
      accessToken = newTokens.access_token
      const nextRefreshToken = newTokens.refresh_token ?? refreshTokenPlaintext

      // Dual-write so both columns stay populated until PR2.
      await supabase
        .from('bank_connections')
        .update({
          access_token: newTokens.access_token,
          refresh_token: nextRefreshToken,
          access_token_encrypted: encryptField(newTokens.access_token),
          refresh_token_encrypted: encryptField(nextRefreshToken),
          token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id)
    }

    const { dataUrl } = await getBaseUrls(supabase)
    const balances = await getAccountBalance(accessToken, dataUrl, connAccount.external_account_id)

    const preferred = balances[0]

    if (preferred && connAccount.bank_account_id) {
      const balance = preferred.current

      await supabase
        .from('bank_accounts')
        .update({
          balance,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connAccount.bank_account_id)

      // Sync balance to linked asset (cash-as-asset)
      const { data: ba } = await supabase
        .from('bank_accounts')
        .select('linked_asset_id')
        .eq('id', connAccount.bank_account_id)
        .single()

      if (ba?.linked_asset_id) {
        await supabase
          .from('assets')
          .update({ current_value: balance, updated_at: new Date().toISOString() })
          .eq('id', ba.linked_asset_id)
      }

      return NextResponse.json({ balance, currency: preferred.currency })
    }

    return NextResponse.json({ balance: null, balances })
  } catch (err) {
    console.error('TrueLayer balances error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Saldo ophalen mislukt' },
      { status: 500 }
    )
  }
}
