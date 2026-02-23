import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isGoCardlessEnabled } from '@/lib/gocardless/feature-flag'
import { getAccessToken, getTransactions } from '@/lib/gocardless/client'
import { mapTransactions } from '@/lib/gocardless/mapper'
import { categorizeTransaction, type CategoryCorrection } from '@/lib/parsers/categorize'
import type { Budget } from '@/lib/budget-data'

export async function POST(req: Request) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!(await isGoCardlessEnabled(supabase))) {
    return NextResponse.json({ error: 'GoCardless is niet ingeschakeld' }, { status: 503 })
  }

  try {
    const { gc_account_id, date_from, date_to } = await req.json()

    if (!gc_account_id) {
      return NextResponse.json({ error: 'gc_account_id is vereist' }, { status: 400 })
    }

    // Fetch the gc_account record
    const { data: gcAccount } = await supabase
      .from('gocardless_accounts')
      .select('*, gocardless_requisitions(*)')
      .eq('id', gc_account_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!gcAccount) {
      return NextResponse.json({ error: 'Account niet gevonden' }, { status: 404 })
    }

    // Rate limit check
    const today = new Date().toISOString().split('T')[0]
    let dailyRequests = gcAccount.daily_requests || 0

    if (gcAccount.rate_limit_reset_date !== today) {
      dailyRequests = 0
    }

    if (dailyRequests >= 10) {
      // Log rate limit
      await supabase.from('gocardless_sync_log').insert({
        user_id: user.id,
        gc_account_id,
        sync_type: 'transactions',
        status: 'rate_limited',
        error_message: 'Daglimiet van 10 verzoeken bereikt',
      })

      return NextResponse.json({
        error: 'Daglimiet bereikt (10 verzoeken per dag per account)',
        daily_requests: dailyRequests,
      }, { status: 429 })
    }

    // Determine date range
    const syncFrom = date_from || gcAccount.sync_cursor || undefined
    const syncTo = date_to || undefined

    // Fetch transactions from GoCardless
    const token = await getAccessToken(supabase)
    const gcTransactions = await getTransactions(supabase, token, gcAccount.gc_account_id, syncFrom, syncTo)
    const booked = gcTransactions.transactions.booked || []

    // Map to ParsedTransaction
    const parsed = await mapTransactions(booked)

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
          (corrections ?? []) as CategoryCorrection[]
        )

        return {
          user_id: user.id,
          account_id: gcAccount.bank_account_id,
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
          category_source: cat.budget_id ? 'rule' as const : 'import' as const,
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

    // Update sync cursor to latest booking date
    let latestDate = gcAccount.sync_cursor
    for (const tx of booked) {
      if (!latestDate || tx.bookingDate > latestDate) {
        latestDate = tx.bookingDate
      }
    }

    // Update gc_account
    await supabase
      .from('gocardless_accounts')
      .update({
        last_synced_at: new Date().toISOString(),
        sync_cursor: latestDate,
        daily_requests: dailyRequests + 1,
        rate_limit_reset_date: today,
      })
      .eq('id', gc_account_id)

    // Log sync
    await supabase.from('gocardless_sync_log').insert({
      user_id: user.id,
      gc_account_id,
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
    console.error('GoCardless sync error:', err)

    // Try to log error
    try {
      const body = await req.clone().json().catch(() => ({}))
      if (body.gc_account_id) {
        await supabase.from('gocardless_sync_log').insert({
          user_id: user.id,
          gc_account_id: body.gc_account_id,
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
