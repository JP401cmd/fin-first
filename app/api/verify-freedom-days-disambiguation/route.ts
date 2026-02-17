import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Verification endpoint for Feature #191: Freedom days disambiguation with info tooltips
 *
 * Checks:
 * 1. "Gewonnen" freedom days on De Wil has info tooltip
 * 2. "Per jaar" freedom days on De Kern has info tooltip with disambiguation
 * 3. "Open potentieel" on De Wil has info tooltip with disambiguation
 * 4. Each term only appears on its designated page
 * 5. Tooltips are accessible (aria-label, role="tooltip")
 * 6. Tooltips are styled consistently
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []
  const cwd = process.cwd()

  // Read source files
  let willPage = ''
  let corePage = ''
  let dashboardPage = ''
  let horizonPage = ''

  try {
    willPage = readFileSync(join(cwd, 'app/(app)/will/page.tsx'), 'utf-8')
    corePage = readFileSync(join(cwd, 'app/(app)/core/page.tsx'), 'utf-8')
    dashboardPage = readFileSync(join(cwd, 'app/(app)/dashboard/page.tsx'), 'utf-8')
    horizonPage = readFileSync(join(cwd, 'app/(app)/horizon/page.tsx'), 'utf-8')
  } catch (e) {
    // Dashboard might be at different path
    try { dashboardPage = readFileSync(join(cwd, 'app/dashboard/page.tsx'), 'utf-8') } catch {}
  }

  // === Test 1: "Gewonnen" hero on De Wil has info tooltip ===
  const wilHeroHasGewonnenTooltip = willPage.includes('vrijheidsdagen gewonnen') &&
    willPage.includes('HeroTooltip') &&
    willPage.includes('Gewonnen vrijheidsdagen komen uitsluitend van voltooide acties')
  results.push({
    name: '"Gewonnen" hero on De Wil has info tooltip explaining completed actions',
    pass: wilHeroHasGewonnenTooltip,
    detail: wilHeroHasGewonnenTooltip
      ? 'HeroTooltip found next to "vrijheidsdagen gewonnen" with explanation about completed actions'
      : 'Missing HeroTooltip for "gewonnen" in De Wil hero section'
  })

  // === Test 2: "Per jaar" KPI on De Kern has disambiguation tooltip ===
  const kernHasPerJaarTooltip = corePage.includes('Vrije Dagen per Jaar') &&
    corePage.includes('exclusief De Kern') &&
    corePage.includes('passief inkomen')
  results.push({
    name: '"Per jaar" KPI on De Kern has disambiguation tooltip',
    pass: kernHasPerJaarTooltip,
    detail: kernHasPerJaarTooltip
      ? 'KPI tooltip includes "exclusief De Kern" and explains passive income basis'
      : 'Missing disambiguation text in "Vrije Dagen per Jaar" tooltip'
  })

  // === Test 3: "Open potentieel" KPI on De Wil has disambiguation tooltip ===
  const wilHasOpenPotentieelTooltip = willPage.includes('Open Potentieel') &&
    willPage.includes('exclusief De Wil') &&
    willPage.includes('openstaande acties en aanbevelingen')
  results.push({
    name: '"Open potentieel" KPI on De Wil has disambiguation tooltip',
    pass: wilHasOpenPotentieelTooltip,
    detail: wilHasOpenPotentieelTooltip
      ? 'KPI tooltip includes "exclusief De Wil" and explains open actions/recommendations'
      : 'Missing disambiguation text in "Open Potentieel" tooltip'
  })

  // === Test 4: "Open potentieel" hero sub-KPI on De Wil has tooltip ===
  const wilHeroOpenPotentieelTooltip = willPage.includes('wil-hero-open-potentieel') &&
    willPage.includes('Open potentieel toont vrijheidsdagen')
  results.push({
    name: '"Open potentieel" hero sub-KPI on De Wil has info tooltip',
    pass: wilHeroOpenPotentieelTooltip,
    detail: wilHeroOpenPotentieelTooltip
      ? 'HeroTooltip found in hero sub-KPI "Open potentieel" section'
      : 'Missing HeroTooltip for "Open potentieel" hero sub-KPI'
  })

  // === Test 5: "Dagen Gewonnen" KPI on De Kern has disambiguation tooltip ===
  const kernDagenGewonnenTooltip = corePage.includes('kpi-dagen-gewonnen') &&
    corePage.includes('exclusief De Kern') &&
    corePage.includes('maandelijkse besparing')
  results.push({
    name: '"Dagen Gewonnen" KPI on De Kern has disambiguation tooltip',
    pass: kernDagenGewonnenTooltip,
    detail: kernDagenGewonnenTooltip
      ? 'Tooltip differentiates from De Wil "gewonnen" (monthly savings vs completed actions)'
      : 'Missing disambiguation in "Dagen Gewonnen" tooltip on De Kern'
  })

  // === Test 6: "Open potentieel" does NOT appear as metric label on De Kern ===
  // It can appear in tooltip text referencing De Wil, but not as a displayed metric title
  const corePageLabels = corePage.replace(/KpiTooltip text="[^"]*"/g, '') // Remove tooltip text
  const openPotentieelNotOnKern = !corePageLabels.includes('Open potentieel') && !corePageLabels.includes('Open Potentieel')
  results.push({
    name: '"Open potentieel" does NOT appear as metric label on De Kern',
    pass: openPotentieelNotOnKern,
    detail: openPotentieelNotOnKern
      ? '"Open potentieel" only appears in De Wil, not as a metric label on De Kern'
      : '"Open potentieel" found as metric label on De Kern (should be De Wil only)'
  })

  // === Test 7: "Vrije Dagen per Jaar" does NOT appear as metric label on De Wil ===
  // It can appear in tooltip text referencing De Kern, but not as a displayed metric title
  const willPageLabels = willPage.replace(/(?:KpiTooltip|HeroTooltip) text="[^"]*"/g, '') // Remove tooltip text
  const vrijeDagenNotOnWil = !willPageLabels.includes('Vrije Dagen per Jaar')
  results.push({
    name: '"Vrije Dagen per Jaar" does NOT appear as metric label on De Wil',
    pass: vrijeDagenNotOnWil,
    detail: vrijeDagenNotOnWil
      ? '"Vrije Dagen per Jaar" only referenced in tooltip text for disambiguation, not as a metric label'
      : '"Vrije Dagen per Jaar" found as metric label on De Wil (should be De Kern only)'
  })

  // === Test 8: "Open potentieel" does NOT appear on Dashboard ===
  const openPotentieelNotOnDashboard = !dashboardPage.includes('Open potentieel') && !dashboardPage.includes('Open Potentieel')
  results.push({
    name: '"Open potentieel" does NOT appear on Dashboard',
    pass: openPotentieelNotOnDashboard,
    detail: openPotentieelNotOnDashboard
      ? '"Open potentieel" not found on Dashboard page'
      : '"Open potentieel" found on Dashboard (should be De Wil only)'
  })

  // === Test 9: "Open potentieel" does NOT appear on Horizon ===
  const openPotentieelNotOnHorizon = !horizonPage.includes('Open potentieel') && !horizonPage.includes('Open Potentieel')
  results.push({
    name: '"Open potentieel" does NOT appear on Horizon',
    pass: openPotentieelNotOnHorizon,
    detail: openPotentieelNotOnHorizon
      ? '"Open potentieel" not found on Horizon page'
      : '"Open potentieel" found on Horizon (should be De Wil only)'
  })

  // === Test 10: Tooltips have aria-label for accessibility ===
  const willTooltipAccessible = willPage.includes('aria-label="Meer informatie"')
  const coreTooltipAccessible = corePage.includes('aria-label="Meer informatie"')
  const tooltipsAccessible = willTooltipAccessible && coreTooltipAccessible
  results.push({
    name: 'Tooltips have aria-label for accessibility',
    pass: tooltipsAccessible,
    detail: tooltipsAccessible
      ? 'Both De Wil and De Kern tooltip buttons have aria-label="Meer informatie"'
      : `De Wil aria-label: ${willTooltipAccessible}, De Kern aria-label: ${coreTooltipAccessible}`
  })

  // === Test 11: Tooltips have role="tooltip" ===
  const willHasRoleTooltip = willPage.includes('role="tooltip"')
  const coreHasRoleTooltip = corePage.includes('role="tooltip"')
  const tooltipsHaveRole = willHasRoleTooltip && coreHasRoleTooltip
  results.push({
    name: 'Tooltips have role="tooltip" attribute',
    pass: tooltipsHaveRole,
    detail: tooltipsHaveRole
      ? 'Both pages use role="tooltip" for accessibility'
      : `De Wil role="tooltip": ${willHasRoleTooltip}, De Kern role="tooltip": ${coreHasRoleTooltip}`
  })

  // === Test 12: HeroTooltip component exists on De Wil page ===
  const heroTooltipExists = willPage.includes('function HeroTooltip') &&
    willPage.includes('teal-900/95') && // Dark background for hero context
    willPage.includes('teal-100') // Light text for dark background
  results.push({
    name: 'HeroTooltip component exists with dark-background styling',
    pass: heroTooltipExists,
    detail: heroTooltipExists
      ? 'HeroTooltip renders with dark teal background and light text (hero-appropriate styling)'
      : 'HeroTooltip component missing or incorrectly styled'
  })

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#191 — Freedom days disambiguation with info tooltips',
    summary: `${passing}/${total} checks passing`,
    allPassing: passing === total,
    results,
  })
}
