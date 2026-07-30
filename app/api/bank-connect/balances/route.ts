import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { notFound, unauthorized, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { isTrueLayerEnabled } from '@/lib/truelayer/feature-flag'
import { getBaseUrls, refreshAccessToken } from '@/lib/truelayer/client'
import { syncAccountBalance } from '@/lib/truelayer/balance-sync'
import { RELINK_REQUIRED_MESSAGE } from '@/lib/truelayer/errors'
import { decryptField, encryptField } from '@/lib/crypto/field-encryption'

const BalancesSchema = z.object({
  /** De gekoppelde bankrekening waarvan het saldo ververst moet worden. */
  connection_account_id: z.string().uuid('ongeldige koppeling'),
})

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  if (!(await isTrueLayerEnabled(supabase))) {
    return NextResponse.json({ error: 'Bank Connect is niet ingeschakeld' }, { status: 503 })
  }

  // Zod op de body: deze handler kwam er in fase 8 toch al langs, en dat is
  // precies het moment waarop de mutatieroute-conventie (ADR 0044) om validatie
  // vraagt. Buiten de try, want `parseBody` levert zelf al een client-veilige 400.
  const parsed = await parseBody(BalancesSchema, req)
  if (!parsed.ok) return parsed.response
  const { connection_account_id } = parsed.data

  try {
    const { data: connAccount } = await supabase
      .from('bank_connection_accounts')
      .select('*, bank_connections(*)')
      .eq('id', connection_account_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!connAccount) {
      return notFound('Account niet gevonden')
    }

    const connection = connAccount.bank_connections

    // Encrypted-only read: decrypt the *_encrypted columns, no plaintext
    // fallback. Rows must be backfilled before this deploys — see runbook.
    let accessToken: string | null = decryptField(connection.access_token_encrypted ?? null)
    const refreshToken: string | null = decryptField(connection.refresh_token_encrypted ?? null)
    const tokenExpiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null

    if (tokenExpiresAt && tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
      if (!refreshToken) {
        return NextResponse.json({ error: RELINK_REQUIRED_MESSAGE }, { status: 401 })
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
      return NextResponse.json({ error: RELINK_REQUIRED_MESSAGE }, { status: 401 })
    }

    const { dataUrl } = await getBaseUrls(supabase)

    // Ophalen + wegschrijven (bank_accounts.balance + gekoppelde cash-asset)
    // leeft in de gedeelde helper, zodat de sync-route exact hetzelfde doet.
    const { balances, synced } = await syncAccountBalance(supabase, {
      accessToken,
      dataUrl,
      externalAccountId: connAccount.external_account_id,
      bankAccountId: connAccount.bank_account_id,
      userId: user.id,
    })

    if (synced) {
      return NextResponse.json({
        balance: synced.balance,
        currency: synced.currency,
        // Fase 8, additief: de waarde die het cash-bezit vóór deze verversing
        // droeg en of er een herwaardering is weggeschreven. Bestaande lezers
        // van `balance`/`currency` blijven werken.
        balance_previous: synced.previous,
        balance_revalued: synced.revalued,
      })
    }

    return NextResponse.json({ balance: null, balances })
  } catch (err) {
    return serverError(err, 'bankconnect-balances:POST')
  }
}
