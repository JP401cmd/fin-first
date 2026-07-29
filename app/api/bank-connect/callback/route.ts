import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCode, getAccounts, getBaseUrls } from '@/lib/truelayer/client'
import { blindIndex, encryptField } from '@/lib/crypto/field-encryption'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/core/cash/connect?error=missing_code`)
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${appUrl}/login`)
  }

  try {
    // Extract connection ID from state
    const connectionId = state.split(':')[0]

    const { data: connection } = await supabase
      .from('bank_connections')
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .single()

    if (!connection) {
      return NextResponse.redirect(`${appUrl}/core/cash/connect?error=connection_not_found`)
    }

    const redirectUri = `${appUrl}/api/bank-connect/callback`

    // Exchange code for tokens
    const tokens = await exchangeCode(supabase, code, redirectUri)

    // Update connection with tokens
    const now = new Date()
    const tokenExpiresAt = new Date(now.getTime() + tokens.expires_in * 1000)

    // Encrypted-only write (Stage A / PR2): tokens live solely in the
    // *_encrypted columns. The plaintext access_token/refresh_token columns are
    // no longer written and are dropped by a follow-up migration
    // (see supabase/migrations/*_drop_plaintext_bank_tokens.sql).
    await supabase
      .from('bank_connections')
      .update({
        access_token_encrypted: encryptField(tokens.access_token),
        refresh_token_encrypted: encryptField(tokens.refresh_token ?? null),
        token_expires_at: tokenExpiresAt.toISOString(),
        status: 'active',
        authorized_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', connection.id)

    // Fetch accounts from TrueLayer
    const { dataUrl } = await getBaseUrls(supabase)
    const tlAccounts = await getAccounts(tokens.access_token, dataUrl)

    // Process each account
    for (const tlAccount of tlAccounts) {
      const iban = tlAccount.account_number?.iban ?? null
      const accountName = tlAccount.display_name || connection.provider_name

      // ── Stap 1: identiteit vóór aanmaak ────────────────────────────────────
      // `external_account_id` is de stabiele identiteit van een rekening bij de
      // bank en overleeft een herautorisatie (elke 90 dagen!) én een reconnect na
      // "Verbreken". Deze lookup stond eerder ONDER de aanmaak van bank_accounts,
      // waardoor elke nieuwe koppeling eerst een tweede bankrekening + tweede
      // cash-asset aanmaakte en het saldo daarna dubbel in het vermogen telde.
      // Bewust GEEN filter op is_active: een reconnect na een soft disconnect moet
      // de bestaande rij hergebruiken en heractiveren, niet dupliceren.
      const { data: existingLink } = await supabase
        .from('bank_connection_accounts')
        .select('id, bank_account_id')
        .eq('user_id', user.id)
        .eq('external_account_id', tlAccount.account_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      // Find or create a matching bank_account
      let bankAccountId: string | null = existingLink?.bank_account_id ?? null

      // ── Stap 2: IBAN-fallback ──────────────────────────────────────────────
      // Alleen nodig als er nog geen koppeling bestond (eerste keer koppelen op
      // een handmatig aangemaakte rekening).
      if (!bankAccountId && iban) {
        // Look up existing bank_account by IBAN. We use the blind index so
        // this keeps working once the plaintext `iban` column is dropped in
        // PR2. Existing rows that haven't been backfilled yet have a NULL
        // iban_hash and would silently miss — the backfill script
        // (scripts/encrypt-existing-bank-credentials.mjs) populates iban_hash
        // for every existing row before we deploy this code path to prod.
        //
        // maybeSingle() i.p.v. single(): single() gooit óók bij méér dan één
        // treffer, en die fout landde in de "maak een nieuwe aan"-tak — precies
        // het gedrag dat bestaande duplicaten liet dóórgroeien. Oudste eerst,
        // zodat we deterministisch op de rij mét historie uitkomen.
        const ibanHash = blindIndex(iban)
        const { data: existing } = await supabase
          .from('bank_accounts')
          .select('id')
          .eq('user_id', user.id)
          .eq('iban_hash', ibanHash)
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()

        bankAccountId = existing?.id ?? null
      }

      // ── Stap 2b: cash-as-asset backfill voor hergebruikte rekeningen ───────
      // Nieuw aangemaakte rekeningen krijgen hun asset hieronder (of via de
      // trigger fn_auto_link_bank_account_asset); alleen bestaande rijen van vóór
      // cash-as-asset kunnen nog zonder zitten.
      if (bankAccountId) {
        const { data: reused } = await supabase
          .from('bank_accounts')
          .select('id, linked_asset_id, iban')
          .eq('id', bankAccountId)
          .maybeSingle()

        if (reused && !reused.linked_asset_id) {
          const assetIban = iban ?? reused.iban ?? null
          const assetName = assetIban
            ? `${connection.provider_name} ${assetIban.slice(-4)}`
            : connection.provider_name
          const { data: backfillAsset } = await supabase
            .from('assets')
            .insert({
              user_id: user.id,
              name: assetName,
              asset_type: 'cash',
              current_value: 0,
              purchase_value: 0,
              expected_return: 0,
              monthly_contribution: 0,
              institution: connection.provider_name,
              // Dual-write: plaintext for fallback + encrypted/hash for the
              // post-PR2 world where the plaintext column is gone.
              account_number: assetIban,
              account_number_encrypted: encryptField(assetIban),
              account_number_hash: assetIban ? blindIndex(assetIban) : null,
              is_liquid: true,
              subtype: 'checking',
              has_budget_tracking: true,
              ownership: 'personal',
              net_worth_inclusion_pct: 100,
              is_active: true,
            })
            .select('id')
            .single()

          if (backfillAsset) {
            await supabase
              .from('bank_accounts')
              .update({ linked_asset_id: backfillAsset.id })
              .eq('id', bankAccountId)
          }
        }
      }

      // ── Stap 3: pas nu aanmaken ────────────────────────────────────────────
      if (!bankAccountId) {
        // Create linked asset (cash-as-asset)
        const assetName = iban ? `${connection.provider_name} ${iban.slice(-4)}` : connection.provider_name
        // Both encrypt + index helpers tolerate null inputs (return null), so
        // we can pass `iban` directly even when this TrueLayer account has no
        // IBAN at all.
        const { data: newAsset } = await supabase
          .from('assets')
          .insert({
            user_id: user.id,
            name: assetName,
            asset_type: 'cash',
            current_value: 0,
            purchase_value: 0,
            expected_return: 0,
            monthly_contribution: 0,
            institution: connection.provider_name,
            account_number: iban,
            account_number_encrypted: encryptField(iban),
            account_number_hash: iban ? blindIndex(iban) : null,
            is_liquid: true,
            subtype: 'checking',
            has_budget_tracking: true,
            ownership: 'personal',
            net_worth_inclusion_pct: 100,
            is_active: true,
          })
          .select('id')
          .single()

        // Create bank account linked to asset
        const { data: newAccount } = await supabase
          .from('bank_accounts')
          .insert({
            user_id: user.id,
            name: assetName,
            iban,
            iban_encrypted: encryptField(iban),
            iban_hash: iban ? blindIndex(iban) : null,
            bank_name: connection.provider_name,
            account_type: 'checking',
            balance: 0,
            sort_order: 0,
            linked_asset_id: newAsset?.id ?? null,
          })
          .select('id')
          .single()

        bankAccountId = newAccount?.id ?? null
      }

      // ── Stap 4: koppeling bijwerken of aanmaken ────────────────────────────
      // `existingLink` komt uit stap 1 — bewust niet opnieuw opgehaald, zodat
      // "welke rij hergebruiken we" op één plek beslist wordt.
      if (existingLink) {
        await supabase
          .from('bank_connection_accounts')
          .update({
            connection_id: connection.id,
            bank_account_id: bankAccountId,
            iban,
            iban_encrypted: encryptField(iban),
            iban_hash: iban ? blindIndex(iban) : null,
            account_name: accountName,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingLink.id)
      } else {
        await supabase
          .from('bank_connection_accounts')
          .insert({
            user_id: user.id,
            connection_id: connection.id,
            bank_account_id: bankAccountId,
            external_account_id: tlAccount.account_id,
            iban,
            iban_encrypted: encryptField(iban),
            iban_hash: iban ? blindIndex(iban) : null,
            account_name: accountName,
          })
      }
    }

    // ── Stap 5: verweesde verbindingen opruimen ───────────────────────────────
    // Elke klik op "Verbind" maakt via /api/bank-connect/auth-link een `pending`
    // rij aan die niemand ooit opruimde — afgebroken pogingen stapelden zich op.
    // En na een herautorisatie blijft de vórige verbinding op 'active' staan met
    // een levend refresh token, terwijl al haar rekeningen hierboven naar de
    // nieuwe verbinding zijn verhangen.
    //
    // We ruimen daarom alle ándere verbindingen van deze gebruiker op die géén
    // enkele rekening meer dragen: die zijn per definitie verweesd. Verbindingen
    // die nog wél rekeningen hebben (bv. een andere bank) blijven ongemoeid.
    // Dode credentials gaan mee weg — een consent die we niet meer gebruiken
    // hoort geen bruikbaar token achter te laten.
    const { data: linkedConnections } = await supabase
      .from('bank_connection_accounts')
      .select('connection_id')
      .eq('user_id', user.id)

    const inUse = new Set(
      (linkedConnections ?? []).map((row) => row.connection_id as string),
    )
    inUse.add(connection.id)

    const { data: ownConnections } = await supabase
      .from('bank_connections')
      .select('id, status')
      .eq('user_id', user.id)

    const orphanIds = (ownConnections ?? [])
      .filter((c) => !inUse.has(c.id as string) && c.status !== 'expired' && c.status !== 'revoked')
      .map((c) => c.id as string)

    if (orphanIds.length > 0) {
      await supabase
        .from('bank_connections')
        .update({
          status: 'expired',
          access_token_encrypted: encryptField(''),
          refresh_token_encrypted: null,
          updated_at: new Date().toISOString(),
        })
        .in('id', orphanIds)
        .eq('user_id', user.id)
    }

    // Check if user has completed onboarding. If not, redirect back to
    // the onboarding flow instead of the in-app success page — the (app)
    // layout would redirect them anyway since it gates on onboarding_completed.
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .single()

    if (profile && !profile.onboarding_completed) {
      return NextResponse.redirect(`${appUrl}/onboarding?bank_connected=1`)
    }

    return NextResponse.redirect(`${appUrl}/core/cash/connect/success`)
  } catch (err) {
    console.error('TrueLayer callback error:', err)

    // If callback fails during onboarding, redirect back to onboarding
    // with an error param so the user can retry without hitting the (app)
    // layout gate.
    const { data: { user: errUser } } = await supabase.auth.getUser()
    if (errUser) {
      const { data: errProfile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', errUser.id)
        .single()
      if (errProfile && !errProfile.onboarding_completed) {
        return NextResponse.redirect(`${appUrl}/onboarding?bank_error=1`)
      }
    }

    return NextResponse.redirect(`${appUrl}/core/cash/connect?error=callback_failed`)
  }
}
