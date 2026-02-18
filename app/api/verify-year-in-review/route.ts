import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

interface TestResult {
  test: string
  passed: boolean
  details: string
}

export async function GET() {
  const results: TestResult[] = []

  // ── Test 1: Year-in-review API route exists ──
  try {
    const routePath = path.join(process.cwd(), 'app', 'api', 'year-in-review', 'route.ts')
    const exists = fs.existsSync(routePath)
    results.push({
      test: 'API route exists at /api/year-in-review',
      passed: exists,
      details: exists ? 'route.ts found' : 'route.ts not found',
    })
  } catch (e) {
    results.push({ test: 'API route exists', passed: false, details: String(e) })
  }

  // ── Test 2: Year-in-review page exists ──
  try {
    const pagePath = path.join(process.cwd(), 'app', '(app)', 'identity', 'jaaroverzicht', 'page.tsx')
    const exists = fs.existsSync(pagePath)
    results.push({
      test: 'Page exists at /identity/jaaroverzicht',
      passed: exists,
      details: exists ? 'page.tsx found' : 'page.tsx not found',
    })
  } catch (e) {
    results.push({ test: 'Page exists', passed: false, details: String(e) })
  }

  // ── Test 3: API returns 401 without auth ──
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/year-in-review?year=2025`, {
      headers: { 'Cookie': '' },
    })
    const passed = res.status === 401
    results.push({
      test: 'API returns 401 without authentication',
      passed,
      details: `Status: ${res.status}`,
    })
  } catch (e) {
    results.push({ test: 'API returns 401 without auth', passed: false, details: String(e) })
  }

  // ── Test 4: API route source has YearInReviewData type ──
  try {
    const routePath = path.join(process.cwd(), 'app', 'api', 'year-in-review', 'route.ts')
    const content = fs.readFileSync(routePath, 'utf-8')
    const hasType = content.includes('YearInReviewData')
    results.push({
      test: 'API defines YearInReviewData type',
      passed: hasType,
      details: hasType ? 'Type found' : 'Type not found',
    })
  } catch (e) {
    results.push({ test: 'API defines type', passed: false, details: String(e) })
  }

  // ── Test 5: API queries net_worth_snapshots ──
  try {
    const routePath = path.join(process.cwd(), 'app', 'api', 'year-in-review', 'route.ts')
    const content = fs.readFileSync(routePath, 'utf-8')
    const hasSnapshots = content.includes('net_worth_snapshots')
    results.push({
      test: 'API queries net_worth_snapshots table',
      passed: hasSnapshots,
      details: hasSnapshots ? 'Query found' : 'Query not found',
    })
  } catch (e) {
    results.push({ test: 'API queries snapshots', passed: false, details: String(e) })
  }

  // ── Test 6: API queries actions for freedom days ──
  try {
    const routePath = path.join(process.cwd(), 'app', 'api', 'year-in-review', 'route.ts')
    const content = fs.readFileSync(routePath, 'utf-8')
    const hasFreedomDays = content.includes('freedom_days_impact') && content.includes('freedomDaysWon')
    results.push({
      test: 'API calculates freedom days from actions',
      passed: hasFreedomDays,
      details: hasFreedomDays ? 'Freedom days calculation found' : 'Not found',
    })
  } catch (e) {
    results.push({ test: 'API calculates freedom days', passed: false, details: String(e) })
  }

  // ── Test 7: API queries badges (user_badges or app_settings) ──
  try {
    const routePath = path.join(process.cwd(), 'app', 'api', 'year-in-review', 'route.ts')
    const content = fs.readFileSync(routePath, 'utf-8')
    const hasBadges = content.includes('user_badges') && content.includes('badgesEarned')
    results.push({
      test: 'API queries badges (user_badges + fallback)',
      passed: hasBadges,
      details: hasBadges ? 'Badge queries found' : 'Not found',
    })
  } catch (e) {
    results.push({ test: 'API queries badges', passed: false, details: String(e) })
  }

  // ── Test 8: API calculates best and worst months ──
  try {
    const routePath = path.join(process.cwd(), 'app', 'api', 'year-in-review', 'route.ts')
    const content = fs.readFileSync(routePath, 'utf-8')
    const hasMonths = content.includes('bestMonth') && content.includes('worstMonth') && content.includes('monthlyOverview')
    results.push({
      test: 'API calculates best/worst months',
      passed: hasMonths,
      details: hasMonths ? 'Best/worst month logic found' : 'Not found',
    })
  } catch (e) {
    results.push({ test: 'API calculates best/worst months', passed: false, details: String(e) })
  }

  // ── Test 9: API calculates FIRE progress comparison ──
  try {
    const routePath = path.join(process.cwd(), 'app', 'api', 'year-in-review', 'route.ts')
    const content = fs.readFileSync(routePath, 'utf-8')
    const hasFire = content.includes('fireStart') && content.includes('fireEnd') && content.includes('fireProgressDelta')
    results.push({
      test: 'API calculates FIRE progress (start vs end)',
      passed: hasFire,
      details: hasFire ? 'FIRE comparison found' : 'Not found',
    })
  } catch (e) {
    results.push({ test: 'API calculates FIRE progress', passed: false, details: String(e) })
  }

  // ── Test 10: Page has scrollable multi-section layout ──
  try {
    const pagePath = path.join(process.cwd(), 'app', '(app)', 'identity', 'jaaroverzicht', 'page.tsx')
    const content = fs.readFileSync(pagePath, 'utf-8')
    const hasSections = ['section-freedom-days', 'section-net-worth', 'section-badges', 'section-months', 'section-fire']
      .every(id => content.includes(id))
    results.push({
      test: 'Page has all 5 required sections',
      passed: hasSections,
      details: hasSections ? 'All sections found' : 'Missing sections',
    })
  } catch (e) {
    results.push({ test: 'Page has sections', passed: false, details: String(e) })
  }

  // ── Test 11: Page has freedom days section ──
  try {
    const pagePath = path.join(process.cwd(), 'app', '(app)', 'identity', 'jaaroverzicht', 'page.tsx')
    const content = fs.readFileSync(pagePath, 'utf-8')
    const hasFreedomSection = content.includes('Vrijheidsdagen gewonnen') && content.includes('freedomDaysByMonth')
    results.push({
      test: 'Page has freedom days section with monthly chart',
      passed: hasFreedomSection,
      details: hasFreedomSection ? 'Freedom days section found' : 'Not found',
    })
  } catch (e) {
    results.push({ test: 'Page has freedom days section', passed: false, details: String(e) })
  }

  // ── Test 12: Page has net worth growth section ──
  try {
    const pagePath = path.join(process.cwd(), 'app', '(app)', 'identity', 'jaaroverzicht', 'page.tsx')
    const content = fs.readFileSync(pagePath, 'utf-8')
    const hasNwSection = content.includes('Vermogensgroei') && content.includes('netWorthByMonth')
    results.push({
      test: 'Page has net worth growth section with sparkline',
      passed: hasNwSection,
      details: hasNwSection ? 'Net worth section found' : 'Not found',
    })
  } catch (e) {
    results.push({ test: 'Page has net worth section', passed: false, details: String(e) })
  }

  // ── Test 13: Page has badges section ──
  try {
    const pagePath = path.join(process.cwd(), 'app', '(app)', 'identity', 'jaaroverzicht', 'page.tsx')
    const content = fs.readFileSync(pagePath, 'utf-8')
    const hasBadgeSection = content.includes('Badges verdiend') && content.includes('badgesEarned')
    results.push({
      test: 'Page has badges earned section',
      passed: hasBadgeSection,
      details: hasBadgeSection ? 'Badges section found' : 'Not found',
    })
  } catch (e) {
    results.push({ test: 'Page has badges section', passed: false, details: String(e) })
  }

  // ── Test 14: Page has FIRE progress section ──
  try {
    const pagePath = path.join(process.cwd(), 'app', '(app)', 'identity', 'jaaroverzicht', 'page.tsx')
    const content = fs.readFileSync(pagePath, 'utf-8')
    const hasFireSection = content.includes('FIRE voortgang') && content.includes('fireStart') && content.includes('fireEnd')
    results.push({
      test: 'Page has FIRE progress comparison section',
      passed: hasFireSection,
      details: hasFireSection ? 'FIRE section found' : 'Not found',
    })
  } catch (e) {
    results.push({ test: 'Page has FIRE section', passed: false, details: String(e) })
  }

  // ── Test 15: Report is shareable ──
  try {
    const pagePath = path.join(process.cwd(), 'app', '(app)', 'identity', 'jaaroverzicht', 'page.tsx')
    const content = fs.readFileSync(pagePath, 'utf-8')
    const hasShare = content.includes('ShareDialog') && content.includes('share-btn')
    const hasDownload = content.includes('download-btn') && content.includes('renderYearInReviewToCanvas')
    results.push({
      test: 'Report is shareable as image or link',
      passed: hasShare && hasDownload,
      details: `Share: ${hasShare}, Download: ${hasDownload}`,
    })
  } catch (e) {
    results.push({ test: 'Report shareable', passed: false, details: String(e) })
  }

  // ── Test 16: Beautiful visual design with module colors ──
  try {
    const pagePath = path.join(process.cwd(), 'app', '(app)', 'identity', 'jaaroverzicht', 'page.tsx')
    const content = fs.readFileSync(pagePath, 'utf-8')
    const hasAmber = content.includes('amber-') // amber for De Kern
    const hasTeal = content.includes('teal-')   // teal for De Wil
    const hasPurple = content.includes('purple-') // purple for De Horizon
    const hasGradients = content.includes('bg-gradient-to')
    results.push({
      test: 'Beautiful visual design with amber/teal/purple module colors',
      passed: hasAmber && hasTeal && hasPurple && hasGradients,
      details: `Amber: ${hasAmber}, Teal: ${hasTeal}, Purple: ${hasPurple}, Gradients: ${hasGradients}`,
    })
  } catch (e) {
    results.push({ test: 'Visual design', passed: false, details: String(e) })
  }

  // ── Test 17: Year selector for generating different years ──
  try {
    const pagePath = path.join(process.cwd(), 'app', '(app)', 'identity', 'jaaroverzicht', 'page.tsx')
    const content = fs.readFileSync(pagePath, 'utf-8')
    const hasYearSelector = content.includes('selectedYear') && content.includes('year-btn-')
    results.push({
      test: 'Year selector allows switching between years',
      passed: hasYearSelector,
      details: hasYearSelector ? 'Year selector found' : 'Not found',
    })
  } catch (e) {
    results.push({ test: 'Year selector', passed: false, details: String(e) })
  }

  // ── Test 18: API uses Promise.allSettled for graceful degradation ──
  try {
    const routePath = path.join(process.cwd(), 'app', 'api', 'year-in-review', 'route.ts')
    const content = fs.readFileSync(routePath, 'utf-8')
    const hasAllSettled = content.includes('Promise.allSettled')
    results.push({
      test: 'API uses Promise.allSettled for graceful degradation',
      passed: hasAllSettled,
      details: hasAllSettled ? 'Promise.allSettled found' : 'Not found',
    })
  } catch (e) {
    results.push({ test: 'API graceful degradation', passed: false, details: String(e) })
  }

  // ── Test 19: No mock data patterns ──
  try {
    const filesToCheck = [
      path.join(process.cwd(), 'app', 'api', 'year-in-review', 'route.ts'),
      path.join(process.cwd(), 'app', '(app)', 'identity', 'jaaroverzicht', 'page.tsx'),
    ]
    const mockPatterns = ['globalThis', 'devStore', 'dev-store', 'mockDb', 'mockData', 'fakeData', 'sampleData', 'dummyData', 'testData', 'STUB', 'MOCK']
    let foundMock = false
    let mockDetail = ''

    for (const filePath of filesToCheck) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8')
        for (const pattern of mockPatterns) {
          if (content.includes(pattern)) {
            foundMock = true
            mockDetail = `Found '${pattern}' in ${path.basename(filePath)}`
            break
          }
        }
      }
      if (foundMock) break
    }

    results.push({
      test: 'No mock data patterns in source files',
      passed: !foundMock,
      details: foundMock ? mockDetail : 'No mock patterns found',
    })
  } catch (e) {
    results.push({ test: 'No mock data', passed: false, details: String(e) })
  }

  const passing = results.filter(r => r.passed).length
  const total = results.length

  return NextResponse.json({
    summary: `${passing}/${total} tests passing`,
    passing,
    total,
    results,
  })
}
