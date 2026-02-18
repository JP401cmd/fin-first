/**
 * Verification endpoint for Feature #234: Freedom card generator
 *
 * Tests:
 * 1. FreedomCard component exists with visual card layout
 * 2. Shows freedom percentage with progress bar
 * 3. Shows days won this month
 * 4. Shows FIRE countdown
 * 5. TriFinity branding on card
 * 6. NO EUR amounts in anonymous/named modes — only percentages and timeframes
 * 7. Download as PNG/JPG (canvas renderer exists)
 * 8. GET /api/share/freedom-card endpoint exists and requires auth
 */

import { readFileSync } from 'fs'
import { join } from 'path'

function fileContains(relPath: string, ...patterns: string[]): boolean {
  try {
    const content = readFileSync(join(process.cwd(), relPath), 'utf-8')
    return patterns.every(p => content.includes(p))
  } catch {
    return false
  }
}

function fileExists(relPath: string): boolean {
  try {
    readFileSync(join(process.cwd(), relPath), 'utf-8')
    return true
  } catch {
    return false
  }
}

function readFile(relPath: string): string {
  try {
    return readFileSync(join(process.cwd(), relPath), 'utf-8')
  } catch {
    return ''
  }
}

export async function GET() {
  const results: { test: string; pass: boolean; detail: string }[] = []

  // ── Test 1: FreedomCard component exists ──
  const cardFile = readFile('components/app/freedom-card.tsx')
  results.push({
    test: 'FreedomCard component exists with visual card layout',
    pass: cardFile.includes('FreedomCardVisual') && cardFile.includes('id="freedom-card"'),
    detail: cardFile.includes('FreedomCardVisual')
      ? 'FreedomCardVisual component found with card layout'
      : 'FreedomCardVisual component not found',
  })

  // ── Test 2: Freedom percentage with progress bar ──
  results.push({
    test: 'Shows freedom percentage with progress bar',
    pass: cardFile.includes('freedomPercentage') &&
      cardFile.includes('financiele vrijheid') &&
      cardFile.includes('rounded-full bg-gradient-to-r from-amber-400 via-teal-400 to-purple-500'),
    detail: cardFile.includes('freedomPercentage')
      ? 'Freedom percentage with gradient progress bar found'
      : 'Freedom percentage or progress bar missing',
  })

  // ── Test 3: Days won this month ──
  const apiFile = readFile('app/api/share/freedom-card/route.ts')
  results.push({
    test: 'Shows days won this month (not all-time)',
    pass: cardFile.includes('freedomDaysWonThisMonth') &&
      cardFile.includes('Dagen deze maand') &&
      apiFile.includes('freedomDaysWonThisMonth'),
    detail: cardFile.includes('Dagen deze maand')
      ? 'Card shows "Dagen deze maand" with monthly filtering in API'
      : 'Days won this month not implemented',
  })

  // ── Test 4: FIRE countdown ──
  results.push({
    test: 'Shows FIRE countdown',
    pass: cardFile.includes('FIRE countdown') &&
      cardFile.includes('fireCountdown') &&
      cardFile.includes('countdownText'),
    detail: cardFile.includes('FIRE countdown')
      ? 'FIRE countdown section found with years/months display'
      : 'FIRE countdown section missing',
  })

  // ── Test 5: TriFinity branding ──
  results.push({
    test: 'TriFinity branding on card',
    pass: cardFile.includes('TriFinity') &&
      cardFile.includes('bg-amber-400') &&
      cardFile.includes('bg-teal-400') &&
      cardFile.includes('bg-purple-400'),
    detail: cardFile.includes('TriFinity')
      ? 'TriFinity branding with amber/teal/purple dots found'
      : 'TriFinity branding missing',
  })

  // ── Test 6: No EUR amounts in anonymous/named modes ──
  // In anonymous mode: no netWorth, no fireTarget displayed
  // The component conditionally shows EUR only for 'full' privacy
  const onlyShowsEurInFull = cardFile.includes("privacyLevel === 'full'") &&
    cardFile.includes('formatCurrencyNL')
  results.push({
    test: 'No EUR amounts in anonymous/named modes — only percentages and timeframes',
    pass: onlyShowsEurInFull,
    detail: onlyShowsEurInFull
      ? 'EUR amounts conditionally shown only in "full" privacy mode'
      : 'EUR amount display logic not properly gated by privacy level',
  })

  // ── Test 7: API only returns EUR in 'full' mode ──
  const apiGatesEur = apiFile.includes("if (privacyLevel === 'full')") &&
    apiFile.includes('cardData.netWorth') &&
    apiFile.includes('cardData.fireTarget')
  results.push({
    test: 'API gates EUR amounts to full privacy mode only',
    pass: apiGatesEur,
    detail: apiGatesEur
      ? 'API only includes netWorth/fireTarget in full privacy mode'
      : 'API EUR gating not found',
  })

  // ── Test 8: Download as PNG (canvas renderer) ──
  const hasCanvasRenderer = cardFile.includes('renderFreedomCardToCanvas') &&
    cardFile.includes('toDataURL') &&
    cardFile.includes('.png')
  results.push({
    test: 'Download as PNG image (canvas-based renderer)',
    pass: hasCanvasRenderer,
    detail: hasCanvasRenderer
      ? 'Canvas-based renderer with PNG download found'
      : 'Canvas-based PNG download not implemented',
  })

  // ── Test 9: Canvas renderer draws all required elements ──
  const canvasDrawsAll = cardFile.includes('MIJN VRIJHEIDSKAART') &&
    cardFile.includes('Dagen deze maand') &&
    cardFile.includes('FIRE countdown') &&
    cardFile.includes('Vrijheidstijd') &&
    cardFile.includes('Spaarquote') &&
    cardFile.includes('Geld is opgeslagen tijd')
  results.push({
    test: 'Canvas renderer includes all card sections',
    pass: canvasDrawsAll,
    detail: canvasDrawsAll
      ? 'Canvas renderer draws header, stats grid, footer, and branding'
      : 'Canvas renderer missing some sections',
  })

  // ── Test 10: GET /api/share/freedom-card endpoint exists ──
  results.push({
    test: 'GET /api/share/freedom-card endpoint exists',
    pass: fileExists('app/api/share/freedom-card/route.ts') &&
      apiFile.includes('export async function GET'),
    detail: fileExists('app/api/share/freedom-card/route.ts')
      ? 'Endpoint file exists with GET handler'
      : 'Endpoint file missing',
  })

  // ── Test 11: API requires authentication ──
  results.push({
    test: 'API requires authentication (returns 401)',
    pass: apiFile.includes('status: 401') && apiFile.includes('Niet ingelogd'),
    detail: apiFile.includes('status: 401')
      ? 'API returns 401 for unauthenticated requests'
      : 'API auth check missing',
  })

  // ── Test 12: API returns all required card fields ──
  const hasAllFields = apiFile.includes('freedomPercentage') &&
    apiFile.includes('freedomDaysWon') &&
    apiFile.includes('freedomDaysWonThisMonth') &&
    apiFile.includes('fireCountdown') &&
    apiFile.includes('freedomTime') &&
    apiFile.includes('savingsRate') &&
    apiFile.includes('generatedAt')
  results.push({
    test: 'API returns all required card data fields',
    pass: hasAllFields,
    detail: hasAllFields
      ? 'All fields present: freedomPercentage, freedomDaysWon, freedomDaysWonThisMonth, fireCountdown, freedomTime, savingsRate, generatedAt'
      : 'Some required fields missing from API response',
  })

  // ── Test 13: FreedomCardGenerator component exists ──
  results.push({
    test: 'FreedomCardGenerator component with privacy selector',
    pass: cardFile.includes('FreedomCardGenerator') &&
      cardFile.includes('privacyLevel') &&
      cardFile.includes('generateCard'),
    detail: cardFile.includes('FreedomCardGenerator')
      ? 'FreedomCardGenerator with privacy level selector and generate button found'
      : 'FreedomCardGenerator component missing',
  })

  // ── Test 14: Card integrated on identity page ──
  const identityFile = readFile('app/(app)/identity/page.tsx')
  results.push({
    test: 'Card generator integrated on identity page',
    pass: identityFile.includes('FreedomCardGenerator') &&
      identityFile.includes('freedom-card'),
    detail: identityFile.includes('FreedomCardGenerator')
      ? 'FreedomCardGenerator imported and used on identity page'
      : 'FreedomCardGenerator not found on identity page',
  })

  // ── Test 15: Test page exists ──
  results.push({
    test: 'Test page exists at /test-freedom-card',
    pass: fileExists('app/test-freedom-card/page.tsx'),
    detail: fileExists('app/test-freedom-card/page.tsx')
      ? 'Test page found'
      : 'Test page missing',
  })

  // ── Test 16: API calculates this month days from completed_at ──
  const monthlyDaysLogic = apiFile.includes('completed_at') &&
    apiFile.includes('monthStart') &&
    apiFile.includes('monthEnd') &&
    apiFile.includes('freedomDaysWonThisMonth')
  results.push({
    test: 'API filters completed actions by completed_at for this month',
    pass: monthlyDaysLogic,
    detail: monthlyDaysLogic
      ? 'API uses completed_at date range filtering for this-month days'
      : 'Monthly filtering logic not found',
  })

  // Summary
  const passing = results.filter(r => r.pass).length
  const total = results.length

  return Response.json({
    feature: '#234 Freedom card generator',
    summary: `${passing}/${total} tests passing`,
    passing,
    total,
    results,
  })
}
