import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Verification endpoint for Feature #186: Consistent philosophical labels.
 * Reads source files and checks for correct freedom-oriented labels.
 */
export async function GET() {
  const results: { step: string; status: 'pass' | 'fail'; detail: string }[] = []
  const appDir = path.join(process.cwd(), 'app', '(app)')

  // Helper to read a file
  function readFile(relPath: string): string {
    try {
      return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8')
    } catch {
      return ''
    }
  }

  // 1. Dashboard: Check FIRE labels replaced with freedom framing
  const dashboard = readFile('app/(app)/dashboard/page.tsx')
  const dashboardHasFreedom = dashboard.includes('volledige vrijheid te bereiken') && dashboard.includes('moment van volledige vrijheid')
  results.push({
    step: '1. Dashboard FIRE labels use freedom framing',
    status: dashboardHasFreedom ? 'pass' : 'fail',
    detail: dashboardHasFreedom
      ? 'Dashboard uses "volledige vrijheid" instead of generic FIRE labels'
      : 'Dashboard still uses generic FIRE labels'
  })

  // 2. Horizon hero: "pad naar volledige vrijheid"
  const horizon = readFile('app/(app)/horizon/page.tsx')
  const heroHasFreedom = horizon.includes('pad naar volledige vrijheid')
  results.push({
    step: '2. Horizon hero uses "pad naar volledige vrijheid"',
    status: heroHasFreedom ? 'pass' : 'fail',
    detail: heroHasFreedom
      ? 'Hero shows "jaar — pad naar volledige vrijheid"'
      : 'Hero missing freedom framing'
  })

  // 3. Horizon FIRE target → "volledige vrijheid"
  const fireTargetFreedom = horizon.includes('— volledige vrijheid')
  results.push({
    step: '3. FIRE target bar shows "volledige vrijheid"',
    status: fireTargetFreedom ? 'pass' : 'fail',
    detail: fireTargetFreedom
      ? 'Progress bar endpoint shows "volledige vrijheid" instead of "FIRE doel"'
      : 'Still uses "FIRE doel"'
  })

  // 4. Horizon KPI: "Vrijheidsleeftijd" instead of "FIRE Leeftijd"
  const kpiVrijheidsleeftijd = horizon.includes('Vrijheidsleeftijd')
  results.push({
    step: '4. KPI uses "Vrijheidsleeftijd" label',
    status: kpiVrijheidsleeftijd ? 'pass' : 'fail',
    detail: kpiVrijheidsleeftijd
      ? 'KPI card shows "Vrijheidsleeftijd" instead of "FIRE Leeftijd"'
      : 'Still uses "FIRE Leeftijd"'
  })

  // 5. Horizon KPI: "dagen tot volledige vrijheid"
  const dagenTotVrijheid = horizon.includes('dagen tot volledige vrijheid')
  results.push({
    step: '5. Countdown KPI shows "dagen tot volledige vrijheid"',
    status: dagenTotVrijheid ? 'pass' : 'fail',
    detail: dagenTotVrijheid
      ? 'Shows "dagen tot volledige vrijheid" instead of "dagen tot FIRE"'
      : 'Still uses "dagen tot FIRE"'
  })

  // 6. Horizon KPI: "van volledige vrijheid"
  const vanVrijheid = horizon.includes('van volledige vrijheid')
  results.push({
    step: '6. Freedom percentage shows "van volledige vrijheid"',
    status: vanVrijheid ? 'pass' : 'fail',
    detail: vanVrijheid
      ? 'Shows "van volledige vrijheid" instead of "van FIRE doel"'
      : 'Still uses "van FIRE doel"'
  })

  // 7. Debts page: "vrijheid die je terugkoopt"
  const debts = readFile('app/(app)/core/debts/page.tsx')
  const debtsHasFreedom = debts.includes('vrijheid die je terugkoopt')
  results.push({
    step: '7. Debts page uses "vrijheid die je terugkoopt" framing',
    status: debtsHasFreedom ? 'pass' : 'fail',
    detail: debtsHasFreedom
      ? 'Schulden subtitle includes "vrijheid die je terugkoopt"'
      : 'Missing freedom framing on debts page'
  })

  // 8. Budgets "Sparen" section: "vrijheid opbouwen"
  const budgets = readFile('app/(app)/core/budgets/page.tsx')
  const sparenFreedom = budgets.includes('vrijheid opbouwen')
  results.push({
    step: '8. Budgets "Sparen" section uses "vrijheid opbouwen"',
    status: sparenFreedom ? 'pass' : 'fail',
    detail: sparenFreedom
      ? 'Sparen sections show "vrijheid opbouwen" framing'
      : 'Missing "vrijheid opbouwen" on budgets page'
  })

  // 9. Budgets "Schulden" section: "vrijheid terugkopen"
  const schuldenFreedom = budgets.includes('vrijheid terugkopen')
  results.push({
    step: '9. Budgets "Schulden" section uses "vrijheid terugkopen"',
    status: schuldenFreedom ? 'pass' : 'fail',
    detail: schuldenFreedom
      ? 'Schulden section shows "vrijheid terugkopen" framing'
      : 'Missing "vrijheid terugkopen" on budgets page'
  })

  // 10. Assets page: Dutch header "Bezittingen" instead of English "Assets"
  const assets = readFile('app/(app)/core/assets/page.tsx')
  const assetsDutch = assets.includes('Bezittingen') && assets.includes('opgeslagen vrijheid')
  results.push({
    step: '10. Assets page uses Dutch "Bezittingen" with freedom subtitle',
    status: assetsDutch ? 'pass' : 'fail',
    detail: assetsDutch
      ? 'Assets header shows "Bezittingen" with "opgeslagen vrijheid" subtitle'
      : 'Still uses English "Assets" or missing freedom subtitle'
  })

  // 11. Core page: target bar uses "volledige vrijheid"
  const core = readFile('app/(app)/core/page.tsx')
  const coreFreedom = core.includes('— volledige vrijheid')
  results.push({
    step: '11. Core page target bar shows "volledige vrijheid"',
    status: coreFreedom ? 'pass' : 'fail',
    detail: coreFreedom
      ? 'Core progress bar shows target as "volledige vrijheid"'
      : 'Core page missing freedom framing on target bar'
  })

  // 12. Horizon tooltips: freedom-oriented instead of FIRE
  const tooltipFreedom = horizon.includes('Je verwachte vrijheidsleeftijd') &&
    horizon.includes('verwacht moment van volledige vrijheid') &&
    horizon.includes('richting volledige vrijheid')
  results.push({
    step: '12. Horizon tooltips use freedom-oriented language',
    status: tooltipFreedom ? 'pass' : 'fail',
    detail: tooltipFreedom
      ? 'All KPI tooltips use freedom-oriented language'
      : 'Some tooltips still use generic FIRE language'
  })

  // 13. Dutch language consistency - no remaining English "Assets" header
  const noEnglishAssets = !assets.includes('>Assets<')
  results.push({
    step: '13. No English "Assets" header in Dutch app',
    status: noEnglishAssets ? 'pass' : 'fail',
    detail: noEnglishAssets
      ? 'No English "Assets" header found — Dutch consistency maintained'
      : 'English "Assets" header still present'
  })

  // 14. Horizon projection chart: "volledige vrijheid" instead of "FIRE-doel"
  const projFreedom = horizon.includes('richting volledige vrijheid')
  results.push({
    step: '14. Projection chart references "volledige vrijheid"',
    status: projFreedom ? 'pass' : 'fail',
    detail: projFreedom
      ? 'Projection chart subtitle uses "volledige vrijheid"'
      : 'Projection chart still references "FIRE-doel"'
  })

  const passing = results.filter(r => r.status === 'pass').length
  const total = results.length

  return NextResponse.json({
    feature: '#186 - Consistent philosophical labels throughout app',
    summary: `${passing}/${total} checks passing`,
    passing,
    total,
    results
  })
}
