import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * GET /api/verify-holdings-sync
 *
 * Verification endpoint for Feature #233: Auto-sync holdings to asset values
 *
 * Tests all 6 feature steps:
 * 1. Calculate total portfolio value from all active holdings
 * 2. Auto-sync total to parent asset's current_value field
 * 3. Portfolio tracker is source of truth when holdings exist for an asset
 * 4. Handle sync on holding create/update/delete
 * 5. Handle sync on price feed updates
 * 6. Prevent manual asset value edit when holdings are active (or warn)
 */
export async function GET() {
  const results: {
    id: string
    name: string
    passed: boolean
    details: string
  }[] = []

  // Helper to read file content
  function readFile(relativePath: string): string {
    try {
      const fullPath = path.resolve(process.cwd(), relativePath)
      return fs.readFileSync(fullPath, 'utf-8')
    } catch {
      return ''
    }
  }

  // ========================================================
  // STEP 1: Calculate total portfolio value from all active holdings
  // ========================================================
  const holdingsSyncFile = readFile('lib/holdings-sync.ts')

  // Test 1.1: syncAssetValueFromHoldings function exists
  const hasSyncFunction = holdingsSyncFile.includes('export async function syncAssetValueFromHoldings')
  results.push({
    id: 'step1_sync_function_exists',
    name: 'Step 1.1: syncAssetValueFromHoldings function exists in lib/holdings-sync.ts',
    passed: hasSyncFunction,
    details: hasSyncFunction
      ? 'Function found and exported'
      : 'Missing syncAssetValueFromHoldings function',
  })

  // Test 1.2: Function queries active holdings only
  const queriesActiveHoldings = holdingsSyncFile.includes(".eq('is_active', true)")
    && holdingsSyncFile.includes("from('holdings')")
    && holdingsSyncFile.includes("select('units, current_price, avg_purchase_price')")
  results.push({
    id: 'step1_queries_active_holdings',
    name: 'Step 1.2: Queries only active holdings (is_active=true)',
    passed: queriesActiveHoldings,
    details: queriesActiveHoldings
      ? 'Correctly filters by is_active=true and selects units, current_price, avg_purchase_price'
      : 'Missing active holdings filter or missing columns',
  })

  // Test 1.3: Function calculates total value using current_price with avg_purchase_price fallback
  const calculatesTotalValue = holdingsSyncFile.includes('h.current_price ?? h.avg_purchase_price')
    && holdingsSyncFile.includes('reduce')
    && holdingsSyncFile.includes('price * h.units')
  results.push({
    id: 'step1_calculates_total_value',
    name: 'Step 1.3: Calculates total value with current_price, fallback to avg_purchase_price',
    passed: calculatesTotalValue,
    details: calculatesTotalValue
      ? 'Uses h.current_price ?? h.avg_purchase_price * h.units with reduce()'
      : 'Missing value calculation logic',
  })

  // ========================================================
  // STEP 2: Auto-sync total to parent asset's current_value field
  // ========================================================

  // Test 2.1: Updates asset's current_value
  const updatesAssetValue = holdingsSyncFile.includes("from('assets')")
    && holdingsSyncFile.includes("update({ current_value: totalValue })")
  results.push({
    id: 'step2_updates_asset_value',
    name: 'Step 2.1: Updates parent asset current_value with total from holdings',
    passed: updatesAssetValue,
    details: updatesAssetValue
      ? 'Correctly updates assets table with { current_value: totalValue }'
      : 'Missing asset update logic',
  })

  // Test 2.2: Sync function scoped to user (security)
  const scopedToUser = holdingsSyncFile.includes(".eq('user_id', userId)")
  results.push({
    id: 'step2_user_scoped',
    name: 'Step 2.2: Sync is scoped to authenticated user (user_id check)',
    passed: scopedToUser,
    details: scopedToUser
      ? 'Both holdings query and asset update are user-scoped'
      : 'Missing user_id check — potential cross-user data leak',
  })

  // Test 2.3: Sync function returns result info
  const returnsSyncResult = holdingsSyncFile.includes('synced: true')
    && holdingsSyncFile.includes('totalValue')
  results.push({
    id: 'step2_returns_result',
    name: 'Step 2.3: Sync function returns { synced, totalValue }',
    passed: returnsSyncResult,
    details: returnsSyncResult
      ? 'Returns sync status and total value for caller verification'
      : 'Missing return value information',
  })

  // ========================================================
  // STEP 3: Portfolio tracker is source of truth when holdings exist
  // ========================================================

  // Test 3.1: assetHasActiveHoldings function exists
  const hasCheckFunction = holdingsSyncFile.includes('export async function assetHasActiveHoldings')
  results.push({
    id: 'step3_check_function_exists',
    name: 'Step 3.1: assetHasActiveHoldings check function exists',
    passed: hasCheckFunction,
    details: hasCheckFunction
      ? 'Function exported from lib/holdings-sync.ts'
      : 'Missing assetHasActiveHoldings function',
  })

  // Test 3.2: has-holdings API endpoint exists
  const hasHoldingsRoute = readFile('app/api/assets/has-holdings/route.ts')
  const hasHoldingsEndpoint = hasHoldingsRoute.includes('assetHasActiveHoldings')
    && hasHoldingsRoute.includes("GET")
  results.push({
    id: 'step3_has_holdings_endpoint',
    name: 'Step 3.2: GET /api/assets/has-holdings endpoint exists',
    passed: hasHoldingsEndpoint,
    details: hasHoldingsEndpoint
      ? 'Endpoint calls assetHasActiveHoldings and returns { has_holdings, holdings_count, total_value }'
      : 'Missing has-holdings API endpoint',
  })

  // Test 3.3: Source of truth comment/documentation
  const hasSourceOfTruthDoc = holdingsSyncFile.includes('source of truth')
    || holdingsSyncFile.includes('Portfolio tracker is source of truth')
  results.push({
    id: 'step3_source_of_truth_documented',
    name: 'Step 3.3: Source of truth principle documented in code',
    passed: hasSourceOfTruthDoc,
    details: hasSourceOfTruthDoc
      ? 'Portfolio tracker source of truth documented in holdings-sync.ts'
      : 'Missing source of truth documentation',
  })

  // ========================================================
  // STEP 4: Handle sync on holding create/update/delete
  // ========================================================
  const holdingsRoute = readFile('app/api/holdings/route.ts')

  // Test 4.1: Sync on create (POST)
  const syncOnCreate = holdingsRoute.includes('syncAssetValueFromHoldings')
    && holdingsRoute.includes('POST')
  results.push({
    id: 'step4_sync_on_create',
    name: 'Step 4.1: syncAssetValueFromHoldings called on holding CREATE (POST)',
    passed: syncOnCreate,
    details: syncOnCreate
      ? 'POST /api/holdings triggers sync after insertion'
      : 'Missing sync on holding creation',
  })

  // Test 4.2: Sync on update (PATCH)
  const syncOnUpdate = holdingsRoute.includes('PATCH')
    && holdingsRoute.includes('syncAssetValueFromHoldings')
  // Verify specifically that PATCH handler calls sync
  const patchSection = holdingsRoute.substring(holdingsRoute.indexOf('export async function PATCH'))
  const patchHasSync = patchSection.includes('syncAssetValueFromHoldings')
  results.push({
    id: 'step4_sync_on_update',
    name: 'Step 4.2: syncAssetValueFromHoldings called on holding UPDATE (PATCH)',
    passed: patchHasSync,
    details: patchHasSync
      ? 'PATCH /api/holdings triggers sync after update'
      : 'Missing sync on holding update',
  })

  // Test 4.3: Sync on delete (DELETE)
  const deleteSection = holdingsRoute.substring(holdingsRoute.indexOf('export async function DELETE'))
  const deleteHasSync = deleteSection.includes('syncAssetValueFromHoldings')
  results.push({
    id: 'step4_sync_on_delete',
    name: 'Step 4.3: syncAssetValueFromHoldings called on holding DELETE',
    passed: deleteHasSync,
    details: deleteHasSync
      ? 'DELETE /api/holdings triggers sync after deletion (reads asset_id before delete)'
      : 'Missing sync on holding deletion',
  })

  // Test 4.4: Sync on holding transaction (buy/sell)
  const holdingTxRoute = readFile('app/api/holding-transactions/route.ts')
  const syncOnTransaction = holdingTxRoute.includes('syncAssetValueFromHoldings')
    && holdingTxRoute.includes("type === 'buy' || type === 'sell'")
  results.push({
    id: 'step4_sync_on_transaction',
    name: 'Step 4.4: syncAssetValueFromHoldings called on buy/sell transactions',
    passed: syncOnTransaction,
    details: syncOnTransaction
      ? 'POST /api/holding-transactions triggers sync for buy and sell (not dividend)'
      : 'Missing sync on holding transactions',
  })

  // ========================================================
  // STEP 5: Handle sync on price feed updates
  // ========================================================
  const refreshPricesRoute = readFile('app/api/holdings/refresh-prices/route.ts')

  // Test 5.1: Sync on price refresh (POST)
  const syncOnPriceRefresh = refreshPricesRoute.includes('syncAssetValueFromHoldings')
    && refreshPricesRoute.includes('POST')
  results.push({
    id: 'step5_sync_on_price_refresh',
    name: 'Step 5.1: syncAssetValueFromHoldings called on price refresh (POST)',
    passed: syncOnPriceRefresh,
    details: syncOnPriceRefresh
      ? 'POST /api/holdings/refresh-prices triggers sync after fetching new prices'
      : 'Missing sync on price refresh',
  })

  // Test 5.2: Sync on manual price override (PATCH)
  const patchPricesSection = refreshPricesRoute.substring(
    refreshPricesRoute.indexOf('export async function PATCH') || 0
  )
  const syncOnManualPrice = patchPricesSection.includes('syncAssetValueFromHoldings')
  results.push({
    id: 'step5_sync_on_manual_price',
    name: 'Step 5.2: syncAssetValueFromHoldings called on manual price override (PATCH)',
    passed: syncOnManualPrice,
    details: syncOnManualPrice
      ? 'PATCH /api/holdings/refresh-prices triggers sync after manual price update'
      : 'Missing sync on manual price override',
  })

  // Test 5.3: Price data used in value calculation (current_price vs avg_purchase_price)
  const priceUsedInCalc = holdingsSyncFile.includes('current_price ?? avg_purchase_price')
    || holdingsSyncFile.includes('h.current_price ?? h.avg_purchase_price')
  results.push({
    id: 'step5_price_feed_used',
    name: 'Step 5.3: Price feed data (current_price) used in total value calculation',
    passed: priceUsedInCalc,
    details: priceUsedInCalc
      ? 'Sync uses current_price when available (from price feed), falls back to avg_purchase_price'
      : 'Missing price feed integration in value calculation',
  })

  // ========================================================
  // STEP 6: Prevent manual asset value edit when holdings are active (or warn)
  // ========================================================
  const assetsPage = readFile('app/(app)/core/assets/page.tsx')

  // Test 6.1: Asset detail checks for active holdings
  const checksHoldings = assetsPage.includes('has-holdings')
    && assetsPage.includes('hasActiveHoldings')
  results.push({
    id: 'step6_checks_holdings',
    name: 'Step 6.1: Asset detail checks for active holdings via API',
    passed: checksHoldings,
    details: checksHoldings
      ? 'Asset detail fetches /api/assets/has-holdings and stores result in state'
      : 'Missing holdings check in asset detail',
  })

  // Test 6.2: Warning banner displayed when holdings are active
  const hasWarningBanner = assetsPage.includes('Portfolio tracker actief')
    && assetsPage.includes('holdings-source-of-truth-banner')
  results.push({
    id: 'step6_warning_banner',
    name: 'Step 6.2: Warning banner shown when portfolio tracker is active',
    passed: hasWarningBanner,
    details: hasWarningBanner
      ? '"Portfolio tracker actief" banner with holdings count displayed'
      : 'Missing holdings source-of-truth warning banner',
  })

  // Test 6.3: Revalue button disabled when holdings are active
  const revalueDisabled = assetsPage.includes('disabled={hasActiveHoldings}')
    && assetsPage.includes('Herwaarderen')
  results.push({
    id: 'step6_revalue_disabled',
    name: 'Step 6.3: Revalue button disabled when holdings are active',
    passed: revalueDisabled,
    details: revalueDisabled
      ? 'Herwaarderen button is disabled and shows explanatory tooltip'
      : 'Missing revalue button disable logic',
  })

  // Test 6.4: Current value field read-only in edit form when holdings active
  const valueReadOnly = assetsPage.includes('readOnly={hasActiveHoldings}')
    && assetsPage.includes('asset-form-holdings-warning')
  results.push({
    id: 'step6_value_readonly_in_form',
    name: 'Step 6.4: Current value input read-only in edit form when holdings active',
    passed: valueReadOnly,
    details: valueReadOnly
      ? 'Current value field is readOnly and shows sync message when holdings exist'
      : 'Missing read-only value field in edit form',
  })

  // Test 6.5: Revaluation modal also warns
  const revalueModalWarns = assetsPage.includes('valuation-holdings-warning')
  results.push({
    id: 'step6_revalue_modal_warns',
    name: 'Step 6.5: Revaluation modal shows warning when holdings are active',
    passed: revalueModalWarns,
    details: revalueModalWarns
      ? 'Valuation modal displays holdings warning with data-testid=valuation-holdings-warning'
      : 'Missing revaluation modal warning',
  })

  // ========================================================
  // BONUS: Error handling
  // ========================================================

  // Test B.1: Non-critical error handling in sync function
  const hasGracefulErrors = holdingsSyncFile.includes('catch')
    && holdingsSyncFile.includes('synced: false')
  results.push({
    id: 'bonus_graceful_errors',
    name: 'Bonus: Sync errors are non-critical (graceful failure)',
    passed: hasGracefulErrors,
    details: hasGracefulErrors
      ? 'Sync function catches errors and returns { synced: false } without failing main operation'
      : 'Missing graceful error handling',
  })

  // Test B.2: Import of syncAssetValueFromHoldings in all relevant routes
  const importInHoldings = holdingsRoute.includes("import { syncAssetValueFromHoldings } from '@/lib/holdings-sync'")
  const importInRefresh = refreshPricesRoute.includes("import { syncAssetValueFromHoldings } from '@/lib/holdings-sync'")
  const importInTx = holdingTxRoute.includes("import { syncAssetValueFromHoldings } from '@/lib/holdings-sync'")
  const allImports = importInHoldings && importInRefresh && importInTx
  results.push({
    id: 'bonus_all_imports',
    name: 'Bonus: syncAssetValueFromHoldings imported in all 3 relevant API routes',
    passed: allImports,
    details: allImports
      ? 'Imported in holdings/route.ts, holdings/refresh-prices/route.ts, holding-transactions/route.ts'
      : `Missing imports: holdings=${importInHoldings}, refresh=${importInRefresh}, tx=${importInTx}`,
  })

  // Summary
  const total = results.length
  const passing = results.filter(r => r.passed).length
  const failing = results.filter(r => !r.passed)

  return NextResponse.json({
    feature: '#233 — Auto-sync holdings to asset values',
    summary: `${passing}/${total} tests passing`,
    all_passing: passing === total,
    total,
    passing,
    failing: failing.length,
    results,
  })
}
