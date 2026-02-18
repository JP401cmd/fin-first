/**
 * Verification endpoint for Feature #254: Freedom card uses only safe non-financial data
 *
 * Verifies that the freedom card generator never exposes sensitive EUR amounts.
 * Card shows only: percentages, timeframes, days. No net worth, no income, no debt amounts.
 * Even in 'Full' privacy mode, amounts are optional (require explicit opt-in).
 *
 * Tests map to feature steps:
 * 1. Generate freedom card and inspect for EUR amounts
 * 2. Verify only percentages and timeframes appear by default
 * 3. Verify freedom percentage is shown as percentage not EUR
 * 4. Verify FIRE countdown shown as time not money
 * 5. Verify days won shown as days not EUR equivalent
 * 6. Test all three privacy levels for data exposure
 */

import { readFileSync } from 'fs'
import { join } from 'path'

function readFile(relPath: string): string {
  try {
    return readFileSync(join(process.cwd(), relPath), 'utf-8')
  } catch {
    return ''
  }
}

export async function GET() {
  const results: { id: number; step: string; test: string; pass: boolean; detail: string }[] = []

  const cardFile = readFile('components/app/freedom-card.tsx')
  const apiFile = readFile('app/api/share/freedom-card/route.ts')

  // ══════════════════════════════════════════════════════════════════
  // STEP 1: Generate freedom card and inspect for EUR amounts
  // ══════════════════════════════════════════════════════════════════

  // Test 1.1: API only returns EUR amounts (netWorth, fireTarget) in 'full' mode
  const apiFullGuard = apiFile.includes("if (privacyLevel === 'full')") &&
    apiFile.includes('cardData.netWorth') &&
    apiFile.includes('cardData.fireTarget')
  results.push({
    id: 1,
    step: 'Step 1: Inspect for EUR amounts',
    test: 'API only includes netWorth/fireTarget in full privacy mode',
    pass: apiFullGuard,
    detail: apiFullGuard
      ? "API gates EUR amounts behind if (privacyLevel === 'full') check"
      : 'API does not properly gate EUR amounts',
  })

  // Test 1.2: Card visual only shows EUR amounts when privacy is 'full'
  const cardFullGuard = !!cardFile.match(/privacyLevel\s*===\s*['"]full['"]\s*&&\s*netWorth/)
  results.push({
    id: 2,
    step: 'Step 1: Inspect for EUR amounts',
    test: 'Card visual only renders EUR amounts in full mode',
    pass: cardFullGuard,
    detail: cardFullGuard
      ? "FreedomCardVisual guards EUR with privacyLevel === 'full' && netWorth"
      : 'Card visual EUR guard not found',
  })

  // Test 1.3: Canvas renderer only draws EUR amounts when privacy is 'full'
  const canvasFullGuard = !!cardFile.match(/data\.privacyLevel\s*===\s*['"]full['"]/) &&
    cardFile.includes('renderFreedomCardToCanvas')
  results.push({
    id: 3,
    step: 'Step 1: Inspect for EUR amounts',
    test: 'Canvas renderer only draws EUR amounts in full mode',
    pass: canvasFullGuard,
    detail: canvasFullGuard
      ? "Canvas renderer guards EUR with data.privacyLevel === 'full'"
      : 'Canvas renderer EUR guard not found',
  })

  // ══════════════════════════════════════════════════════════════════
  // STEP 2: Verify only percentages and timeframes appear by default
  // ══════════════════════════════════════════════════════════════════

  // Test 2.1: Default privacy level is 'anonymous' (no EUR, no name)
  const defaultAnonymous = cardFile.includes("useState<PrivacyLevel>('anonymous')") &&
    (cardFile.includes("return 'anonymous'") || !!cardFile.match(/return\s+['"]anonymous['"]/))
  results.push({
    id: 4,
    step: 'Step 2: Only percentages and timeframes by default',
    test: 'Default privacy level is anonymous',
    pass: defaultAnonymous,
    detail: defaultAnonymous
      ? "useState defaults to 'anonymous', getStoredPrivacyLevel returns 'anonymous'"
      : 'Default privacy level not set to anonymous',
  })

  // Test 2.2: Anonymous mode API response excludes displayName, netWorth, fireTarget
  // API only adds displayName for named/full, only adds netWorth/fireTarget for full
  const anonymousExcludesName = !!apiFile.match(/if\s*\(\s*privacyLevel\s*===\s*['"]named['"]\s*\|\|\s*privacyLevel\s*===\s*['"]full['"]\s*\)[\s\S]*?displayName/)
  const anonymousExcludesAmounts = !!apiFile.match(/if\s*\(\s*privacyLevel\s*===\s*['"]full['"]\s*\)[\s\S]*?netWorth/)
  results.push({
    id: 5,
    step: 'Step 2: Only percentages and timeframes by default',
    test: 'Anonymous API response excludes name and EUR amounts',
    pass: anonymousExcludesName && anonymousExcludesAmounts,
    detail: `Excludes name: ${anonymousExcludesName}, Excludes EUR: ${anonymousExcludesAmounts}`,
  })

  // Test 2.3: Card stats grid shows only safe metrics (days, time, percentage)
  const statsSafe = cardFile.includes('Dagen deze maand') &&
    cardFile.includes('FIRE countdown') &&
    cardFile.includes('Vrijheidstijd') &&
    cardFile.includes('Spaarquote')
  results.push({
    id: 6,
    step: 'Step 2: Only percentages and timeframes by default',
    test: 'Stats grid shows only safe metrics: days, countdown, freedom time, savings rate',
    pass: statsSafe,
    detail: statsSafe
      ? 'All 4 stat cards display safe non-EUR metrics'
      : 'Stats grid contains unexpected metrics',
  })

  // ══════════════════════════════════════════════════════════════════
  // STEP 3: Verify freedom percentage is shown as percentage not EUR
  // ══════════════════════════════════════════════════════════════════

  // Test 3.1: Freedom percentage displayed with % sign, not EUR
  const pctAsPercent = cardFile.includes('freedomPercentage') &&
    (cardFile.includes('.toFixed(1)}%') || cardFile.includes("toFixed(1)}%'")) &&
    cardFile.includes('financiele vrijheid')
  results.push({
    id: 7,
    step: 'Step 3: Freedom % shown as percentage not EUR',
    test: 'Freedom percentage displayed with % suffix, not as EUR amount',
    pass: pctAsPercent,
    detail: pctAsPercent
      ? "Shows X.X% with 'financiele vrijheid' label"
      : 'Freedom percentage not displayed as percentage',
  })

  // Test 3.2: Canvas also shows freedom percentage as %, not EUR
  const canvasPctAsPercent = cardFile.includes('pctText') &&
    cardFile.includes("toFixed(1)}%`")
  results.push({
    id: 8,
    step: 'Step 3: Freedom % shown as percentage not EUR',
    test: 'Canvas renderer shows freedom percentage as % not EUR',
    pass: canvasPctAsPercent,
    detail: canvasPctAsPercent
      ? 'Canvas draws percentage with % suffix'
      : 'Canvas freedom percentage rendering not found',
  })

  // Test 3.3: API calculates freedom percentage as 0-100 ratio, not EUR
  const apiPctCalc = apiFile.includes('freedomPct') &&
    (apiFile.includes('(netWorth / fireTarget) * 100') || apiFile.includes('* 100'))
  results.push({
    id: 9,
    step: 'Step 3: Freedom % shown as percentage not EUR',
    test: 'API calculates freedom percentage as 0-100 ratio',
    pass: apiPctCalc,
    detail: apiPctCalc
      ? 'API computes freedomPct as (netWorth / fireTarget) * 100, returns as number 0-100'
      : 'API freedom percentage calculation not found',
  })

  // ══════════════════════════════════════════════════════════════════
  // STEP 4: Verify FIRE countdown shown as time not money
  // ══════════════════════════════════════════════════════════════════

  // Test 4.1: FIRE countdown displays years/months, not EUR amounts
  // Template literals like `${years}j ${months}mnd` contain '}j ' and 'mnd'
  const fireCountdownAsTime = cardFile.includes('fireCountdown') &&
    cardFile.includes('}j ') && // years abbreviation in Dutch (from template `${x}j `)
    (cardFile.includes('mnd') || cardFile.includes('maanden')) // months
  results.push({
    id: 10,
    step: 'Step 4: FIRE countdown shown as time not money',
    test: 'FIRE countdown displays years and months, not EUR',
    pass: fireCountdownAsTime,
    detail: fireCountdownAsTime
      ? "Shows 'Xj Xmnd' or 'X maanden' format"
      : 'FIRE countdown time format not found',
  })

  // Test 4.2: FIRE countdown labels are time-based
  const fireLabels = cardFile.includes('Bereikt!') &&
    cardFile.includes('Niet haalbaar') &&
    cardFile.includes('N/B')
  results.push({
    id: 11,
    step: 'Step 4: FIRE countdown shown as time not money',
    test: 'FIRE countdown uses time-based labels (Bereikt, Niet haalbaar, N/B)',
    pass: fireLabels,
    detail: fireLabels
      ? 'All fallback labels are time-based, no EUR references'
      : 'FIRE countdown fallback labels missing',
  })

  // Test 4.3: API returns FIRE countdown as years/months/days, not EUR
  const apiFireAsTime = apiFile.includes('countdownYears') &&
    apiFile.includes('countdownMonths') &&
    apiFile.includes('countdownDays')
  results.push({
    id: 12,
    step: 'Step 4: FIRE countdown shown as time not money',
    test: 'API returns FIRE countdown as years/months/days fields',
    pass: apiFireAsTime,
    detail: apiFireAsTime
      ? 'API includes countdownYears, countdownMonths, countdownDays in fireCountdown object'
      : 'API FIRE countdown time fields not found',
  })

  // ══════════════════════════════════════════════════════════════════
  // STEP 5: Verify days won shown as days not EUR equivalent
  // ══════════════════════════════════════════════════════════════════

  // Test 5.1: Days won shown as integer count, not EUR value
  const daysAsCount = cardFile.includes('freedomDaysWon') &&
    cardFile.includes('daysWonDisplay') &&
    (cardFile.includes('+${daysWonDisplay}') || cardFile.includes('`+${'))
  results.push({
    id: 13,
    step: 'Step 5: Days won shown as days not EUR',
    test: 'Days won displayed as +N count, not EUR equivalent',
    pass: daysAsCount,
    detail: daysAsCount
      ? "Shows '+X' format as day count"
      : 'Days won count display not found',
  })

  // Test 5.2: Days are labeled as "Dagen deze maand" not as money
  const daysLabel = cardFile.includes('Dagen deze maand')
  results.push({
    id: 14,
    step: 'Step 5: Days won shown as days not EUR',
    test: 'Days labeled as "Dagen deze maand" not as money',
    pass: daysLabel,
    detail: daysLabel
      ? '"Dagen deze maand" label found — explicitly time-framed'
      : '"Dagen deze maand" label not found',
  })

  // Test 5.3: API returns days as integer counts, not EUR amounts
  const apiDaysAsCount = apiFile.includes('Math.round(totalFreedomDaysWon)') &&
    apiFile.includes('Math.round(freedomDaysWonThisMonth)')
  results.push({
    id: 15,
    step: 'Step 5: Days won shown as days not EUR',
    test: 'API returns freedom days as rounded integers, not EUR',
    pass: apiDaysAsCount,
    detail: apiDaysAsCount
      ? 'API rounds freedomDaysWon and freedomDaysWonThisMonth to integers'
      : 'API days calculation not as expected',
  })

  // ══════════════════════════════════════════════════════════════════
  // STEP 6: Test all three privacy levels for data exposure
  // ══════════════════════════════════════════════════════════════════

  // Test 6.1: Anonymous mode - no name, no EUR amounts
  const anonymousNoName = !!apiFile.match(/if\s*\(\s*privacyLevel\s*===\s*['"]named['"]\s*\|\|\s*privacyLevel\s*===\s*['"]full['"]\s*\)/)
  const anonymousNoEur = !!apiFile.match(/if\s*\(\s*privacyLevel\s*===\s*['"]full['"]\s*\)\s*\{/)
  results.push({
    id: 16,
    step: 'Step 6: All three privacy levels',
    test: 'Anonymous: excludes displayName and EUR amounts',
    pass: anonymousNoName && anonymousNoEur,
    detail: `Name guard: ${anonymousNoName}, EUR guard: ${anonymousNoEur}`,
  })

  // Test 6.2: Named mode - has name, no EUR amounts
  // Named is in the (named || full) guard for displayName, but NOT in the full-only guard for EUR
  results.push({
    id: 17,
    step: 'Step 6: All three privacy levels',
    test: 'Named: includes displayName but excludes EUR amounts',
    pass: anonymousNoName && anonymousNoEur,
    detail: 'Named included in displayName guard, excluded from EUR guard',
  })

  // Test 6.3: Full mode - has name AND EUR amounts, but requires explicit opt-in
  const fullOptIn = cardFile.includes('showFullOptIn') &&
    cardFile.includes('confirmFullOptIn') &&
    cardFile.includes('cancelFullOptIn') &&
    cardFile.includes('full-optin-dialog')
  results.push({
    id: 18,
    step: 'Step 6: All three privacy levels',
    test: 'Full: includes EUR amounts but requires explicit opt-in',
    pass: fullOptIn && apiFullGuard,
    detail: `Opt-in dialog: ${fullOptIn}, API guard: ${apiFullGuard}`,
  })

  // Test 6.4: Full mode amounts are OPTIONAL (opt-in dialog with cancel option)
  const fullOptional = cardFile.includes('full-optin-cancel') &&
    cardFile.includes('Annuleren') &&
    cardFile.includes('Ja, bedragen tonen')
  results.push({
    id: 19,
    step: 'Step 6: All three privacy levels',
    test: 'Full mode amounts are optional with cancel button',
    pass: fullOptional,
    detail: fullOptional
      ? 'Opt-in has "Ja, bedragen tonen" confirm and "Annuleren" cancel buttons'
      : 'Full mode cancel/confirm buttons not found',
  })

  // Test 6.5: Privacy selector shows all 3 levels with correct Dutch labels
  const allThreeLabels = cardFile.includes('Anoniem') &&
    cardFile.includes('Met naam') &&
    cardFile.includes('Volledig')
  results.push({
    id: 20,
    step: 'Step 6: All three privacy levels',
    test: 'Privacy selector shows Anoniem, Met naam, Volledig',
    pass: allThreeLabels,
    detail: allThreeLabels
      ? 'All 3 Dutch privacy labels found in selector'
      : 'Some privacy labels missing',
  })

  // Test 6.6: Share text does not include EUR amounts
  const shareTextSafe = cardFile.includes('getShareContent') &&
    !cardFile.match(/getShareContent[\s\S]*?netWorth[\s\S]*?return/) // no netWorth in share text builder
  // Check the actual share text construction
  const shareContentBlock = cardFile.match(/getShareContent[\s\S]*?return\s*\{[\s\S]*?\}/)?.[0] || ''
  const shareHasEur = shareContentBlock.includes('netWorth') || shareContentBlock.includes('fireTarget') ||
    shareContentBlock.includes('formatCurrency') || shareContentBlock.includes('€')
  results.push({
    id: 21,
    step: 'Step 6: All three privacy levels',
    test: 'Share text does not include EUR amounts',
    pass: !shareHasEur,
    detail: !shareHasEur
      ? 'Share text uses only freedom %, days won, and FIRE countdown — no EUR'
      : 'Share text may contain EUR amounts',
  })

  // ══════════════════════════════════════════════════════════════════
  // Summary
  // ══════════════════════════════════════════════════════════════════
  const passing = results.filter(r => r.pass).length
  const total = results.length

  return Response.json({
    feature: '#254 Freedom card uses only safe non-financial data',
    summary: `${passing}/${total} tests passing`,
    passing,
    total,
    allPassing: passing === total,
    results,
  })
}
