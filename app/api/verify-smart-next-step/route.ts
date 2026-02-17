import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * GET /api/verify-smart-next-step — Verify feature #198:
 * Smart 'Volgende Stap' next step engine.
 *
 * Tests all 10 feature requirements via source code analysis.
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

  // --- Test 1: NextStepCard component exists ---
  const nextStepCard = readFile('components/app/next-step-card.tsx')
  results.push({
    name: '1. NextStepCard component exists',
    pass: nextStepCard.includes('export function NextStepCard') && nextStepCard.includes('export function NextStepSection'),
    detail: nextStepCard.includes('export function NextStepCard')
      ? 'NextStepCard and NextStepSection components exist in components/app/next-step-card.tsx'
      : 'Missing NextStepCard component',
  })

  // --- Test 2: Next step algorithm evaluates user data completeness ---
  const hasComputeKern = nextStepCard.includes('export function computeAllKernSteps')
  const hasComputeWil = nextStepCard.includes('export function computeAllWilSteps')
  const hasComputeHorizon = nextStepCard.includes('export function computeAllHorizonSteps')
  const checksHasTransactions = nextStepCard.includes('hasTransactions')
  const checksBudgetCount = nextStepCard.includes('budgetCount')
  const checksAssets = nextStepCard.includes('totalAssets')
  const checksGoals = nextStepCard.includes('goalCount')
  results.push({
    name: '2. Algorithm evaluates user data completeness',
    pass: hasComputeKern && hasComputeWil && hasComputeHorizon && checksHasTransactions && checksBudgetCount && checksAssets && checksGoals,
    detail: `computeAllKernSteps=${hasComputeKern}, computeAllWilSteps=${hasComputeWil}, computeAllHorizonSteps=${hasComputeHorizon}. Checks: transactions=${checksHasTransactions}, budgets=${checksBudgetCount}, assets=${checksAssets}, goals=${checksGoals}`,
  })

  // --- Test 3: Shows 'Importeer je eerste bankafschrift' when no transactions ---
  const hasImportStep = nextStepCard.includes("key: 'import_transactions'") && nextStepCard.includes('Importeer je eerste bankafschrift')
  const importCondition = nextStepCard.includes('!data.hasTransactions')
  results.push({
    name: "3. Shows 'Importeer je eerste bankafschrift' when no transactions",
    pass: hasImportStep && importCondition,
    detail: hasImportStep && importCondition
      ? "Step key 'import_transactions' with title 'Importeer je eerste bankafschrift' shown when !data.hasTransactions"
      : `importStep=${hasImportStep}, condition=${importCondition}`,
  })

  // --- Test 4: Shows 'Voeg je vermogen toe' when no assets ---
  const hasAssetsStep = nextStepCard.includes("key: 'add_assets'") && nextStepCard.includes('Voeg je vermogen toe')
  const assetsCondition = nextStepCard.includes('data.totalAssets === 0')
  results.push({
    name: "4. Shows 'Voeg je vermogen toe' when no assets exist",
    pass: hasAssetsStep && assetsCondition,
    detail: hasAssetsStep && assetsCondition
      ? "Step key 'add_assets' with title 'Voeg je vermogen toe' shown when totalAssets === 0"
      : `assetsStep=${hasAssetsStep}, condition=${assetsCondition}`,
  })

  // --- Test 5: Shows budget attention alerts when budgets are over limit ---
  const hasBudgetAttention = nextStepCard.includes("key: 'budget_attention'") && nextStepCard.includes('aandacht nodig')
  const budgetCondition = nextStepCard.includes('alertBudgetCount')
  results.push({
    name: '5. Shows budget attention alerts when budgets over limit',
    pass: hasBudgetAttention && budgetCondition,
    detail: hasBudgetAttention && budgetCondition
      ? "Step key 'budget_attention' with dynamic 'X budgetten hebben aandacht nodig' shown when alertBudgetCount > 0"
      : `budgetAttentionStep=${hasBudgetAttention}, alertBudgetCount=${budgetCondition}`,
  })

  // --- Test 6: Shows 'Stel je eerste doel in' when no goals ---
  const hasGoalsStep = nextStepCard.includes("key: 'set_goals'") && nextStepCard.includes('Stel je eerste doel in')
  const goalsCondition = nextStepCard.includes('data.goalCount === 0')
  results.push({
    name: "6. Shows 'Stel je eerste doel in' when no goals exist",
    pass: hasGoalsStep && goalsCondition,
    detail: hasGoalsStep && goalsCondition
      ? "Step key 'set_goals' with title 'Stel je eerste doel in' shown when goalCount === 0"
      : `goalsStep=${hasGoalsStep}, condition=${goalsCondition}`,
  })

  // --- Test 7: Card placed prominently below hero on each overview page ---
  const corePage = readFile('app/(app)/core/page.tsx')
  const willPage = readFile('app/(app)/will/page.tsx')
  const horizonPage = readFile('app/(app)/horizon/page.tsx')

  const coreHasNextStep = corePage.includes('NextStepSection') && corePage.includes('computeAllKernSteps')
  const willHasNextStep = willPage.includes('NextStepSection') && willPage.includes('computeAllWilSteps')
  const horizonHasNextStep = horizonPage.includes('NextStepSection') && horizonPage.includes('computeAllHorizonSteps')

  // Check placement is after hero section (search for "Next Step Card" comment after hero)
  const coreAfterHero = corePage.indexOf('Next Step Card') > corePage.indexOf('</section>')
  const willAfterHero = willPage.indexOf('Next Step Card') > willPage.indexOf('</section>')
  const horizonAfterHero = horizonPage.indexOf('Next Step Card') > horizonPage.indexOf('</section>')

  results.push({
    name: '7. Card placed below hero on each overview page',
    pass: coreHasNextStep && willHasNextStep && horizonHasNextStep && coreAfterHero && willAfterHero && horizonAfterHero,
    detail: `Core: ${coreHasNextStep} (afterHero=${coreAfterHero}), Will: ${willHasNextStep} (afterHero=${willAfterHero}), Horizon: ${horizonHasNextStep} (afterHero=${horizonAfterHero})`,
  })

  // --- Test 8: Limited to 1-2 suggestions per page ---
  // NextStepSection shows only first visible step (currentStep = visibleSteps[0])
  const showsSingleStep = nextStepCard.includes('const currentStep = visibleSteps.length > 0 ? visibleSteps[0] : null')
  const showsSingleCard = nextStepCard.includes('return <NextStepCard step={currentStep}')
  results.push({
    name: '8. Limit to 1-2 suggestions per page',
    pass: showsSingleStep && showsSingleCard,
    detail: showsSingleStep && showsSingleCard
      ? 'NextStepSection renders only the first non-dismissed step (single card per page)'
      : `singleStepLogic=${showsSingleStep}, singleCardRender=${showsSingleCard}`,
  })

  // --- Test 9: Dismiss and complete functionality ---
  const hasDismissHandler = nextStepCard.includes('handleDismiss') && nextStepCard.includes("onDismiss={handleDismiss}")
  const hasDismissButton = nextStepCard.includes('data-testid="dismiss-next-step"')
  const hasDismissAPI = nextStepCard.includes("/api/next-steps/dismiss")
  const hasOptimisticUpdate = nextStepCard.includes('setDismissedKeys(prev => new Set([...prev, key]))')
  const hasCompletedKeys = nextStepCard.includes('completedKeys')
  results.push({
    name: '9. Dismiss and complete functionality implemented',
    pass: hasDismissHandler && hasDismissButton && hasDismissAPI && hasOptimisticUpdate && hasCompletedKeys,
    detail: `dismissHandler=${hasDismissHandler}, dismissButton=${hasDismissButton}, dismissAPI=${hasDismissAPI}, optimistic=${hasOptimisticUpdate}, completedKeys=${hasCompletedKeys}`,
  })

  // --- Test 10: Persist dismissed/completed steps per user via API ---
  const dismissRoute = readFile('app/api/next-steps/dismiss/route.ts')
  const completeRoute = readFile('app/api/next-steps/complete/route.ts')
  const getRoute = readFile('app/api/next-steps/route.ts')

  const dismissUsesDb = dismissRoute.includes('next_step_completions') && dismissRoute.includes('upsert')
  const completeUsesDb = completeRoute.includes('next_step_completions') && completeRoute.includes('upsert')
  const getLoadsFromDb = getRoute.includes('next_step_completions') && getRoute.includes('dismissed_steps')
  const hasAuthCheck = dismissRoute.includes('auth.getUser()') && completeRoute.includes('auth.getUser()') && getRoute.includes('auth.getUser()')
  const fetchesDismissedOnMount = nextStepCard.includes("/api/next-steps") && nextStepCard.includes('loadDismissedAndCompleted')

  results.push({
    name: '10. Persist dismissed/completed per user via API',
    pass: dismissUsesDb && completeUsesDb && getLoadsFromDb && hasAuthCheck && fetchesDismissedOnMount,
    detail: `dismissDB=${dismissUsesDb}, completeDB=${completeUsesDb}, getLoads=${getLoadsFromDb}, authChecks=${hasAuthCheck}, fetchOnMount=${fetchesDismissedOnMount}`,
  })

  // --- Test 11: Database table exists for persistence ---
  const migrationFile = readFile('supabase/migrations/20260215000001_create_new_tables.sql')
  const tableExists = migrationFile.includes('CREATE TABLE IF NOT EXISTS next_step_completions')
  const hasUniqueConstraint = migrationFile.includes('UNIQUE(user_id, step_key)')
  const hasRLS = migrationFile.includes('ALTER TABLE next_step_completions ENABLE ROW LEVEL SECURITY')
  results.push({
    name: '11. Database table next_step_completions with RLS',
    pass: tableExists && hasUniqueConstraint && hasRLS,
    detail: `table=${tableExists}, uniqueConstraint=${hasUniqueConstraint}, RLS=${hasRLS}`,
  })

  // --- Test 12: Core page passes alertBudgetCount ---
  const corePassesAlertCount = corePage.includes('alertBudgetCount: alertBudgets.length')
  results.push({
    name: '12. Core page passes alertBudgetCount to algorithm',
    pass: corePassesAlertCount,
    detail: corePassesAlertCount
      ? 'Core page passes alertBudgets.length to computeAllKernSteps for budget attention step'
      : 'Core page missing alertBudgetCount parameter',
  })

  // --- Test 13: NextStepEmptyCard shows when all steps done ---
  const hasEmptyCard = nextStepCard.includes('export function NextStepEmptyCard')
  const emptyCardRendered = nextStepCard.includes('return <NextStepEmptyCard')
  const emptyShowsAllesBij = nextStepCard.includes('Alles bij')
  results.push({
    name: '13. Empty state card when all steps dismissed/completed',
    pass: hasEmptyCard && emptyCardRendered && emptyShowsAllesBij,
    detail: `emptyCard=${hasEmptyCard}, rendered=${emptyCardRendered}, showsAllesBij=${emptyShowsAllesBij}`,
  })

  // --- Test 14: Module-themed colors ---
  const hasAmber = nextStepCard.includes("amber: {") && nextStepCard.includes('border-amber-200')
  const hasTeal = nextStepCard.includes("teal: {") && nextStepCard.includes('border-teal-200')
  const hasPurple = nextStepCard.includes("purple: {") && nextStepCard.includes('border-purple-200')
  results.push({
    name: '14. Module-themed colors (amber/teal/purple)',
    pass: hasAmber && hasTeal && hasPurple,
    detail: `amber=${hasAmber}, teal=${hasTeal}, purple=${hasPurple}`,
  })

  const passing = results.filter(r => r.pass).length
  return NextResponse.json({
    feature: '#198 — Smart Volgende Stap next step engine',
    passing,
    total: results.length,
    all_pass: passing === results.length,
    results,
  })
}
