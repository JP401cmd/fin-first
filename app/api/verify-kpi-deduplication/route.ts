import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

type TestResult = {
  id: string
  name: string
  passed: boolean
  details: string
}

export async function GET() {
  const results: TestResult[] = []
  const root = process.cwd()

  let dashboardSrc = ''
  let coreSrc = ''
  let willSrc = ''
  let horizonSrc = ''

  try {
    dashboardSrc = readFileSync(join(root, 'app', '(app)', 'dashboard', 'page.tsx'), 'utf-8')
    coreSrc = readFileSync(join(root, 'app', '(app)', 'core', 'page.tsx'), 'utf-8')
    willSrc = readFileSync(join(root, 'app', '(app)', 'will', 'page.tsx'), 'utf-8')
    horizonSrc = readFileSync(join(root, 'app', '(app)', 'horizon', 'page.tsx'), 'utf-8')
  } catch (err) {
    return NextResponse.json({ error: 'Could not read page files', details: String(err) }, { status: 500 })
  }

  // TEST 1: Dashboard has only preview teasers, no primary KPI grid
  {
    const hasPreviewMetrics = dashboardSrc.includes('kern-preview-metric')
      && dashboardSrc.includes('wil-preview-metric')
      && dashboardSrc.includes('horizon-preview-metric')
    const hasFreedomTeaser = dashboardSrc.includes('dashboard-freedom-teaser')
    const hasNoKpiGrid = !dashboardSrc.includes('data-testid="kpi-')
    const passed = hasPreviewMetrics && hasFreedomTeaser && hasNoKpiGrid
    results.push({
      id: 'dashboard-only-previews',
      name: 'Dashboard has only preview teasers (no primary KPIs)',
      passed,
      details: passed
        ? 'Dashboard shows 3 preview metrics + freedom teaser. No primary KPI grid found.'
        : `Preview metrics: ${hasPreviewMetrics}, Freedom teaser: ${hasFreedomTeaser}, No KPI grid: ${hasNoKpiGrid}`,
    })
  }

  // TEST 2: De Kern does NOT have FIRE age as a primary metric
  {
    const hasFireAgeKpi = coreSrc.includes('kpi-fire-age') || coreSrc.includes('Vrijheidsleeftijd')
    const heroShowsFreedomPct = coreSrc.includes('freedomPercentage') && coreSrc.includes('vrijheid bereikt')
    const passed = !hasFireAgeKpi && heroShowsFreedomPct
    results.push({
      id: 'kern-no-fire-age',
      name: 'De Kern does NOT show FIRE age as primary metric',
      passed,
      details: passed
        ? 'Kern hero shows freedom percentage. No FIRE age KPI found.'
        : `FIRE age KPI: ${hasFireAgeKpi}, Hero freedom %: ${heroShowsFreedomPct}`,
    })
  }

  // TEST 3: De Wil does NOT show net worth metrics as primary
  {
    const hasNetWorthKpi = willSrc.includes('kpi-netto-vermogen') || willSrc.includes('kpi-net-worth')
    const heroShowsFreedomDays = willSrc.includes('vrijheidsdagen gewonnen') || willSrc.includes('vrijheidsdag gewonnen')
    const passed = !hasNetWorthKpi && heroShowsFreedomDays
    results.push({
      id: 'wil-no-net-worth',
      name: 'De Wil does NOT show net worth metrics as primary',
      passed,
      details: passed
        ? 'Wil hero shows freedom days won. No net worth KPIs found.'
        : `Net worth KPI: ${hasNetWorthKpi}, Hero freedom days: ${heroShowsFreedomDays}`,
    })
  }

  // TEST 4: De Horizon does NOT show action-based freedom days as primary
  {
    const hasFreedomDaysKpi = horizonSrc.includes('kpi-vrijheidsdagen-gewonnen')
      || horizonSrc.includes('kpi-voltooide-acties')
      || horizonSrc.includes('kpi-dagen-gewonnen')
    const hasWillpowerKpi = horizonSrc.includes('kpi-wilskrachtscore')
    const heroShowsFireAge = horizonSrc.includes('hero-fire-age') || horizonSrc.includes('FIRE leeftijd')
    const passed = !hasFreedomDaysKpi && !hasWillpowerKpi && heroShowsFireAge
    results.push({
      id: 'horizon-no-action-days',
      name: 'De Horizon does NOT show action-based freedom days as primary',
      passed,
      details: passed
        ? 'Horizon hero shows FIRE age. No freedom days won or willpower KPIs found.'
        : `Freedom days KPI: ${hasFreedomDaysKpi}, Willpower KPI: ${hasWillpowerKpi}, Hero FIRE age: ${heroShowsFireAge}`,
    })
  }

  // TEST 5: FIRE age KPI ONLY on Horizon
  {
    const pages = { Dashboard: dashboardSrc, Kern: coreSrc, Wil: willSrc, Horizon: horizonSrc }
    const found: string[] = []
    for (const [name, src] of Object.entries(pages)) {
      if (src.includes('kpi-fire-age')) found.push(name)
    }
    const passed = found.length === 1 && found[0] === 'Horizon'
    results.push({
      id: 'fire-age-only-horizon',
      name: 'FIRE age KPI appears ONLY on Horizon page',
      passed,
      details: passed
        ? 'kpi-fire-age found only on Horizon.'
        : `Found on: ${found.join(', ') || 'none'}`,
    })
  }

  // TEST 6: Freedom days won hero metric (primary display) ONLY on Wil
  {
    // Check for the primary metric display (data-testid or hero primary rendering),
    // NOT tooltip references that explain the difference between metrics.
    const pages = { Dashboard: dashboardSrc, Kern: coreSrc, Wil: willSrc, Horizon: horizonSrc }
    const found: string[] = []
    for (const [name, src] of Object.entries(pages)) {
      // Look for the hero primary metric rendering: wil-hero-freedom-days-value or
      // totalFreedomDaysWon displayed as the main number. Tooltip references
      // (e.g., "Dit verschilt van 'vrijheidsdagen gewonnen' in De Wil") should NOT count.
      if (src.includes('wil-hero-freedom-days-value') || src.includes('wil-hero-freedom-days-label')) {
        found.push(name)
      }
    }
    const passed = found.length === 1 && found[0] === 'Wil'

    // Also verify that Kern's tooltip reference is just cross-referencing, not displaying
    const kernOnlyTooltipRef = coreSrc.includes("'vrijheidsdagen gewonnen' in De Wil")
      && !coreSrc.includes('wil-hero-freedom-days')
      && !coreSrc.includes('totalFreedomDaysWon')

    const finalPassed = passed && kernOnlyTooltipRef
    results.push({
      id: 'freedom-days-only-wil',
      name: 'Freedom days won hero metric ONLY on Wil page',
      passed: finalPassed,
      details: finalPassed
        ? 'Freedom days won primary display only on De Wil. Kern tooltip cross-references De Wil (not a duplicate).'
        : `Primary display on: ${found.join(', ') || 'none'}. Kern tooltip ref only: ${kernOnlyTooltipRef}`,
    })
  }

  // TEST 7: Vermogensgroei KPI ONLY on Kern
  {
    const pages = { Dashboard: dashboardSrc, Kern: coreSrc, Wil: willSrc, Horizon: horizonSrc }
    const found: string[] = []
    for (const [name, src] of Object.entries(pages)) {
      if (src.includes('kpi-vermogensgroei')) found.push(name)
    }
    const passed = found.length === 1 && found[0] === 'Kern'
    results.push({
      id: 'vermogensgroei-only-kern',
      name: 'Vermogensgroei KPI appears ONLY on Kern page',
      passed,
      details: passed
        ? 'kpi-vermogensgroei found only on De Kern.'
        : `Found on: ${found.join(', ') || 'none'}`,
    })
  }

  // TEST 8: Spaarquote KPI ONLY on Kern
  {
    const pages = { Dashboard: dashboardSrc, Kern: coreSrc, Wil: willSrc, Horizon: horizonSrc }
    const found: string[] = []
    for (const [name, src] of Object.entries(pages)) {
      if (src.includes('kpi-spaarquote')) found.push(name)
    }
    const passed = found.length === 1 && found[0] === 'Kern'
    results.push({
      id: 'spaarquote-only-kern',
      name: 'Spaarquote KPI appears ONLY on Kern page',
      passed,
      details: passed
        ? 'kpi-spaarquote found only on De Kern.'
        : `Found on: ${found.join(', ') || 'none'}`,
    })
  }

  // TEST 9: Wilskrachtscore KPI ONLY on Wil
  {
    const pages = { Dashboard: dashboardSrc, Kern: coreSrc, Wil: willSrc, Horizon: horizonSrc }
    const found: string[] = []
    for (const [name, src] of Object.entries(pages)) {
      if (src.includes('kpi-wilskrachtscore')) found.push(name)
    }
    const passed = found.length === 1 && found[0] === 'Wil'
    results.push({
      id: 'wilskrachtscore-only-wil',
      name: 'Wilskrachtscore KPI appears ONLY on Wil page',
      passed,
      details: passed
        ? 'kpi-wilskrachtscore found only on De Wil.'
        : `Found on: ${found.join(', ') || 'none'}`,
    })
  }

  // TEST 10: Veerkracht (resilience) KPI ONLY on Horizon
  {
    const pages = { Dashboard: dashboardSrc, Kern: coreSrc, Wil: willSrc, Horizon: horizonSrc }
    const found: string[] = []
    for (const [name, src] of Object.entries(pages)) {
      if (src.includes('resilience-kpi')) found.push(name)
    }
    const passed = found.length === 1 && found[0] === 'Horizon'
    results.push({
      id: 'resilience-only-horizon',
      name: 'Veerkracht KPI appears ONLY on Horizon page',
      passed,
      details: passed
        ? 'resilience-kpi found only on De Horizon.'
        : `Found on: ${found.join(', ') || 'none'}`,
    })
  }

  // TEST 11: Dashboard uses preview test IDs (not primary KPI test IDs)
  {
    const previewPattern = /data-testid="(kern|wil|horizon)-preview-(metric|value)"/g
    const previewMatches = [...dashboardSrc.matchAll(previewPattern)]
    const primaryKpiPattern = /data-testid="kpi-/g
    const primaryKpiMatches = [...dashboardSrc.matchAll(primaryKpiPattern)]
    const passed = previewMatches.length >= 3 && primaryKpiMatches.length === 0
    results.push({
      id: 'dashboard-preview-testids',
      name: 'Dashboard uses preview test IDs (not primary KPI test IDs)',
      passed,
      details: passed
        ? `Found ${previewMatches.length} preview IDs, 0 primary KPI IDs on Dashboard.`
        : `Preview IDs: ${previewMatches.length}, Primary KPI IDs: ${primaryKpiMatches.length}`,
    })
  }

  // TEST 12: Cross-page tooltip differentiation
  {
    const kernDiffs = coreSrc.includes('Dit verschilt van') && coreSrc.includes('De Wil')
    const wilDiffs = willSrc.includes('Dit verschilt van') && willSrc.includes('De Kern')
    const passed = kernDiffs && wilDiffs
    results.push({
      id: 'tooltips-cross-page',
      name: 'KPI tooltips differentiate similar metrics across pages',
      passed,
      details: passed
        ? 'Both Kern and Wil tooltips explicitly differentiate from each other.'
        : `Kern diffs from Wil: ${kernDiffs}, Wil diffs from Kern: ${wilDiffs}`,
    })
  }

  // TEST 13: Each module page has a unique hero primary metric
  {
    const kernHero = coreSrc.includes('kern-hero') && coreSrc.includes('freedomPercentage')
    const wilHero = willSrc.includes('wil-hero') && willSrc.includes('totalFreedomDaysWon')
    const horizonHero = horizonSrc.includes('horizon-hero') && horizonSrc.includes('hero-fire-age')
    const dashNoModuleHero = !dashboardSrc.includes('kern-hero')
      && !dashboardSrc.includes('wil-hero')
      && !dashboardSrc.includes('horizon-hero')
    const passed = kernHero && wilHero && horizonHero && dashNoModuleHero
    results.push({
      id: 'unique-hero-primaries',
      name: 'Each module page has a unique hero primary metric',
      passed,
      details: passed
        ? 'Kern: freedom %, Wil: freedom days, Horizon: FIRE age. Dashboard: no module hero.'
        : `Kern: ${kernHero}, Wil: ${wilHero}, Horizon: ${horizonHero}, Dash no hero: ${dashNoModuleHero}`,
    })
  }

  // TEST 14: Autonomie Score KPI ONLY on Kern
  {
    const pages = { Dashboard: dashboardSrc, Kern: coreSrc, Wil: willSrc, Horizon: horizonSrc }
    const found: string[] = []
    for (const [name, src] of Object.entries(pages)) {
      if (src.includes('kpi-autonomie-score')) found.push(name)
    }
    const passed = found.length === 1 && found[0] === 'Kern'
    results.push({
      id: 'autonomie-score-only-kern',
      name: 'Autonomie Score KPI appears ONLY on Kern page',
      passed,
      details: passed
        ? 'kpi-autonomie-score found only on De Kern.'
        : `Found on: ${found.join(', ') || 'none'}`,
    })
  }

  // TEST 15: FIRE Doelbedrag KPI ONLY on Horizon
  {
    const pages = { Dashboard: dashboardSrc, Kern: coreSrc, Wil: willSrc, Horizon: horizonSrc }
    const found: string[] = []
    for (const [name, src] of Object.entries(pages)) {
      if (src.includes('kpi-fire-target')) found.push(name)
    }
    const passed = found.length === 1 && found[0] === 'Horizon'
    results.push({
      id: 'fire-target-only-horizon',
      name: 'FIRE Doelbedrag KPI appears ONLY on Horizon page',
      passed,
      details: passed
        ? 'kpi-fire-target found only on De Horizon.'
        : `Found on: ${found.join(', ') || 'none'}`,
    })
  }

  const passing = results.filter(r => r.passed).length
  const total = results.length

  return NextResponse.json({
    feature: '#245 - No KPI appears as primary metric on multiple pages',
    summary: `${passing}/${total} tests passing`,
    allPassing: passing === total,
    dashboardRole: 'Preview teasers only',
    tests: results,
  })
}
