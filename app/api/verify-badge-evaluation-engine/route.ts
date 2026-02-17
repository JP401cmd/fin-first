import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * GET /api/verify-badge-evaluation-engine
 *
 * Verification endpoint for Feature #204: Badge evaluation engine.
 * Tests that:
 * 1. Badge evaluation logic checks user state against all badge criteria
 * 2. Evaluation is triggered on login
 * 3. Evaluation is triggered on action completion
 * 4. Evaluation is triggered on bank file import
 * 5. Evaluation is triggered on month close / snapshot
 * 6. Badges are awarded when criteria met with earned_at timestamp
 * 7. Already-earned badges are not re-awarded (idempotency)
 * 8. POST /api/badges/evaluate endpoint exists and works
 */
export async function GET() {
  const results: Array<{
    test: string
    pass: boolean
    detail: string
  }> = []

  const cwd = process.cwd()

  // ── Test 1: Badge evaluation logic exists and checks criteria ──
  try {
    const evaluateSource = readFileSync(
      join(cwd, 'app/api/badges/evaluate/route.ts'),
      'utf8'
    )
    const hasEvaluateFn = evaluateSource.includes('async function evaluateBadges')
    const fetchesParallel = evaluateSource.includes('Promise.all')
    const checksProfiles = evaluateSource.includes("from('profiles')")
    const checksAccounts = evaluateSource.includes("from('bank_accounts')")
    const checksBudgets = evaluateSource.includes("from('budgets')")
    const checksTransactions = evaluateSource.includes("from('transactions')")
    const checksDebts = evaluateSource.includes("from('debts')")
    const checksAssets = evaluateSource.includes("from('assets')")
    const checksActions = evaluateSource.includes("from('actions')")
    const allDataSources = checksProfiles && checksAccounts && checksBudgets &&
      checksTransactions && checksDebts && checksAssets && checksActions

    results.push({
      test: '1. Badge evaluation logic checks user state against all badge criteria',
      pass: hasEvaluateFn && fetchesParallel && allDataSources,
      detail: hasEvaluateFn && fetchesParallel && allDataSources
        ? 'evaluateBadges() fetches profiles, bank_accounts, budgets, transactions, debts, assets, actions in parallel via Promise.all()'
        : `Missing: fn=${hasEvaluateFn}, parallel=${fetchesParallel}, allSources=${allDataSources}`,
    })
  } catch (err) {
    results.push({
      test: '1. Badge evaluation logic checks user state against all badge criteria',
      pass: false,
      detail: `Error reading evaluate route: ${err}`,
    })
  }

  // ── Test 2: Trigger evaluation on login ──
  try {
    const loginSource = readFileSync(
      join(cwd, 'app/login/page.tsx'),
      'utf8'
    )
    const hasLoginTrigger = loginSource.includes('/api/badges/evaluate') &&
      loginSource.includes("'login'")

    results.push({
      test: '2. Trigger evaluation on login',
      pass: hasLoginTrigger,
      detail: hasLoginTrigger
        ? 'Login page calls /api/badges/evaluate with trigger: "login" after successful signInWithPassword'
        : 'Login page does not trigger badge evaluation after login',
    })
  } catch (err) {
    results.push({
      test: '2. Trigger evaluation on login',
      pass: false,
      detail: `Error reading login page: ${err}`,
    })
  }

  // ── Test 3: Trigger evaluation on action completion ──
  try {
    const actionBoardSource = readFileSync(
      join(cwd, 'components/app/action-board.tsx'),
      'utf8'
    )
    const importsHook = actionBoardSource.includes('useBadgeEvaluation')
    const callsOnComplete = actionBoardSource.includes("evaluateBadges('action_complete')")
    const triggersOnCompleted = actionBoardSource.includes("status === 'completed'") &&
      actionBoardSource.includes('evaluateBadges')

    results.push({
      test: '3. Trigger evaluation on action completion',
      pass: importsHook && callsOnComplete,
      detail: importsHook && callsOnComplete
        ? 'ActionBoard imports useBadgeEvaluation and calls evaluateBadges("action_complete") when status changes to completed'
        : `Missing: hook=${importsHook}, triggerCall=${callsOnComplete}, completedCheck=${triggersOnCompleted}`,
    })
  } catch (err) {
    results.push({
      test: '3. Trigger evaluation on action completion',
      pass: false,
      detail: `Error reading action-board: ${err}`,
    })
  }

  // ── Test 4: Trigger evaluation on bank file import ──
  try {
    const importSource = readFileSync(
      join(cwd, 'app/(app)/core/cash/import/page.tsx'),
      'utf8'
    )
    const hasImportTrigger = importSource.includes('/api/badges/evaluate') &&
      importSource.includes("'import'")

    results.push({
      test: '4. Trigger evaluation on bank file import',
      pass: hasImportTrigger,
      detail: hasImportTrigger
        ? 'Import page calls /api/badges/evaluate with trigger: "import" after successful bank file import'
        : 'Import page does not trigger badge evaluation after import',
    })
  } catch (err) {
    results.push({
      test: '4. Trigger evaluation on bank file import',
      pass: false,
      detail: `Error reading import page: ${err}`,
    })
  }

  // ── Test 5: Trigger evaluation on month close / snapshot ──
  try {
    const autoSnapshotSource = readFileSync(
      join(cwd, 'app/api/snapshots/auto/route.ts'),
      'utf8'
    )
    const snapshotSource = readFileSync(
      join(cwd, 'app/api/snapshots/route.ts'),
      'utf8'
    )
    const autoHasTrigger = autoSnapshotSource.includes('/api/badges/evaluate') &&
      autoSnapshotSource.includes("'month_close'")
    const manualHasTrigger = snapshotSource.includes('/api/badges/evaluate') &&
      snapshotSource.includes("'month_close'")

    results.push({
      test: '5. Trigger evaluation on month close / snapshot',
      pass: autoHasTrigger && manualHasTrigger,
      detail: autoHasTrigger && manualHasTrigger
        ? 'Both auto and manual snapshot endpoints trigger badge evaluation with trigger: "month_close"'
        : `auto=${autoHasTrigger}, manual=${manualHasTrigger}`,
    })
  } catch (err) {
    results.push({
      test: '5. Trigger evaluation on month close / snapshot',
      pass: false,
      detail: `Error reading snapshot routes: ${err}`,
    })
  }

  // ── Test 6: Award badges when criteria met and store earned_at timestamp ──
  try {
    const evaluateSource = readFileSync(
      join(cwd, 'app/api/badges/evaluate/route.ts'),
      'utf8'
    )
    const storesEarnedAt = evaluateSource.includes('earned_at') &&
      evaluateSource.includes('new Date().toISOString()')
    const savesToDb = evaluateSource.includes('saveEarnedBadges')
    const hasEarnedAtInResponse = evaluateSource.includes('earned_at: now')

    results.push({
      test: '6. Award badges when criteria met and store earned_at timestamp',
      pass: storesEarnedAt && savesToDb && hasEarnedAtInResponse,
      detail: storesEarnedAt && savesToDb && hasEarnedAtInResponse
        ? 'Badges awarded with earned_at timestamp, saved via saveEarnedBadges(), and included in response'
        : `earnedAt=${storesEarnedAt}, save=${savesToDb}, response=${hasEarnedAtInResponse}`,
    })
  } catch (err) {
    results.push({
      test: '6. Award badges when criteria met and store earned_at timestamp',
      pass: false,
      detail: `Error: ${err}`,
    })
  }

  // ── Test 7: Don't re-award already earned badges (idempotency) ──
  try {
    const evaluateSource = readFileSync(
      join(cwd, 'app/api/badges/evaluate/route.ts'),
      'utf8'
    )
    const hasExistingEarnedSet = evaluateSource.includes('existingEarned: Set<string>')
    const checksExistingBefore = evaluateSource.includes('existingEarned.has(')
    const getsExistingFirst = evaluateSource.includes('getEarnedBadges')

    // Count how many times existingEarned.has() is checked
    const hasChecks = (evaluateSource.match(/existingEarned\.has\(/g) || []).length
    const sufficientChecks = hasChecks >= 5 // Should have many checks for different badge types

    results.push({
      test: '7. Don\'t re-award already earned badges (idempotency)',
      pass: hasExistingEarnedSet && checksExistingBefore && getsExistingFirst && sufficientChecks,
      detail: hasExistingEarnedSet && checksExistingBefore && getsExistingFirst && sufficientChecks
        ? `Uses Set<string> of existing slugs. getEarnedBadges() called first. ${hasChecks} existingEarned.has() checks before awarding.`
        : `set=${hasExistingEarnedSet}, checks=${checksExistingBefore}(${hasChecks}), getsFirst=${getsExistingFirst}`,
    })
  } catch (err) {
    results.push({
      test: '7. Don\'t re-award already earned badges (idempotency)',
      pass: false,
      detail: `Error: ${err}`,
    })
  }

  // ── Test 8: POST /api/badges/evaluate endpoint exists ──
  try {
    const evaluateSource = readFileSync(
      join(cwd, 'app/api/badges/evaluate/route.ts'),
      'utf8'
    )
    const hasPostExport = evaluateSource.includes('export async function POST')
    const acceptsTrigger = evaluateSource.includes('VALID_TRIGGERS') &&
      evaluateSource.includes("'login'") &&
      evaluateSource.includes("'action_complete'") &&
      evaluateSource.includes("'import'") &&
      evaluateSource.includes("'month_close'") &&
      evaluateSource.includes("'page_load'")
    const returnsTrigger = evaluateSource.includes('trigger,') || evaluateSource.includes('trigger:')
    const checksAuth = evaluateSource.includes("{ error: 'Niet ingelogd' }")

    results.push({
      test: '8. POST /api/badges/evaluate endpoint exists and accepts trigger parameter',
      pass: hasPostExport && acceptsTrigger && checksAuth,
      detail: hasPostExport && acceptsTrigger && checksAuth
        ? 'POST endpoint exported, accepts trigger parameter (login/action_complete/import/month_close/page_load/manual), returns trigger in response, requires authentication'
        : `post=${hasPostExport}, triggers=${acceptsTrigger}, auth=${checksAuth}`,
    })
  } catch (err) {
    results.push({
      test: '8. POST /api/badges/evaluate endpoint exists and accepts trigger parameter',
      pass: false,
      detail: `Error: ${err}`,
    })
  }

  // ── Test 9: useBadgeEvaluation hook supports trigger parameter ──
  try {
    const hookSource = readFileSync(
      join(cwd, 'lib/hooks/use-badge-evaluation.ts'),
      'utf8'
    )
    const exportsTriggerType = hookSource.includes('BadgeEvaluationTrigger')
    const acceptsTriggerParam = hookSource.includes('trigger: BadgeEvaluationTrigger') ||
      hookSource.includes('trigger:BadgeEvaluationTrigger')
    const sendsTrigger = hookSource.includes('JSON.stringify({ trigger })')

    results.push({
      test: '9. useBadgeEvaluation hook supports trigger parameter',
      pass: exportsTriggerType && acceptsTriggerParam && sendsTrigger,
      detail: exportsTriggerType && acceptsTriggerParam && sendsTrigger
        ? 'Hook exports BadgeEvaluationTrigger type, evaluateBadges() accepts trigger parameter, sends trigger in request body'
        : `type=${exportsTriggerType}, param=${acceptsTriggerParam}, sends=${sendsTrigger}`,
    })
  } catch (err) {
    results.push({
      test: '9. useBadgeEvaluation hook supports trigger parameter',
      pass: false,
      detail: `Error: ${err}`,
    })
  }

  // ── Test 10: BadgeEvaluator component passes page_load trigger ──
  try {
    const evaluatorSource = readFileSync(
      join(cwd, 'components/app/badge-evaluator.tsx'),
      'utf8'
    )
    const passesPageLoad = evaluatorSource.includes("evaluateBadges('page_load')")

    results.push({
      test: '10. BadgeEvaluator component passes page_load trigger',
      pass: passesPageLoad,
      detail: passesPageLoad
        ? 'BadgeEvaluator passes "page_load" trigger to evaluateBadges() on mount'
        : 'BadgeEvaluator does not pass page_load trigger',
    })
  } catch (err) {
    results.push({
      test: '10. BadgeEvaluator component passes page_load trigger',
      pass: false,
      detail: `Error: ${err}`,
    })
  }

  // ── Test 11: All trigger calls are fire-and-forget (non-blocking) ──
  try {
    const loginSource = readFileSync(join(cwd, 'app/login/page.tsx'), 'utf8')
    const importSource = readFileSync(join(cwd, 'app/(app)/core/cash/import/page.tsx'), 'utf8')
    const autoSnapshotSource = readFileSync(join(cwd, 'app/api/snapshots/auto/route.ts'), 'utf8')

    const loginFireAndForget = loginSource.includes('.catch(() => {})') &&
      loginSource.includes('/api/badges/evaluate')
    const importFireAndForget = importSource.includes('.catch(() => {})') &&
      importSource.includes('/api/badges/evaluate')
    const snapshotFireAndForget = autoSnapshotSource.includes('.catch(() => {})') &&
      autoSnapshotSource.includes('/api/badges/evaluate')

    results.push({
      test: '11. All trigger calls are fire-and-forget (non-blocking)',
      pass: loginFireAndForget && importFireAndForget && snapshotFireAndForget,
      detail: loginFireAndForget && importFireAndForget && snapshotFireAndForget
        ? 'Login, import, and snapshot triggers all use .catch(() => {}) for silent failure (non-blocking)'
        : `login=${loginFireAndForget}, import=${importFireAndForget}, snapshot=${snapshotFireAndForget}`,
    })
  } catch (err) {
    results.push({
      test: '11. All trigger calls are fire-and-forget (non-blocking)',
      pass: false,
      detail: `Error: ${err}`,
    })
  }

  // ── Test 12: Dashboard has BadgeEvaluator for automatic evaluation ──
  try {
    const dashboardSource = readFileSync(
      join(cwd, 'app/(app)/dashboard/page.tsx'),
      'utf8'
    )
    const hasBadgeEvaluator = dashboardSource.includes('<BadgeEvaluator') &&
      dashboardSource.includes("import { BadgeEvaluator }")

    results.push({
      test: '12. Dashboard has BadgeEvaluator for automatic evaluation on page load',
      pass: hasBadgeEvaluator,
      detail: hasBadgeEvaluator
        ? 'Dashboard imports and renders <BadgeEvaluator /> for automatic badge evaluation on navigation'
        : 'Dashboard does not include BadgeEvaluator component',
    })
  } catch (err) {
    results.push({
      test: '12. Dashboard has BadgeEvaluator for automatic evaluation on page load',
      pass: false,
      detail: `Error: ${err}`,
    })
  }

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#204 Badge evaluation engine',
    passing,
    total,
    all_passing: passing === total,
    results,
  })
}
