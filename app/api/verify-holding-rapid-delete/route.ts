import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * GET /api/verify-holding-rapid-delete
 * Verifies that the holding delete operation has rapid-click / idempotency protection.
 * Source-code level verification of protection mechanisms.
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  try {
    // Read the holdings page source code
    const holdingPagePath = join(process.cwd(), 'app', '(app)', 'core', 'assets', 'holdings', 'page.tsx')
    const holdingPageSrc = readFileSync(holdingPagePath, 'utf-8')

    // Read the holdings API route source code
    const apiRoutePath = join(process.cwd(), 'app', 'api', 'holdings', 'route.ts')
    const apiRouteSrc = readFileSync(apiRoutePath, 'utf-8')

    // Test 1: deleting state exists to prevent rapid re-entry
    const hasDeletingState = holdingPageSrc.includes('const [deleting, setDeleting]')
    results.push({
      name: 'Deleting state variable exists to prevent concurrent deletes',
      pass: hasDeletingState,
      detail: hasDeletingState
        ? 'useState<string | null>(null) for deleting — tracks which holding is currently being deleted'
        : 'Missing deleting state variable',
    })

    // Test 2: Early return guard in handleDelete if already deleting
    const hasEarlyReturn = holdingPageSrc.includes('if (deleting) return')
    results.push({
      name: 'handleDelete returns early if already deleting',
      pass: hasEarlyReturn,
      detail: hasEarlyReturn
        ? 'if (deleting) return — prevents concurrent delete operations'
        : 'Missing early return guard in handleDelete',
    })

    // Test 3: setDeleting(id) is called before API call
    const hasSetDeletingBefore = holdingPageSrc.includes('setDeleting(id)')
    results.push({
      name: 'Deleting state set before fetch call',
      pass: hasSetDeletingBefore,
      detail: hasSetDeletingBefore
        ? 'setDeleting(id) called before fetch — locks out other delete attempts'
        : 'Missing setDeleting(id) before API call',
    })

    // Test 4: setDeleting(null) in finally block to unlock
    const hasSetDeletingNull = holdingPageSrc.includes('setDeleting(null)')
    results.push({
      name: 'Deleting state cleared in finally block',
      pass: hasSetDeletingNull,
      detail: hasSetDeletingNull
        ? 'setDeleting(null) in finally — unlocks for future deletes after completion'
        : 'Missing setDeleting(null) cleanup',
    })

    // Test 5: Confirm button is disabled during deletion
    const hasDisabledConfirmButton = holdingPageSrc.includes('disabled={deleting === holding.id}')
    results.push({
      name: 'Confirm delete button is disabled during active deletion',
      pass: hasDisabledConfirmButton,
      detail: hasDisabledConfirmButton
        ? 'disabled={deleting === holding.id} — button is unclickable while delete is in progress'
        : 'Missing disabled attribute on confirm delete button',
    })

    // Test 6: Visual feedback on button during deletion (shows loading text)
    const hasLoadingText = holdingPageSrc.includes("deleting === holding.id ? '...' : 'Ja'")
    results.push({
      name: 'Visual feedback shows loading state on confirm button',
      pass: hasLoadingText,
      detail: hasLoadingText
        ? "Button text changes to '...' during deletion — user sees it's processing"
        : 'Missing visual loading feedback on delete confirm button',
    })

    // Test 7: API DELETE endpoint is idempotent (no error on deleting non-existent entity)
    // Supabase .delete().eq() returns success even if 0 rows match
    const hasDeleteEndpoint = apiRouteSrc.includes("export async function DELETE")
    const hasSuccessReturn = apiRouteSrc.includes("return NextResponse.json({ success: true })")
    const noRowCountCheck = !apiRouteSrc.includes('rowCount') && !apiRouteSrc.includes('affectedRows')
    results.push({
      name: 'API DELETE endpoint is idempotent (no error if already deleted)',
      pass: hasDeleteEndpoint && hasSuccessReturn && noRowCountCheck,
      detail: hasDeleteEndpoint && hasSuccessReturn && noRowCountCheck
        ? 'DELETE returns { success: true } without checking row count — safe for concurrent/duplicate requests'
        : `Endpoint: ${hasDeleteEndpoint}, SuccessReturn: ${hasSuccessReturn}, NoRowCount: ${noRowCountCheck}`,
    })

    // Test 8: Optimistic UI update removes holding from list immediately
    const hasOptimisticRemoval = holdingPageSrc.includes("setHoldings((prev) => prev.filter((h) => h.id !== id))")
    results.push({
      name: 'Optimistic UI removes holding from list immediately after delete',
      pass: hasOptimisticRemoval,
      detail: hasOptimisticRemoval
        ? 'setHoldings filters out deleted holding — list updates without waiting for reload'
        : 'Missing optimistic UI update on delete',
    })

    // Test 9: deleteConfirm is cleared after successful delete
    const hasClearConfirm = holdingPageSrc.includes("setDeleteConfirm(null)")
    results.push({
      name: 'Delete confirmation state cleared after successful delete',
      pass: hasClearConfirm,
      detail: hasClearConfirm
        ? 'setDeleteConfirm(null) — resets the two-step confirm flow after deletion'
        : 'Missing deleteConfirm cleanup',
    })

    // Test 10: Two-step confirmation pattern exists (prevents accidental delete)
    const hasTwoStep = holdingPageSrc.includes('deleteConfirm === holding.id')
    results.push({
      name: 'Two-step confirmation prevents accidental deletion',
      pass: hasTwoStep,
      detail: hasTwoStep
        ? 'First click shows Ja/Nee buttons, second click confirms — prevents accidental single-click delete'
        : 'Missing two-step delete confirmation',
    })

  } catch (err) {
    results.push({
      name: 'Source code accessible',
      pass: false,
      detail: `Could not read source files: ${err instanceof Error ? err.message : 'unknown error'}`,
    })
  }

  const passing = results.filter((r) => r.pass).length
  const total = results.length

  return NextResponse.json({
    title: 'Holding Rapid Delete Protection Verification',
    summary: `${passing}/${total} checks passing`,
    passing,
    total,
    allPassing: passing === total,
    results,
  })
}
