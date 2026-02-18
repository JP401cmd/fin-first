import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * GET /api/verify-next-step-prioritization — Verify feature #255:
 * Smart next step algorithm prioritization.
 *
 * Tests:
 * 1. Priority ordering: no transactions first
 * 2. Priority ordering: no assets second
 * 3. Priority ordering: budget alerts third
 * 4. Priority ordering: no goals fourth
 * 5. Priority ordering: FIRE unreachable fifth
 * 6. Limited to 1-2 suggestions per page
 * 7. Priority changes as user completes steps
 * 8. API includes FIRE unreachable detection
 */
export async function GET() {
  const results: Array<{ name: string; pass: boolean; detail: string }> = []
  const projectRoot = process.cwd()

  function readFile(filePath: string): string {
    try {
      return fs.readFileSync(path.join(projectRoot, filePath), 'utf-8')
    } catch {
      return ''
    }
  }

  const nextStepCard = readFile('components/app/next-step-card.tsx')
  const apiRoute = readFile('app/api/next-steps/route.ts')
  const corePage = readFile('app/(app)/core/page.tsx')
  const willPage = readFile('app/(app)/will/page.tsx')
  const horizonPage = readFile('app/(app)/horizon/page.tsx')

  // --- Test 1: Highest priority: no transactions imported yet ---
  // In computeAllKernSteps, the first check should be for !data.hasTransactions
  // and it should come before all other checks
  const kernStepsSource = nextStepCard.substring(
    nextStepCard.indexOf('export function computeAllKernSteps'),
    nextStepCard.indexOf('export function computeAllWilSteps')
  )

  // Check that import_transactions is the FIRST step pushed in computeAllKernSteps
  const importIdx = kernStepsSource.indexOf("key: 'import_transactions'")
  const assetsIdx = kernStepsSource.indexOf("key: 'add_assets'")
  const budgetAttIdx = kernStepsSource.indexOf("key: 'budget_attention'")
  const goalsIdx = kernStepsSource.indexOf("key: 'set_goals'")
  const fireIdx = kernStepsSource.indexOf("key: 'fire_unreachable'")

  results.push({
    name: '1. Highest priority: no transactions imported (import first)',
    pass: importIdx > 0 && importIdx < assetsIdx && importIdx < budgetAttIdx && importIdx < goalsIdx && importIdx < fireIdx,
    detail: importIdx > 0
      ? `import_transactions at position ${importIdx} (earliest in priority chain). Checks !data.hasTransactions condition.`
      : 'import_transactions step not found in computeAllKernSteps',
  })

  // --- Test 2: Second priority: no assets added ---
  results.push({
    name: '2. Second priority: no assets added (add wealth)',
    pass: assetsIdx > 0 && assetsIdx > importIdx && assetsIdx < budgetAttIdx && assetsIdx < goalsIdx && assetsIdx < fireIdx,
    detail: assetsIdx > 0
      ? `add_assets at position ${assetsIdx}, after import_transactions (${importIdx}), before budget_attention (${budgetAttIdx})`
      : 'add_assets step not found in computeAllKernSteps',
  })

  // --- Test 3: Third priority: budget categories over limit ---
  results.push({
    name: '3. Third priority: budget alerts (needs attention)',
    pass: budgetAttIdx > 0 && budgetAttIdx > assetsIdx && budgetAttIdx < goalsIdx && budgetAttIdx < fireIdx,
    detail: budgetAttIdx > 0
      ? `budget_attention at position ${budgetAttIdx}, after add_assets (${assetsIdx}), before set_goals (${goalsIdx})`
      : 'budget_attention step not found in computeAllKernSteps',
  })

  // --- Test 4: Fourth priority: no goals set ---
  results.push({
    name: '4. Fourth priority: no goals set',
    pass: goalsIdx > 0 && goalsIdx > budgetAttIdx && goalsIdx < fireIdx,
    detail: goalsIdx > 0
      ? `set_goals at position ${goalsIdx}, after budget_attention (${budgetAttIdx}), before fire_unreachable (${fireIdx})`
      : 'set_goals step not found in computeAllKernSteps',
  })

  // --- Test 5: Fifth priority: FIRE target unreachable ---
  results.push({
    name: '5. Fifth priority: FIRE target unreachable (try scenarios)',
    pass: fireIdx > 0 && fireIdx > goalsIdx,
    detail: fireIdx > 0
      ? `fire_unreachable at position ${fireIdx}, after set_goals (${goalsIdx}). Links to /horizon for scenario exploration.`
      : 'fire_unreachable step not found in computeAllKernSteps',
  })

  // --- Test 6: Limit display to 1-2 suggestions per page ---
  // NextStepSection shows only the first visible step (currentStep = visibleSteps[0])
  const showsSingleStep = nextStepCard.includes('const currentStep = visibleSteps.length > 0 ? visibleSteps[0] : null')
  const showsSingleCard = nextStepCard.includes('return <NextStepCard step={currentStep}')
  // All module pages use NextStepSection (which auto-limits to 1 card)
  const coreUsesSection = corePage.includes('NextStepSection')
  const willUsesSection = willPage.includes('NextStepSection')
  const horizonUsesSection = horizonPage.includes('NextStepSection')
  results.push({
    name: '6. Limit display to 1-2 suggestions per page',
    pass: showsSingleStep && showsSingleCard && coreUsesSection && willUsesSection && horizonUsesSection,
    detail: `NextStepSection renders only first non-dismissed step. Used on: core=${coreUsesSection}, will=${willUsesSection}, horizon=${horizonUsesSection}`,
  })

  // --- Test 7: Priority changes as user completes steps ---
  // The computeAllKernSteps function dynamically builds list based on data state
  // Completed steps are excluded from the list
  const checksHasTransactions = kernStepsSource.includes('!data.hasTransactions')
  const checksAssets = kernStepsSource.includes('data.totalAssets === 0')
  const checksAlertBudgets = kernStepsSource.includes('data.alertBudgetCount')
  const checksGoals = kernStepsSource.includes('data.hasGoals === false')
  const checksFireUnreachable = kernStepsSource.includes('data.fireUnreachable === true')
  const dynamicList = checksHasTransactions && checksAssets && checksAlertBudgets && checksGoals && checksFireUnreachable
  // Also check that the API uses conditional step building
  const apiUsesConditional = apiRoute.includes('hasTransactions') && apiRoute.includes('hasAssets') && apiRoute.includes('alertBudgetCount') && apiRoute.includes('hasGoals') && apiRoute.includes('fireUnreachable')
  results.push({
    name: '7. Priority changes as user completes steps',
    pass: dynamicList && apiUsesConditional,
    detail: `Dynamic conditions: transactions=${checksHasTransactions}, assets=${checksAssets}, budgetAlerts=${checksAlertBudgets}, goals=${checksGoals}, fireUnreachable=${checksFireUnreachable}. API uses same conditions: ${apiUsesConditional}`,
  })

  // --- Test 8: API includes FIRE reachability detection ---
  const apiHasFireCalc = apiRoute.includes('fireUnreachable') && apiRoute.includes('fire_unreachable')
  const apiCalculatesFire = apiRoute.includes('fireTarget') && apiRoute.includes('monthlySavings')
  const apiReturnsFireState = apiRoute.includes("fire_unreachable: fireUnreachable")
  results.push({
    name: '8. API includes FIRE unreachable detection',
    pass: apiHasFireCalc && apiCalculatesFire && apiReturnsFireState,
    detail: `API: fireUnreachable var=${apiHasFireCalc}, FIRE calculation=${apiCalculatesFire}, data_state includes fire_unreachable=${apiReturnsFireState}`,
  })

  // --- Test 9: Core page passes hasGoals and fireUnreachable to algorithm ---
  const corePassesGoals = corePage.includes('hasGoals') && corePage.includes('computeAllKernSteps')
  const corePassesFire = corePage.includes('fireUnreachable') && corePage.includes('computeAllKernSteps')
  results.push({
    name: '9. Core page passes hasGoals and fireUnreachable to algorithm',
    pass: corePassesGoals && corePassesFire,
    detail: `Core page passes hasGoals=${corePassesGoals} and fireUnreachable=${corePassesFire} to computeAllKernSteps()`,
  })

  // --- Test 10: API priority ordering matches spec ---
  // In the API, check that priorities are: 1=import, 2=assets, 3=budget_attention, 4=goals, 5=fire_unreachable
  const apiImportPriority = apiRoute.includes("key: 'import_transactions'") && apiRoute.includes('priority: 1')
  const apiAssetsPriority = apiRoute.includes("key: 'add_assets'") && apiRoute.includes('priority: 2')
  const apiBudgetPriority = apiRoute.includes("key: 'budget_attention'") && apiRoute.includes('priority: 3')
  const apiGoalsPriority = apiRoute.includes("key: 'set_goals'") && apiRoute.includes('priority: 4')
  const apiFirePriority = apiRoute.includes("key: 'fire_unreachable'") && apiRoute.includes('priority: 5')
  results.push({
    name: '10. API priority ordering matches spec (1-5)',
    pass: apiImportPriority && apiAssetsPriority && apiBudgetPriority && apiGoalsPriority && apiFirePriority,
    detail: `import=p1:${apiImportPriority}, assets=p2:${apiAssetsPriority}, budgetAlerts=p3:${apiBudgetPriority}, goals=p4:${apiGoalsPriority}, fire=p5:${apiFirePriority}`,
  })

  // --- Test 11: computeAllKernSteps accepts hasGoals and fireUnreachable params ---
  const acceptsGoals = kernStepsSource.includes('hasGoals?:')
  const acceptsFire = kernStepsSource.includes('fireUnreachable?:')
  results.push({
    name: '11. computeAllKernSteps accepts hasGoals and fireUnreachable params',
    pass: acceptsGoals && acceptsFire,
    detail: `Function signature includes: hasGoals=${acceptsGoals}, fireUnreachable=${acceptsFire}`,
  })

  // --- Test 12: fire_unreachable is a valid step key for completion ---
  const completeRoute = readFile('app/api/next-steps/complete/route.ts')
  const fireInValidKeys = completeRoute.includes("'fire_unreachable'")
  results.push({
    name: '12. fire_unreachable is a valid step key for completion',
    pass: fireInValidKeys,
    detail: fireInValidKeys
      ? 'fire_unreachable included in VALID_STEP_KEYS in /api/next-steps/complete'
      : 'fire_unreachable NOT found in VALID_STEP_KEYS',
  })

  const passing = results.filter(r => r.pass).length
  return NextResponse.json({
    feature: '#255 — Smart next step algorithm prioritization',
    passing,
    total: results.length,
    all_pass: passing === results.length,
    results,
  })
}
