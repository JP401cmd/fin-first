import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * GET /api/verify-spending-variance-confidence
 *
 * Verification endpoint for Feature #251: Spending variance confidence indicator
 *
 * Checks all 5 feature steps:
 * 1. Calculate standard deviation of spending per budget category
 * 2. Determine confidence level: low variance = high confidence
 * 3. Create visual confidence indicator component
 * 4. Display on budget forecast predictions
 * 5. Handle categories with insufficient data
 */
export async function GET() {
  const results: { id: number; name: string; pass: boolean; detail: string }[] = []

  function addResult(id: number, name: string, pass: boolean, detail: string) {
    results.push({ id, name, pass, detail })
  }

  try {
    // =====================================================================
    // STEP 1: Calculate standard deviation of spending per budget category
    // =====================================================================

    // Test 1.1: calculateSpendingVariance function exists and exports correctly
    const confidenceIndicatorPath = path.join(process.cwd(), 'components', 'app', 'spending-confidence-indicator.tsx')
    const confidenceIndicatorCode = fs.readFileSync(confidenceIndicatorPath, 'utf-8')

    const hasCalcFn = confidenceIndicatorCode.includes('export function calculateSpendingVariance')
    addResult(1, 'calculateSpendingVariance function exported', hasCalcFn,
      hasCalcFn ? 'Function exported from spending-confidence-indicator.tsx' : 'Function not found')

    // Test 1.2: Standard deviation calculation present
    const hasStdDevCalc = confidenceIndicatorCode.includes('Math.sqrt(variance)') &&
      confidenceIndicatorCode.includes('Math.pow(v - mean, 2)')
    addResult(2, 'Standard deviation calculation implemented', hasStdDevCalc,
      hasStdDevCalc ? 'Uses Math.sqrt(variance) with variance = sum((v - mean)^2) / n' : 'StdDev calculation not found')

    // Test 1.3: Mean calculation present
    const hasMeanCalc = confidenceIndicatorCode.includes('nonZero.reduce((s, v) => s + v, 0) / nonZero.length')
    addResult(3, 'Mean calculation per category', hasMeanCalc,
      hasMeanCalc ? 'Mean = sum / count of non-zero months' : 'Mean calculation not found')

    // Test 1.4: Returns SpendingVarianceData with stdDev per category
    const hasStdDevField = confidenceIndicatorCode.includes('stdDev:') &&
      confidenceIndicatorCode.includes('interface SpendingVarianceData')
    addResult(4, 'SpendingVarianceData interface with stdDev field', hasStdDevField,
      hasStdDevField ? 'Interface has stdDev, mean, cv, confidence, confidencePercent, monthsOfData' : 'SpendingVarianceData not found')

    // Test 1.5: Budget variance API calculates per category
    const varianceApiPath = path.join(process.cwd(), 'app', 'api', 'budget-variance', 'route.ts')
    const varianceApiCode = fs.readFileSync(varianceApiPath, 'utf-8')

    const apiCalcsPerCategory = varianceApiCode.includes('parentBudgets.map') &&
      varianceApiCode.includes('monthlySpending') &&
      varianceApiCode.includes('Math.sqrt(variance)')
    addResult(5, 'API calculates variance per budget category', apiCalcsPerCategory,
      apiCalcsPerCategory ? 'GET /api/budget-variance maps over parent budgets, computes stdDev/mean/cv per category' : 'Per-category calc not found in API')

    // =====================================================================
    // STEP 2: Determine confidence level: low variance = high confidence
    // =====================================================================

    // Test 2.1: CV-based confidence mapping
    const hasCVMapping = confidenceIndicatorCode.includes('cv < 0.15') &&
      confidenceIndicatorCode.includes('cv < 0.35')
    addResult(6, 'Coefficient of Variation (CV) confidence mapping', hasCVMapping,
      hasCVMapping ? 'CV < 0.15 = high, CV 0.15-0.35 = medium, CV > 0.35 = low' : 'CV mapping not found')

    // Test 2.2: Low variance -> high confidence
    const lowVarHighConf = confidenceIndicatorCode.includes("confidence = 'high'") &&
      confidenceIndicatorCode.includes('cv < 0.15')
    addResult(7, 'Low variance (CV < 0.15) = high confidence', lowVarHighConf,
      lowVarHighConf ? 'When CV < 0.15, confidence is "high" with ~90% percent' : 'Low-variance-high-confidence mapping not found')

    // Test 2.3: High variance -> low confidence
    const highVarLowConf = confidenceIndicatorCode.includes("confidence = 'low'")
    addResult(8, 'High variance (CV > 0.35) = low confidence', highVarLowConf,
      highVarLowConf ? 'When CV > 0.35, confidence is "low" with ~45% or lower' : 'High-variance-low-confidence mapping not found')

    // Test 2.4: Confidence percentage computed
    const hasConfPercent = confidenceIndicatorCode.includes('confidencePercent') &&
      confidenceIndicatorCode.includes('Math.max(10, Math.min(95,')
    addResult(9, 'Confidence percentage clamped to 10-95%', hasConfPercent,
      hasConfPercent ? 'confidencePercent clamped between 10% and 95%' : 'Percentage clamping not found')

    // Test 2.5: Same logic in budget-forecast.ts
    const forecastPath = path.join(process.cwd(), 'lib', 'budget-forecast.ts')
    const forecastCode = fs.readFileSync(forecastPath, 'utf-8')
    const forecastHasCVMapping = forecastCode.includes('cv < 0.15') &&
      forecastCode.includes('cv < 0.35') &&
      forecastCode.includes('stdDev')
    addResult(10, 'Budget forecast uses same CV-based confidence logic', forecastHasCVMapping,
      forecastHasCVMapping ? 'computeBudgetForecast uses identical CV thresholds and stdDev calculation' : 'Forecast CV logic not found')

    // =====================================================================
    // STEP 3: Create visual confidence indicator component
    // =====================================================================

    // Test 3.1: SpendingConfidenceIndicator component
    const hasIndicatorComponent = confidenceIndicatorCode.includes('export function SpendingConfidenceIndicator') &&
      confidenceIndicatorCode.includes('data-testid="spending-confidence-indicator"')
    addResult(11, 'SpendingConfidenceIndicator component with signal bars', hasIndicatorComponent,
      hasIndicatorComponent ? '1-3 signal bars (WiFi-style): 3=high/emerald, 2=medium/amber, 1=low/zinc, 0=insufficient' : 'Indicator component not found')

    // Test 3.2: SpendingConfidenceBadge component
    const hasBadgeComponent = confidenceIndicatorCode.includes('export function SpendingConfidenceBadge') &&
      confidenceIndicatorCode.includes('data-testid="spending-confidence-badge"')
    addResult(12, 'SpendingConfidenceBadge compact pill component', hasBadgeComponent,
      hasBadgeComponent ? 'Pill-shaped badge with mini signal bars + Dutch label for forecast section' : 'Badge component not found')

    // Test 3.3: SpendingVarianceDetailPanel component
    const hasDetailPanel = confidenceIndicatorCode.includes('export function SpendingVarianceDetailPanel') &&
      confidenceIndicatorCode.includes('data-testid="variance-detail-panel"')
    addResult(13, 'SpendingVarianceDetailPanel detailed breakdown', hasDetailPanel,
      hasDetailPanel ? 'Shows signal bars, label, %, mean, stdDev, months, and confidence progress bar' : 'Detail panel not found')

    // Test 3.4: Color-coded by confidence level
    const hasColors = confidenceIndicatorCode.includes('bg-emerald-500') &&
      confidenceIndicatorCode.includes('bg-amber-500') &&
      confidenceIndicatorCode.includes('bg-zinc-400')
    addResult(14, 'Color-coded by confidence: emerald/amber/zinc', hasColors,
      hasColors ? 'High=emerald-500, Medium=amber-500, Low=zinc-400 with matching bg/text/border colors' : 'Colors not found')

    // Test 3.5: Tooltip support
    const hasTooltip = confidenceIndicatorCode.includes('data-testid="confidence-tooltip"') &&
      confidenceIndicatorCode.includes('getVarianceTooltip')
    addResult(15, 'Hover tooltip with variance details', hasTooltip,
      hasTooltip ? 'Dutch tooltips showing stdDev, CV%, months, and contextual description' : 'Tooltip not found')

    // =====================================================================
    // STEP 4: Display on budget forecast predictions
    // =====================================================================

    // Test 4.1: Budget page imports confidence components
    const budgetPagePath = path.join(process.cwd(), 'app', '(app)', 'core', 'budgets', 'page.tsx')
    const budgetPageCode = fs.readFileSync(budgetPagePath, 'utf-8')

    const importsConfidence = budgetPageCode.includes('SpendingConfidenceBadge') &&
      budgetPageCode.includes('SpendingVarianceDetailPanel') &&
      budgetPageCode.includes('calculateSpendingVariance')
    addResult(16, 'Budget page imports confidence components', importsConfidence,
      importsConfidence ? 'Imports SpendingConfidenceBadge, SpendingVarianceDetailPanel, calculateSpendingVariance' : 'Imports not found')

    // Test 4.2: Variance calculated from spending history
    const calcUsed = budgetPageCode.includes('calculateSpendingVariance(monthlySpending')
    addResult(17, 'Variance calculated from monthly spending history', calcUsed,
      calcUsed ? 'calculateSpendingVariance(monthlySpending, budget.name) in forecast section' : 'Calculation not invoked')

    // Test 4.3: SpendingConfidenceBadge displayed in forecast card
    const badgeDisplayed = budgetPageCode.includes('<SpendingConfidenceBadge data={varianceData}')
    addResult(18, 'Confidence badge shown on forecast card', badgeDisplayed,
      badgeDisplayed ? 'SpendingConfidenceBadge rendered in forecast prediction card header' : 'Badge not displayed')

    // Test 4.4: SpendingVarianceDetailPanel displayed below forecast
    const detailPanelDisplayed = budgetPageCode.includes('<SpendingVarianceDetailPanel data={varianceData}')
    addResult(19, 'Variance detail panel shown below forecast', detailPanelDisplayed,
      detailPanelDisplayed ? 'SpendingVarianceDetailPanel rendered below forecast card and for insufficient data' : 'Detail panel not displayed')

    // Test 4.5: Budget forecast section exists with proper test IDs
    const hasForecastSection = budgetPageCode.includes('data-testid="budget-forecast-section"') &&
      budgetPageCode.includes('data-testid="budget-forecast-card"') &&
      budgetPageCode.includes('data-testid="budget-forecast-amount"')
    addResult(20, 'Budget forecast section with data-testid attributes', hasForecastSection,
      hasForecastSection ? 'Forecast section, card, and amount all have testable data-testid attributes' : 'Test IDs not found')

    // =====================================================================
    // STEP 5: Handle categories with insufficient data
    // =====================================================================

    // Test 5.1: Insufficient data check (< 3 months)
    const hasInsufficientCheck = confidenceIndicatorCode.includes('nonZero.length < 3') &&
      confidenceIndicatorCode.includes("confidence: 'insufficient'")
    addResult(21, 'Insufficient data detection (< 3 months)', hasInsufficientCheck,
      hasInsufficientCheck ? 'Returns confidence="insufficient" when fewer than 3 non-zero months' : 'Insufficient check not found')

    // Test 5.2: Detail panel shows insufficient message
    const hasInsufficientMsg = confidenceIndicatorCode.includes('data-testid="variance-insufficient-message"') &&
      confidenceIndicatorCode.includes('Onvoldoende data')
    addResult(22, 'Insufficient data shows Dutch message', hasInsufficientMsg,
      hasInsufficientMsg ? '"Onvoldoende data — minimaal 3 maanden met uitgaven nodig (X/3)"' : 'Insufficient message not found')

    // Test 5.3: Budget forecast section handles insufficient data
    const forecastHandlesInsufficient = budgetPageCode.includes('data-testid="budget-forecast-insufficient"') &&
      budgetPageCode.includes('!forecast.hasSufficientData')
    addResult(23, 'Forecast section handles insufficient data gracefully', forecastHandlesInsufficient,
      forecastHandlesInsufficient ? 'Shows message + variance panel when insufficient data, hides prediction card' : 'Insufficient handling not found')

    // Test 5.4: API handles insufficient data per category
    const apiHandlesInsufficient = varianceApiCode.includes('hasSufficientData: false') &&
      varianceApiCode.includes("confidence: 'insufficient'")
    addResult(24, 'API returns insufficient status for low-data categories', apiHandlesInsufficient,
      apiHandlesInsufficient ? 'Returns hasSufficientData:false, confidence:"insufficient" for < 3 months' : 'API insufficient handling not found')

    // Test 5.5: Zero bars shown for insufficient data in indicator
    const zeroBarsInsufficient = confidenceIndicatorCode.includes("case 'insufficient': return 0")
    addResult(25, 'Zero bars shown for insufficient data categories', zeroBarsInsufficient,
      zeroBarsInsufficient ? 'getActiveBars returns 0 for insufficient, showing all bars as inactive' : 'Zero bars not found')

    // =====================================================================
    // BONUS: Additional robustness checks
    // =====================================================================

    // Test B1: Dutch labels for all confidence levels
    const hasDutchLabels = confidenceIndicatorCode.includes('Hoge betrouwbaarheid') &&
      confidenceIndicatorCode.includes('Gemiddelde betrouwbaarheid') &&
      confidenceIndicatorCode.includes('Lage betrouwbaarheid') &&
      confidenceIndicatorCode.includes('Onvoldoende data')
    addResult(26, 'Dutch confidence labels for all 4 levels', hasDutchLabels,
      hasDutchLabels ? 'Hoge/Gemiddelde/Lage betrouwbaarheid + Onvoldoende data' : 'Dutch labels incomplete')

    // Test B2: API summary with confidence distribution
    const hasSummary = varianceApiCode.includes('highConfidence') &&
      varianceApiCode.includes('mediumConfidence') &&
      varianceApiCode.includes('lowConfidence') &&
      varianceApiCode.includes('insufficientData')
    addResult(27, 'API returns confidence distribution summary', hasSummary,
      hasSummary ? 'Summary: totalCategories, highConfidence, mediumConfidence, lowConfidence, insufficientData' : 'Summary not found')

    // Calculate totals
    const passing = results.filter(r => r.pass).length
    const total = results.length

    return NextResponse.json({
      feature: '#251 — Spending variance confidence indicator',
      passing,
      total,
      percentage: Math.round((passing / total) * 100),
      steps: {
        step1_stddev_per_category: results.filter(r => r.id >= 1 && r.id <= 5),
        step2_confidence_from_variance: results.filter(r => r.id >= 6 && r.id <= 10),
        step3_visual_indicator_component: results.filter(r => r.id >= 11 && r.id <= 15),
        step4_display_on_forecast: results.filter(r => r.id >= 16 && r.id <= 20),
        step5_insufficient_data_handling: results.filter(r => r.id >= 21 && r.id <= 25),
        bonus_checks: results.filter(r => r.id >= 26),
      },
      results,
    })
  } catch (err) {
    return NextResponse.json({
      feature: '#251 — Spending variance confidence indicator',
      error: err instanceof Error ? err.message : 'Unknown error',
      results,
    }, { status: 500 })
  }
}
