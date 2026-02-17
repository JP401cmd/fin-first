import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

type TestResult = { step: string; pass: boolean; detail: string }

/**
 * GET /api/verify-holdings-crud-mgmt
 *
 * Server-side verification for Feature #227: Holdings CRUD management
 * Tests code structure and API patterns without requiring authentication.
 */
export async function GET() {
  const results: TestResult[] = []
  const root = process.cwd()

  // ── Step 1: Holdings list view (HoldingsList component) on asset detail page ──
  try {
    const assetsPage = fs.readFileSync(path.join(root, 'app/(app)/core/assets/page.tsx'), 'utf-8')
    const hasHoldingsListComponent = assetsPage.includes('function HoldingsList')
    const hasHoldingsListInDetailModal = assetsPage.includes('HoldingsList assetId={asset.id}')
    const hasToggle = assetsPage.includes('data-testid="holdings-toggle"')
    const hasExpandedSection = assetsPage.includes('data-testid="holdings-list-expanded"')
    const hasHoldingsListSection = assetsPage.includes('data-testid="holdings-list-section"')

    results.push({
      step: '1. HoldingsList component exists in assets page',
      pass: hasHoldingsListComponent,
      detail: hasHoldingsListComponent
        ? 'HoldingsList function component found'
        : 'Missing function HoldingsList in assets/page.tsx',
    })

    results.push({
      step: '2. HoldingsList integrated in AssetDetailModal',
      pass: hasHoldingsListInDetailModal,
      detail: hasHoldingsListInDetailModal
        ? 'HoldingsList assetId={asset.id} found in detail modal'
        : 'HoldingsList not used inside AssetDetailModal',
    })

    results.push({
      step: '3. Holdings toggle button with test ID',
      pass: hasToggle && hasExpandedSection && hasHoldingsListSection,
      detail: `toggle=${hasToggle}, expanded=${hasExpandedSection}, section=${hasHoldingsListSection}`,
    })
  } catch (err) {
    results.push({
      step: '1-3. HoldingsList component checks',
      pass: false,
      detail: `Error reading assets page: ${err instanceof Error ? err.message : 'unknown'}`,
    })
  }

  // ── Step 2: Create holding form with required fields ──
  try {
    const assetsPage = fs.readFileSync(path.join(root, 'app/(app)/core/assets/page.tsx'), 'utf-8')
    const hasTickerInput = assetsPage.includes('data-testid="holding-ticker-input"')
    const hasIsinInput = assetsPage.includes('data-testid="holding-isin-input"')
    const hasNameInput = assetsPage.includes('data-testid="holding-name-input"')
    const hasUnitsInput = assetsPage.includes('data-testid="holding-units-input"')
    const hasAvgPriceInput = assetsPage.includes('data-testid="holding-avg-price-input"')
    const hasPurchaseDateInput = assetsPage.includes('data-testid="holding-purchase-date-input"')
    const hasSaveBtn = assetsPage.includes('data-testid="holding-save-btn"')

    const allFields = hasTickerInput && hasIsinInput && hasNameInput && hasUnitsInput && hasAvgPriceInput && hasPurchaseDateInput
    results.push({
      step: '4. Create form has all required fields (ticker, ISIN, name, units, avg price, purchase date)',
      pass: allFields,
      detail: `ticker=${hasTickerInput}, isin=${hasIsinInput}, name=${hasNameInput}, units=${hasUnitsInput}, avgPrice=${hasAvgPriceInput}, purchaseDate=${hasPurchaseDateInput}`,
    })

    results.push({
      step: '5. Create form has save button',
      pass: hasSaveBtn,
      detail: hasSaveBtn ? 'holding-save-btn found' : 'Missing save button',
    })
  } catch (err) {
    results.push({
      step: '4-5. Create form checks',
      pass: false,
      detail: `Error: ${err instanceof Error ? err.message : 'unknown'}`,
    })
  }

  // ── Step 3: Read/list holdings per asset ──
  try {
    const apiRoute = fs.readFileSync(path.join(root, 'app/api/holdings/route.ts'), 'utf-8')
    const hasAssetIdFilter = apiRoute.includes('asset_id') && apiRoute.includes('assetIdFilter')
    const hasGetMethod = apiRoute.includes('export async function GET')

    results.push({
      step: '6. API GET /api/holdings supports ?asset_id filter',
      pass: hasAssetIdFilter,
      detail: hasAssetIdFilter
        ? 'GET endpoint filters by asset_id query parameter'
        : 'Missing asset_id filter in GET endpoint',
    })

    // Check that HoldingsList fetches per asset
    const assetsPage = fs.readFileSync(path.join(root, 'app/(app)/core/assets/page.tsx'), 'utf-8')
    const fetchesPerAsset = assetsPage.includes('/api/holdings?asset_id=')
    results.push({
      step: '7. HoldingsList fetches holdings per asset',
      pass: fetchesPerAsset,
      detail: fetchesPerAsset
        ? 'Fetch uses /api/holdings?asset_id= filter'
        : 'Missing per-asset filter in fetch',
    })
  } catch (err) {
    results.push({
      step: '6-7. Read/list per asset checks',
      pass: false,
      detail: `Error: ${err instanceof Error ? err.message : 'unknown'}`,
    })
  }

  // ── Step 4: Update holding details ──
  try {
    const apiRoute = fs.readFileSync(path.join(root, 'app/api/holdings/route.ts'), 'utf-8')
    const hasPatchMethod = apiRoute.includes('export async function PATCH')
    const patchUpdatesFields = apiRoute.includes('body.name') && apiRoute.includes('body.ticker') && apiRoute.includes('body.units')

    results.push({
      step: '8. API PATCH /api/holdings updates holding details',
      pass: hasPatchMethod && patchUpdatesFields,
      detail: `PATCH=${hasPatchMethod}, fields=${patchUpdatesFields}`,
    })

    // Check edit button in HoldingsList
    const assetsPage = fs.readFileSync(path.join(root, 'app/(app)/core/assets/page.tsx'), 'utf-8')
    const hasEditBtn = assetsPage.includes('data-testid={`edit-holding-')
    results.push({
      step: '9. HoldingsList has edit button per holding',
      pass: hasEditBtn,
      detail: hasEditBtn ? 'Edit button with test ID found' : 'Missing edit button',
    })
  } catch (err) {
    results.push({
      step: '8-9. Update checks',
      pass: false,
      detail: `Error: ${err instanceof Error ? err.message : 'unknown'}`,
    })
  }

  // ── Step 5: Delete holding with confirmation ──
  try {
    const apiRoute = fs.readFileSync(path.join(root, 'app/api/holdings/route.ts'), 'utf-8')
    const hasDeleteMethod = apiRoute.includes('export async function DELETE')

    const assetsPage = fs.readFileSync(path.join(root, 'app/(app)/core/assets/page.tsx'), 'utf-8')
    const hasDeleteBtn = assetsPage.includes('data-testid={`delete-holding-')
    const hasConfirmDeleteBtn = assetsPage.includes('data-testid={`confirm-delete-holding-')
    const hasDeleteConfirmState = assetsPage.includes('deleteConfirm')

    results.push({
      step: '10. API DELETE /api/holdings removes holding',
      pass: hasDeleteMethod,
      detail: hasDeleteMethod ? 'DELETE endpoint found' : 'Missing DELETE endpoint',
    })

    results.push({
      step: '11. Delete with confirmation flow (2-step)',
      pass: hasDeleteBtn && hasConfirmDeleteBtn && hasDeleteConfirmState,
      detail: `deleteBtn=${hasDeleteBtn}, confirmBtn=${hasConfirmDeleteBtn}, state=${hasDeleteConfirmState}`,
    })
  } catch (err) {
    results.push({
      step: '10-11. Delete checks',
      pass: false,
      detail: `Error: ${err instanceof Error ? err.message : 'unknown'}`,
    })
  }

  // ── Step 6: Aggregate holdings total syncs to asset current_value ──
  try {
    const apiRoute = fs.readFileSync(path.join(root, 'app/api/holdings/route.ts'), 'utf-8')
    const hasSyncFunction = apiRoute.includes('syncAssetValueFromHoldings')
    const syncCalledOnCreate = apiRoute.includes('syncAssetValueFromHoldings(supabase, holding.asset_id')
    const syncCalledOnDelete = apiRoute.includes('syncAssetValueFromHoldings(supabase, holdingToDelete.asset_id')

    results.push({
      step: '12. Aggregate sync function exists',
      pass: hasSyncFunction,
      detail: hasSyncFunction
        ? 'syncAssetValueFromHoldings function found'
        : 'Missing aggregate sync function',
    })

    results.push({
      step: '13. Sync called on create and delete',
      pass: syncCalledOnCreate && syncCalledOnDelete,
      detail: `onCreate=${syncCalledOnCreate}, onDelete=${syncCalledOnDelete}`,
    })
  } catch (err) {
    results.push({
      step: '12-13. Aggregate sync checks',
      pass: false,
      detail: `Error: ${err instanceof Error ? err.message : 'unknown'}`,
    })
  }

  // ── Step 7: API endpoints ──
  try {
    const apiRoute = fs.readFileSync(path.join(root, 'app/api/holdings/route.ts'), 'utf-8')
    const hasGet = apiRoute.includes('export async function GET')
    const hasPost = apiRoute.includes('export async function POST')
    const hasPatch = apiRoute.includes('export async function PATCH')
    const hasDelete = apiRoute.includes('export async function DELETE')

    results.push({
      step: '14. All CRUD API endpoints present (GET, POST, PATCH, DELETE)',
      pass: hasGet && hasPost && hasPatch && hasDelete,
      detail: `GET=${hasGet}, POST=${hasPost}, PATCH=${hasPatch}, DELETE=${hasDelete}`,
    })

    // Check single-holding endpoint
    let hasSingleGet = false
    try {
      const singleRoute = fs.readFileSync(path.join(root, 'app/api/holdings/[id]/route.ts'), 'utf-8')
      hasSingleGet = singleRoute.includes('export async function GET')
    } catch {
      // Endpoint may not exist, still pass if main route handles it
    }

    results.push({
      step: '15. GET /api/holdings/:id endpoint for single holding',
      pass: hasSingleGet,
      detail: hasSingleGet ? 'Single holding GET endpoint found' : 'app/api/holdings/[id]/route.ts not found or missing GET',
    })
  } catch (err) {
    results.push({
      step: '14-15. API endpoint checks',
      pass: false,
      detail: `Error: ${err instanceof Error ? err.message : 'unknown'}`,
    })
  }

  // ── Additional: Holdings shown only for investment-like asset types ──
  try {
    const assetsPage = fs.readFileSync(path.join(root, 'app/(app)/core/assets/page.tsx'), 'utf-8')
    const hasTypeGating = assetsPage.includes("'investment'") && assetsPage.includes("'crypto'") && assetsPage.includes("asset.asset_type")
    results.push({
      step: '16. Holdings list gated to investment-like asset types',
      pass: hasTypeGating,
      detail: hasTypeGating
        ? 'Type gating for investment/crypto/savings found'
        : 'Missing asset type gating for holdings list',
    })
  } catch (err) {
    results.push({
      step: '16. Type gating check',
      pass: false,
      detail: `Error: ${err instanceof Error ? err.message : 'unknown'}`,
    })
  }

  // ── Auth check ──
  try {
    const apiRoute = fs.readFileSync(path.join(root, 'app/api/holdings/route.ts'), 'utf-8')
    const hasAuthCheck = apiRoute.includes("'Niet ingelogd'") && apiRoute.includes('status: 401')
    results.push({
      step: '17. API endpoints require authentication',
      pass: hasAuthCheck,
      detail: hasAuthCheck ? '401 auth check present' : 'Missing auth check',
    })
  } catch (err) {
    results.push({
      step: '17. Auth check',
      pass: false,
      detail: `Error: ${err instanceof Error ? err.message : 'unknown'}`,
    })
  }

  const passing = results.filter((r) => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#227 — Holdings CRUD management',
    summary: `${passing}/${total} tests passing`,
    passing,
    total,
    results,
  })
}
