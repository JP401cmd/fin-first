import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

type TestResult = { step: string; pass: boolean; details: string }

export async function GET() {
  const results: TestResult[] = []

  function check(step: string, pass: boolean, details: string) {
    results.push({ step, pass, details })
  }

  const root = process.cwd()

  // ─── Step 1: OwnershipToggle component exists ───
  try {
    const src = fs.readFileSync(path.join(root, 'components/app/ownership-toggle.tsx'), 'utf-8')
    const hasToggle = src.includes('OwnershipToggle')
    const hasBadge = src.includes('OwnershipBadge')
    const hasHook = src.includes('useHouseholdStatus')
    const hasPersonalBtn = src.includes('ownership-personal-btn')
    const hasSharedBtn = src.includes('ownership-shared-btn')
    check(
      'OwnershipToggle component with personal/shared buttons',
      hasToggle && hasBadge && hasHook && hasPersonalBtn && hasSharedBtn,
      `OwnershipToggle: ${hasToggle}, OwnershipBadge: ${hasBadge}, useHouseholdStatus: ${hasHook}, personal btn: ${hasPersonalBtn}, shared btn: ${hasSharedBtn}`,
    )
  } catch (e) {
    check('OwnershipToggle component', false, `File not found: ${e}`)
  }

  // ─── Step 2: Asset form has ownership toggle ───
  try {
    const src = fs.readFileSync(path.join(root, 'app/(app)/core/assets/page.tsx'), 'utf-8')
    const hasImport = src.includes('OwnershipToggle')
    const hasState = src.includes("useState<OwnershipType>(asset?.ownership")
    const hasSaveField = src.includes("ownership: ownership")
    const hasHouseholdId = src.includes("household_id: ownership === 'shared'")
    const hasBadge = src.includes('OwnershipBadge')
    check(
      'Asset form has ownership toggle + save fields',
      hasImport && hasState && hasSaveField && hasHouseholdId,
      `Import: ${hasImport}, State: ${hasState}, Save: ${hasSaveField}, HouseholdId: ${hasHouseholdId}, Badge: ${hasBadge}`,
    )
  } catch (e) {
    check('Asset form ownership', false, `Error: ${e}`)
  }

  // ─── Step 3: Debt form has ownership toggle ───
  try {
    const src = fs.readFileSync(path.join(root, 'app/(app)/core/debts/page.tsx'), 'utf-8')
    const hasImport = src.includes('OwnershipToggle')
    const hasState = src.includes("useState<OwnershipType>(debt?.ownership")
    const hasSaveField = src.includes("ownership: ownership")
    const hasHouseholdId = src.includes("household_id: ownership === 'shared'")
    const hasBadge = src.includes('OwnershipBadge')
    check(
      'Debt form has ownership toggle + save fields',
      hasImport && hasState && hasSaveField && hasHouseholdId,
      `Import: ${hasImport}, State: ${hasState}, Save: ${hasSaveField}, HouseholdId: ${hasHouseholdId}, Badge: ${hasBadge}`,
    )
  } catch (e) {
    check('Debt form ownership', false, `Error: ${e}`)
  }

  // ─── Step 4: Budget form has ownership toggle ───
  try {
    const src = fs.readFileSync(path.join(root, 'components/app/budget-form.tsx'), 'utf-8')
    const hasImport = src.includes('OwnershipToggle')
    const hasFormField = src.includes("ownership: budget?.ownership ?? 'personal'")
    const hasSave = src.includes('...ownershipFields')
    check(
      'Budget form (new) has ownership toggle + save fields',
      hasImport && hasFormField && hasSave,
      `Import: ${hasImport}, FormField: ${hasFormField}, Save: ${hasSave}`,
    )
  } catch (e) {
    check('Budget form ownership', false, `Error: ${e}`)
  }

  // ─── Step 5: Budget edit modal has ownership toggle ───
  try {
    const src = fs.readFileSync(path.join(root, 'app/(app)/core/budgets/page.tsx'), 'utf-8')
    const hasImport = src.includes('OwnershipToggle')
    const hasState = src.includes("useState<OwnershipType>(budget.ownership")
    const hasSaveField = src.includes("ownership: ownership")
    check(
      'Budget edit modal has ownership toggle + save fields',
      hasImport && hasState && hasSaveField,
      `Import: ${hasImport}, State: ${hasState}, Save: ${hasSaveField}`,
    )
  } catch (e) {
    check('Budget edit modal ownership', false, `Error: ${e}`)
  }

  // ─── Step 6: Cost splitting options implemented ───
  try {
    const src = fs.readFileSync(path.join(root, 'lib/household-data.ts'), 'utf-8')
    const hasEqualMode = src.includes("case 'equal'")
    const hasIncomeRatio = src.includes("case 'income_ratio'")
    const hasCustomMode = src.includes("case 'custom'")
    const hasOneCarriesAll = src.includes("case 'one_carries_all'")
    const hasComputeSharePct = src.includes('computeSharePct')
    const hasLabels = src.includes('SPLIT_MODE_LABELS')
    check(
      'Cost splitting: 50/50, income-ratio, custom %, one-pays-all',
      hasEqualMode && hasIncomeRatio && hasCustomMode && hasOneCarriesAll && hasComputeSharePct && hasLabels,
      `equal: ${hasEqualMode}, income_ratio: ${hasIncomeRatio}, custom: ${hasCustomMode}, one_carries_all: ${hasOneCarriesAll}, computeSharePct: ${hasComputeSharePct}, labels: ${hasLabels}`,
    )
  } catch (e) {
    check('Cost splitting', false, `Error: ${e}`)
  }

  // ─── Step 7: Household settings API ───
  try {
    const src = fs.readFileSync(path.join(root, 'app/api/household/settings/route.ts'), 'utf-8')
    const hasGet = src.includes('export async function GET')
    const hasPatch = src.includes('export async function PATCH')
    const hasValidation = src.includes('VALID_SPLIT_MODES')
    check(
      'Household settings API (GET + PATCH)',
      hasGet && hasPatch && hasValidation,
      `GET: ${hasGet}, PATCH: ${hasPatch}, validation: ${hasValidation}`,
    )
  } catch (e) {
    check('Household settings API', false, `Error: ${e}`)
  }

  // ─── Step 8: Household data API with perspective ───
  try {
    const src = fs.readFileSync(path.join(root, 'app/api/household/data/route.ts'), 'utf-8')
    const hasGet = src.includes('export async function GET')
    const hasPerspective = src.includes("perspective")
    const hasNetWorth = src.includes('computePerspectiveNetWorth')
    const hasSharePct = src.includes('computeSharePct')
    check(
      'Household data API with perspective-aware net worth',
      hasGet && hasPerspective && hasNetWorth && hasSharePct,
      `GET: ${hasGet}, perspective: ${hasPerspective}, netWorth: ${hasNetWorth}, sharePct: ${hasSharePct}`,
    )
  } catch (e) {
    check('Household data API', false, `Error: ${e}`)
  }

  // ─── Step 9: computePerspectiveNetWorth function ───
  try {
    const src = fs.readFileSync(path.join(root, 'lib/household-data.ts'), 'utf-8')
    const hasFn = src.includes('computePerspectiveNetWorth')
    const hasPersonalAssets = src.includes('personalAssets')
    const hasSharedAssets = src.includes('sharedAssets')
    const hasMyShare = src.includes('myShareOfSharedAssets')
    const hasHouseholdPerspective = src.includes("perspective === 'household'")
    check(
      'Net worth calculation per perspective (personal vs household)',
      hasFn && hasPersonalAssets && hasSharedAssets && hasMyShare && hasHouseholdPerspective,
      `function: ${hasFn}, personalAssets: ${hasPersonalAssets}, sharedAssets: ${hasSharedAssets}, myShare: ${hasMyShare}, householdPerspective: ${hasHouseholdPerspective}`,
    )
  } catch (e) {
    check('Net worth calculation', false, `Error: ${e}`)
  }

  // ─── Step 10: Asset/Debt types include ownership field ───
  try {
    const assetSrc = fs.readFileSync(path.join(root, 'lib/asset-data.ts'), 'utf-8')
    const debtSrc = fs.readFileSync(path.join(root, 'lib/debt-data.ts'), 'utf-8')
    const budgetSrc = fs.readFileSync(path.join(root, 'lib/budget-data.ts'), 'utf-8')
    const assetHasOwnership = assetSrc.includes("ownership: 'personal' | 'shared'")
    const debtHasOwnership = debtSrc.includes("ownership: 'personal' | 'shared'")
    const budgetHasOwnership = budgetSrc.includes("ownership: 'personal' | 'shared'")
    check(
      'Asset, Debt, Budget types include ownership field',
      assetHasOwnership && debtHasOwnership && budgetHasOwnership,
      `Asset: ${assetHasOwnership}, Debt: ${debtHasOwnership}, Budget: ${budgetHasOwnership}`,
    )
  } catch (e) {
    check('Type definitions', false, `Error: ${e}`)
  }

  // ─── Step 11: Database migration has ownership columns ───
  try {
    const migrationsDir = path.join(root, 'supabase/migrations')
    const files = fs.readdirSync(migrationsDir)
    const householdMigration = files.find(f => f.includes('household'))
    let hasAssetOwnership = false
    let hasDebtOwnership = false
    let hasBudgetOwnership = false
    let hasSplitMode = false

    if (householdMigration) {
      const sql = fs.readFileSync(path.join(migrationsDir, householdMigration), 'utf-8')
      hasAssetOwnership = sql.includes('ALTER TABLE assets ADD COLUMN') && sql.includes('ownership')
      hasDebtOwnership = sql.includes('ALTER TABLE debts ADD COLUMN') && sql.includes('ownership')
      hasBudgetOwnership = sql.includes('ALTER TABLE budgets ADD COLUMN') && sql.includes('ownership')
      hasSplitMode = sql.includes('split_mode')
    }
    check(
      'Database migration with ownership columns and split_mode',
      !!householdMigration && hasAssetOwnership && hasDebtOwnership && hasBudgetOwnership && hasSplitMode,
      `Migration: ${householdMigration || 'not found'}, assets: ${hasAssetOwnership}, debts: ${hasDebtOwnership}, budgets: ${hasBudgetOwnership}, split_mode: ${hasSplitMode}`,
    )
  } catch (e) {
    check('Database migration', false, `Error: ${e}`)
  }

  // ─── Step 12: Perspective provider and switcher ───
  try {
    const providerSrc = fs.readFileSync(path.join(root, 'components/app/perspective-provider.tsx'), 'utf-8')
    const switcherSrc = fs.readFileSync(path.join(root, 'components/app/perspective-switcher.tsx'), 'utf-8')
    const hasProvider = providerSrc.includes('PerspectiveProvider')
    const hasSwitcher = switcherSrc.includes('PerspectiveSwitcher')
    const hasPersonal = providerSrc.includes("'personal'")
    const hasHousehold = providerSrc.includes("'household'")
    check(
      'Perspective provider with personal/household views',
      hasProvider && hasSwitcher && hasPersonal && hasHousehold,
      `Provider: ${hasProvider}, Switcher: ${hasSwitcher}, personal: ${hasPersonal}, household: ${hasHousehold}`,
    )
  } catch (e) {
    check('Perspective provider', false, `Error: ${e}`)
  }

  // ─── Step 13: filterByPerspective function ───
  try {
    const src = fs.readFileSync(path.join(root, 'lib/household-data.ts'), 'utf-8')
    const hasFn = src.includes('filterByPerspective')
    const hasHouseholdReturn = src.includes("perspective === 'household'")
    check(
      'filterByPerspective function for combined and individual views',
      hasFn && hasHouseholdReturn,
      `function: ${hasFn}, householdReturn: ${hasHouseholdReturn}`,
    )
  } catch (e) {
    check('filterByPerspective', false, `Error: ${e}`)
  }

  // ─── Step 14: No-household warning when selecting shared ───
  try {
    const src = fs.readFileSync(path.join(root, 'components/app/ownership-toggle.tsx'), 'utf-8')
    const hasWarningCheck = src.includes("newValue === 'shared' && !hasHousehold")
    const hasWarningUI = src.includes('ownership-no-household-warning')
    const hasIdentityLink = src.includes('/identity')
    check(
      'Warning shown when selecting shared without household',
      hasWarningCheck && hasWarningUI && hasIdentityLink,
      `check: ${hasWarningCheck}, UI: ${hasWarningUI}, identityLink: ${hasIdentityLink}`,
    )
  } catch (e) {
    check('No-household warning', false, `Error: ${e}`)
  }

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#242 — Shared vs personal data management',
    passing,
    total,
    allPassing: passing === total,
    results,
  })
}
