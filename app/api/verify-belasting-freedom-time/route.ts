import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  // Read the belasting page source code
  const belastingPath = path.join(process.cwd(), 'app/(app)/core/belasting/page.tsx')
  let source = ''
  try {
    source = fs.readFileSync(belastingPath, 'utf-8')
  } catch {
    return NextResponse.json({
      error: 'Could not read belasting page source',
      results: [{ name: 'File exists', pass: false, detail: 'app/(app)/core/belasting/page.tsx not found' }],
    })
  }

  // Test 1: formatWithFreedom is imported
  const hasImport = source.includes('formatWithFreedom') && source.includes("from '@/lib/format'")
  results.push({
    name: 'formatWithFreedom imported from lib/format',
    pass: hasImport,
    detail: hasImport ? 'Import found' : 'Missing import of formatWithFreedom',
  })

  // Test 2: Hero section shows freedom-time for tax amount
  const heroFreedomTime = source.includes('data-testid="belasting-hero-freedom-time"')
  results.push({
    name: 'Hero shows freedom-time label for tax amount',
    pass: heroFreedomTime,
    detail: heroFreedomTime ? 'Hero freedom-time label found' : 'Missing hero freedom-time label',
  })

  // Test 3: Hero uses formatWithFreedom for freedom time display
  const heroUsesFormatWithFreedom = source.includes('formatWithFreedom(result.belasting, dailyExpenses')
  results.push({
    name: 'Hero uses formatWithFreedom() for tax amount',
    pass: heroUsesFormatWithFreedom,
    detail: heroUsesFormatWithFreedom ? 'formatWithFreedom used in hero' : 'formatWithFreedom not used in hero',
  })

  // Test 4: KPI "Totale Belasting" card shows freedom days lost
  const kpiBelastingFreedom = source.includes('data-testid="kpi-belasting-freedom"')
    && source.includes('vrijheidsdagen verloren')
  results.push({
    name: 'Totale Belasting KPI shows freedom days lost',
    pass: kpiBelastingFreedom,
    detail: kpiBelastingFreedom ? 'Freedom days lost shown in tax KPI' : 'Missing freedom days lost in tax KPI',
  })

  // Test 5: KPI "Vrijheidsdagen" card shows freedom-time equivalent
  const kpiVrijheidsdagenTime = source.includes('data-testid="kpi-vrijheidsdagen-time"')
    && source.includes('formatWithFreedom(result.belasting, dailyExpenses')
  results.push({
    name: 'Vrijheidsdagen KPI shows freedom-time equivalent',
    pass: kpiVrijheidsdagenTime,
    detail: kpiVrijheidsdagenTime ? 'Freedom-time shown in vrijheidsdagen KPI' : 'Missing freedom-time in vrijheidsdagen KPI',
  })

  // Test 6: KPI "Heffingsvrij Benut" card shows freedom-time
  const kpiHeffingsvrijFreedom = source.includes('data-testid="kpi-heffingsvrij-freedom"')
    && source.includes('formatWithFreedom(result.heffingsvrijVermogen, dailyExpenses')
  results.push({
    name: 'Heffingsvrij KPI shows freedom-time for amount',
    pass: kpiHeffingsvrijFreedom,
    detail: kpiHeffingsvrijFreedom ? 'Freedom-time shown in heffingsvrij KPI' : 'Missing freedom-time in heffingsvrij KPI',
  })

  // Test 7: Optimization tips use formatWithFreedom for savings
  const optimizationFreedom = source.includes('formatWithFreedom(tip.besparing, dailyExpenses)')
  results.push({
    name: 'Optimization savings use formatWithFreedom()',
    pass: optimizationFreedom,
    detail: optimizationFreedom ? 'formatWithFreedom used for optimization savings' : 'Optimization savings do not use formatWithFreedom',
  })

  // Test 8: Optimization tips show "vrijheidsdagen teruggewonnen" (freedom days recovered)
  const optimizationRecovered = source.includes('vrijheidsdagen teruggewonnen')
  results.push({
    name: 'Optimization tips show freedom days recovered',
    pass: optimizationRecovered,
    detail: optimizationRecovered ? '"vrijheidsdagen teruggewonnen" found' : 'Missing "vrijheidsdagen teruggewonnen" label',
  })

  // Test 9: All 4 KPI cards have data-testid attributes
  const kpiTestIds = [
    'kpi-totale-belasting',
    'kpi-effectief-tarief',
    'kpi-vrijheidsdagen',
    'kpi-heffingsvrij',
  ]
  const allKpiTestIds = kpiTestIds.every(id => source.includes(`data-testid="${id}"`))
  results.push({
    name: 'All 4 KPI cards have data-testid attributes',
    pass: allKpiTestIds,
    detail: allKpiTestIds ? 'All testids found' : `Missing testids: ${kpiTestIds.filter(id => !source.includes(`data-testid="${id}"`)).join(', ')}`,
  })

  // Test 10: Uses real data from Supabase (dailyExpenses from transactions)
  const usesRealData = source.includes("from('transactions')") && source.includes('setDailyExpenses')
  results.push({
    name: 'Calculations use real expense data from database',
    pass: usesRealData,
    detail: usesRealData ? 'Real daily expenses calculated from transactions' : 'Missing real expense data calculation',
  })

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: 'Freedom-time in Box 3 tax displays (#185)',
    passing,
    total,
    allPassing: passing === total,
    results,
  })
}
