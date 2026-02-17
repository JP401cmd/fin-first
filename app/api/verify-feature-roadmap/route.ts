import { NextResponse } from 'next/server'
import { FEATURES, PHASES, DEFAULT_MATRIX, levelToPhaseId } from '@/lib/feature-phases'
import * as fs from 'fs'
import * as path from 'path'

/**
 * Verify Feature #197: Feature roadmap view on Identity page
 * Tests that the Chronology Scale section shows per-phase feature unlock information
 */
export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []

  // Read the identity page source
  let identitySource = ''
  try {
    identitySource = fs.readFileSync(
      path.join(process.cwd(), 'app/(app)/identity/page.tsx'),
      'utf-8'
    )
  } catch {
    return NextResponse.json({
      pass: false,
      results: [{ test: 'Read identity page source', pass: false, detail: 'Could not read file' }],
    })
  }

  // Test 1: Identity page imports FEATURES from feature-phases
  const importsFeatures = identitySource.includes('FEATURES') && identitySource.includes('feature-phases')
  results.push({
    test: 'Identity page imports FEATURES from feature-phases',
    pass: importsFeatures,
    detail: importsFeatures ? 'FEATURES imported correctly' : 'Missing FEATURES import',
  })

  // Test 2: Identity page imports DEFAULT_MATRIX from feature-phases
  const importsMatrix = identitySource.includes('DEFAULT_MATRIX')
  results.push({
    test: 'Identity page imports DEFAULT_MATRIX',
    pass: importsMatrix,
    detail: importsMatrix ? 'DEFAULT_MATRIX imported' : 'Missing DEFAULT_MATRIX import',
  })

  // Test 3: Identity page imports PHASES from feature-phases
  const importsPHASES = identitySource.includes('PHASES') && identitySource.includes('feature-phases')
  results.push({
    test: 'Identity page imports PHASES',
    pass: importsPHASES,
    detail: importsPHASES ? 'PHASES imported' : 'Missing PHASES import',
  })

  // Test 4: Feature roadmap data-testid attributes exist
  const hasRoadmapTestIds = identitySource.includes('feature-roadmap-') && identitySource.includes('data-testid')
  results.push({
    test: 'Feature roadmap has data-testid attributes per phase',
    pass: hasRoadmapTestIds,
    detail: hasRoadmapTestIds ? 'data-testid feature-roadmap-{phase} found' : 'Missing roadmap data-testid',
  })

  // Test 5: Feature pills with data-testid per feature
  const hasFeaturePills = identitySource.includes('data-testid={`feature-pill-${feature.id}`}')
  results.push({
    test: 'Feature pills have individual data-testid attributes',
    pass: hasFeaturePills,
    detail: hasFeaturePills ? 'Feature pill testids found' : 'Missing feature pill testids',
  })

  // Test 6: Locked/unlocked visual distinction
  const hasLockedState = identitySource.includes('data-unlocked=')
  results.push({
    test: 'Feature pills show locked vs unlocked state',
    pass: hasLockedState,
    detail: hasLockedState ? 'Locked/unlocked state attribute present' : 'Missing locked/unlocked state',
  })

  // Test 7: Verify feature-to-phase mapping is correct
  // Each feature should map to exactly one unlock phase (the first phase where it's available)
  let allFeaturesHaveUnlockPhase = true
  const featurePhaseMapping: Record<string, string> = {}
  for (const feature of FEATURES) {
    const matrix = DEFAULT_MATRIX[feature.id]
    if (!matrix) {
      allFeaturesHaveUnlockPhase = false
      continue
    }
    let found = false
    for (const phase of PHASES) {
      if (matrix[phase.id]) {
        featurePhaseMapping[feature.id] = phase.id
        found = true
        break
      }
    }
    if (!found) allFeaturesHaveUnlockPhase = false
  }
  results.push({
    test: 'Every feature has a valid unlock phase',
    pass: allFeaturesHaveUnlockPhase,
    detail: allFeaturesHaveUnlockPhase
      ? `All ${FEATURES.length} features mapped to phases`
      : 'Some features missing unlock phase',
  })

  // Test 8: Features per phase distribution
  const featuresPerPhase: Record<string, number> = {}
  for (const phase of PHASES) {
    featuresPerPhase[phase.id] = 0
  }
  for (const [, phaseId] of Object.entries(featurePhaseMapping)) {
    featuresPerPhase[phaseId] = (featuresPerPhase[phaseId] || 0) + 1
  }
  const hasDistribution = Object.values(featuresPerPhase).some(c => c > 0)
  results.push({
    test: 'Features are distributed across phases',
    pass: hasDistribution,
    detail: `Distribution: ${PHASES.map(p => `${p.label}: ${featuresPerPhase[p.id]}`).join(', ')}`,
  })

  // Test 9: Feature icons are defined for all features
  const hasFeatureIcons = identitySource.includes('featureIcons')
  results.push({
    test: 'Feature icon map is defined',
    pass: hasFeatureIcons,
    detail: hasFeatureIcons ? 'featureIcons map found' : 'Missing featureIcons map',
  })

  // Test 10: Expandable feature list exists
  const hasExpandedList = identitySource.includes('feature-list-')
  results.push({
    test: 'Expandable feature list per phase exists',
    pass: hasExpandedList,
    detail: hasExpandedList ? 'Expandable list found (feature-list-{phase})' : 'Missing expandable list',
  })

  // Test 11: Lock icons for locked features
  const hasLockIcons = identitySource.includes('🔒') && identitySource.includes('Vergrendeld')
  results.push({
    test: 'Lock icons shown for locked features',
    pass: hasLockIcons,
    detail: hasLockIcons ? 'Lock icons and "Vergrendeld" text found' : 'Missing lock indicators',
  })

  // Test 12: Unlock indicators for available features
  const hasUnlockIndicators = identitySource.includes('Beschikbaar') && identitySource.includes('Ontgrendeld')
  results.push({
    test: 'Unlock indicators shown for available features',
    pass: hasUnlockIndicators,
    detail: hasUnlockIndicators ? '"Beschikbaar" and "Ontgrendeld" indicators found' : 'Missing unlock indicators',
  })

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    pass: passing === total,
    passing,
    total,
    results,
    featurePhaseMapping,
    featuresPerPhase,
  })
}
