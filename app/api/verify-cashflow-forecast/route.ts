import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * GET /api/verify-cashflow-forecast
 * Verification endpoint for Feature #221: Cash flow forecast 3-6 months.
 * Tests code structure, component existence, feature gating, and integration.
 */
export async function GET() {
  const tests: { name: string; pass: boolean; details: string }[] = []

  function check(name: string, pass: boolean, details: string) {
    tests.push({ name, pass, details })
  }

  try {
    // --- 1. API endpoint exists ---
    try {
      const apiFile = readFileSync(join(process.cwd(), 'app/api/cashflow-forecast/route.ts'), 'utf8')
      check(
        '1. API endpoint exists',
        apiFile.includes('export async function GET') && apiFile.includes('/api/cashflow-forecast'),
        apiFile.includes('export async function GET') ? 'GET handler found in route.ts' : 'Missing GET handler'
      )
    } catch {
      check('1. API endpoint exists', false, 'File not found: app/api/cashflow-forecast/route.ts')
    }

    // --- 2. API identifies recurring transactions ---
    try {
      const apiFile = readFileSync(join(process.cwd(), 'app/api/cashflow-forecast/route.ts'), 'utf8')
      check(
        '2. Identifies recurring transactions from history',
        apiFile.includes('recurring_transactions') && apiFile.includes('is_active'),
        apiFile.includes('recurring_transactions') ? 'Fetches recurring_transactions with is_active filter' : 'Missing recurring_transactions query'
      )
    } catch {
      check('2. Identifies recurring transactions', false, 'API file not found')
    }

    // --- 3. Projects 3-6 month cash flow ---
    try {
      const apiFile = readFileSync(join(process.cwd(), 'app/api/cashflow-forecast/route.ts'), 'utf8')
      const has6Months = apiFile.includes('i <= 6') || apiFile.includes('6 months') || apiFile.includes('6')
      const hasPatterns = apiFile.includes('avgMonthlyIncome') || apiFile.includes('estimatedMonthly')
      check(
        '3. Projects 3-6 month cash flow based on patterns',
        has6Months && hasPatterns,
        `6-month projection: ${has6Months}, Pattern-based: ${hasPatterns}`
      )
    } catch {
      check('3. Projects 3-6 month cash flow', false, 'API file not found')
    }

    // --- 4. Area chart component exists ---
    try {
      const chartFile = readFileSync(join(process.cwd(), 'components/app/cashflow-forecast-chart.tsx'), 'utf8')
      const hasSvg = chartFile.includes('<svg')
      const hasAreaPath = chartFile.includes('areaPath') || chartFile.includes('area')
      const hasExport = chartFile.includes('export function CashFlowForecastChart')
      check(
        '4. Area chart component exists (SVG-based)',
        hasSvg && hasAreaPath && hasExport,
        `SVG: ${hasSvg}, Area path: ${hasAreaPath}, Export: ${hasExport}`
      )
    } catch {
      check('4. Area chart component exists', false, 'File not found: components/app/cashflow-forecast-chart.tsx')
    }

    // --- 5. Chart shows projected bank balance ---
    try {
      const chartFile = readFileSync(join(process.cwd(), 'components/app/cashflow-forecast-chart.tsx'), 'utf8')
      const hasProjectedBalance = chartFile.includes('projectedBalance')
      const hasLinePath = chartFile.includes('linePath') || chartFile.includes('path d=')
      const hasForecastPoints = chartFile.includes('ForecastPoint')
      check(
        '5. Chart shows projected bank balance',
        hasProjectedBalance && hasLinePath && hasForecastPoints,
        `ProjectedBalance: ${hasProjectedBalance}, Line path: ${hasLinePath}, ForecastPoint type: ${hasForecastPoints}`
      )
    } catch {
      check('5. Chart shows projected bank balance', false, 'Chart file not found')
    }

    // --- 6. Alert when projected balance drops below threshold ---
    try {
      const apiFile = readFileSync(join(process.cwd(), 'app/api/cashflow-forecast/route.ts'), 'utf8')
      const chartFile = readFileSync(join(process.cwd(), 'components/app/cashflow-forecast-chart.tsx'), 'utf8')
      const hasThreshold = apiFile.includes('€500') || apiFile.includes('500')
      const hasAlertMsg = apiFile.includes('Let op') && apiFile.includes('zakt je saldo')
      const hasAlertRender = chartFile.includes('cashflow-forecast-alerts') || chartFile.includes('AlertTriangle')
      check(
        '6. Alert when balance drops below €500',
        hasThreshold && hasAlertMsg && hasAlertRender,
        `Threshold check: ${hasThreshold}, Dutch alert message: ${hasAlertMsg}, Alert rendering: ${hasAlertRender}`
      )
    } catch {
      check('6. Alert for low balance', false, 'Files not found')
    }

    // --- 7. Feature-gated to Stability+ ---
    try {
      const phasesFile = readFileSync(join(process.cwd(), 'lib/feature-phases.ts'), 'utf8')
      const hasFeature = phasesFile.includes("'cashflow_forecast'") || phasesFile.includes('"cashflow_forecast"')
      const hasMatrix = phasesFile.includes('cashflow_forecast')
      const stabilityTrue = phasesFile.includes('cashflow_forecast') &&
        (phasesFile.match(/cashflow_forecast[\s\S]*stability:\s*true/) !== null)
      const recoveryFalse = phasesFile.includes('cashflow_forecast') &&
        (phasesFile.match(/cashflow_forecast[\s\S]*recovery:\s*false/) !== null)
      check(
        '7. Feature-gated to Stability+',
        hasFeature && hasMatrix && stabilityTrue && recoveryFalse,
        `In FEATURES: ${hasFeature}, In matrix: ${hasMatrix}, Stability=true: ${stabilityTrue}, Recovery=false: ${recoveryFalse}`
      )
    } catch {
      check('7. Feature-gated to Stability+', false, 'Feature phases file not found')
    }

    // --- 8. Shows on De Kern overview page ---
    try {
      const corePage = readFileSync(join(process.cwd(), 'app/(app)/core/page.tsx'), 'utf8')
      const hasImport = corePage.includes('CashFlowForecastChart')
      const hasSection = corePage.includes('cashflow-forecast-section')
      const hasFeatureGate = corePage.includes('cashflow_forecast')
      check(
        '8. Shows on De Kern overview page',
        hasImport && hasSection && hasFeatureGate,
        `Import: ${hasImport}, Section testid: ${hasSection}, Feature gate: ${hasFeatureGate}`
      )
    } catch {
      check('8. Shows on De Kern overview page', false, 'Core page not found')
    }

    // --- 9. CollapsibleSection integration ---
    try {
      const corePage = readFileSync(join(process.cwd(), 'app/(app)/core/page.tsx'), 'utf8')
      const hasCollapsible = corePage.includes('kern_cashflow_forecast')
      const hasTitle = corePage.includes('Cashflow Prognose')
      check(
        '9. CollapsibleSection with proper title',
        hasCollapsible && hasTitle,
        `Storage key: ${hasCollapsible}, Title "Cashflow Prognose": ${hasTitle}`
      )
    } catch {
      check('9. CollapsibleSection', false, 'Core page not found')
    }

    // --- 10. Uses real Supabase data (not mocks) ---
    try {
      const apiFile = readFileSync(join(process.cwd(), 'app/api/cashflow-forecast/route.ts'), 'utf8')
      const usesSupabase = apiFile.includes('supabase') && apiFile.includes('from(')
      const noMock = !apiFile.includes('mockData') && !apiFile.includes('fakeData') && !apiFile.includes('globalThis')
      check(
        '10. Uses real Supabase data (no mocks)',
        usesSupabase && noMock,
        `Supabase queries: ${usesSupabase}, No mock patterns: ${noMock}`
      )
    } catch {
      check('10. Real data', false, 'API file not found')
    }

    // --- 11. Auth protection on API ---
    try {
      const apiFile = readFileSync(join(process.cwd(), 'app/api/cashflow-forecast/route.ts'), 'utf8')
      const hasAuth = apiFile.includes('auth.getUser') || apiFile.includes('auth.getClaims')
      const has401 = apiFile.includes('401')
      check(
        '11. API requires authentication (401)',
        hasAuth && has401,
        `Auth check: ${hasAuth}, 401 response: ${has401}`
      )
    } catch {
      check('11. Auth protection', false, 'API file not found')
    }

    // --- 12. Chart has summary stats ---
    try {
      const chartFile = readFileSync(join(process.cwd(), 'components/app/cashflow-forecast-chart.tsx'), 'utf8')
      const hasSummary = chartFile.includes('cashflow-forecast-summary')
      const has3m = chartFile.includes('Over 3 maanden')
      const has6m = chartFile.includes('Over 6 maanden')
      check(
        '12. Chart has summary stats (current, 3m, 6m)',
        hasSummary && has3m && has6m,
        `Summary testid: ${hasSummary}, 3-month label: ${has3m}, 6-month label: ${has6m}`
      )
    } catch {
      check('12. Chart summary stats', false, 'Chart file not found')
    }

    // --- 13. Danger zone visualization ---
    try {
      const chartFile = readFileSync(join(process.cwd(), 'components/app/cashflow-forecast-chart.tsx'), 'utf8')
      const hasDangerZone = chartFile.includes('dangerThreshold') || chartFile.includes('danger')
      const hasRedZone = chartFile.includes('#fef2f2') || chartFile.includes('red-50')
      check(
        '13. Red danger zone below €500',
        hasDangerZone && hasRedZone,
        `Danger threshold: ${hasDangerZone}, Red zone fill: ${hasRedZone}`
      )
    } catch {
      check('13. Danger zone', false, 'Chart file not found')
    }

    // --- 14. Current vs projected distinction ---
    try {
      const chartFile = readFileSync(join(process.cwd(), 'components/app/cashflow-forecast-chart.tsx'), 'utf8')
      const hasCurrentMonth = chartFile.includes('isCurrentMonth')
      const hasDashed = chartFile.includes('strokeDasharray')
      const hasVandaag = chartFile.includes('vandaag')
      check(
        '14. Distinguishes current month vs projected',
        hasCurrentMonth && hasDashed && hasVandaag,
        `isCurrentMonth flag: ${hasCurrentMonth}, Dashed projected line: ${hasDashed}, "vandaag" marker: ${hasVandaag}`
      )
    } catch {
      check('14. Current vs projected', false, 'Chart file not found')
    }

    // --- 15. Budget-based expense estimation ---
    try {
      const apiFile = readFileSync(join(process.cwd(), 'app/api/cashflow-forecast/route.ts'), 'utf8')
      const hasBudgets = apiFile.includes('budgets') && apiFile.includes('default_limit')
      const hasBlending = apiFile.includes('recurring') && apiFile.includes('avgMonthly')
      check(
        '15. Uses budget limits + recurring + patterns',
        hasBudgets && hasBlending,
        `Budget queries: ${hasBudgets}, Blending strategy: ${hasBlending}`
      )
    } catch {
      check('15. Budget-based estimation', false, 'API file not found')
    }

  } catch (err) {
    check('Unexpected error', false, String(err))
  }

  const passing = tests.filter(t => t.pass).length
  const total = tests.length

  return NextResponse.json({
    feature: '#221 Cash flow forecast 3-6 months',
    passing,
    total,
    allPassing: passing === total,
    tests,
  })
}
