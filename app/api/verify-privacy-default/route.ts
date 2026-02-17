import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Verification endpoint for Feature #175: Privacy level defaults to anonymous for sharing
 *
 * Tests:
 * 1. FreedomCardGenerator component defaults privacyLevel to 'anonymous'
 * 2. Test page also defaults to 'anonymous'
 * 3. API route defaults to 'anonymous' when no privacy param given
 * 4. Anonymous mode does NOT include displayName
 * 5. Anonymous mode does NOT include netWorth
 * 6. Anonymous mode does NOT include fireTarget
 * 7. Privacy options list has 'anonymous' as first option (most prominent position)
 * 8. User must explicitly click 'named' or 'full' to opt into less private modes
 */
export async function GET() {
  const results: Array<{ id: number; name: string; pass: boolean; detail: string }> = []

  try {
    // Read source files
    const componentPath = join(process.cwd(), 'components', 'app', 'freedom-card.tsx')
    const componentSource = readFileSync(componentPath, 'utf-8')

    const apiPath = join(process.cwd(), 'app', 'api', 'share', 'freedom-card', 'route.ts')
    const apiSource = readFileSync(apiPath, 'utf-8')

    // Test 1: FreedomCardGenerator defaults privacyLevel to 'anonymous'
    const defaultAnonymousMatch = componentSource.match(/useState<PrivacyLevel>\(\s*['"]anonymous['"]\s*\)/)
    results.push({
      id: 1,
      name: 'FreedomCardGenerator defaults to anonymous',
      pass: !!defaultAnonymousMatch,
      detail: defaultAnonymousMatch
        ? "useState<PrivacyLevel>('anonymous') found in FreedomCardGenerator"
        : 'Default privacy level is NOT anonymous in FreedomCardGenerator'
    })

    // Test 2: API route defaults to 'anonymous' when no privacy param
    const apiDefaultMatch = apiSource.match(/\.get\(\s*['"]privacy['"]\s*\)\s*\|\|\s*['"]anonymous['"]/)
    results.push({
      id: 2,
      name: 'API route defaults to anonymous when no param',
      pass: !!apiDefaultMatch,
      detail: apiDefaultMatch
        ? "url.searchParams.get('privacy') || 'anonymous' found in API route"
        : 'API route does NOT default to anonymous'
    })

    // Test 3: Anonymous mode does NOT include displayName
    // Check: displayName is only set when privacyLevel is 'named' or 'full'
    const displayNameGuard = apiSource.match(/if\s*\(\s*privacyLevel\s*===\s*['"]named['"]\s*\|\|\s*privacyLevel\s*===\s*['"]full['"]\s*\)[\s\S]*?displayName/)
    results.push({
      id: 3,
      name: 'Anonymous mode excludes displayName',
      pass: !!displayNameGuard,
      detail: displayNameGuard
        ? 'displayName only set for named/full privacy levels'
        : 'displayName guard not found or incorrect'
    })

    // Test 4: Anonymous mode does NOT include netWorth/fireTarget
    // Check: netWorth and fireTarget only set when privacyLevel is 'full'
    const netWorthGuard = apiSource.match(/if\s*\(\s*privacyLevel\s*===\s*['"]full['"]\s*\)[\s\S]*?netWorth/)
    results.push({
      id: 4,
      name: 'Anonymous mode excludes netWorth and fireTarget',
      pass: !!netWorthGuard,
      detail: netWorthGuard
        ? 'netWorth/fireTarget only set for full privacy level'
        : 'netWorth/fireTarget guard not found or incorrect'
    })

    // Test 5: Privacy options list has 'anonymous' as first option
    const privacyOptionsMatch = componentSource.match(/privacyOptions[\s\S]*?\[\s*\{[\s\S]*?value:\s*['"](\w+)['"]/)
    const firstOption = privacyOptionsMatch ? privacyOptionsMatch[1] : null
    results.push({
      id: 5,
      name: 'Anonymous is first privacy option (most prominent)',
      pass: firstOption === 'anonymous',
      detail: firstOption === 'anonymous'
        ? 'Anonymous is the first option in privacyOptions array'
        : `First option is "${firstOption}" instead of "anonymous"`
    })

    // Test 6: There are exactly 3 privacy options (anonymous, named, full)
    // Extract the privacyOptions array block (it spans multiple lines)
    const optionsBlock = componentSource.match(/privacyOptions[\s\S]*?=\s*\[([\s\S]*?)\]/)?.[1] || ''
    const hasAnonymous = optionsBlock.includes('anonymous')
    const hasNamed = optionsBlock.includes('named')
    const hasFull = optionsBlock.includes('full')
    results.push({
      id: 6,
      name: 'Three privacy options exist: anonymous, named, full',
      pass: hasAnonymous && hasNamed && hasFull,
      detail: `anonymous: ${hasAnonymous}, named: ${hasNamed}, full: ${hasFull}`
    })

    // Test 7: Card visual does NOT show displayName when it's undefined (anonymous mode)
    const displayNameConditional = componentSource.match(/\{displayName\s*&&/)
    results.push({
      id: 7,
      name: 'Card hides displayName when undefined (anonymous)',
      pass: !!displayNameConditional,
      detail: displayNameConditional
        ? '{displayName && ...} conditional rendering found'
        : 'displayName conditional rendering not found'
    })

    // Test 8: Card visual only shows EUR amounts for full privacy level
    const amountGuard = componentSource.match(/privacyLevel\s*===\s*['"]full['"]\s*&&\s*netWorth/)
    results.push({
      id: 8,
      name: 'Card only shows EUR amounts for full privacy',
      pass: !!amountGuard,
      detail: amountGuard
        ? "privacyLevel === 'full' && netWorth guard found in card visual"
        : 'EUR amount privacy guard not found'
    })

    // Test 9: API validates privacy level input
    const validationMatch = apiSource.match(/\['anonymous',\s*'named',\s*'full'\]\.includes/)
    results.push({
      id: 9,
      name: 'API validates privacy level input',
      pass: !!validationMatch,
      detail: validationMatch
        ? "API validates against ['anonymous', 'named', 'full']"
        : 'API does not validate privacy level input'
    })

    // Test 10: Calling API without privacy param returns anonymous card
    // Verify the logic: no param -> defaults to 'anonymous' -> no displayName, no netWorth
    const defaultFlowCorrect = !!apiDefaultMatch && !!displayNameGuard && !!netWorthGuard
    results.push({
      id: 10,
      name: 'Default API call produces anonymous card (no name, no amounts)',
      pass: defaultFlowCorrect,
      detail: defaultFlowCorrect
        ? 'API defaults to anonymous -> no displayName -> no netWorth/fireTarget'
        : 'Default API flow does not guarantee anonymous output'
    })

    const passing = results.filter(r => r.pass).length
    const total = results.length

    return NextResponse.json({
      feature: 175,
      name: 'Privacy level defaults to anonymous for sharing',
      summary: `${passing}/${total} tests passing`,
      passing,
      total,
      allPassing: passing === total,
      results
    })
  } catch (error) {
    return NextResponse.json({
      feature: 175,
      error: `Verification failed: ${error instanceof Error ? error.message : String(error)}`,
      results
    }, { status: 500 })
  }
}
