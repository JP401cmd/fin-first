import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

/**
 * Verification endpoint for Feature #194:
 * "New feature spotlight after phase transition"
 *
 * Tests that NewFeatureSpotlight:
 * 1. Tracks phase transitions and newly unlocked features
 * 2. Shows pulse/glow animation on newly available sections
 * 3. Shows tooltip 'Nieuw! [Feature name] is nu beschikbaar'
 * 4. Stores seen state in localStorage per feature
 * 5. Only shows once per feature per user
 * 6. Animation is subtle and non-blocking
 */
export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []

  // Read source files
  const featureGatePath = path.join(process.cwd(), 'components', 'app', 'feature-gate.tsx')
  const providerPath = path.join(process.cwd(), 'components', 'app', 'feature-access-provider.tsx')
  const layoutPath = path.join(process.cwd(), 'app', '(app)', 'layout.tsx')
  const globalsCssPath = path.join(process.cwd(), 'app', 'globals.css')

  let featureGateSource = ''
  let providerSource = ''
  let layoutSource = ''
  let globalsCss = ''

  try {
    featureGateSource = fs.readFileSync(featureGatePath, 'utf-8')
    providerSource = fs.readFileSync(providerPath, 'utf-8')
    layoutSource = fs.readFileSync(layoutPath, 'utf-8')
    globalsCss = fs.readFileSync(globalsCssPath, 'utf-8')
  } catch (err) {
    return NextResponse.json({
      pass: false,
      results: [{ test: 'File read', pass: false, detail: `Could not read source files: ${err}` }],
    })
  }

  // Extract the NewFeatureSpotlight function code
  const spotlightMatch = featureGateSource.match(/export function NewFeatureSpotlight[\s\S]*?^}/m)
  const spotlightCode = spotlightMatch ? spotlightMatch[0] : ''

  // ── Test 1: Phase transitions tracked in layout ──
  const hasPhaseTransitionDetection = layoutSource.includes('lastKnownPhase') && layoutSource.includes('phaseTransition')
  results.push({
    test: 'Phase transitions detected in app layout',
    pass: hasPhaseTransitionDetection,
    detail: hasPhaseTransitionDetection
      ? 'Layout compares last_known_phase with current phase for transition detection'
      : 'Phase transition detection not found in layout',
  })

  // ── Test 2: Newly unlocked features computed in provider ──
  const hasNewlyUnlocked = providerSource.includes('newlyUnlockedFeatures')
  results.push({
    test: 'Provider computes newly unlocked features on phase transition',
    pass: hasNewlyUnlocked,
    detail: hasNewlyUnlocked
      ? 'FeatureAccessProvider computes newlyUnlockedFeatures from matrix comparison'
      : 'newlyUnlockedFeatures not found in provider',
  })

  // ── Test 3: NewFeatureSpotlight wraps newly unlocked features ──
  const hasSpotlightWrapping = featureGateSource.includes('isNewlyUnlocked') && featureGateSource.includes('<NewFeatureSpotlight')
  results.push({
    test: 'FeatureGate wraps newly unlocked features in NewFeatureSpotlight',
    pass: hasSpotlightWrapping,
    detail: hasSpotlightWrapping
      ? 'Newly unlocked features are wrapped in NewFeatureSpotlight for pulse/glow animation'
      : 'NewFeatureSpotlight wrapping not found in FeatureGate',
  })

  // ── Test 4: Pulse/glow animation present ──
  const hasPulseAnimation = spotlightCode.includes('animate-pulse') && spotlightCode.includes('blur-sm')
  results.push({
    test: 'Pulse/glow animation on newly available sections',
    pass: hasPulseAnimation,
    detail: hasPulseAnimation
      ? 'animate-pulse + blur-sm gradient provides subtle glow effect'
      : 'Pulse/glow animation not found',
  })

  // ── Test 5: Tooltip shows "Nieuw! [Feature name] is nu beschikbaar" ──
  const hasTooltipText = spotlightCode.includes('is nu beschikbaar') && spotlightCode.includes('Nieuw!')
  results.push({
    test: 'Tooltip shows "Nieuw! [Feature name] is nu beschikbaar"',
    pass: hasTooltipText,
    detail: hasTooltipText
      ? 'Tooltip with "Nieuw! {featureLabel} is nu beschikbaar" found'
      : 'Expected tooltip text not found in NewFeatureSpotlight',
  })

  // ── Test 6: Tooltip uses feature label (not just ID) ──
  const usesFeatureLabel = spotlightCode.includes('FEATURES.find') && spotlightCode.includes('featureLabel')
  results.push({
    test: 'Tooltip displays human-readable feature name (not raw ID)',
    pass: usesFeatureLabel,
    detail: usesFeatureLabel
      ? 'FEATURES.find(f => f.id === featureId) used to look up feature label'
      : 'Feature label lookup not found — tooltip may show raw ID',
  })

  // ── Test 7: Tooltip has data-testid for testing ──
  const hasTooltipTestId = spotlightCode.includes('data-testid={`spotlight-tooltip-')
  results.push({
    test: 'Tooltip has data-testid attribute for testing',
    pass: hasTooltipTestId,
    detail: hasTooltipTestId
      ? 'spotlight-tooltip-{featureId} test ID found'
      : 'Missing tooltip data-testid',
  })

  // ── Test 8: localStorage stores seen state per feature ──
  const hasLocalStorageKey = spotlightCode.includes('spotlight_seen_${featureId}')
  const hasLocalStorageGet = spotlightCode.includes('localStorage.getItem')
  const hasLocalStorageSet = spotlightCode.includes('localStorage.setItem')
  const hasLSPersistence = hasLocalStorageKey && hasLocalStorageGet && hasLocalStorageSet
  results.push({
    test: 'Seen state stored in localStorage per feature',
    pass: hasLSPersistence,
    detail: hasLSPersistence
      ? 'localStorage with spotlight_seen_${featureId} key for per-feature tracking'
      : 'localStorage persistence pattern not fully implemented',
  })

  // ── Test 9: Shows only once per feature (check before show logic) ──
  const getItemIndex = spotlightCode.indexOf('localStorage.getItem')
  const setShowIndex = spotlightCode.indexOf('setShowSpotlight(true)')
  const checksBeforeShow = getItemIndex > -1 && setShowIndex > -1 && getItemIndex < setShowIndex
  results.push({
    test: 'Checks localStorage before showing (only once per feature)',
    pass: checksBeforeShow,
    detail: checksBeforeShow
      ? 'localStorage.getItem checked before setShowSpotlight(true) — ensures one-time display'
      : 'Show-once guard may be missing or out of order',
  })

  // ── Test 10: Animation is non-blocking (pointer-events-none) ──
  const hasPointerEventsNone = spotlightCode.includes('pointer-events-none')
  results.push({
    test: 'Animation is subtle and non-blocking (pointer-events-none)',
    pass: hasPointerEventsNone,
    detail: hasPointerEventsNone
      ? 'pointer-events-none on glow ring and tooltip — user interaction not blocked'
      : 'pointer-events-none not found — animation may block clicks',
  })

  // ── Test 11: Auto-dismiss after timeout ──
  const hasAutoDismiss = spotlightCode.includes('setTimeout') && spotlightCode.includes('setShowSpotlight(false)')
  results.push({
    test: 'Spotlight auto-dismisses after timeout',
    pass: hasAutoDismiss,
    detail: hasAutoDismiss
      ? 'setTimeout triggers setShowSpotlight(false) for auto-dismiss'
      : 'Auto-dismiss not found',
  })

  // ── Test 12: Tooltip fade-in animation in CSS ──
  const hasFadeInAnimation = globalsCss.includes('spotlight-fade-in') && globalsCss.includes('animate-fade-in')
  results.push({
    test: 'Tooltip fade-in CSS animation defined',
    pass: hasFadeInAnimation,
    detail: hasFadeInAnimation
      ? 'spotlight-fade-in keyframes and .animate-fade-in class defined in globals.css'
      : 'Fade-in animation not found in globals.css',
  })

  const allPass = results.every(r => r.pass)

  return NextResponse.json({
    pass: allPass,
    passing: results.filter(r => r.pass).length,
    total: results.length,
    results,
  })
}
