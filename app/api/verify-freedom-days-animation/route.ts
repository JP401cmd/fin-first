import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

export async function GET() {
  const results: { test: string; passed: boolean; details: string }[] = []

  // Helper
  function addTest(test: string, passed: boolean, details: string) {
    results.push({ test, passed, details })
  }

  try {
    const root = process.cwd()

    // 1. FreedomDaysAnimationProvider exists
    const animComponentPath = path.join(root, 'components', 'app', 'freedom-days-animation.tsx')
    const animExists = fs.existsSync(animComponentPath)
    addTest('FreedomDaysAnimation component exists', animExists, animExists ? 'File found' : 'File not found')

    let animContent = ''
    if (animExists) {
      animContent = fs.readFileSync(animComponentPath, 'utf-8')
    }

    // 2. Animation component has floating text element
    const hasFloatingText = animContent.includes('freedom-days-floating-text')
    addTest('Floating text has data-testid', hasFloatingText, hasFloatingText ? 'data-testid="freedom-days-floating-text" found' : 'Missing')

    // 3. Animation text floats up and fades out
    const hasTransition = animContent.includes('duration-[2000ms]') || animContent.includes('duration-[1500ms]')
    const hasOpacityFade = animContent.includes('opacity') && (animContent.includes('float') || animContent.includes('phase'))
    const hasUpwardMovement = animContent.includes('translateY') || animContent.includes('top:')
    addTest('Animation floats up and fades out', hasTransition && hasOpacityFade && hasUpwardMovement,
      `Transition: ${hasTransition}, Opacity: ${hasOpacityFade}, Upward: ${hasUpwardMovement}`)

    // 4. Animation shows "+X dagen" format
    const hasFormatted = animContent.includes('+{formattedDays}') || animContent.includes(`+\${formattedDays}`)
    const hasDagenLabel = animContent.includes('vrijheidsdagen') || animContent.includes('vrijheidsdag')
    addTest('Shows "+X dagen" format', hasFormatted && hasDagenLabel,
      `Formatted: ${hasFormatted}, Label: ${hasDagenLabel}`)

    // 5. Provider wraps children and provides context
    const hasProvider = animContent.includes('FreedomDaysAnimationProvider')
    const hasContext = animContent.includes('createContext')
    const hasTrigger = animContent.includes('triggerAnimation')
    addTest('Provider with context and triggerAnimation', hasProvider && hasContext && hasTrigger,
      `Provider: ${hasProvider}, Context: ${hasContext}, Trigger: ${hasTrigger}`)

    // 6. Animation overlay is non-intrusive (pointer-events-none)
    const hasPointerNone = animContent.includes('pointer-events-none')
    const hasZIndex = animContent.includes('z-50') || animContent.includes('z-10')
    addTest('Animation is smooth and non-intrusive', hasPointerNone && hasZIndex,
      `pointer-events-none: ${hasPointerNone}, z-index: ${hasZIndex}`)

    // 7. ActionBoard triggers animation on completion
    const actionBoardPath = path.join(root, 'components', 'app', 'action-board.tsx')
    const actionBoardContent = fs.readFileSync(actionBoardPath, 'utf-8')
    const boardImportsAnim = actionBoardContent.includes('useFreedomDaysAnimation')
    const boardTriggers = actionBoardContent.includes('triggerAnimation')
    const boardOnComplete = actionBoardContent.includes("status === 'completed'") && boardTriggers
    addTest('ActionBoard triggers animation on completion', boardImportsAnim && boardOnComplete,
      `Import: ${boardImportsAnim}, Triggers on complete: ${boardOnComplete}`)

    // 8. De Wil hero shows running total (already existed, verify it's still there)
    const willPagePath = path.join(root, 'app', '(app)', 'will', 'page.tsx')
    const willContent = fs.readFileSync(willPagePath, 'utf-8')
    const hasRunningTotal = willContent.includes('wil-hero-freedom-days-value')
    const hasHeroPrimary = willContent.includes('totalFreedomDaysWon')
    addTest('Running freedom days total in De Wil hero', hasRunningTotal && hasHeroPrimary,
      `Hero value: ${hasRunningTotal}, Running total: ${hasHeroPrimary}`)

    // 9. Weekly freedom days tracking
    const hasWeeklyCalc = willContent.includes('weeklyFreedomDaysWon')
    const hasWeekStart = willContent.includes('weekStart')
    const hasWeeklyDisplay = willContent.includes('weekly-freedom-days-value')
    addTest('Weekly freedom days tracking', hasWeeklyCalc && hasWeekStart,
      `Weekly calc: ${hasWeeklyCalc}, Week start: ${hasWeekStart}`)

    // 10. Weekly summary displayed in hero
    const hasWeeklySummary = willContent.includes('wil-hero-weekly-summary')
    const hasDezeWeek = willContent.includes('Deze week:')
    addTest('Weekly summary displayed in hero', hasWeeklySummary && hasDezeWeek && hasWeeklyDisplay,
      `Summary section: ${hasWeeklySummary}, "Deze week": ${hasDezeWeek}, Value: ${hasWeeklyDisplay}`)

    // 11. De Wil page wrapped with FreedomDaysAnimationProvider
    const hasProviderImport = willContent.includes('FreedomDaysAnimationProvider')
    const hasProviderWrap = willContent.includes('<FreedomDaysAnimationProvider>')
    addTest('De Wil page wrapped with animation provider', hasProviderImport && hasProviderWrap,
      `Import: ${hasProviderImport}, Wrapped: ${hasProviderWrap}`)

    // 12. Animation overlay has aria-hidden for accessibility
    const hasAriaHidden = animContent.includes('aria-hidden="true"')
    addTest('Animation overlay is accessible (aria-hidden)', hasAriaHidden,
      hasAriaHidden ? 'aria-hidden="true" found' : 'Missing')

  } catch (error) {
    addTest('Error running tests', false, String(error))
  }

  const passing = results.filter((r) => r.passed).length
  const total = results.length

  return NextResponse.json({
    feature: '#207 - Freedom days animation loop',
    passing,
    total,
    allPassing: passing === total,
    results,
  })
}
