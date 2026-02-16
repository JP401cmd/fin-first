import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

/**
 * Verification endpoint for Feature #134:
 * "New feature spotlight shows only once per feature"
 *
 * Tests that NewFeatureSpotlight uses localStorage (not sessionStorage)
 * to persist "seen" markers, ensuring the spotlight only shows once ever.
 */
export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []

  // Read the FeatureGate source to verify implementation
  const featureGatePath = path.join(process.cwd(), 'components', 'app', 'feature-gate.tsx')
  let source = ''
  try {
    source = fs.readFileSync(featureGatePath, 'utf-8')
  } catch (err) {
    return NextResponse.json({
      pass: false,
      results: [{ test: 'File read', pass: false, detail: 'Could not read feature-gate.tsx' }],
    })
  }

  // Extract the NewFeatureSpotlight function
  const spotlightMatch = source.match(/export function NewFeatureSpotlight[\s\S]*?^}/m)
  const spotlightCode = spotlightMatch ? spotlightMatch[0] : ''

  // Test 1: Component exists
  results.push({
    test: 'NewFeatureSpotlight component exists',
    pass: source.includes('export function NewFeatureSpotlight'),
    detail: source.includes('export function NewFeatureSpotlight')
      ? 'NewFeatureSpotlight component is exported'
      : 'Component not found in feature-gate.tsx',
  })

  // Test 2: Uses localStorage.getItem to check seen state
  const usesLocalStorageGet = spotlightCode.includes('localStorage.getItem')
  results.push({
    test: 'Uses localStorage.getItem to check seen state',
    pass: usesLocalStorageGet,
    detail: usesLocalStorageGet
      ? 'localStorage.getItem found in NewFeatureSpotlight'
      : 'localStorage.getItem NOT found — spotlight may not persist across sessions',
  })

  // Test 3: Uses localStorage.setItem to mark as seen
  const usesLocalStorageSet = spotlightCode.includes('localStorage.setItem')
  results.push({
    test: 'Uses localStorage.setItem to mark as seen',
    pass: usesLocalStorageSet,
    detail: usesLocalStorageSet
      ? 'localStorage.setItem found in NewFeatureSpotlight'
      : 'localStorage.setItem NOT found — seen marker may not persist',
  })

  // Test 4: Does NOT use sessionStorage (regression check)
  const usesSessionStorage = spotlightCode.includes('sessionStorage')
  results.push({
    test: 'Does NOT use sessionStorage (regression check)',
    pass: !usesSessionStorage,
    detail: !usesSessionStorage
      ? 'No sessionStorage references — spotlight correctly uses persistent storage'
      : 'sessionStorage still referenced — spotlight will reset on browser close',
  })

  // Test 5: Key format includes featureId for per-feature tracking
  const keyPattern = /spotlight_seen_\$\{featureId\}/
  const hasKeyPattern = keyPattern.test(spotlightCode)
  results.push({
    test: 'Key format includes featureId for per-feature tracking',
    pass: hasKeyPattern,
    detail: hasKeyPattern
      ? 'Key pattern spotlight_seen_${featureId} found'
      : 'Expected key pattern not found — features may share spotlight state',
  })

  // Test 6: Spotlight auto-dismisses (setTimeout present)
  const hasTimeout = spotlightCode.includes('setTimeout')
  results.push({
    test: 'Spotlight auto-dismisses after timeout',
    pass: hasTimeout,
    detail: hasTimeout
      ? 'setTimeout found — spotlight will auto-dismiss'
      : 'No setTimeout — spotlight may persist indefinitely',
  })

  // Test 7: Initial state is false (avoids flash before useEffect check)
  const initialStateFalse = spotlightCode.includes('useState(false)')
  results.push({
    test: 'Initial state is false (no flash before localStorage check)',
    pass: initialStateFalse,
    detail: initialStateFalse
      ? 'useState(false) — spotlight hidden until localStorage check passes'
      : 'Initial state is not false — may flash spotlight before check',
  })

  // Test 8: Marks seen BEFORE timeout (immediately on first show)
  // Check that localStorage.setItem appears before setTimeout in the code
  const setItemIndex = spotlightCode.indexOf('localStorage.setItem')
  const setTimeoutIndex = spotlightCode.indexOf('setTimeout')
  const marksSeenBeforeTimeout = setItemIndex > -1 && setTimeoutIndex > -1 && setItemIndex < setTimeoutIndex
  results.push({
    test: 'Marks seen immediately (before timeout, not after)',
    pass: marksSeenBeforeTimeout,
    detail: marksSeenBeforeTimeout
      ? 'localStorage.setItem called before setTimeout — seen marker set immediately'
      : 'localStorage.setItem should be called before setTimeout for immediate persistence',
  })

  const allPass = results.every(r => r.pass)

  return NextResponse.json({
    pass: allPass,
    passing: results.filter(r => r.pass).length,
    total: results.length,
    results,
  })
}
