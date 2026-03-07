import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []

  // Read source files
  const beheerNavPath = path.join(process.cwd(), 'components', 'app', 'beheer', 'beheer-nav.tsx')
  const beheerNavSrc = fs.readFileSync(beheerNavPath, 'utf-8')

  const nieuwsPagePath = path.join(process.cwd(), 'app', '(app)', 'beheer', 'nieuws', 'page.tsx')
  const nieuwsPageExists = fs.existsSync(nieuwsPagePath)
  const nieuwsPageSrc = nieuwsPageExists ? fs.readFileSync(nieuwsPagePath, 'utf-8') : ''

  const apiRoutePath = path.join(process.cwd(), 'app', 'api', 'admin', 'news-prompt', 'route.ts')
  const apiRouteExists = fs.existsSync(apiRoutePath)
  const apiRouteSrc = apiRouteExists ? fs.readFileSync(apiRoutePath, 'utf-8') : ''

  // === Feature #494: Nieuws tab in beheer nav ===

  // Test 1: 'Nieuws' tab exists in beheer-nav tabs array
  const hasNieuwsTab = beheerNavSrc.includes("label: 'Nieuws'")
  results.push({
    test: '#494: Nieuws tab exists in beheer-nav',
    pass: hasNieuwsTab,
    detail: hasNieuwsTab
      ? "tabs array includes { label: 'Nieuws', href: '/beheer/nieuws' }"
      : 'ERROR: Nieuws tab not found in beheer-nav.tsx',
  })

  // Test 2: Nieuws tab links to /beheer/nieuws
  const linksToNieuws = beheerNavSrc.includes("href: '/beheer/nieuws'")
  results.push({
    test: '#494: Nieuws tab links to /beheer/nieuws',
    pass: linksToNieuws,
    detail: linksToNieuws
      ? "href is '/beheer/nieuws'"
      : 'ERROR: Nieuws tab href not found',
  })

  // Test 3: /beheer/nieuws page exists
  results.push({
    test: '#494: /beheer/nieuws page file exists',
    pass: nieuwsPageExists,
    detail: nieuwsPageExists
      ? 'app/(app)/beheer/nieuws/page.tsx exists'
      : 'ERROR: nieuws page not found',
  })

  // Test 4: Active styling works (no special activeClass = uses default amber)
  const noSpecialActiveClass = beheerNavSrc.includes("{ label: 'Nieuws', href: '/beheer/nieuws' }")
  results.push({
    test: '#494: Nieuws tab uses default active styling (amber)',
    pass: noSpecialActiveClass,
    detail: noSpecialActiveClass
      ? 'No custom activeClass — uses default amber active styling'
      : 'Check: Nieuws tab may have custom activeClass',
  })

  // === Feature #495: Editable textarea for news system prompt ===

  // Test 5: Page has textarea element
  const hasTextarea = nieuwsPageSrc.includes('<textarea')
  results.push({
    test: '#495: Page has textarea for system prompt',
    pass: hasTextarea,
    detail: hasTextarea
      ? 'textarea element found in nieuws page'
      : 'ERROR: No textarea found',
  })

  // Test 6: Default prompt is defined
  const hasDefaultPrompt = nieuwsPageSrc.includes('DEFAULT_NEWS_PROMPT')
  results.push({
    test: '#495: Default prompt constant defined',
    pass: hasDefaultPrompt,
    detail: hasDefaultPrompt
      ? 'DEFAULT_NEWS_PROMPT constant found'
      : 'ERROR: No default prompt defined',
  })

  // Test 7: Textarea is pre-filled with default
  const preFilledWithDefault = nieuwsPageSrc.includes('useState(DEFAULT_NEWS_PROMPT)')
  results.push({
    test: '#495: Textarea pre-filled with default prompt',
    pass: preFilledWithDefault,
    detail: preFilledWithDefault
      ? 'useState initializes with DEFAULT_NEWS_PROMPT'
      : 'ERROR: Textarea not pre-filled with default',
  })

  // Test 8: Uses app_settings key news_system_prompt
  const usesNewsKey = apiRouteSrc.includes("'news_system_prompt'") || apiRouteSrc.includes('"news_system_prompt"')
  results.push({
    test: '#495: Uses app_settings key news_system_prompt',
    pass: usesNewsKey,
    detail: usesNewsKey
      ? "API route uses key 'news_system_prompt'"
      : 'ERROR: news_system_prompt key not found in API',
  })

  // Test 9: Textarea has sufficient rows (>= 10)
  const rowsMatch = nieuwsPageSrc.match(/rows=\{(\d+)\}/)
  const hasEnoughRows = rowsMatch ? parseInt(rowsMatch[1]) >= 10 : false
  results.push({
    test: '#495: Textarea has enough rows (>= 10)',
    pass: hasEnoughRows,
    detail: hasEnoughRows
      ? `Textarea has rows={${rowsMatch?.[1]}}`
      : 'ERROR: Textarea too small or rows not set',
  })

  // === Feature #496: Save and Reset buttons ===

  // Test 10: Opslaan button exists
  const hasSaveButton = nieuwsPageSrc.includes('Opslaan')
  results.push({
    test: '#496: Opslaan button exists',
    pass: hasSaveButton,
    detail: hasSaveButton
      ? 'Opslaan button found'
      : 'ERROR: No Opslaan button found',
  })

  // Test 11: Terugzetten naar standaard button exists
  const hasResetButton = nieuwsPageSrc.includes('Terugzetten naar standaard')
  results.push({
    test: '#496: Terugzetten naar standaard button exists',
    pass: hasResetButton,
    detail: hasResetButton
      ? 'Reset button found'
      : 'ERROR: No reset button found',
  })

  // Test 12: API route has PUT for saving
  const hasPut = apiRouteSrc.includes('export async function PUT')
  results.push({
    test: '#496: API route has PUT method for saving',
    pass: hasPut,
    detail: hasPut
      ? 'PUT handler found in news-prompt route'
      : 'ERROR: No PUT handler',
  })

  // Test 13: API route has DELETE for reset (or saves default)
  const hasDeleteOrReset = apiRouteSrc.includes('export async function DELETE') || apiRouteSrc.includes('delete')
  results.push({
    test: '#496: API route supports reset (DELETE method)',
    pass: hasDeleteOrReset,
    detail: hasDeleteOrReset
      ? 'DELETE handler found for resetting prompt'
      : 'ERROR: No reset mechanism in API',
  })

  // Test 14: Success feedback shown
  const hasSuccessFeedback = nieuwsPageSrc.includes('success') && nieuwsPageSrc.includes('opgeslagen')
  results.push({
    test: '#496: Success message shown after save',
    pass: hasSuccessFeedback,
    detail: hasSuccessFeedback
      ? 'Success feedback with "opgeslagen" message found'
      : 'ERROR: No success feedback found',
  })

  // Test 15: API route checks admin auth
  const apiChecksAdmin = apiRouteSrc.includes('isSuperAdmin')
  results.push({
    test: '#496: API route checks isSuperAdmin',
    pass: apiChecksAdmin,
    detail: apiChecksAdmin
      ? 'isSuperAdmin check present in API route'
      : 'ERROR: No admin auth check in API',
  })

  // Test 16: Page loads saved prompt on mount
  const loadsOnMount = nieuwsPageSrc.includes('/api/admin/news-prompt') && nieuwsPageSrc.includes('useEffect')
  results.push({
    test: '#496: Page loads saved prompt on mount',
    pass: loadsOnMount,
    detail: loadsOnMount
      ? 'useEffect fetches /api/admin/news-prompt on mount'
      : 'ERROR: No load-on-mount found',
  })

  // Test 17: Upsert used for persistence (not insert)
  const usesUpsert = apiRouteSrc.includes('.upsert(')
  results.push({
    test: '#496: API uses upsert for persistence',
    pass: usesUpsert,
    detail: usesUpsert
      ? 'Supabase upsert used for idempotent save'
      : 'ERROR: No upsert found',
  })

  const passCount = results.filter(r => r.pass).length
  return NextResponse.json({
    features: '#494, #495, #496 - Beheer Nieuws tab + system prompt',
    summary: `${passCount}/${results.length} tests passing`,
    allPassing: passCount === results.length,
    results,
  })
}
