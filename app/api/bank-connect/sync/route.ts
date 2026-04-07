import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isTrueLayerEnabled } from '@/lib/truelayer/feature-flag'
import { getBaseUrls, getAccountTransactions, refreshAccessToken } from '@/lib/truelayer/client'
import { mapTransactions } from '@/lib/truelayer/mapper'
import { categorizeTransaction, buildFrequencyMap, type CategoryCorrection } from '@/lib/parsers/categorize'
import { decryptField, encryptField } from '@/lib/crypto/field-encryption'
import type { Budget } from '@/lib/budget-data'

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
    const { connection_account_id, date_from, date_to } = await req.json()

    if (!connection_account_id) {
      return NextResponse.json({ error: 'connection_account_id is vereist' }, { status: 400 })
    }

    // Fetch the connection account with its parent connection
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

    // Rate limit check
    const today = new Date().toISOString().split('T')[0]
    let dailyRequests = connAccount.daily_requests || 0

    if (connAccount.rate_limit_reset_date !== today) {
      dailyRequests = 0
    }

    if (dailyRequests >= 10) {
      await supabase.from('bank_sync_log').insert({
        user_id: user.id,
        connection_account_id,
        sync_type: 'transactions',
        status: 'rate_limited',
        error_message: 'Daglimiet van 10 verzoeken bereikt',
      })

      return NextResponse.json({
        error: 'Daglimiet bereikt (10 verzoeken per dag per account)',
        daily_requests: dailyRequests,
      }, { status: 429 })
    }

    // Dual-read: prefer the encrypted column, fall back to plaintext for rows
    // that haven't been backfilled yet. Once PR2 drops the plaintext columns
    // the `?? connection.access_token` branches become dead code.
    let accessToken: string = decryptField(connection.access_token_encrypted ?? null) ?? connection.access_token
    const refreshTokenPlaintext: string | null =
      decryptField(connection.refresh_token_encrypted ?? null) ?? connection.refresh_token ?? null
    const tokenExpiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null

    if (tokenExpiresAt && tokenExpiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
      if (!refreshTokenPlaintext) {
        return NextResponse.json({ error: 'Token verlopen, verbind opnieuw' }, { status: 401 })
      }

      try {
        const newTokens = await refreshAccessToken(supabase, refreshTokenPlaintext)
        accessToken = newTokens.access_token
        const nextRefreshToken = newTokens.refresh_token ?? refreshTokenPlaintext

        // Dual-write the refreshed tokens so both columns stay in sync.
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
      } catch {
        await supabase
          .from('bank_connections')
          .update({ status: 'expired', updated_at: new Date().toISOString() })
          .eq('id', connection.id)

        return NextResponse.json({ error: 'Token verlopen, verbind opnieuw' }, { status: 401 })
      }
    }

    // Determine date range
    const syncFrom = date_from || connAccount.sync_cursor || undefined
    const syncTo = date_to || undefined

    // Fetch transactions from TrueLayer
    const { dataUrl } = await getBaseUrls(supabase)
    const tlTransactions = await getAccountTransactions(
      accessToken, dataUrl, connAccount.external_account_id, syncFrom, syncTo
    )

    // Map to ParsedTransaction
    const parsed = await mapTransactions(tlTransactions)

    // Load budgets + corrections for categorization
    const { data: budgets } = await supabase
      .from('budgets')
      .select('*')
      .order('sort_order', { ascending: true })

    const { data: corrections } = await supabase
      .from('category_corrections')
      .select('*')
      .eq('user_id', user.id)

    // Check existing hashes for dedup
    const hashes = parsed.map((p) => p.import_hash)
    const { data: existingHashes } = await supabase
      .from('transactions')
      .select('import_hash')
      .eq('user_id', user.id)
      .in('import_hash', hashes)

    const existingHashSet = new Set((existingHashes ?? []).map((r) => r.import_hash))

    // Filter out duplicates and prepare inserts
    const newTransactions = parsed.filter((p) => !existingHashSet.has(p.import_hash))
    const duplicateCount = parsed.length - newTransactions.length

    // Build frequency map for smart matching
    const freqMap = await buildFrequencyMap(user.id, supabase)

    // Categorize and batch insert
    const BATCH_SIZE = 50
    let insertedCount = 0

    for (let i = 0; i < newTransactions.length; i += BATCH_SIZE) {
      const batch = newTransactions.slice(i, i + BATCH_SIZE)

      const rows = batch.map((tx) => {
        const cat = categorizeTransaction(
          tx.description,
          tx.counterparty_name,
          tx.amount,
          (budgets ?? []) as Budget[],
          (corrections ?? []) as CategoryCorrection[],
          undefined,
          tx.counterparty_iban,
          freqMap,
        )

        return {
          user_id: user.id,
          account_id: connAccount.bank_account_id,
          date: tx.date,
          amount: tx.amount,
          description: tx.description,
          counterparty_name: tx.counterparty_name,
          counterparty_iban: tx.counterparty_iban,
          reference: tx.reference,
          transaction_type: tx.transaction_type,
          import_hash: tx.import_hash,
          is_income: tx.amount > 0,
          budget_id: cat.budget_id,
          category_source: cat.category_source ?? (cat.budget_id ? 'rule' : 'import'),
        }
      })

      const { error: insertError } = await supabase
        .from('transactions')
        .insert(rows)

      if (insertError) {
        console.error('Batch insert error:', insertError)
      } else {
        insertedCount += rows.length
      }
    }

    // Update sync cursor to latest date
    let latestDate = connAccount.sync_cursor
    for (const tx of tlTransactions) {
      const txDate = tx.timestamp.split('T')[0]
      if (!latestDate || txDate > latestDate) {
        latestDate = txDate
      }
    }

    // Update connection account
    await supabase
      .from('bank_connection_accounts')
      .update({
        last_synced_at: new Date().toISOString(),
        sync_cursor: latestDate,
        daily_requests: dailyRequests + 1,
        rate_limit_reset_date: today,
        updated_at: new Date().toISOString(),
      })
      .eq('id', connection_account_id)

    // Log sync
    await supabase.from('bank_sync_log').insert({
      user_id: user.id,
      connection_account_id,
      sync_type: 'transactions',
      status: 'success',
      transactions_new: insertedCount,
      transactions_dup: duplicateCount,
    })

    return NextResponse.json({
      new: insertedCount,
      duplicates: duplicateCount,
      daily_requests: dailyRequests + 1,
    })
  } catch (err) {
    console.error('TrueLayer sync error:', err)

    // Try to log error
    try {
      const body = await req.clone().json().catch(() => ({}))
      if (body.connection_account_id) {
        await supabase.from('bank_sync_log').insert({
          user_id: user.id,
          connection_account_id: body.connection_account_id,
          sync_type: 'transactions',
          status: 'error',
          error_message: err instanceof Error ? err.message : 'Onbekende fout',
        })
      }
    } catch {
      // Ignore logging errors
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Synchronisatie mislukt' },
      { status: 500 }
    )
  }
}
