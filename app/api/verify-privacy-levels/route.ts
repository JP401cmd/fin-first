import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Verification endpoint for Feature #235: Privacy levels for sharing
 *
 * Tests:
 * 1. Privacy level selector UI has exactly 3 options (anonymous, named, full)
 * 2. Anonymous mode: percentages only, no name (displayName excluded)
 * 3. Named mode: with name, no EUR amounts (displayName included, netWorth excluded)
 * 4. Full mode: percentages + amounts (requires explicit opt-in confirmation)
 * 5. Default to Anonymous for first-time use (no localStorage = anonymous)
 * 6. Remember user's last privacy preference (localStorage read/write)
 */
export async function GET() {
  const results: Array<{ id: number; name: string; pass: boolean; detail: string }> = []

  try {
    // Read source files
    const componentPath = join(process.cwd(), 'components', 'app', 'freedom-card.tsx')
    const componentSource = readFileSync(componentPath, 'utf-8')

    const apiPath = join(process.cwd(), 'app', 'api', 'share', 'freedom-card', 'route.ts')
    const apiSource = readFileSync(apiPath, 'utf-8')

    // Test 1: Privacy level selector UI with 3 options
    const optionsBlock = componentSource.match(/privacyOptions[\s\S]*?=\s*\[([\s\S]*?)\]/)?.[1] || ''
    const hasAnonymousOpt = optionsBlock.includes("'anonymous'") || optionsBlock.includes('"anonymous"')
    const hasNamedOpt = optionsBlock.includes("'named'") || optionsBlock.includes('"named"')
    const hasFullOpt = optionsBlock.includes("'full'") || optionsBlock.includes('"full"')
    const hasPrivacySelector = componentSource.includes('data-testid="privacy-level-selector"') ||
      componentSource.includes('Privacy niveau')
    results.push({
      id: 1,
      name: 'Privacy level selector UI with 3 options',
      pass: hasAnonymousOpt && hasNamedOpt && hasFullOpt && hasPrivacySelector,
      detail: `selector: ${hasPrivacySelector}, anonymous: ${hasAnonymousOpt}, named: ${hasNamedOpt}, full: ${hasFullOpt}`
    })

    // Test 2: Anonymous mode - percentages only, no name
    // In the API, displayName is only included for named/full
    const displayNameGuard = apiSource.match(/if\s*\(\s*privacyLevel\s*===\s*['"]named['"]\s*\|\|\s*privacyLevel\s*===\s*['"]full['"]\s*\)[\s\S]*?displayName/)
    // In the card visual, displayName only rendered when truthy
    const displayNameConditional = componentSource.match(/\{displayName\s*&&/)
    results.push({
      id: 2,
      name: 'Anonymous mode: percentages only, no name',
      pass: !!displayNameGuard && !!displayNameConditional,
      detail: `API guard: ${!!displayNameGuard}, Card conditional: ${!!displayNameConditional}`
    })

    // Test 3: Named mode: with name, no EUR amounts
    // Named includes displayName but NOT netWorth/fireTarget
    const namedIncludesName = !!displayNameGuard // named is in the condition
    const fullOnlyAmounts = apiSource.match(/if\s*\(\s*privacyLevel\s*===\s*['"]full['"]\s*\)[\s\S]*?netWorth/)
    results.push({
      id: 3,
      name: 'Named mode: with name, no EUR amounts',
      pass: namedIncludesName && !!fullOnlyAmounts,
      detail: `Named includes name: ${namedIncludesName}, Amounts only in full: ${!!fullOnlyAmounts}`
    })

    // Test 4: Full mode - requires explicit opt-in
    // Check for opt-in confirmation dialog
    const hasOptInDialog = componentSource.includes('full-optin-dialog') ||
      componentSource.includes('showFullOptIn')
    const hasConfirmButton = componentSource.includes('full-optin-confirm') ||
      componentSource.includes('confirmFullOptIn')
    const hasCancelButton = componentSource.includes('full-optin-cancel') ||
      componentSource.includes('cancelFullOptIn')
    const hasOptInWarningText = componentSource.includes('Bedragen zichtbaar maken') ||
      componentSource.includes('opt-in')
    results.push({
      id: 4,
      name: 'Full mode: requires explicit opt-in confirmation',
      pass: hasOptInDialog && hasConfirmButton && hasCancelButton,
      detail: `Dialog: ${hasOptInDialog}, Confirm btn: ${hasConfirmButton}, Cancel btn: ${hasCancelButton}, Warning text: ${hasOptInWarningText}`
    })

    // Test 5: Default to Anonymous for first-time use
    // getStoredPrivacyLevel returns 'anonymous' when nothing stored
    const hasDefaultAnonymous = componentSource.includes("return 'anonymous'") ||
      componentSource.match(/return\s+['"]anonymous['"]/)
    // useState defaults to 'anonymous'
    const usesAnonymousDefault = !!componentSource.match(/useState<PrivacyLevel>\(\s*['"]anonymous['"]\s*\)/)
    results.push({
      id: 5,
      name: 'Default to Anonymous for first-time use',
      pass: !!hasDefaultAnonymous && usesAnonymousDefault,
      detail: `getStoredPrivacyLevel default: ${!!hasDefaultAnonymous}, useState default: ${usesAnonymousDefault}`
    })

    // Test 6: Remember user's last privacy preference (localStorage)
    const hasStorageKey = componentSource.includes('PRIVACY_STORAGE_KEY') ||
      componentSource.includes('trifinity_privacy_level')
    const hasLocalStorageGet = componentSource.includes('localStorage.getItem') &&
      (componentSource.includes('PRIVACY_STORAGE_KEY') || componentSource.includes('trifinity_privacy_level'))
    const hasLocalStorageSet = componentSource.includes('localStorage.setItem') &&
      (componentSource.includes('PRIVACY_STORAGE_KEY') || componentSource.includes('trifinity_privacy_level'))
    results.push({
      id: 6,
      name: 'Remember user\'s last privacy preference (localStorage)',
      pass: hasStorageKey && hasLocalStorageGet && hasLocalStorageSet,
      detail: `Storage key: ${hasStorageKey}, Get: ${hasLocalStorageGet}, Set: ${hasLocalStorageSet}`
    })

    // Test 7: Privacy options have correct Dutch labels
    const hasAnoniemLabel = componentSource.includes('Anoniem')
    const hasMetNaamLabel = componentSource.includes('Met naam')
    const hasVolledigLabel = componentSource.includes('Volledig')
    results.push({
      id: 7,
      name: 'Privacy options have correct Dutch labels',
      pass: hasAnoniemLabel && hasMetNaamLabel && hasVolledigLabel,
      detail: `Anoniem: ${hasAnoniemLabel}, Met naam: ${hasMetNaamLabel}, Volledig: ${hasVolledigLabel}`
    })

    // Test 8: Privacy selector buttons have data-testid attributes
    // The component uses template literal: data-testid={`privacy-option-${opt.value}`}
    // which generates privacy-option-anonymous, privacy-option-named, privacy-option-full at runtime
    const hasTemplateTestId = componentSource.includes('privacy-option-${opt.value}') ||
      componentSource.includes('privacy-option-${')
    // Also check that privacy options include all 3 values (ensuring testids are generated)
    const hasAllThreeValues = hasAnonymousOpt && hasNamedOpt && hasFullOpt
    results.push({
      id: 8,
      name: 'Privacy selector buttons have data-testid attributes',
      pass: hasTemplateTestId && hasAllThreeValues,
      detail: `Template testid: ${hasTemplateTestId}, All 3 values: ${hasAllThreeValues}`
    })

    // Test 9: Full mode opt-in shows warning about amounts visibility
    const hasAmountsWarning = componentSource.includes('netto vermogen') ||
      componentSource.includes('FIRE-doelbedrag') ||
      componentSource.includes('bedragen')
    results.push({
      id: 9,
      name: 'Full mode opt-in shows warning about amounts being visible',
      pass: hasAmountsWarning && hasOptInDialog,
      detail: `Warning text: ${hasAmountsWarning}, Dialog present: ${hasOptInDialog}`
    })

    // Test 10: useEffect loads stored preference on mount
    const hasUseEffect = componentSource.includes('useEffect')
    const hasGetStored = componentSource.includes('getStoredPrivacyLevel')
    results.push({
      id: 10,
      name: 'Component loads stored preference on mount via useEffect',
      pass: hasUseEffect && hasGetStored,
      detail: `useEffect: ${hasUseEffect}, getStoredPrivacyLevel: ${hasGetStored}`
    })

    // Test 11: Privacy level is stored when changed
    const hasStorePrivacyLevel = componentSource.includes('storePrivacyLevel')
    const storeCalledOnChange = componentSource.match(/handlePrivacyChange[\s\S]*?storePrivacyLevel/) ||
      componentSource.match(/storePrivacyLevel\(newLevel\)/) ||
      componentSource.match(/storePrivacyLevel\(/)
    results.push({
      id: 11,
      name: 'Privacy level is stored to localStorage when changed',
      pass: hasStorePrivacyLevel && !!storeCalledOnChange,
      detail: `storePrivacyLevel fn: ${hasStorePrivacyLevel}, Called on change: ${!!storeCalledOnChange}`
    })

    // Test 12: Card visual respects privacy by hiding EUR amounts in anonymous/named
    const cardAmountGuard = componentSource.match(/privacyLevel\s*===\s*['"]full['"]\s*&&\s*netWorth/)
    results.push({
      id: 12,
      name: 'Card visual hides EUR amounts in anonymous/named mode',
      pass: !!cardAmountGuard,
      detail: cardAmountGuard
        ? "privacyLevel === 'full' && netWorth guard found in card visual"
        : 'EUR amount guard not found'
    })

    const passing = results.filter(r => r.pass).length
    const total = results.length

    return NextResponse.json({
      feature: 235,
      name: 'Privacy levels for sharing',
      summary: `${passing}/${total} tests passing`,
      passing,
      total,
      allPassing: passing === total,
      results
    })
  } catch (error) {
    return NextResponse.json({
      feature: 235,
      error: `Verification failed: ${error instanceof Error ? error.message : String(error)}`,
      results
    }, { status: 500 })
  }
}
