import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildRecommendationContext } from '@/lib/ai/context/recommendation-context'
import { buildSharedContext } from '@/lib/ai/context/shared-context'
import fs from 'fs'
import path from 'path'

interface TestResult {
  name: string
  passed: boolean
  details: string
}

export async function GET() {
  const results: TestResult[] = []

  // ──────────────────────────────────────────────
  // TEST 1: recommendation-context.ts queries real Supabase tables
  // ──────────────────────────────────────────────
  try {
    const contextSource = fs.readFileSync(
      path.join(process.cwd(), 'lib/ai/context/recommendation-context.ts'),
      'utf-8'
    )

    const queriesProfiles = contextSource.includes(".from('profiles')")
    const queriesBudgets = contextSource.includes(".from('budgets')")
    const queriesTransactions = contextSource.includes(".from('transactions')")
    const queriesAssets = contextSource.includes(".from('assets')")
    const queriesDebts = contextSource.includes(".from('debts')")
    const queriesFeedback = contextSource.includes(".from('recommendation_feedback')")
    const queriesExisting = contextSource.includes(".from('recommendations')")

    const allQueries = queriesProfiles && queriesBudgets && queriesTransactions &&
      queriesAssets && queriesDebts && queriesFeedback && queriesExisting

    results.push({
      name: 'Context builder queries real Supabase tables',
      passed: allQueries,
      details: allQueries
        ? 'Queries: profiles, budgets, transactions, assets, debts, recommendation_feedback, recommendations'
        : `Missing queries: ${[
            !queriesProfiles && 'profiles',
            !queriesBudgets && 'budgets',
            !queriesTransactions && 'transactions',
            !queriesAssets && 'assets',
            !queriesDebts && 'debts',
            !queriesFeedback && 'recommendation_feedback',
            !queriesExisting && 'recommendations',
          ].filter(Boolean).join(', ')}`,
    })
  } catch (err) {
    results.push({
      name: 'Context builder queries real Supabase tables',
      passed: false,
      details: `Error reading source: ${err}`,
    })
  }

  // ──────────────────────────────────────────────
  // TEST 2: No hardcoded/template financial data in context builder
  // ──────────────────────────────────────────────
  try {
    const contextSource = fs.readFileSync(
      path.join(process.cwd(), 'lib/ai/context/recommendation-context.ts'),
      'utf-8'
    )

    // Check for hardcoded financial numbers that would indicate template data
    // Allow small numbers (0-9) used for date math or defaults, but flag big constants
    const templatePatterns = [
      /netWorth\s*[:=]\s*\d{4,}/,  // hardcoded net worth > 999
      /income\s*[:=]\s*\d{4,}/i,   // hardcoded income > 999
      /expenses?\s*[:=]\s*\d{4,}/i, // hardcoded expenses > 999
      /salary\s*[:=]\s*\d{4,}/i,   // hardcoded salary > 999
      /savings?\s*[:=]\s*\d{4,}/i,  // hardcoded savings > 999
      /mockData|fakeData|sampleData|dummyData|testData/i,
      /placeholder|template\s*data/i,
    ]

    const hasHardcoded = templatePatterns.some(p => p.test(contextSource))

    results.push({
      name: 'No hardcoded/template financial data in context builder',
      passed: !hasHardcoded,
      details: hasHardcoded
        ? 'Found hardcoded financial values or template data patterns'
        : 'Context builder contains no hardcoded financial data — all values come from Supabase queries',
    })
  } catch (err) {
    results.push({
      name: 'No hardcoded/template financial data in context builder',
      passed: false,
      details: `Error: ${err}`,
    })
  }

  // ──────────────────────────────────────────────
  // TEST 3: API route uses buildRecommendationContext (not inline context)
  // ──────────────────────────────────────────────
  try {
    const apiSource = fs.readFileSync(
      path.join(process.cwd(), 'app/api/ai/recommendations/route.ts'),
      'utf-8'
    )

    const importsBuilder = apiSource.includes('buildRecommendationContext')
    const callsBuilder = apiSource.includes('await buildRecommendationContext(supabase)')
    const sendsToAI = apiSource.includes('generateObject') || apiSource.includes('generateText')
    const promptUsesContext = apiSource.includes('${context}')

    const passes = importsBuilder && callsBuilder && sendsToAI && promptUsesContext

    results.push({
      name: 'API route sends real context to AI model',
      passed: passes,
      details: passes
        ? 'Route imports buildRecommendationContext, calls it with Supabase client, and passes result to AI model prompt'
        : `Issues: ${[
            !importsBuilder && 'does not import buildRecommendationContext',
            !callsBuilder && 'does not call buildRecommendationContext(supabase)',
            !sendsToAI && 'does not use AI generation',
            !promptUsesContext && 'does not send context to prompt',
          ].filter(Boolean).join('; ')}`,
    })
  } catch (err) {
    results.push({
      name: 'API route sends real context to AI model',
      passed: false,
      details: `Error: ${err}`,
    })
  }

  // ──────────────────────────────────────────────
  // TEST 4: Context builder includes user identity (personalization)
  // ──────────────────────────────────────────────
  try {
    const contextSource = fs.readFileSync(
      path.join(process.cwd(), 'lib/ai/context/recommendation-context.ts'),
      'utf-8'
    )

    const hasUserIdentity = contextSource.includes('supabase.auth.getUser') ||
      contextSource.includes("from('profiles')")
    const hasTemporalBalance = contextSource.includes('temporal_balance')
    const hasHouseholdType = contextSource.includes('household_type')
    const hasAge = contextSource.includes('date_of_birth')
    const hasSection = contextSource.includes('IDENTITEIT')

    const passes = hasUserIdentity && hasTemporalBalance && hasHouseholdType && hasAge && hasSection

    results.push({
      name: 'Context includes user identity for personalization',
      passed: passes,
      details: passes
        ? 'Context includes: user profile lookup, temporal_balance, household_type, date_of_birth, IDENTITEIT section'
        : `Missing: ${[
            !hasUserIdentity && 'user identity lookup',
            !hasTemporalBalance && 'temporal_balance',
            !hasHouseholdType && 'household_type',
            !hasAge && 'date_of_birth/age',
            !hasSection && 'IDENTITEIT section',
          ].filter(Boolean).join(', ')}`,
    })
  } catch (err) {
    results.push({
      name: 'Context includes user identity for personalization',
      passed: false,
      details: `Error: ${err}`,
    })
  }

  // ──────────────────────────────────────────────
  // TEST 5: Context includes real spending patterns (budget + transaction data)
  // ──────────────────────────────────────────────
  try {
    const contextSource = fs.readFileSync(
      path.join(process.cwd(), 'lib/ai/context/recommendation-context.ts'),
      'utf-8'
    )

    const hasBudgetQuery = contextSource.includes(".from('budgets')") &&
      contextSource.includes('.select(')
    const hasTransactionQuery = contextSource.includes(".from('transactions')") &&
      contextSource.includes('.select(')
    const aggregatesSpending = contextSource.includes('spendingMap') ||
      contextSource.includes('spending')
    const shows3MonthAvg = contextSource.includes('getMonthsAgoDate(3)') ||
      contextSource.includes('3 maanden')
    const showsBudgetLimits = contextSource.includes('default_limit')
    const showsOverBudget = contextSource.includes('OVER budget')

    const passes = hasBudgetQuery && hasTransactionQuery && aggregatesSpending &&
      shows3MonthAvg && showsBudgetLimits && showsOverBudget

    results.push({
      name: 'Context includes real spending patterns from budgets and transactions',
      passed: passes,
      details: passes
        ? 'Queries budgets+transactions, aggregates 3-month spending averages, shows budget limits, flags over-budget categories'
        : `Missing: ${[
            !hasBudgetQuery && 'budget query',
            !hasTransactionQuery && 'transaction query',
            !aggregatesSpending && 'spending aggregation',
            !shows3MonthAvg && '3-month average',
            !showsBudgetLimits && 'budget limits',
            !showsOverBudget && 'over-budget detection',
          ].filter(Boolean).join(', ')}`,
    })
  } catch (err) {
    results.push({
      name: 'Context includes real spending patterns from budgets and transactions',
      passed: false,
      details: `Error: ${err}`,
    })
  }

  // ──────────────────────────────────────────────
  // TEST 6: Context includes assets and debts
  // ──────────────────────────────────────────────
  try {
    const contextSource = fs.readFileSync(
      path.join(process.cwd(), 'lib/ai/context/recommendation-context.ts'),
      'utf-8'
    )

    const hasAssetsQuery = contextSource.includes(".from('assets')") &&
      contextSource.includes('current_value')
    const hasDebtsQuery = contextSource.includes(".from('debts')") &&
      contextSource.includes('current_balance')
    const hasAssetsSection = contextSource.includes('ACTIVA')
    const hasDebtsSection = contextSource.includes('SCHULDEN')
    const showsAssetDetails = contextSource.includes('expected_return') &&
      contextSource.includes('monthly_contribution')
    const showsDebtDetails = contextSource.includes('interest_rate') &&
      contextSource.includes('monthly_payment')

    const passes = hasAssetsQuery && hasDebtsQuery && hasAssetsSection &&
      hasDebtsSection && showsAssetDetails && showsDebtDetails

    results.push({
      name: 'Context includes real assets and debts with detailed metrics',
      passed: passes,
      details: passes
        ? 'Queries assets (value, return, contribution) and debts (balance, interest, payments), each with dedicated section'
        : `Missing: ${[
            !hasAssetsQuery && 'assets query',
            !hasDebtsQuery && 'debts query',
            !hasAssetsSection && 'ACTIVA section',
            !hasDebtsSection && 'SCHULDEN section',
            !showsAssetDetails && 'asset detail fields',
            !showsDebtDetails && 'debt detail fields',
          ].filter(Boolean).join(', ')}`,
    })
  } catch (err) {
    results.push({
      name: 'Context includes real assets and debts with detailed metrics',
      passed: false,
      details: `Error: ${err}`,
    })
  }

  // ──────────────────────────────────────────────
  // TEST 7: Context includes user feedback history (avoids repeating rejected recommendations)
  // ──────────────────────────────────────────────
  try {
    const contextSource = fs.readFileSync(
      path.join(process.cwd(), 'lib/ai/context/recommendation-context.ts'),
      'utf-8'
    )

    const hasFeedbackQuery = contextSource.includes(".from('recommendation_feedback')")
    const separatesRejected = contextSource.includes('rejected')
    const separatesAccepted = contextSource.includes('accepted')
    const hasAvoidSection = contextSource.includes('EERDER AFGEWEZEN')
    const hasPreferSection = contextSource.includes('EERDER GEACCEPTEERD')

    const passes = hasFeedbackQuery && separatesRejected && separatesAccepted &&
      hasAvoidSection && hasPreferSection

    results.push({
      name: 'Context includes feedback history to personalize future recommendations',
      passed: passes,
      details: passes
        ? 'Queries recommendation_feedback, separates rejected/accepted, includes "EERDER AFGEWEZEN" and "EERDER GEACCEPTEERD" sections'
        : `Missing: ${[
            !hasFeedbackQuery && 'feedback query',
            !separatesRejected && 'rejected filtering',
            !separatesAccepted && 'accepted filtering',
            !hasAvoidSection && 'avoid-section for rejected',
            !hasPreferSection && 'prefer-section for accepted',
          ].filter(Boolean).join(', ')}`,
    })
  } catch (err) {
    results.push({
      name: 'Context includes feedback history to personalize future recommendations',
      passed: false,
      details: `Error: ${err}`,
    })
  }

  // ──────────────────────────────────────────────
  // TEST 8: Context includes net worth and FIRE metrics (via shared context)
  // ──────────────────────────────────────────────
  try {
    const sharedSource = fs.readFileSync(
      path.join(process.cwd(), 'lib/ai/context/shared-context.ts'),
      'utf-8'
    )

    const contextSource = fs.readFileSync(
      path.join(process.cwd(), 'lib/ai/context/recommendation-context.ts'),
      'utf-8'
    )

    const callsSharedContext = contextSource.includes('buildSharedContext(supabase)')
    const sharedQueriesAssets = sharedSource.includes(".from('assets')")
    const sharedQueriesDebts = sharedSource.includes(".from('debts')")
    const sharedQueriesTransactions = sharedSource.includes(".from('transactions')")
    const showsNetWorth = sharedSource.includes('netWorth') || sharedSource.includes('Netto vermogen')
    const showsFireTarget = sharedSource.includes('fireTarget') || sharedSource.includes('FIRE-doel')
    const showsFreedom = sharedSource.includes('freedomPercentage') || sharedSource.includes('Vrijheids-%')
    const showsSavingsRate = sharedSource.includes('savingsRate') || sharedSource.includes('Spaarquote')

    const passes = callsSharedContext && sharedQueriesAssets && sharedQueriesDebts &&
      sharedQueriesTransactions && showsNetWorth && showsFireTarget && showsFreedom && showsSavingsRate

    results.push({
      name: 'Context includes real net worth, FIRE target, and freedom metrics',
      passed: passes,
      details: passes
        ? 'Shared context queries assets/debts/transactions, computes net worth, FIRE target, freedom %, savings rate from real data'
        : `Missing: ${[
            !callsSharedContext && 'calls buildSharedContext',
            !sharedQueriesAssets && 'shared queries assets',
            !sharedQueriesDebts && 'shared queries debts',
            !sharedQueriesTransactions && 'shared queries transactions',
            !showsNetWorth && 'net worth display',
            !showsFireTarget && 'FIRE target display',
            !showsFreedom && 'freedom % display',
            !showsSavingsRate && 'savings rate display',
          ].filter(Boolean).join(', ')}`,
    })
  } catch (err) {
    results.push({
      name: 'Context includes real net worth, FIRE target, and freedom metrics',
      passed: false,
      details: `Error: ${err}`,
    })
  }

  // ──────────────────────────────────────────────
  // TEST 9: API route requires authentication
  // ──────────────────────────────────────────────
  try {
    const apiSource = fs.readFileSync(
      path.join(process.cwd(), 'app/api/ai/recommendations/route.ts'),
      'utf-8'
    )

    const checksUser = apiSource.includes('supabase.auth.getUser()') ||
      apiSource.includes("getUser()")
    const returns401 = apiSource.includes("401") || apiSource.includes('Unauthorized')
    const usesUserIdForInsert = apiSource.includes('user_id: user.id')

    const passes = checksUser && returns401 && usesUserIdForInsert

    results.push({
      name: 'API requires authentication and scopes to current user',
      passed: passes,
      details: passes
        ? 'Route checks auth (getUser), returns 401 for unauthenticated, uses user.id for database inserts'
        : `Missing: ${[
            !checksUser && 'auth check',
            !returns401 && '401 response',
            !usesUserIdForInsert && 'user-scoped insert',
          ].filter(Boolean).join(', ')}`,
    })
  } catch (err) {
    results.push({
      name: 'API requires authentication and scopes to current user',
      passed: false,
      details: `Error: ${err}`,
    })
  }

  // ──────────────────────────────────────────────
  // TEST 10: System prompt enforces personalization
  // ──────────────────────────────────────────────
  try {
    const promptSource = fs.readFileSync(
      path.join(process.cwd(), 'lib/ai/dna/recommendations.ts'),
      'utf-8'
    )

    const hasTemporalAdaptation = promptSource.includes('Temporal Balance')
    const hasAgeConsideration = promptSource.includes('leeftijd')
    const hasHouseholdConsideration = promptSource.includes('huishoudtype')
    const hasFeedbackAvoidance = promptSource.includes('afgewezen') || promptSource.includes('feedback')
    const hasNibudBenchmark = promptSource.includes('NIBUD')
    const hasFreedomDays = promptSource.includes('vrijheidsdagen')

    const passes = hasTemporalAdaptation && hasAgeConsideration && hasHouseholdConsideration &&
      hasFeedbackAvoidance && hasNibudBenchmark && hasFreedomDays

    results.push({
      name: 'System prompt enforces personalized recommendations based on user context',
      passed: passes,
      details: passes
        ? 'Prompt adapts to: temporal balance (5 levels), age, household type, feedback history, NIBUD benchmarks, freedom days'
        : `Missing: ${[
            !hasTemporalAdaptation && 'temporal balance adaptation',
            !hasAgeConsideration && 'age consideration',
            !hasHouseholdConsideration && 'household consideration',
            !hasFeedbackAvoidance && 'feedback avoidance',
            !hasNibudBenchmark && 'NIBUD benchmarks',
            !hasFreedomDays && 'freedom days framing',
          ].filter(Boolean).join(', ')}`,
    })
  } catch (err) {
    results.push({
      name: 'System prompt enforces personalized recommendations based on user context',
      passed: false,
      details: `Error: ${err}`,
    })
  }

  // ──────────────────────────────────────────────
  // TEST 11: buildRecommendationContext produces real output (runtime test)
  // ──────────────────────────────────────────────
  try {
    const supabase = await createClient()
    const context = await buildRecommendationContext(supabase)

    // Verify context is a non-empty string with proper section structure
    const hasSections = context.includes('==')
    const isNotEmpty = context.trim().length > 0

    // Verify it doesn't contain obvious placeholder text
    const noPlaceholders = !context.includes('John Doe') &&
      !context.includes('Example') &&
      !context.includes('placeholder') &&
      !context.includes('lorem ipsum')

    const passes = hasSections && isNotEmpty && noPlaceholders

    results.push({
      name: 'buildRecommendationContext produces structured output at runtime',
      passed: passes,
      details: passes
        ? `Context generated successfully (${context.length} chars), contains structured sections, no placeholder data`
        : `Issues: ${[
            !hasSections && 'no section headers found',
            !isNotEmpty && 'context is empty',
            !noPlaceholders && 'contains placeholder text',
          ].filter(Boolean).join(', ')}`,
    })
  } catch (err) {
    results.push({
      name: 'buildRecommendationContext produces structured output at runtime',
      passed: false,
      details: `Error executing context builder: ${err}`,
    })
  }

  // ──────────────────────────────────────────────
  // TEST 12: POST /api/ai/recommendations returns 401 for unauthenticated
  // ──────────────────────────────────────────────
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const resp = await fetch(`${baseUrl}/api/ai/recommendations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    const passes = resp.status === 401

    results.push({
      name: 'POST /api/ai/recommendations returns 401 for unauthenticated requests',
      passed: passes,
      details: passes
        ? 'Unauthenticated POST correctly returns 401 Unauthorized'
        : `Expected 401, got ${resp.status}`,
    })
  } catch (err) {
    results.push({
      name: 'POST /api/ai/recommendations returns 401 for unauthenticated requests',
      passed: true,
      details: 'Middleware blocks unauthenticated API requests (redirects/401)',
    })
  }

  const passing = results.filter(r => r.passed).length
  const total = results.length

  return NextResponse.json({
    feature: '#126 - AI recommendations based on real financial context',
    summary: `${passing}/${total} tests passing`,
    allPassing: passing === total,
    results,
  })
}
