import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { exchangeCode, getAccounts, getBaseUrls } from '@/lib/truelayer/client'

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

    await supabase
      .from('bank_connections')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
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

      // Find or create a matching bank_account
      let bankAccountId: string | null = null

      if (iban) {
        const { data: existing } = await supabase
          .from('bank_accounts')
          .select('id, linked_asset_id')
          .eq('user_id', user.id)
          .eq('iban', iban)
          .eq('is_active', true)
          .limit(1)
          .single()

        if (existing) {
          bankAccountId = existing.id

          // Cash-as-asset backfill for legacy bank accounts
          if (!existing.linked_asset_id) {
            const assetName = `${connection.provider_name} ${iban.slice(-4)}`
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
                account_number: iban,
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
                .eq('id', existing.id)
            }
          }
        }
      }

      if (!bankAccountId) {
        // Create linked asset (cash-as-asset)
        const assetName = iban ? `${connection.provider_name} ${iban.slice(-4)}` : connection.provider_name
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

      // Check if connection account already exists (re-authorization)
      const { data: existingAccount } = await supabase
        .from('bank_connection_accounts')
        .select('id')
        .eq('external_account_id', tlAccount.account_id)
        .eq('user_id', user.id)
        .single()

      if (existingAccount) {
        await supabase
          .from('bank_connection_accounts')
          .update({
            connection_id: connection.id,
            bank_account_id: bankAccountId,
            iban,
            account_name: accountName,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingAccount.id)
      } else {
        await supabase
          .from('bank_connection_accounts')
          .insert({
            user_id: user.id,
            connection_id: connection.id,
            bank_account_id: bankAccountId,
            external_account_id: tlAccount.account_id,
            iban,
            account_name: accountName,
          })
      }
    }

    return NextResponse.redirect(`${appUrl}/core/cash/connect/success`)
  } catch (err) {
    console.error('TrueLayer callback error:', err)
    return NextResponse.redirect(`${appUrl}/core/cash/connect?error=callback_failed`)
  }
}
