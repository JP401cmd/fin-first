import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'
import { isTrueLayerEnabled } from '@/lib/truelayer/feature-flag'
import { getBaseUrls, refreshAccessToken } from '@/lib/truelayer/client'
import { syncAccountBalance } from '@/lib/truelayer/balance-sync'
import { decryptField, encryptField } from '@/lib/crypto/field-encryption'

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

    // Encrypted-only read: decrypt the *_encrypted columns, no plaintext
    // fallback. Rows must be backfilled before this deploys — see runbook.
    let accessToken: string | null = decryptField(connection.access_token_encrypted ?? null)
    const refreshToken: string | null = decryptField(connection.refresh_token_encrypted ?? null)
    const tokenExpiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null

    if (tokenExpiresAt && tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
      if (!refreshToken) {
        return NextResponse.json({ error: 'Token verlopen, verbind opnieuw' }, { status: 401 })
      }

      const newTokens = await refreshAccessToken(supabase, refreshToken)
      accessToken = newTokens.access_token
      const nextRefreshToken = newTokens.refresh_token ?? refreshToken

      // Encrypted-only write of the refreshed tokens.
      await supabase
        .from('bank_connections')
        .update({
          access_token_encrypted: encryptField(newTokens.access_token),
          refresh_token_encrypted: encryptField(nextRefreshToken),
          token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', connection.id)
    }

    if (!accessToken) {
      // Encrypted token missing/undecryptable and not refreshable — force reconnect.
      return NextResponse.json({ error: 'Token verlopen, verbind opnieuw' }, { status: 401 })
    }

    const { dataUrl } = await getBaseUrls(supabase)

    // Ophalen + wegschrijven (bank_accounts.balance + gekoppelde cash-asset)
    // leeft in de gedeelde helper, zodat de sync-route exact hetzelfde doet.
    const { balances, synced } = await syncAccountBalance(supabase, {
      accessToken,
      dataUrl,
      externalAccountId: connAccount.external_account_id,
      bankAccountId: connAccount.bank_account_id,
    })

    if (synced) {
      return NextResponse.json({ balance: synced.balance, currency: synced.currency })
    }

    return NextResponse.json({ balance: null, balances })
  } catch (err) {
    return serverError(err, 'bankconnect-balances:POST')
  }
}
