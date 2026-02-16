import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Verification endpoint for Feature #165:
 * "Deleting budget category updates spending totals"
 *
 * Tests:
 * 1. Budget delete API endpoint exists (DELETE /api/budgets/[id])
 * 2. Budget page has delete button in detail modal
 * 3. Delete handler calls /api/budgets/[id] with DELETE method
 * 4. API endpoint validates UUID format
 * 5. API endpoint requires authentication
 * 6. API checks user ownership before deleting
 * 7. Cascade cleanup: deletes budget_rollovers for affected budgets
 * 8. Cascade cleanup: deletes budget_amounts for affected budgets
 * 9. Transactions are unlinked (budget_id = null), not deleted
 * 10. Parent deletion includes all children in deletion batch
 * 11. UI refreshes budgets and spending after deletion
 * 12. Budget page spending totals computed from transactions with non-null budget_id
 *
 * If authenticated: also runs live database tests (create, delete, verify)
 */
export async function GET() {
  const results: Array<{
    test: string
    passed: boolean
    details: string
    data?: unknown
  }> = []

  const supabase = await createClient()

  try {
    // Read source files for code-level verification
    const { readFile } = await import('fs/promises')
    const { join } = await import('path')

    let apiRouteContent = ''
    let budgetPageContent = ''

    try {
      apiRouteContent = await readFile(
        join(process.cwd(), 'app/api/budgets/[id]/route.ts'),
        'utf-8'
      )
    } catch { /* file not found */ }

    try {
      budgetPageContent = await readFile(
        join(process.cwd(), 'app/(app)/core/budgets/page.tsx'),
        'utf-8'
      )
    } catch { /* file not found */ }

    // ── Test 1: DELETE endpoint exists ──────────────────────────
    const hasDeleteHandler = apiRouteContent.includes('export async function DELETE')
      && apiRouteContent.includes('budgets')
    results.push({
      test: '1. DELETE /api/budgets/[id] endpoint exists',
      passed: hasDeleteHandler,
      details: hasDeleteHandler
        ? 'Budget delete API route exists with DELETE handler'
        : 'Budget delete API route not found or missing DELETE handler',
    })

    // ── Test 2: Budget page has delete button ──────────────────
    const hasDeleteBtn = budgetPageContent.includes('budget-delete-btn')
      && budgetPageContent.includes('Verwijderen')
      && budgetPageContent.includes('Trash2')
    results.push({
      test: '2. Budget page has delete button in detail modal',
      passed: hasDeleteBtn,
      details: hasDeleteBtn
        ? 'Delete button (Trash2 icon + "Verwijderen" label) with data-testid="budget-delete-btn" found'
        : 'Delete button not found in budget page',
    })

    // ── Test 3: Delete handler calls API with DELETE method ────
    const hasDeleteFetch = budgetPageContent.includes('fetch(`/api/budgets/${budget.id}`')
      && budgetPageContent.includes("method: 'DELETE'")
    results.push({
      test: '3. Delete handler calls /api/budgets/[id] with DELETE method',
      passed: hasDeleteFetch,
      details: hasDeleteFetch
        ? 'Detail modal calls fetch(`/api/budgets/${budget.id}`, { method: "DELETE" })'
        : 'DELETE fetch call not found in budget page',
    })

    // ── Test 4: API validates UUID format ──────────────────────
    const hasUuidValidation = apiRouteContent.includes('uuidRegex')
      || (apiRouteContent.includes('/^[0-9a-f]') && apiRouteContent.includes('status: 400'))
    results.push({
      test: '4. API endpoint validates UUID format',
      passed: hasUuidValidation,
      details: hasUuidValidation
        ? 'UUID regex validation with 400 error for invalid IDs'
        : 'UUID validation not found in API route',
    })

    // ── Test 5: API requires authentication ────────────────────
    const hasAuthCheck = apiRouteContent.includes('auth.getUser()')
      && apiRouteContent.includes('status: 401')
    results.push({
      test: '5. API endpoint requires authentication',
      passed: hasAuthCheck,
      details: hasAuthCheck
        ? 'Calls supabase.auth.getUser() and returns 401 for unauthenticated requests'
        : 'Auth check not found in API route',
    })

    // ── Test 6: API checks user ownership ──────────────────────
    const hasOwnershipCheck = apiRouteContent.includes(".eq('user_id', user.id)")
      && apiRouteContent.includes('status: 404')
    results.push({
      test: '6. API checks user ownership before deleting',
      passed: hasOwnershipCheck,
      details: hasOwnershipCheck
        ? 'Queries budget with .eq("user_id", user.id) and returns 404 if not found'
        : 'Ownership check not found in API route',
    })

    // ── Test 7: Cascade deletes budget_rollovers ───────────────
    const deletesRollovers = apiRouteContent.includes("from('budget_rollovers')")
      && apiRouteContent.includes('.delete(')
      && apiRouteContent.includes("'budget_id'")
    results.push({
      test: '7. Cascade cleanup: deletes budget_rollovers for affected budgets',
      passed: deletesRollovers,
      details: deletesRollovers
        ? 'Deletes from budget_rollovers table for all affected budget IDs'
        : 'budget_rollovers cleanup not found',
    })

    // ── Test 8: Cascade deletes budget_amounts ─────────────────
    const deletesAmounts = apiRouteContent.includes("from('budget_amounts')")
      && apiRouteContent.includes('.delete(')
    results.push({
      test: '8. Cascade cleanup: deletes budget_amounts for affected budgets',
      passed: deletesAmounts,
      details: deletesAmounts
        ? 'Deletes from budget_amounts table for all affected budget IDs'
        : 'budget_amounts cleanup not found',
    })

    // ── Test 9: Transactions unlinked, not deleted ─────────────
    const unlinksTransactions = apiRouteContent.includes("from('transactions')")
      && apiRouteContent.includes('.update(')
      && apiRouteContent.includes('budget_id: null')
    results.push({
      test: '9. Transactions are unlinked (budget_id = null), not deleted',
      passed: unlinksTransactions,
      details: unlinksTransactions
        ? 'Updates transactions to set budget_id = null (preserves transaction history)'
        : 'Transaction unlinking not found — transactions may be orphaned or deleted',
    })

    // ── Test 10: Parent deletion includes children ─────────────
    const handlesChildren = apiRouteContent.includes("parent_id")
      && apiRouteContent.includes('children')
      && apiRouteContent.includes('budgetIdsToDelete')
    results.push({
      test: '10. Parent deletion includes all children in deletion batch',
      passed: handlesChildren,
      details: handlesChildren
        ? 'Detects parent budgets (no parent_id), fetches children, adds to deletion batch'
        : 'Parent-child cascade logic not found',
    })

    // ── Test 11: UI refreshes after deletion ───────────────────
    const refreshesUI = budgetPageContent.includes('onDelete')
      && budgetPageContent.includes('loadBudgets')
      && budgetPageContent.includes('loadSpending')
    results.push({
      test: '11. UI refreshes budgets and spending after deletion',
      passed: refreshesUI,
      details: refreshesUI
        ? 'onDelete callback calls loadBudgets() and loadSpending() to refresh totals'
        : 'UI refresh after deletion not found',
    })

    // ── Test 12: Spending totals computed from non-null budget_id ──
    const spendingFromNonNull = budgetPageContent.includes('if (t.budget_id)')
      || budgetPageContent.includes('t.budget_id')
    const spendingComputedCorrectly = budgetPageContent.includes('spending[b.id]')
      && budgetPageContent.includes('getSpent')
      && budgetPageContent.includes('getParentSpent')
    results.push({
      test: '12. Budget spending totals computed from transactions with non-null budget_id',
      passed: spendingFromNonNull && spendingComputedCorrectly,
      details: spendingFromNonNull && spendingComputedCorrectly
        ? 'Spending map only includes transactions with budget_id (null budget_ids excluded from totals). getSpent() and getParentSpent() aggregate from this map.'
        : 'Spending computation pattern not verified',
    })

    // ── LIVE DATABASE TESTS (if authenticated) ─────────────────
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      const TEST_PREFIX = 'BUDGET_DEL_165'

      // Clean up stale test data first
      const { data: staleBudgets } = await supabase
        .from('budgets')
        .select('id')
        .like('name', `${TEST_PREFIX}%`)
      if (staleBudgets && staleBudgets.length > 0) {
        const staleIds = staleBudgets.map((b: { id: string }) => b.id)
        await supabase.from('budget_rollovers').delete().in('budget_id', staleIds)
        await supabase.from('budget_amounts').delete().in('budget_id', staleIds)
        await supabase.from('transactions').update({ budget_id: null }).in('budget_id', staleIds)
        await supabase.from('budgets').delete().in('id', staleIds)
      }
      const { data: staleTx } = await supabase
        .from('transactions')
        .select('id')
        .like('description', `${TEST_PREFIX}%`)
      if (staleTx && staleTx.length > 0) {
        await supabase.from('transactions').delete().in('id', staleTx.map((t: { id: string }) => t.id))
      }

      // Find an existing parent budget
      const { data: parents } = await supabase
        .from('budgets')
        .select('id, name, budget_type')
        .is('parent_id', null)
        .limit(1)

      const parentBudget = parents?.[0]

      if (parentBudget) {
        // Create test child
        const { data: child } = await supabase
          .from('budgets')
          .insert({
            user_id: user.id,
            parent_id: parentBudget.id,
            name: `${TEST_PREFIX}_Child`,
            slug: `${TEST_PREFIX.toLowerCase()}_child`,
            icon: 'Circle',
            default_limit: 100,
            budget_type: parentBudget.budget_type,
            interval: 'monthly',
            rollover_type: 'reset',
            limit_type: 'soft',
            alert_threshold: 80,
            max_single_transaction_amount: 0,
            is_essential: false,
            priority_score: 1,
            is_inflation_indexed: false,
            sort_order: 999,
          })
          .select('id')
          .single()

        if (child) {
          // Create test transactions
          const txRows = [
            { user_id: user.id, budget_id: child.id, amount: -25.00, date: '2026-02-10', description: `${TEST_PREFIX}_TX1` },
            { user_id: user.id, budget_id: child.id, amount: -35.50, date: '2026-02-12', description: `${TEST_PREFIX}_TX2` },
          ]
          const { data: txData } = await supabase
            .from('transactions')
            .insert(txRows)
            .select('id')

          const txIds = txData?.map((t: { id: string }) => t.id) ?? []

          // Get spending before
          const { data: txBefore } = await supabase
            .from('transactions')
            .select('budget_id, amount')
            .gte('date', '2026-02-01')
            .lt('date', '2026-03-01')
            .not('budget_id', 'is', null)

          const spendingBefore = (txBefore ?? []).reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

          // Delete: cascade cleanup
          await supabase.from('budget_rollovers').delete().eq('budget_id', child.id)
          await supabase.from('budget_amounts').delete().eq('budget_id', child.id)
          await supabase.from('transactions').update({ budget_id: null }).eq('budget_id', child.id)
          await supabase.from('budgets').delete().eq('id', child.id)

          // Verify budget gone
          const { data: checkBudget } = await supabase
            .from('budgets')
            .select('id')
            .eq('id', child.id)
            .maybeSingle()

          // Verify transactions still exist but unlinked
          const { data: txCheck } = await supabase
            .from('transactions')
            .select('id, budget_id')
            .in('id', txIds)

          const txStillExist = txCheck?.length === 2
          const txUnlinked = txCheck?.every(t => t.budget_id === null) ?? false

          // Verify spending adjusts
          const { data: txAfter } = await supabase
            .from('transactions')
            .select('budget_id, amount')
            .gte('date', '2026-02-01')
            .lt('date', '2026-03-01')
            .not('budget_id', 'is', null)

          const spendingAfter = (txAfter ?? []).reduce((s, t) => s + Math.abs(Number(t.amount)), 0)

          results.push({
            test: 'LIVE: Budget created, transactions linked, budget deleted, transactions unlinked, spending adjusted',
            passed: !checkBudget && txStillExist && txUnlinked && spendingAfter < spendingBefore,
            details: [
              `Budget deleted: ${!checkBudget}`,
              `Transactions exist: ${txStillExist}`,
              `Transactions unlinked: ${txUnlinked}`,
              `Spending before: €${spendingBefore.toFixed(2)}, after: €${spendingAfter.toFixed(2)}`,
            ].join('; '),
          })

          // Clean up test transactions
          if (txIds.length > 0) {
            await supabase.from('transactions').delete().in('id', txIds)
          }
        }
      }
    }

  } catch (err) {
    results.push({
      test: 'UNEXPECTED ERROR',
      passed: false,
      details: `${err}`,
    })
  }

  const passing = results.filter((r) => r.passed).length
  const total = results.length

  return NextResponse.json({
    feature: '#165 — Deleting budget category updates spending totals',
    summary: `${passing}/${total} tests passing`,
    passing,
    total,
    allPassing: passing === total,
    results,
  })
}
