import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  const results: { name: string; pass: boolean; details: string }[] = []

  // Read the horizon page source
  const horizonPagePath = path.join(process.cwd(), 'app/(app)/horizon/page.tsx')
  const horizonSource = fs.readFileSync(horizonPagePath, 'utf-8')

  // Read the dashboard page source
  const dashboardPagePath = path.join(process.cwd(), 'app/(app)/dashboard/page.tsx')
  const dashboardSource = fs.readFileSync(dashboardPagePath, 'utf-8')

  // Read the core page source
  const corePagePath = path.join(process.cwd(), 'app/(app)/core/page.tsx')
  const coreSource = fs.readFileSync(corePagePath, 'utf-8')

  // Read the will page source
  const willPagePath = path.join(process.cwd(), 'app/(app)/will/page.tsx')
  const willSource = fs.readFileSync(willPagePath, 'utf-8')

  // Test 1: Horizon hero shows FIRE age as primary metric
  const hasFireAgeHero = horizonSource.includes('data-testid="hero-fire-age"') &&
    horizonSource.includes('Math.round(fire.fireAge)') &&
    horizonSource.includes('data-testid="hero-primary-metric"')
  results.push({
    name: 'Horizon hero shows FIRE age as primary metric',
    pass: hasFireAgeHero,
    details: hasFireAgeHero
      ? 'Hero section has data-testid="hero-fire-age" with Math.round(fire.fireAge) inside data-testid="hero-primary-metric"'
      : 'Missing FIRE age as primary hero metric'
  })

  // Test 2: FIRE age label says "FIRE leeftijd"
  const hasFireAgeLabel = horizonSource.includes('jaar — FIRE leeftijd')
  results.push({
    name: 'Hero metric labeled as FIRE leeftijd',
    pass: hasFireAgeLabel,
    details: hasFireAgeLabel
      ? 'Hero label shows "jaar — FIRE leeftijd"'
      : 'Missing "FIRE leeftijd" label in hero'
  })

  // Test 3: FIRE age is NOT primary metric on dashboard
  // Dashboard shows countdown and freedom %, not fireAge as primary
  const dashboardHasFireAgePrimary = /text-[4-7]xl.*fireAge|data-testid=".*fire-age.*primary"/.test(dashboardSource) ||
    dashboardSource.includes('hero-fire-age')
  results.push({
    name: 'FIRE age is NOT primary metric on dashboard',
    pass: !dashboardHasFireAgePrimary,
    details: !dashboardHasFireAgePrimary
      ? 'Dashboard does not show FIRE age as primary metric (shows countdown + freedom %)'
      : 'Dashboard unexpectedly shows FIRE age as primary metric'
  })

  // Test 4: FIRE age is NOT primary metric on core page
  const coreHasFireAgePrimary = coreSource.includes('fireAge') || coreSource.includes('hero-fire-age')
  results.push({
    name: 'FIRE age is NOT primary metric on De Kern',
    pass: !coreHasFireAgePrimary,
    details: !coreHasFireAgePrimary
      ? 'De Kern page does not reference fireAge (shows net worth as primary)'
      : 'De Kern page unexpectedly references fireAge'
  })

  // Test 5: FIRE age is NOT primary metric on will page
  const willHasFireAgePrimary = willSource.includes('fireAge') || willSource.includes('hero-fire-age')
  results.push({
    name: 'FIRE age is NOT primary metric on De Wil',
    pass: !willHasFireAgePrimary,
    details: !willHasFireAgePrimary
      ? 'De Wil page does not reference fireAge (shows actions as primary)'
      : 'De Wil page unexpectedly references fireAge'
  })

  // Test 6: Horizon has countdown KPI
  const hasCountdownKpi = horizonSource.includes('data-testid="kpi-countdown"') &&
    horizonSource.includes('Aftellen') &&
    horizonSource.includes('fire.countdownDays')
  results.push({
    name: 'Horizon has countdown KPI card',
    pass: hasCountdownKpi,
    details: hasCountdownKpi
      ? 'KPI card with data-testid="kpi-countdown" showing countdown days'
      : 'Missing countdown KPI card'
  })

  // Test 7: Horizon has freedom percentage KPI
  const hasFreedomPctKpi = horizonSource.includes('data-testid="kpi-freedom-pct"') &&
    horizonSource.includes('Vrijheidspercentage') &&
    horizonSource.includes('fire.freedomPercentage')
  results.push({
    name: 'Horizon has freedom percentage KPI card',
    pass: hasFreedomPctKpi,
    details: hasFreedomPctKpi
      ? 'KPI card with data-testid="kpi-freedom-pct" showing freedom percentage'
      : 'Missing freedom percentage KPI card'
  })

  // Test 8: Horizon has health/resilience KPI
  const hasResilienceKpi = horizonSource.includes('data-testid="resilience-kpi"') &&
    (horizonSource.includes('Financiële Gezondheid') || horizonSource.includes('Gezondheid'))
  results.push({
    name: 'Horizon has financiële gezondheid KPI card',
    pass: hasResilienceKpi,
    details: hasResilienceKpi
      ? 'KPI card with data-testid="resilience-kpi" showing health score'
      : 'Missing financiële gezondheid KPI card'
  })

  // Test 9: Purple color theme in hero
  const hasPurpleHero = horizonSource.includes('from-purple-950 via-purple-900 to-purple-950') &&
    horizonSource.includes('text-purple-300/80') &&
    horizonSource.includes('bg-purple-500/10')
  results.push({
    name: 'Consistent purple color theme in hero',
    pass: hasPurpleHero,
    details: hasPurpleHero
      ? 'Hero uses purple-950 gradient with purple-300/80 text and purple-500/10 blur'
      : 'Hero does not have consistent purple theme'
  })

  // Test 10: Purple color theme in KPIs
  const hasPurpleKpis = horizonSource.includes('bg-purple-50') &&
    horizonSource.includes('text-purple-600')
  results.push({
    name: 'Consistent purple color theme in KPIs',
    pass: hasPurpleKpis,
    details: hasPurpleKpis
      ? 'KPI cards use purple-50 background and purple-600 text for icons'
      : 'KPI cards do not have consistent purple theme'
  })

  // Test 11: Hero has sub-metrics (countdown, freedom time, fire date)
  const hasHeroSubMetrics = horizonSource.includes('data-testid="hero-countdown"') &&
    horizonSource.includes('data-testid="hero-freedom-time"') &&
    horizonSource.includes('data-testid="hero-fire-date"')
  results.push({
    name: 'Hero has all three sub-metrics',
    pass: hasHeroSubMetrics,
    details: hasHeroSubMetrics
      ? 'Hero has countdown, freedom time, and fire date sub-metrics'
      : 'Missing one or more hero sub-metrics'
  })

  // Test 12: FIRE age KPI card on horizon page
  const hasFireAgeKpi = horizonSource.includes('data-testid="kpi-fire-age"') &&
    horizonSource.includes('Vrijheidsleeftijd')
  results.push({
    name: 'Horizon has FIRE age KPI card (Vrijheidsleeftijd)',
    pass: hasFireAgeKpi,
    details: hasFireAgeKpi
      ? 'KPI card with data-testid="kpi-fire-age" labeled Vrijheidsleeftijd'
      : 'Missing FIRE age KPI card'
  })

  const passing = results.filter(r => r.pass).length
  return NextResponse.json({
    feature: '#189 - De Horizon unique timeline and future lens',
    summary: `${passing}/${results.length} tests passing`,
    results,
  })
}
