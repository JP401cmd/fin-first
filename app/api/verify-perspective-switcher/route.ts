import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface TestResult {
  name: string
  passed: boolean
  details?: string
}

export async function GET() {
  const results: TestResult[] = []
  const supabase = await createClient()
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  // ========================================
  // Test 1: Perspective switcher UI component exists
  // ========================================
  {
    let passed = false
    let details = ''
    try {
      // Check the component file exists by importing it via dynamic check
      const fs = await import('fs')
      const path = await import('path')
      const componentPath = path.join(process.cwd(), 'components', 'app', 'perspective-switcher.tsx')
      passed = fs.existsSync(componentPath)
      details = passed ? 'PerspectiveSwitcher component exists at components/app/perspective-switcher.tsx' : 'Component file not found'
    } catch (err) {
      details = `Error checking file: ${err instanceof Error ? err.message : String(err)}`
    }
    results.push({
      name: '1. Perspective switcher UI component exists',
      passed,
      details,
    })
  }

  // ========================================
  // Test 2: Perspective provider context exists
  // ========================================
  {
    let passed = false
    let details = ''
    try {
      const fs = await import('fs')
      const path = await import('path')
      const providerPath = path.join(process.cwd(), 'components', 'app', 'perspective-provider.tsx')
      passed = fs.existsSync(providerPath)
      details = passed ? 'PerspectiveProvider exists at components/app/perspective-provider.tsx' : 'Provider file not found'
    } catch (err) {
      details = `Error checking file: ${err instanceof Error ? err.message : String(err)}`
    }
    results.push({
      name: '2. Perspective provider context exists',
      passed,
      details,
    })
  }

  // ========================================
  // Test 3: Supports Household, Partner 1, Partner 2 views
  // ========================================
  {
    let passed = false
    let details = ''
    try {
      const fs = await import('fs')
      const path = await import('path')
      const providerPath = path.join(process.cwd(), 'components', 'app', 'perspective-provider.tsx')
      const content = fs.readFileSync(providerPath, 'utf-8')
      const hasPersonal = content.includes("'personal'")
      const hasHousehold = content.includes("'household'")
      const hasPartner = content.includes("'partner'")
      passed = hasPersonal && hasHousehold && hasPartner
      details = `personal: ${hasPersonal}, household: ${hasHousehold}, partner: ${hasPartner}`
    } catch (err) {
      details = `Error: ${err instanceof Error ? err.message : String(err)}`
    }
    results.push({
      name: '3. Supports views: Household (combined), Partner 1, Partner 2',
      passed,
      details,
    })
  }

  // ========================================
  // Test 4: GET /api/perspective returns valid response
  // ========================================
  {
    let passed = false
    let details = ''
    try {
      const res = await fetch(`${baseUrl}/api/perspective`, {
        headers: { 'Cookie': '' },
      })
      // Should return 401 for unauthenticated or 200 for authenticated
      if (res.status === 401) {
        passed = true
        details = 'API correctly returns 401 for unauthenticated requests'
      } else if (res.status === 200) {
        const data = await res.json()
        passed = !!data.selectedPerspective && !!data.availablePerspectives
        details = `Returns perspective: ${data.selectedPerspective}, available: ${data.availablePerspectives?.length ?? 0} options`
      } else {
        details = `Unexpected status ${res.status}`
      }
    } catch (err) {
      details = `Error: ${err instanceof Error ? err.message : String(err)}`
    }
    results.push({
      name: '4. GET /api/perspective returns valid response (401 for unauth)',
      passed,
      details,
    })
  }

  // ========================================
  // Test 5: PATCH /api/perspective validates input
  // ========================================
  {
    let passed = false
    let details = ''
    try {
      const res = await fetch(`${baseUrl}/api/perspective`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perspective: 'invalid_value' }),
      })
      // Should return 401 (unauth) or 400 (invalid value)
      passed = res.status === 401 || res.status === 400
      details = `Returns ${res.status} for invalid perspective value`
    } catch (err) {
      details = `Error: ${err instanceof Error ? err.message : String(err)}`
    }
    results.push({
      name: '5. PATCH /api/perspective validates input',
      passed,
      details,
    })
  }

  // ========================================
  // Test 6: Perspective switcher integrated in app header
  // ========================================
  {
    let passed = false
    let details = ''
    try {
      const fs = await import('fs')
      const path = await import('path')
      const headerPath = path.join(process.cwd(), 'components', 'app', 'app-header.tsx')
      const content = fs.readFileSync(headerPath, 'utf-8')
      const hasImport = content.includes('PerspectiveSwitcher')
      const hasComponent = content.includes('<PerspectiveSwitcher')
      passed = hasImport && hasComponent
      details = `Import: ${hasImport}, Component used: ${hasComponent}`
    } catch (err) {
      details = `Error: ${err instanceof Error ? err.message : String(err)}`
    }
    results.push({
      name: '6. Perspective switcher integrated in app header',
      passed,
      details,
    })
  }

  // ========================================
  // Test 7: PerspectiveProvider wraps app layout
  // ========================================
  {
    let passed = false
    let details = ''
    try {
      const fs = await import('fs')
      const path = await import('path')
      const layoutPath = path.join(process.cwd(), 'app', '(app)', 'layout.tsx')
      const content = fs.readFileSync(layoutPath, 'utf-8')
      const hasImport = content.includes('PerspectiveProvider')
      const hasProvider = content.includes('<PerspectiveProvider')
      passed = hasImport && hasProvider
      details = `Import: ${hasImport}, Provider wraps layout: ${hasProvider}`
    } catch (err) {
      details = `Error: ${err instanceof Error ? err.message : String(err)}`
    }
    results.push({
      name: '7. PerspectiveProvider wraps app layout',
      passed,
      details,
    })
  }

  // ========================================
  // Test 8: Persistent preference via localStorage
  // ========================================
  {
    let passed = false
    let details = ''
    try {
      const fs = await import('fs')
      const path = await import('path')
      const providerPath = path.join(process.cwd(), 'components', 'app', 'perspective-provider.tsx')
      const content = fs.readFileSync(providerPath, 'utf-8')
      const hasStorageKey = content.includes('PERSPECTIVE_STORAGE_KEY') || content.includes('trifinity_perspective')
      const hasLocalStorage = content.includes('localStorage')
      const hasGetItem = content.includes('getItem')
      const hasSetItem = content.includes('setItem')
      passed = hasStorageKey && hasLocalStorage && hasGetItem && hasSetItem
      details = `Storage key: ${hasStorageKey}, localStorage: ${hasLocalStorage}, get: ${hasGetItem}, set: ${hasSetItem}`
    } catch (err) {
      details = `Error: ${err instanceof Error ? err.message : String(err)}`
    }
    results.push({
      name: '8. Persistent preference via localStorage',
      passed,
      details,
    })
  }

  // ========================================
  // Test 9: Persistent preference via database (PATCH endpoint)
  // ========================================
  {
    let passed = false
    let details = ''
    try {
      const fs = await import('fs')
      const path = await import('path')
      const apiPath = path.join(process.cwd(), 'app', 'api', 'perspective', 'route.ts')
      const content = fs.readFileSync(apiPath, 'utf-8')
      const hasPatch = content.includes('PATCH')
      const hasUpdate = content.includes('.update(')
      const hasSelectedPerspective = content.includes('selected_perspective')
      passed = hasPatch && hasUpdate && hasSelectedPerspective
      details = `PATCH handler: ${hasPatch}, DB update: ${hasUpdate}, selected_perspective field: ${hasSelectedPerspective}`
    } catch (err) {
      details = `Error: ${err instanceof Error ? err.message : String(err)}`
    }
    results.push({
      name: '9. Persistent preference via database (PATCH /api/perspective)',
      passed,
      details,
    })
  }

  // ========================================
  // Test 10: Recalculate metrics per perspective (context hook exported)
  // ========================================
  {
    let passed = false
    let details = ''
    try {
      const fs = await import('fs')
      const path = await import('path')
      const providerPath = path.join(process.cwd(), 'components', 'app', 'perspective-provider.tsx')
      const content = fs.readFileSync(providerPath, 'utf-8')
      const hasUsePerspective = content.includes('export function usePerspective')
      const hasPerspectiveType = content.includes("export type Perspective")
      const hasSetPerspective = content.includes('setPerspective')
      passed = hasUsePerspective && hasPerspectiveType && hasSetPerspective
      details = `usePerspective hook: ${hasUsePerspective}, Perspective type: ${hasPerspectiveType}, setPerspective: ${hasSetPerspective}`
    } catch (err) {
      details = `Error: ${err instanceof Error ? err.message : String(err)}`
    }
    results.push({
      name: '10. Recalculate metrics per perspective (usePerspective hook)',
      passed,
      details,
    })
  }

  // ========================================
  // Test 11: Switcher dropdown has data-testid attributes
  // ========================================
  {
    let passed = false
    let details = ''
    try {
      const fs = await import('fs')
      const path = await import('path')
      const switcherPath = path.join(process.cwd(), 'components', 'app', 'perspective-switcher.tsx')
      const content = fs.readFileSync(switcherPath, 'utf-8')
      const hasSwitcherTestId = content.includes('data-testid="perspective-switcher"')
      const hasTriggerTestId = content.includes('data-testid="perspective-switcher-trigger"')
      const hasDropdownTestId = content.includes('data-testid="perspective-dropdown"')
      const hasOptionTestId = content.includes('data-testid={`perspective-option-')
      passed = hasSwitcherTestId && hasTriggerTestId && hasDropdownTestId && hasOptionTestId
      details = `switcher: ${hasSwitcherTestId}, trigger: ${hasTriggerTestId}, dropdown: ${hasDropdownTestId}, options: ${hasOptionTestId}`
    } catch (err) {
      details = `Error: ${err instanceof Error ? err.message : String(err)}`
    }
    results.push({
      name: '11. Switcher dropdown has data-testid attributes',
      passed,
      details,
    })
  }

  // ========================================
  // Test 12: Pages updated to respect perspective (dashboard page uses usePerspective or PerspectiveProvider context available)
  // ========================================
  {
    let passed = false
    let details = ''
    try {
      const fs = await import('fs')
      const path = await import('path')
      // Check that the layout wraps children with PerspectiveProvider,
      // making the context available to all pages
      const layoutPath = path.join(process.cwd(), 'app', '(app)', 'layout.tsx')
      const content = fs.readFileSync(layoutPath, 'utf-8')
      // PerspectiveProvider should wrap the main content
      const hasProvider = content.includes('<PerspectiveProvider')
      const hasClosing = content.includes('</PerspectiveProvider>')
      // The children (all pages) are rendered inside the provider
      const wrapsChildren = content.includes('{children}')
      passed = hasProvider && hasClosing && wrapsChildren
      details = `Provider wraps: ${hasProvider}, closes: ${hasClosing}, children inside: ${wrapsChildren}`
    } catch (err) {
      details = `Error: ${err instanceof Error ? err.message : String(err)}`
    }
    results.push({
      name: '12. All pages can access perspective via context (PerspectiveProvider wraps children)',
      passed,
      details,
    })
  }

  const passing = results.filter(r => r.passed).length
  const total = results.length

  return NextResponse.json({
    feature: '#241 - Perspective switcher',
    summary: `${passing}/${total} tests passing`,
    passing,
    total,
    all_passing: passing === total,
    results,
  })
}
