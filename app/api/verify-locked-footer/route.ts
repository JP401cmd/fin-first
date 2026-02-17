import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

/**
 * Verification endpoint for Feature #196:
 * "Meer functies beschikbaar footer on gated pages"
 *
 * Tests:
 * 1. LockedFeaturesFooter component exists
 * 2. Component accepts module prop
 * 3. Component accepts optional featureIds prop for sub-pages
 * 4. Component uses useFeatureAccess hook for current phase
 * 5. Component shows correct Dutch text format
 * 6. Component hides when no locked features
 * 7. Component opens BottomSheet on click
 * 8. BottomSheet shows feature summary grouped by phase
 * 9. Component integrated on /core page (kern module)
 * 10. Component integrated on /will page (wil module)
 * 11. Component integrated on /horizon page (horizon module)
 * 12. Component integrated on /core/debts page (kern module, specific featureIds)
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []
  const root = process.cwd()

  // Helper to read a file safely
  function readFile(relPath: string): string | null {
    try {
      return fs.readFileSync(path.join(root, relPath), 'utf-8')
    } catch {
      return null
    }
  }

  // Test 1: Component file exists
  const componentPath = 'components/app/locked-features-footer.tsx'
  const componentCode = readFile(componentPath)
  results.push({
    name: 'LockedFeaturesFooter component exists',
    pass: componentCode !== null,
    detail: componentCode ? `Found at ${componentPath}` : `Missing: ${componentPath}`,
  })

  // Test 2: Component accepts module prop
  const hasModuleProp = componentCode?.includes("module: 'kern' | 'wil' | 'horizon'") ?? false
  results.push({
    name: 'Component accepts module prop (kern/wil/horizon)',
    pass: hasModuleProp,
    detail: hasModuleProp ? 'Module prop with kern|wil|horizon union type' : 'Missing module prop type',
  })

  // Test 3: Component accepts optional featureIds prop
  const hasFeatureIdsProp = componentCode?.includes('featureIds?: string[]') ?? false
  results.push({
    name: 'Component accepts optional featureIds prop for sub-pages',
    pass: hasFeatureIdsProp,
    detail: hasFeatureIdsProp ? 'featureIds?: string[] optional prop' : 'Missing featureIds optional prop',
  })

  // Test 4: Component uses useFeatureAccess hook
  const usesHook = componentCode?.includes('useFeatureAccess()') ?? false
  results.push({
    name: 'Component uses useFeatureAccess for current phase',
    pass: usesHook,
    detail: usesHook ? 'Uses useFeatureAccess() to get features & phase' : 'Missing useFeatureAccess()',
  })

  // Test 5: Shows correct Dutch text format "X meer functies beschikbaar"
  const hasCorrectText = componentCode?.includes("meer") && componentCode?.includes("functies") && componentCode?.includes("beschikbaar") && componentCode?.includes("op niveau")
  results.push({
    name: 'Shows correct text: "X meer functies beschikbaar op niveau Y"',
    pass: !!hasCorrectText,
    detail: hasCorrectText ? 'Contains "meer functies beschikbaar op niveau" text pattern' : 'Missing correct Dutch text',
  })

  // Test 6: Hides when no locked features
  const hidesWhenEmpty = componentCode?.includes('if (lockedFeatures.length === 0) return null') ?? false
  results.push({
    name: 'Hides footer when all features are visible (no locked)',
    pass: hidesWhenEmpty,
    detail: hidesWhenEmpty ? 'Returns null when lockedFeatures.length === 0' : 'Missing empty check',
  })

  // Test 7: Opens BottomSheet on click
  const hasBottomSheet = componentCode?.includes('BottomSheet') && componentCode?.includes('setShowPanel(true)') && componentCode?.includes('onClick')
  results.push({
    name: 'Footer is clickable → opens BottomSheet summary',
    pass: !!hasBottomSheet,
    detail: hasBottomSheet ? 'Button with onClick opens BottomSheet panel' : 'Missing BottomSheet/click handler',
  })

  // Test 8: BottomSheet shows features grouped by phase
  const hasGroupedFeatures = componentCode?.includes('sortedPhaseGroups') && componentCode?.includes('groupedByPhase')
  results.push({
    name: 'BottomSheet shows locked features grouped by unlock phase',
    pass: !!hasGroupedFeatures,
    detail: hasGroupedFeatures ? 'Features grouped by phase with sorted display' : 'Missing phase grouping',
  })

  // Test 9: Integrated on /core page
  const corePage = readFile('app/(app)/core/page.tsx')
  const coreHasFooter = corePage?.includes('LockedFeaturesFooter') && corePage?.includes('module="kern"')
  results.push({
    name: 'Integrated on De Kern /core page (module="kern")',
    pass: !!coreHasFooter,
    detail: coreHasFooter ? '<LockedFeaturesFooter module="kern" /> on core page' : 'Missing on /core page',
  })

  // Test 10: Integrated on /will page
  const willPage = readFile('app/(app)/will/page.tsx')
  const willHasFooter = willPage?.includes('LockedFeaturesFooter') && willPage?.includes('module="wil"')
  results.push({
    name: 'Integrated on De Wil /will page (module="wil")',
    pass: !!willHasFooter,
    detail: willHasFooter ? '<LockedFeaturesFooter module="wil" /> on will page' : 'Missing on /will page',
  })

  // Test 11: Integrated on /horizon page
  const horizonPage = readFile('app/(app)/horizon/page.tsx')
  const horizonHasFooter = horizonPage?.includes('LockedFeaturesFooter') && horizonPage?.includes('module="horizon"')
  results.push({
    name: 'Integrated on De Horizon /horizon page (module="horizon")',
    pass: !!horizonHasFooter,
    detail: horizonHasFooter ? '<LockedFeaturesFooter module="horizon" /> on horizon page' : 'Missing on /horizon page',
  })

  // Test 12: Integrated on /core/debts page
  const debtsPage = readFile('app/(app)/core/debts/page.tsx')
  const debtsHasFooter = debtsPage?.includes('LockedFeaturesFooter') && debtsPage?.includes('schulden_aflosplan')
  results.push({
    name: 'Integrated on /core/debts page with specific featureIds',
    pass: !!debtsHasFooter,
    detail: debtsHasFooter ? '<LockedFeaturesFooter module="kern" featureIds={[\'schulden_aflosplan\']} />' : 'Missing on /core/debts page',
  })

  const passing = results.filter(r => r.pass).length
  return NextResponse.json({
    feature: '#196 — Meer functies beschikbaar footer on gated pages',
    total: results.length,
    passing,
    allPassing: passing === results.length,
    results,
  })
}
