import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAccessToken, getRequisition, getAccountDetails } from '@/lib/gocardless/client'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { searchParams } = new URL(req.url)
  const reference = searchParams.get('ref')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  if (!reference) {
    return NextResponse.redirect(`${appUrl}/core/cash/connect?error=missing_reference`)
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${appUrl}/login`)
  }

  try {
    // Find the requisition by reference pattern (reference contains user ID fragment)
    const { data: reqRow } = await supabase
      .from('gocardless_requisitions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!reqRow) {
      return NextResponse.redirect(`${appUrl}/core/cash/connect?error=requisition_not_found`)
    }

    const token = await getAccessToken(supabase)
    const gcRequisition = await getRequisition(supabase, token, reqRow.requisition_id)

    if (gcRequisition.status !== 'LN') {
      // Not linked — update status to error
      await supabase
        .from('gocardless_requisitions')
        .update({ status: 'error', updated_at: new Date().toISOString() })
        .eq('id', reqRow.id)

      return NextResponse.redirect(`${appUrl}/core/cash/connect?error=not_authorized&status=${gcRequisition.status}`)
    }

    // Set authorized + expiry
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000) // +90 days

    await supabase
      .from('gocardless_requisitions')
      .update({
        status: 'linked',
        authorized_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', reqRow.id)

    // Process each account
    for (const gcAccountId of gcRequisition.accounts) {
      let accountDetail: { iban: string; owner_name: string } | null = null
      try {
        const detail = await getAccountDetails(supabase, token, gcAccountId)
        accountDetail = { iban: detail.iban, owner_name: detail.owner_name }
      } catch {
        // Some sandbox accounts don't have details
      }

      const iban = accountDetail?.iban ?? null

      // Find or create a matching bank_account
      let bankAccountId: string | null = null

      if (iban) {
        // Try to match existing bank account by IBAN
        const { data: existing } = await supabase
          .from('bank_accounts')
          .select('id')
          .eq('user_id', user.id)
          .eq('iban', iban)
          .eq('is_active', true)
          .limit(1)
          .single()

        if (existing) {
          bankAccountId = existing.id
        }
      }

      if (!bankAccountId) {
        // Create a linked asset record first (cash-as-asset)
        const accountName = iban ? `${reqRow.institution_name} ${iban.slice(-4)}` : reqRow.institution_name
        const { data: newAsset } = await supabase
          .from('assets')
          .insert({
            user_id: user.id,
            name: accountName,
            asset_type: 'cash',
            current_value: 0,
            purchase_value: 0,
            expected_return: 0,
            monthly_contribution: 0,
            institution: reqRow.institution_name,
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

        // Create the bank account linked to the asset
        const { data: newAccount } = await supabase
          .from('bank_accounts')
          .insert({
            user_id: user.id,
            name: accountName,
            iban,
            bank_name: reqRow.institution_name,
            account_type: 'checking',
            balance: 0,
            sort_order: 0,
            linked_asset_id: newAsset?.id ?? null,
          })
          .select('id')
          .single()

        bankAccountId = newAccount?.id ?? null
      }

      // Check if gc_account already exists (re-authorization)
      const { data: existingGcAccount } = await supabase
        .from('gocardless_accounts')
        .select('id')
        .eq('gc_account_id', gcAccountId)
        .single()

      if (existingGcAccount) {
        // Update existing gc_account with new requisition
        await supabase
          .from('gocardless_accounts')
          .update({
            requisition_id: reqRow.id,
            bank_account_id: bankAccountId,
            iban,
            is_active: true,
          })
          .eq('id', existingGcAccount.id)
      } else {
        // Create new gc_account
        await supabase
          .from('gocardless_accounts')
          .insert({
            user_id: user.id,
            requisition_id: reqRow.id,
            bank_account_id: bankAccountId,
            gc_account_id: gcAccountId,
            iban,
          })
      }
    }

    return NextResponse.redirect(`${appUrl}/core/cash/connect/success`)
  } catch (err) {
    console.error('GoCardless callback error:', err)
    return NextResponse.redirect(`${appUrl}/core/cash/connect?error=callback_failed`)
  }
}
