import { NextResponse } from 'next/server'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { computeFireProjection, type FinancialInput } from '@/lib/horizon-data'
import * as fs from 'fs'
import * as path from 'path'

/**
 * GET /api/verify-dashboard-preview-metrics
 * Verifies Feature #187: Dashboard module cards show PREVIEW metrics only
 * - De Kern: "Vermogensgroei deze maand: +€X (+Y dagen)"
 * - De Wil: "X acties open — Y dagen te winnen"
 * - De Horizon: "Countdown: X jaar, Y maanden"
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  // Read the dashboard page source code
  let dashboardSource = ''
  try {
    const dashboardPath = path.join(process.cwd(), 'app', '(app)', 'dashboard', 'page.tsx')
    dashboardSource = fs.readFileSync(dashboardPath, 'utf-8')
  } catch {
    return NextResponse.json({
      pass: false,
      error: 'Could not read dashboard page source',
      results: [],
    })
  }

  // Test 1: De Kern card shows "Vermogensgroei deze maand" as preview metric
  results.push({
    name: 'De Kern shows "Vermogensgroei deze maand" preview',
    pass: dashboardSource.includes('Vermogensgroei deze maand'),
    detail: dashboardSource.includes('Vermogensgroei deze maand')
      ? 'Found "Vermogensgroei deze maand" label in dashboard source'
      : 'Missing "Vermogensgroei deze maand" label in dashboard',
  })

  // Test 2: De Kern preview includes EUR amount with growth sign (+/-)
  results.push({
    name: 'De Kern preview shows +€X format',
    pass: dashboardSource.includes("monthlyGrowth >= 0 ? '+' : ''") && dashboardSource.includes('formatCurrency(monthlyGrowth)'),
    detail: dashboardSource.includes('formatCurrency(monthlyGrowth)')
      ? 'Found formatted monthly growth currency value'
      : 'Missing monthly growth currency formatting',
  })

  // Test 3: De Kern preview includes freedom-day equivalent (+Y dagen)
  results.push({
    name: 'De Kern preview shows (+Y dagen) freedom time',
    pass: dashboardSource.includes('growthDaysStr') && dashboardSource.includes("monthlyGrowth >= 0 ? '+' : '-'"),
    detail: dashboardSource.includes('growthDaysStr')
      ? 'Found freedom-day equivalent in De Kern preview'
      : 'Missing freedom-day equivalent in De Kern preview',
  })

  // Test 4: De Wil card shows "X acties open — Y dagen te winnen" format
  results.push({
    name: 'De Wil shows "X acties open — Y dagen te winnen" preview',
    pass: dashboardSource.includes('acties open') && dashboardSource.includes('dagen te winnen'),
    detail: dashboardSource.includes('acties open') && dashboardSource.includes('dagen te winnen')
      ? 'Found "X acties open — Y dagen te winnen" format in De Wil card'
      : 'Missing expected De Wil preview format',
  })

  // Test 5: De Wil combines actions and days in a single preview metric
  const wilPreviewSingle = dashboardSource.includes('wil-preview-metric') &&
    dashboardSource.includes('wil-preview-value') &&
    !dashboardSource.includes('Laatste aanbeveling')
  results.push({
    name: 'De Wil uses single combined preview metric',
    pass: wilPreviewSingle,
    detail: wilPreviewSingle
      ? 'De Wil card uses a single combined preview metric (no separate rows)'
      : 'De Wil card still has multiple separate preview metrics',
  })

  // Test 6: De Horizon card shows "Countdown: X jaar, Y maanden" format
  results.push({
    name: 'De Horizon shows "Countdown: X jaar, Y maanden" preview',
    pass: dashboardSource.includes('Countdown:') && dashboardSource.includes('Countdown naar vrijheid'),
    detail: dashboardSource.includes('Countdown:')
      ? 'Found "Countdown: X jaar, Y maanden" format in De Horizon card'
      : 'Missing expected De Horizon countdown format',
  })

  // Test 7: De Horizon preview is a single metric (not multiple rows)
  const horizonSingleMetric = dashboardSource.includes('horizon-preview-metric') &&
    !dashboardSource.includes('Levensgebeurtenissen') &&
    !dashboardSource.includes('Verwachte FIRE-leeftijd')
  results.push({
    name: 'De Horizon uses single countdown preview metric',
    pass: horizonSingleMetric,
    detail: horizonSingleMetric
      ? 'De Horizon card uses a single countdown preview metric'
      : 'De Horizon card still has multiple separate preview metrics',
  })

  // Test 8: Preview metrics differ from module hero metrics
  // De Kern hero uses: freedom %, net worth, autonomie score
  // Dashboard preview uses: vermogensgroei (monthly growth) - DIFFERENT ✓
  const kernDiffers = dashboardSource.includes('Vermogensgroei deze maand') &&
    !dashboardSource.includes("Netto vermogen</") && // Not using Netto vermogen as a preview label
    !dashboardSource.includes("Vrijheid</") // Not using Vrijheid % as separate label
  results.push({
    name: 'De Kern preview differs from module hero metrics',
    pass: kernDiffers,
    detail: kernDiffers
      ? 'De Kern preview (Vermogensgroei) differs from hero (Freedom %, Net worth, Autonomie)'
      : 'De Kern preview may overlap with module hero metrics',
  })

  // Test 9: De Wil preview differs from module hero
  // De Wil hero uses: freedom days won, completion ratio, actions completed
  // Dashboard uses: X acties open — Y dagen te winnen (combines open + potential, not completed)
  const wilDiffers = dashboardSource.includes('acties open') &&
    !dashboardSource.includes('Acties voltooid') &&
    !dashboardSource.includes('Beslissnelheid')
  results.push({
    name: 'De Wil preview differs from module hero metrics',
    pass: wilDiffers,
    detail: wilDiffers
      ? 'De Wil preview (open actions + days to win) differs from hero (days won, completion ratio)'
      : 'De Wil preview may overlap with module hero metrics',
  })

  // Test 10: De Horizon preview differs from module hero
  // De Horizon hero uses: FIRE age, countdown days, freedom time (years/months)
  // Dashboard uses: simple "Countdown: X jaar, Y maanden" (simplified from full hero)
  const horizonDiffers = !dashboardSource.includes('Verwachte FIRE-leeftijd') &&
    !dashboardSource.includes('Aftellen') &&
    dashboardSource.includes('Countdown naar vrijheid')
  results.push({
    name: 'De Horizon preview differs from module hero metrics',
    pass: horizonDiffers,
    detail: horizonDiffers
      ? 'De Horizon preview (simplified countdown) differs from hero (FIRE age, countdown days)'
      : 'De Horizon preview may overlap with module hero metrics',
  })

  // Test 11: Cards still link to correct module pages
  const kernLink = dashboardSource.includes('href="/core"')
  const wilLink = dashboardSource.includes('href="/will"')
  const horizonLink = dashboardSource.includes('href="/horizon"')
  results.push({
    name: 'Module cards link to correct pages',
    pass: kernLink && wilLink && horizonLink,
    detail: `De Kern → /core: ${kernLink ? '✓' : '✗'}, De Wil → /will: ${wilLink ? '✓' : '✗'}, De Horizon → /horizon: ${horizonLink ? '✓' : '✗'}`,
  })

  // Test 12: Functional verification with sample data
  const monthlyGrowth = 1500
  const dailyExpenses = 80
  const growthDays = calculateFreedomTime(Math.abs(monthlyGrowth), dailyExpenses)
  const growthDaysStr = formatFreedomTimeString(growthDays, 'long')
  const formattedGrowth = formatCurrency(monthlyGrowth)

  const horizonInput: FinancialInput = {
    totalAssets: 250000,
    totalDebts: 20000,
    monthlyIncome: 5000,
    monthlyExpenses: 2400,
    monthlyContributions: 500,
    yearlyMustExpenses: 24000,
    dateOfBirth: '1990-01-15',
  }
  const fireProjResult = computeFireProjection(horizonInput)

  const functionalOk = formattedGrowth.includes('1.500') &&
    growthDaysStr.length > 0 &&
    fireProjResult.countdownYears >= 0
  results.push({
    name: 'Preview metric computation works with sample data',
    pass: functionalOk,
    detail: `Growth: +${formattedGrowth} (+${growthDaysStr}), Countdown: ${fireProjResult.countdownYears}j ${fireProjResult.countdownMonths}m`,
  })

  const allPassed = results.every(r => r.pass)

  return NextResponse.json({
    pass: allPassed,
    passing: results.filter(r => r.pass).length,
    total: results.length,
    results,
  })
}
