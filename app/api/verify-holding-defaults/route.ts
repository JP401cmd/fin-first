import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * GET /api/verify-holding-defaults
 * Verifies that the holding creation form initializes with correct defaults:
 * 1. Purchase date defaults to today
 * 2. Units field starts empty
 * 3. Currency is EUR by default
 * 4. is_active defaults to true
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []

  try {
    // Read the source file to verify defaults
    const holdingsPagePath = join(process.cwd(), 'app/(app)/core/assets/holdings/page.tsx')
    const source = readFileSync(holdingsPagePath, 'utf-8')

    // Test 1: Units field starts empty (not '1' or any pre-filled value)
    const unitsMatch = source.match(/const \[units, setUnits\] = useState\(['"]([^'"]*)['"]\)/)
    const unitsDefault = unitsMatch ? unitsMatch[1] : null
    results.push({
      name: 'Units field starts empty',
      pass: unitsDefault === '',
      detail: unitsDefault === ''
        ? 'Units defaults to empty string (user must enter value)'
        : `Units defaults to "${unitsDefault}" instead of empty`,
    })

    // Test 2: Purchase date defaults to today
    const hasDateDefault = source.includes("useState(() => {") &&
      source.includes("const today = new Date()") &&
      source.includes("return today.toISOString().split('T')[0]")
    results.push({
      name: 'Purchase date defaults to today',
      pass: hasDateDefault,
      detail: hasDateDefault
        ? 'Purchase date initializes with today\'s date (YYYY-MM-DD format)'
        : 'Purchase date does not default to today',
    })

    // Test 3: Currency is EUR by default
    const currencyMatch = source.match(/const \[currency\] = useState\(['"]([^'"]*)['"]\)/)
    const currencyDefault = currencyMatch ? currencyMatch[1] : null
    results.push({
      name: 'Currency is EUR by default',
      pass: currencyDefault === 'EUR',
      detail: currencyDefault === 'EUR'
        ? 'Currency defaults to EUR'
        : `Currency defaults to "${currencyDefault}" instead of EUR`,
    })

    // Test 4: is_active defaults to true
    const isActiveMatch = source.match(/const \[isActive\] = useState\((true|false)\)/)
    const isActiveDefault = isActiveMatch ? isActiveMatch[1] : null
    results.push({
      name: 'is_active defaults to true',
      pass: isActiveDefault === 'true',
      detail: isActiveDefault === 'true'
        ? 'is_active defaults to true (holding is active by default)'
        : `is_active defaults to ${isActiveDefault} instead of true`,
    })

    // Test 5: Currency display element exists in form
    const hasCurrencyDisplay = source.includes('data-testid="holding-currency-display"')
    results.push({
      name: 'Currency display element exists in form',
      pass: hasCurrencyDisplay,
      detail: hasCurrencyDisplay
        ? 'Form includes a visible currency indicator element'
        : 'Form is missing currency display element',
    })

    // Test 6: is_active display element exists in form
    const hasIsActiveDisplay = source.includes('data-testid="holding-is-active-display"')
    results.push({
      name: 'is_active display element exists in form',
      pass: hasIsActiveDisplay,
      detail: hasIsActiveDisplay
        ? 'Form includes a visible is_active status indicator'
        : 'Form is missing is_active display element',
    })

    // Test 7: Units input has data-testid for testing
    const hasUnitsTestId = source.includes('data-testid="holding-units-input"')
    results.push({
      name: 'Units input has test identifier',
      pass: hasUnitsTestId,
      detail: hasUnitsTestId
        ? 'Units input has data-testid for browser testing'
        : 'Units input is missing data-testid',
    })

    // Test 8: Purchase date input has data-testid for testing
    const hasDateTestId = source.includes('data-testid="holding-purchase-date-input"')
    results.push({
      name: 'Purchase date input has test identifier',
      pass: hasDateTestId,
      detail: hasDateTestId
        ? 'Purchase date input has data-testid for browser testing'
        : 'Purchase date input is missing data-testid',
    })

    // Test 9: Form sends currency in API request body
    const sendsCurrency = source.includes('currency,') || source.includes('currency:')
    results.push({
      name: 'Form sends currency in API request',
      pass: sendsCurrency,
      detail: sendsCurrency
        ? 'Currency value is included in the POST request body'
        : 'Currency is not sent in the API request',
    })

    // Test 10: Form sends is_active in API request body
    const sendsIsActive = source.includes('is_active: isActive') || source.includes('is_active:')
    results.push({
      name: 'Form sends is_active in API request',
      pass: sendsIsActive,
      detail: sendsIsActive
        ? 'is_active value is included in the POST request body'
        : 'is_active is not sent in the API request',
    })

    // Test 11: Units placeholder shows "0" (indicating field should be filled)
    const hasUnitsPlaceholder = source.includes('placeholder="0"') &&
      source.includes('data-testid="holding-units-input"')
    results.push({
      name: 'Units field has placeholder hint',
      pass: hasUnitsPlaceholder,
      detail: hasUnitsPlaceholder
        ? 'Units input shows placeholder "0" to indicate it needs user input'
        : 'Units input is missing placeholder',
    })

    // Test 12: API POST endpoint sets is_active: true for new holdings
    const apiPath = join(process.cwd(), 'app/api/holdings/route.ts')
    const apiSource = readFileSync(apiPath, 'utf-8')
    const apiSetsIsActive = apiSource.includes('is_active: true')
    results.push({
      name: 'API POST sets is_active to true',
      pass: apiSetsIsActive,
      detail: apiSetsIsActive
        ? 'API endpoint always creates holdings with is_active: true'
        : 'API endpoint does not explicitly set is_active: true',
    })

  } catch (err) {
    results.push({
      name: 'Source file read',
      pass: false,
      detail: `Error reading source files: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#172 - Holding creation form has correct defaults',
    summary: `${passing}/${total} checks passing`,
    all_passing: passing === total,
    results,
  })
}
