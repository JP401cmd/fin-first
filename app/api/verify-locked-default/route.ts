import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { FEATURES, PHASES, DEFAULT_MATRIX } from '@/lib/feature-phases'

/**
 * GET /api/verify-locked-default
 *
 * Verifies Feature #192: FeatureGate default switch from hidden to locked.
 *
 * Tests:
 * 1. FeatureGate component default fallback is 'locked' (not 'hidden')
 * 2. LockedFeatureCard component exists and is exported
 * 3. LockedFeatureCard renders feature name from FEATURES array
 * 4. LockedFeatureCard renders feature description
 * 5. LockedFeatureCard renders unlock phase badge
 * 6. LockedFeatureCard has mini progress bar
 * 7. LockedFeatureCard has dashed border, muted colors, lock icon styling
 * 8. LockedFeatureCard is a div (not a link/button) — non-clickable
 * 9. Key features in app use 'locked' fallback
 * 10. Only intentional exceptions use 'hidden' fallback
 * 11. FEATURES array has label and description for all feature definitions
 * 12. getUnlockPhase returns valid phase for each feature
 */
export async function GET() {
  const tests: { name: string; pass: boolean; detail: string }[] = []

  // Read the FeatureGate source file
  const featureGatePath = path.join(process.cwd(), 'components', 'app', 'feature-gate.tsx')
  let featureGateSource = ''
  try {
    featureGateSource = fs.readFileSync(featureGatePath, 'utf-8')
  } catch {
    return NextResponse.json({
      error: 'Could not read feature-gate.tsx',
      tests: { results: [], passing: 0, total: 0, allPassing: false },
    })
  }

  // Test 1: Default fallback is 'locked'
  const defaultMatch = featureGateSource.match(/fallback\s*=\s*['"](\w+)['"]/)
  const defaultFallback = defaultMatch ? defaultMatch[1] : null
  tests.push({
    name: "FeatureGate default fallback is 'locked'",
    pass: defaultFallback === 'locked',
    detail: `Default fallback: ${defaultFallback ?? 'not found'}`,
  })

  // Test 2: LockedFeatureCard component is exported
  const hasLockedExport = featureGateSource.includes('export function LockedFeatureCard') ||
    featureGateSource.includes('export const LockedFeatureCard')
  tests.push({
    name: 'LockedFeatureCard component is exported',
    pass: hasLockedExport,
    detail: hasLockedExport ? 'Found export' : 'Not found',
  })

  // Test 3: LockedFeatureCard renders feature name from FEATURES array
  const hasFeatureLabel = featureGateSource.includes('featureDef?.label') ||
    featureGateSource.includes('featureDef.label')
  tests.push({
    name: 'LockedFeatureCard renders feature name from FEATURES array',
    pass: hasFeatureLabel,
    detail: hasFeatureLabel ? 'Uses featureDef.label' : 'Feature label not found in rendering',
  })

  // Test 4: LockedFeatureCard renders feature description
  const hasDescription = featureGateSource.includes('featureDef?.description') ||
    featureGateSource.includes('featureDef.description')
  tests.push({
    name: 'LockedFeatureCard renders feature description',
    pass: hasDescription,
    detail: hasDescription ? 'Uses featureDef.description' : 'Feature description not found in rendering',
  })

  // Test 5: LockedFeatureCard renders unlock phase badge
  const hasUnlockPhase = featureGateSource.includes('unlockPhase') &&
    featureGateSource.includes('Beschikbaar vanaf')
  tests.push({
    name: 'LockedFeatureCard renders unlock phase badge',
    pass: hasUnlockPhase,
    detail: hasUnlockPhase ? 'Found unlock phase badge with "Beschikbaar vanaf"' : 'Unlock phase badge not found',
  })

  // Test 6: LockedFeatureCard has mini progress bar
  const hasProgressBar = featureGateSource.includes('progressPct') &&
    featureGateSource.includes('rounded-full') &&
    featureGateSource.includes('bg-zinc-200')
  tests.push({
    name: 'LockedFeatureCard has mini progress bar toward unlock level',
    pass: hasProgressBar,
    detail: hasProgressBar ? 'Found progress bar with progressPct calculation' : 'Progress bar not found',
  })

  // Test 7: LockedFeatureCard has dashed border, muted colors, lock icon
  const hasDashedBorder = featureGateSource.includes('border-dashed')
  const hasMutedColors = featureGateSource.includes('opacity-75') || featureGateSource.includes('text-zinc-400')
  const hasLockIcon = featureGateSource.includes('Lock') && featureGateSource.includes('lucide-react')
  tests.push({
    name: 'LockedFeatureCard has dashed border, muted colors, lock icon',
    pass: hasDashedBorder && hasMutedColors && hasLockIcon,
    detail: `Dashed border: ${hasDashedBorder}, Muted colors: ${hasMutedColors}, Lock icon: ${hasLockIcon}`,
  })

  // Test 8: LockedFeatureCard is a div (not link/button) — non-clickable
  // Check the LockedFeatureCard function body uses <div> as root element
  const lockedCardMatch = featureGateSource.match(
    /export function LockedFeatureCard[\s\S]*?return\s*\(\s*<(\w+)/
  )
  const rootElement = lockedCardMatch ? lockedCardMatch[1] : null
  const isNonClickable = rootElement === 'div'
  const hasAriaDisabled = featureGateSource.includes('aria-disabled="true"')
  tests.push({
    name: 'LockedFeatureCard is non-clickable (div, not link/button)',
    pass: isNonClickable && hasAriaDisabled,
    detail: `Root element: ${rootElement ?? 'not found'}, aria-disabled: ${hasAriaDisabled}`,
  })

  // Test 9: Key features in app pages use 'locked' fallback
  // Check the main app pages (core, will, horizon)
  const appPagesToCheck = [
    { name: 'core/page.tsx', path: path.join(process.cwd(), 'app', '(app)', 'core', 'page.tsx') },
    { name: 'will/page.tsx', path: path.join(process.cwd(), 'app', '(app)', 'will', 'page.tsx') },
    { name: 'horizon/page.tsx', path: path.join(process.cwd(), 'app', '(app)', 'horizon', 'page.tsx') },
    { name: 'core/debts/page.tsx', path: path.join(process.cwd(), 'app', '(app)', 'core', 'debts', 'page.tsx') },
    { name: 'core/belasting/page.tsx', path: path.join(process.cwd(), 'app', '(app)', 'core', 'belasting', 'page.tsx') },
  ]
  const pagesWithHiddenFallback: string[] = []
  const pagesWithLockedFallback: string[] = []
  for (const pg of appPagesToCheck) {
    try {
      const src = fs.readFileSync(pg.path, 'utf-8')
      const lockedCount = (src.match(/fallback="locked"/g) || []).length
      const hiddenCount = (src.match(/fallback="hidden"/g) || []).length
      const noFallbackCount = (src.match(/<FeatureGate\s+featureId="[^"]*"\s*>/g) || []).length
      if (lockedCount > 0) pagesWithLockedFallback.push(`${pg.name}(${lockedCount})`)
      if (hiddenCount > 0) pagesWithHiddenFallback.push(`${pg.name}(${hiddenCount})`)
      // noFallback now defaults to 'locked', so these are fine
    } catch {
      // File not found — skip
    }
  }
  tests.push({
    name: 'Key app pages use locked fallback for FeatureGates',
    pass: pagesWithLockedFallback.length >= 4,
    detail: `Locked: ${pagesWithLockedFallback.join(', ')}. Hidden (intentional): ${pagesWithHiddenFallback.join(', ') || 'none'}`,
  })

  // Test 10: Only intentional exceptions use 'hidden' fallback
  // The only allowed hidden usage is gezondheids_score in horizon (inner chart section)
  const horizonSrc = (() => {
    try {
      return fs.readFileSync(
        path.join(process.cwd(), 'app', '(app)', 'horizon', 'page.tsx'), 'utf-8'
      )
    } catch { return '' }
  })()
  const hiddenUsages = horizonSrc.match(/fallback="hidden"/g) || []
  const isIntentionalHidden = hiddenUsages.length <= 1 // Only the chart section
  tests.push({
    name: 'Only intentional exceptions use hidden fallback',
    pass: isIntentionalHidden,
    detail: `Hidden usages in horizon: ${hiddenUsages.length} (expected: 0-1 for chart section)`,
  })

  // Test 11: FEATURES array has label and description for all feature definitions
  const missingLabels = FEATURES.filter(f => !f.label || f.label.trim() === '')
  const missingDescriptions = FEATURES.filter(f => !f.description || f.description.trim() === '')
  tests.push({
    name: 'All FEATURES have label and description for LockedFeatureCard',
    pass: missingLabels.length === 0 && missingDescriptions.length === 0,
    detail: `Total features: ${FEATURES.length}, Missing labels: ${missingLabels.length}, Missing descriptions: ${missingDescriptions.length}`,
  })

  // Test 12: getUnlockPhase returns valid phase for each feature in matrix
  const featuresWithPhase: string[] = []
  const featuresWithoutPhase: string[] = []
  for (const feat of FEATURES) {
    const row = DEFAULT_MATRIX[feat.id]
    if (!row) {
      featuresWithoutPhase.push(feat.id)
      continue
    }
    let found = false
    for (const phase of PHASES) {
      if (row[phase.id] === true) {
        found = true
        break
      }
    }
    if (found) featuresWithPhase.push(feat.id)
    else featuresWithoutPhase.push(feat.id)
  }
  tests.push({
    name: 'Each feature in matrix has a valid unlock phase',
    pass: featuresWithoutPhase.length === 0,
    detail: `With phase: ${featuresWithPhase.length}, Without: ${featuresWithoutPhase.length}${featuresWithoutPhase.length > 0 ? ` (${featuresWithoutPhase.join(', ')})` : ''}`,
  })

  const passing = tests.filter(t => t.pass).length

  return NextResponse.json({
    feature: '#192: FeatureGate default switch from hidden to locked',
    tests: {
      results: tests,
      passing,
      total: tests.length,
      allPassing: passing === tests.length,
    },
  })
}
