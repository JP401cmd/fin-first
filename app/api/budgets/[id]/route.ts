import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * DELETE /api/budgets/[id] — Delete a budget category with cascade cleanup.
 *
 * Steps:
 * 1. Verify authenticated user owns the budget
 * 2. If parent budget: delete all children first (cascade)
 * 3. For each budget being deleted:
 *    a. Delete budget_rollovers referencing the budget
 *    b. Delete budget_amounts referencing the budget
 *    c. Set transactions.budget_id = NULL for transactions referencing the budget
 *    d. Delete the budget itself
 * 4. Return summary of what was deleted
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(id)) {
    return NextResponse.json(
      { error: 'Ongeldig budget ID formaat' },
      { status: 400 }
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  try {
    // Fetch the budget to verify ownership
    const { data: budget, error: fetchError } = await supabase
      .from('budgets')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !budget) {
      return NextResponse.json(
        { error: 'Budget niet gevonden of geen toegang' },
        { status: 404 }
      )
    }

    // Collect all budget IDs to delete (including children if this is a parent)
    const budgetIdsToDelete: string[] = [id]
    let childCount = 0

    // If this is a parent budget (no parent_id), find and include all children
    if (!budget.parent_id) {
      const { data: children } = await supabase
        .from('budgets')
        .select('id')
        .eq('parent_id', id)
        .eq('user_id', user.id)

      if (children && children.length > 0) {
        const childIds = children.map((c: { id: string }) => c.id)
        budgetIdsToDelete.push(...childIds)
        childCount = children.length
      }
    }

    // Track cleanup counts
    let rolloversDeleted = 0
    let amountsDeleted = 0
    let transactionsUnlinked = 0

    // Step 1: Delete budget_rollovers for all affected budgets
    const { count: rolloverCount } = await supabase
      .from('budget_rollovers')
      .delete({ count: 'exact' })
      .in('budget_id', budgetIdsToDelete)

    rolloversDeleted = rolloverCount ?? 0

    // Step 2: Delete budget_amounts for all affected budgets
    const { count: amountsCount } = await supabase
      .from('budget_amounts')
      .delete({ count: 'exact' })
      .in('budget_id', budgetIdsToDelete)

    amountsDeleted = amountsCount ?? 0

    // Step 3: Unlink transactions (set budget_id to NULL instead of deleting)
    // This preserves transaction history while removing the budget reference
    const { count: txCount } = await supabase
      .from('transactions')
      .update({ budget_id: null })
      .in('budget_id', budgetIdsToDelete)

    transactionsUnlinked = txCount ?? 0

    // Step 4: Delete child budgets first (if any)
    if (childCount > 0) {
      const childIds = budgetIdsToDelete.filter(bid => bid !== id)
      await supabase
        .from('budgets')
        .delete()
        .in('id', childIds)
    }

    // Step 5: Delete the budget itself
    const { error: deleteError } = await supabase
      .from('budgets')
      .delete()
      .eq('id', id)

    if (deleteError) {
      return NextResponse.json(
        // eslint-disable-next-line no-restricted-syntax -- rauwe error.message: zie [Arch F4] API-error-envelope
        { error: `Kon budget niet verwijderen: ${deleteError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      deleted: {
        budget_id: id,
        budget_name: budget.name,
        is_parent: !budget.parent_id,
        children_deleted: childCount,
        rollovers_deleted: rolloversDeleted,
        amounts_deleted: amountsDeleted,
        transactions_unlinked: transactionsUnlinked,
      },
    })
  } catch (err) {
    console.error('Error deleting budget:', err)
    return NextResponse.json(
      { error: 'Interne fout bij het verwijderen van het budget' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/budgets/[id] — Get a single budget by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { data: budget, error } = await supabase
    .from('budgets')
    .select('*')
    .eq('id', id)
    .eq('user_id', claims.sub)
    .single()

  if (error || !budget) {
    return NextResponse.json(
      { error: 'Budget niet gevonden' },
      { status: 404 }
    )
  }

  return NextResponse.json({ budget })
}
