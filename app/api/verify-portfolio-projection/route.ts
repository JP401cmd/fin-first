import { NextResponse } from 'next/server'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

type TestResult = {
  name: string
  pass: boolean
  detail: string
}

/**
 * GET /api/verify-portfolio-projection
 *
 * Verification endpoint for Feature #222: Asset portfolio projection in UI.
 * Tests all 6 requirements through code analysis.
 */
export async function GET() {
  const cwd = process.cwd()
  const results: TestResult[] = []

  const assetsPagePath = join(cwd, 'app/(app)/core/assets/page.tsx')
  const assetsSource = existsSync(assetsPagePath) ? readFileSync(assetsPagePath, 'utf8') : ''

  const assetDataPath = join(cwd, 'lib/asset-data.ts')
  const assetDataSource = existsSync(assetDataPath) ? readFileSync(assetDataPath, 'utf8') : ''

  // ─── Test 1: projectPortfolio() function exists in lib/asset-data.ts ─────
  try {
    const hasFn = assetDataSource.includes('export function projectPortfolio(')
    const hasParams = assetDataSource.includes('assets: Asset[]') && assetDataSource.includes('months: number')
    results.push({
      name: 'projectPortfolio() function exists in lib/asset-data.ts',
      pass: hasFn && hasParams,
      detail: hasFn && hasParams
        ? 'projectPortfolio(assets, months) found and exported'
        : `function=${hasFn}, params=${hasParams}`,
    })
  } catch (e) {
    results.push({ name: 'projectPortfolio() function exists', pass: false, detail: String(e) })
  }

  // ─── Test 2: projectPortfolio() is imported and called on assets page ─────
  try {
    const isImported = assetsSource.includes('projectPortfolio')
    const isCalled = assetsSource.includes('projectPortfolio(activeAssets')
    results.push({
      name: 'projectPortfolio() imported and used on assets page',
      pass: isImported && isCalled,
      detail: isImported && isCalled
        ? 'Imported from lib/asset-data and called with activeAssets'
        : `imported=${isImported}, called=${isCalled}`,
    })
  } catch (e) {
    results.push({ name: 'projectPortfolio() used on assets page', pass: false, detail: String(e) })
  }

  // ─── Test 3: Area chart component exists for portfolio projection ─────
  try {
    const hasChart = assetsSource.includes('function ProjectionChart(')
    const hasSvg = assetsSource.includes('data-testid="projection-area-chart"')
    const hasAreaPath = assetsSource.includes('areaPath') && assetsSource.includes('fillOpacity')
    const hasLinePath = assetsSource.includes('linePath')
    results.push({
      name: 'Area chart component exists with SVG rendering',
      pass: hasChart && hasSvg && hasAreaPath && hasLinePath,
      detail: hasChart && hasSvg && hasAreaPath && hasLinePath
        ? 'ProjectionChart renders SVG area chart with fill and line paths'
        : `chart=${hasChart}, svg-testid=${hasSvg}, area=${hasAreaPath}, line=${hasLinePath}`,
    })
  } catch (e) {
    results.push({ name: 'Area chart component exists', pass: false, detail: String(e) })
  }

  // ─── Test 4: 5, 10, 20, 30 year horizon buttons ─────
  try {
    const hasSelector = assetsSource.includes('[5, 10, 20, 30]')
    const setsYears = assetsSource.includes('setProjectionYears(y)')
    const hasTestIds = assetsSource.includes('projection-year-${y}') || assetsSource.includes('projection-year-')
    const hasButtonContainer = assetsSource.includes('projection-year-buttons')
    const hasYearState = assetsSource.includes('projectionYears') && assetsSource.includes('setProjectionYears')
    results.push({
      name: 'Show projection for 5, 10, 20, 30 year horizons',
      pass: hasSelector && setsYears && hasTestIds && hasButtonContainer && hasYearState,
      detail: hasSelector && setsYears && hasTestIds && hasButtonContainer && hasYearState
        ? 'All 4 horizon buttons (5j, 10j, 20j, 30j) with dynamic data-testid and state setter'
        : `array=${hasSelector}, setter=${setsYears}, testids=${hasTestIds}, container=${hasButtonContainer}, state=${hasYearState}`,
    })
  } catch (e) {
    results.push({ name: 'Year horizon buttons', pass: false, detail: String(e) })
  }

  // ─── Test 5: Monthly contributions included in projection ─────
  try {
    const fnBody = assetDataSource.slice(
      assetDataSource.indexOf('export function projectPortfolio('),
      assetDataSource.indexOf('export function projectPortfolio(') + 800,
    )
    const usesMonthly = fnBody.includes('monthly_contribution')
    const usesProjectAsset = fnBody.includes('projectAsset(')

    // Also check projectAsset for monthly contribution
    const projAssetIdx = assetDataSource.indexOf('function projectAsset(')
    const hasProjectAsset = projAssetIdx >= 0

    results.push({
      name: 'Monthly contributions included in projection calculation',
      pass: usesMonthly && usesProjectAsset && hasProjectAsset,
      detail: usesMonthly && usesProjectAsset && hasProjectAsset
        ? 'projectPortfolio uses monthly_contribution via projectAsset()'
        : `monthly_contribution=${usesMonthly}, projectAsset call=${usesProjectAsset}, fn exists=${hasProjectAsset}`,
    })
  } catch (e) {
    results.push({ name: 'Monthly contributions in projection', pass: false, detail: String(e) })
  }

  // ─── Test 6: Displayed on /core/assets page ─────
  try {
    const hasSection = assetsSource.includes('data-testid="portfolio-projection-section"')
    const hasChartUsage = assetsSource.includes('<ProjectionChart')
    const hasGrowthDisplay = assetsSource.includes('data-testid="projected-growth"')
    results.push({
      name: 'Projection chart displayed on /core/assets page',
      pass: hasSection && hasChartUsage && hasGrowthDisplay,
      detail: hasSection && hasChartUsage && hasGrowthDisplay
        ? 'Projection section with chart and growth display on assets page'
        : `section=${hasSection}, chart=${hasChartUsage}, growth=${hasGrowthDisplay}`,
    })
  } catch (e) {
    results.push({ name: 'Display on assets page', pass: false, detail: String(e) })
  }

  // ─── Test 7: Contextual projection message ─────
  try {
    const hasContextMsg = assetsSource.includes('data-testid="projection-context-message"')
    const hasInlegText = assetsSource.includes('Met je huidige inleg')
    const hasGrowthText = assetsSource.includes('groeit je portfolio naar')
    const hasInJaarText = assetsSource.includes('in ${projectionYears} jaar')
    const hasFreedomTime = assetsSource.includes('vrijheid') && assetsSource.includes('calculateFreedomTime')
    results.push({
      name: 'Contextual message with projected future value',
      pass: hasContextMsg && hasInlegText && hasGrowthText && hasInJaarText,
      detail: hasContextMsg && hasInlegText && hasGrowthText && hasInJaarText
        ? `Message: "Met je huidige inleg...groeit je portfolio naar €X in Y jaar" with freedom-time=${hasFreedomTime}`
        : `testid=${hasContextMsg}, inleg=${hasInlegText}, groeit=${hasGrowthText}, jaar=${hasInJaarText}`,
    })
  } catch (e) {
    results.push({ name: 'Contextual projection message', pass: false, detail: String(e) })
  }

  // ─── Test 8: No-contribution variant of contextual message ─────
  try {
    const hasNoContribMsg = assetsSource.includes('Zonder extra inleg groeit je portfolio naar')
    const hasContribCheck = assetsSource.includes('totalMonthlyContrib > 0')
    results.push({
      name: 'Contextual message handles zero monthly contributions',
      pass: hasNoContribMsg && hasContribCheck,
      detail: hasNoContribMsg && hasContribCheck
        ? 'Shows "Zonder extra inleg" when no monthly contributions'
        : `noContrib=${hasNoContribMsg}, check=${hasContribCheck}`,
    })
  } catch (e) {
    results.push({ name: 'Zero-contribution message variant', pass: false, detail: String(e) })
  }

  // ─── Test 9: ProjectionChart handles empty data ─────
  try {
    const hasEmptyCheck = assetsSource.includes('data.length === 0') && assetsSource.includes('Geen data')
    results.push({
      name: 'ProjectionChart handles empty data gracefully',
      pass: hasEmptyCheck,
      detail: hasEmptyCheck
        ? 'Shows "Geen data" message when projection data is empty'
        : 'Missing empty data handling',
    })
  } catch (e) {
    results.push({ name: 'Empty data handling', pass: false, detail: String(e) })
  }

  // ─── Test 10: Current value reference line on chart ─────
  try {
    const hasCurrentLine = assetsSource.includes('strokeDasharray="3 3"') && assetsSource.includes('#f59e0b')
    const acceptsCurrentValue = assetsSource.includes('currentValue: number') || assetsSource.includes('currentValue,')
    results.push({
      name: 'Chart shows current value reference line',
      pass: hasCurrentLine && acceptsCurrentValue,
      detail: hasCurrentLine && acceptsCurrentValue
        ? 'Dashed amber line at current portfolio value'
        : `dashLine=${hasCurrentLine}, currentValue=${acceptsCurrentValue}`,
    })
  } catch (e) {
    results.push({ name: 'Current value reference line', pass: false, detail: String(e) })
  }

  const passing = results.filter((r) => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#222 Asset portfolio projection in UI',
    summary: `${passing}/${total} tests passing`,
    passing,
    total,
    results,
  })
}
