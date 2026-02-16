import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { join } from 'path'

/**
 * Verification endpoint for Feature #137: Dashboard module card order persists
 *
 * Verifies that the dashboard page maintains consistent card order:
 * 1. De Kern (amber) - first card
 * 2. De Wil (teal) - second card
 * 3. De Horizon (purple) - third card
 *
 * The order is structurally hardcoded in JSX, guaranteeing persistence
 * across sessions, navigation, and login/logout cycles.
 */
export async function GET() {
  const results: { test: string; passed: boolean; detail: string }[] = []

  try {
    // Read the dashboard page source code
    const dashboardPath = join(process.cwd(), 'app', '(app)', 'dashboard', 'page.tsx')
    const source = await readFile(dashboardPath, 'utf-8')

    // Test 1: Dashboard page exists and contains module cards
    const hasKern = source.includes('De Kern')
    const hasWil = source.includes('De Wil')
    const hasHorizon = source.includes('De Horizon')
    results.push({
      test: 'All three module cards exist in dashboard',
      passed: hasKern && hasWil && hasHorizon,
      detail: `Kern: ${hasKern}, Wil: ${hasWil}, Horizon: ${hasHorizon}`,
    })

    // Test 2: Cards are in correct order (Kern before Wil before Horizon)
    const kernIndex = source.indexOf('De Kern')
    const wilIndex = source.indexOf('De Wil')
    const horizonIndex = source.indexOf('De Horizon')
    const correctOrder = kernIndex < wilIndex && wilIndex < horizonIndex
    results.push({
      test: 'Cards are in correct order: Kern → Wil → Horizon',
      passed: correctOrder,
      detail: `Kern at char ${kernIndex}, Wil at char ${wilIndex}, Horizon at char ${horizonIndex}`,
    })

    // Test 3: Cards use correct color themes
    const kernAmber = source.includes('border-amber-200')
    const wilTeal = source.includes('border-teal-200')
    const horizonPurple = source.includes('border-purple-200')
    results.push({
      test: 'Cards use correct color themes (amber, teal, purple)',
      passed: kernAmber && wilTeal && horizonPurple,
      detail: `Kern amber: ${kernAmber}, Wil teal: ${wilTeal}, Horizon purple: ${horizonPurple}`,
    })

    // Test 4: Cards link to correct routes
    const kernLinksToCore = source.includes('href="/core"')
    const wilLinksToWill = source.includes('href="/will"')
    const horizonLinksToHorizon = source.includes('href="/horizon"')
    results.push({
      test: 'Cards link to correct routes (/core, /will, /horizon)',
      passed: kernLinksToCore && wilLinksToWill && horizonLinksToHorizon,
      detail: `Kern → /core: ${kernLinksToCore}, Wil → /will: ${wilLinksToWill}, Horizon → /horizon: ${horizonLinksToHorizon}`,
    })

    // Test 5: Cards are inside a 3-column grid (consistent layout)
    const hasGrid = source.includes('grid') && source.includes('md:grid-cols-3')
    results.push({
      test: 'Cards are in a 3-column grid layout',
      passed: hasGrid,
      detail: `Grid layout present: ${hasGrid}`,
    })

    // Test 6: Order is hardcoded (not dynamically generated from array/map)
    // If cards were dynamic, we'd see .map() with module data near the grid
    const gridSection = source.substring(
      source.indexOf('grid gap-6 md:grid-cols-3'),
      source.indexOf('Freedom indicator') || source.length
    )
    const hasDynamicMapping = gridSection.includes('.map(') || gridSection.includes('.forEach(')
    results.push({
      test: 'Card order is statically defined (not dynamically generated)',
      passed: !hasDynamicMapping,
      detail: `Dynamic mapping in card section: ${hasDynamicMapping} (should be false for static order)`,
    })

    // Test 7: Each card has correct subtitle
    const kernSubtitle = source.includes('Waar sta je echt?')
    const wilSubtitle = source.includes('Wat ga je doen?')
    const horizonSubtitle = source.includes('Waar ga je naartoe?')
    results.push({
      test: 'Cards have correct subtitles',
      passed: kernSubtitle && wilSubtitle && horizonSubtitle,
      detail: `Kern: "${kernSubtitle ? 'Waar sta je echt?' : 'missing'}", Wil: "${wilSubtitle ? 'Wat ga je doen?' : 'missing'}", Horizon: "${horizonSubtitle ? 'Waar ga je naartoe?' : 'missing'}"`,
    })

    // Test 8: Cards use correct avatar components in correct order
    const fhinIndex = source.indexOf('FhinAvatar')
    const finnIndex = source.indexOf('FinnAvatar')
    const ffinIndex = source.indexOf('FfinAvatar')
    const avatarsInOrder = fhinIndex > 0 && finnIndex > 0 && ffinIndex > 0 && fhinIndex < finnIndex && finnIndex < ffinIndex
    results.push({
      test: 'Avatar components are in correct order (Fhin, Finn, Ffin)',
      passed: avatarsInOrder,
      detail: `FhinAvatar at ${fhinIndex}, FinnAvatar at ${finnIndex}, FfinAvatar at ${ffinIndex}`,
    })

  } catch (error) {
    results.push({
      test: 'Dashboard page source readable',
      passed: false,
      detail: `Error: ${error instanceof Error ? error.message : String(error)}`,
    })
  }

  const passing = results.filter(r => r.passed).length
  const total = results.length

  return NextResponse.json({
    feature: '#137 - Dashboard module card order persists',
    summary: `${passing}/${total} tests passing`,
    allPassing: passing === total,
    results,
  })
}
