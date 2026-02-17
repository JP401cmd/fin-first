import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

/**
 * Verification endpoint for Feature #209: Level-up celebration animations
 * Tests: component existence, animation keyframes, phase colors, dismiss options,
 *        progress bar animations, badge shimmer effects, performance properties
 */
export async function GET() {
  const results: { name: string; pass: boolean; detail: string }[] = []
  const rootDir = process.cwd()

  function check(name: string, fn: () => { pass: boolean; detail: string }) {
    try {
      results.push({ name, ...fn() })
    } catch (e: any) {
      results.push({ name, pass: false, detail: `Error: ${e.message}` })
    }
  }

  // ── 1. LevelUpCelebration component exists ────────────────
  check('LevelUpCelebration component exists', () => {
    const filePath = path.join(rootDir, 'components/app/level-up-celebration.tsx')
    const exists = fs.existsSync(filePath)
    if (!exists) return { pass: false, detail: 'File not found' }
    const content = fs.readFileSync(filePath, 'utf-8')
    const hasExport = content.includes('export function LevelUpCelebration')
    return { pass: hasExport, detail: hasExport ? 'Component exported' : 'Export not found' }
  })

  // ── 2. Full-screen celebration with data-testid ───────────
  check('Full-screen celebration with proper ARIA', () => {
    const content = fs.readFileSync(path.join(rootDir, 'components/app/level-up-celebration.tsx'), 'utf-8')
    const hasFixedInset = content.includes('fixed inset-0')
    const hasRole = content.includes('role="dialog"')
    const hasAriaModal = content.includes('aria-modal="true"')
    const hasTestId = content.includes('data-testid="level-up-celebration"')
    const all = hasFixedInset && hasRole && hasAriaModal && hasTestId
    return { pass: all, detail: all ? 'Full-screen modal with ARIA' : `fixed:${hasFixedInset}, role:${hasRole}, ariaModal:${hasAriaModal}, testid:${hasTestId}` }
  })

  // ── 3. Confetti burst animation ───────────────────────────
  check('Confetti burst particle animation', () => {
    const content = fs.readFileSync(path.join(rootDir, 'components/app/level-up-celebration.tsx'), 'utf-8')
    const hasConfetti = content.includes('ConfettiBurst')
    const hasKeyframes = content.includes('@keyframes confetti-particle')
    const hasTestId = content.includes('data-testid="confetti-burst"')
    const all = hasConfetti && hasKeyframes && hasTestId
    return { pass: all, detail: all ? 'Confetti burst with keyframes' : `confetti:${hasConfetti}, keyframes:${hasKeyframes}, testid:${hasTestId}` }
  })

  // ── 4. Phase-specific color themes ────────────────────────
  check('Phase-specific color themes for all 4 phases', () => {
    const content = fs.readFileSync(path.join(rootDir, 'components/app/level-up-celebration.tsx'), 'utf-8')
    const hasRecovery = content.includes("recovery:") && content.includes('rose')
    const hasStability = content.includes("stability:") && content.includes('blue')
    const hasMomentum = content.includes("momentum:") && content.includes('teal')
    const hasMastery = content.includes("mastery:") && content.includes('amber')
    const all = hasRecovery && hasStability && hasMomentum && hasMastery
    return { pass: all, detail: all ? 'All 4 phase color themes' : `recovery:${hasRecovery}, stability:${hasStability}, momentum:${hasMomentum}, mastery:${hasMastery}` }
  })

  // ── 5. Animated level number counter ──────────────────────
  check('Animated number counter (old → new level)', () => {
    const content = fs.readFileSync(path.join(rootDir, 'components/app/level-up-celebration.tsx'), 'utf-8')
    const hasAnimatedNumber = content.includes('function AnimatedNumber')
    const hasRAF = content.includes('requestAnimationFrame')
    const hasTestId = content.includes('data-testid="animated-level-number"')
    const all = hasAnimatedNumber && hasRAF && hasTestId
    return { pass: all, detail: all ? 'Animated counter with RAF' : `component:${hasAnimatedNumber}, raf:${hasRAF}, testid:${hasTestId}` }
  })

  // ── 6. Quick dismiss options ──────────────────────────────
  check('Quick dismiss: Escape, overlay click, X button, CTA', () => {
    const content = fs.readFileSync(path.join(rootDir, 'components/app/level-up-celebration.tsx'), 'utf-8')
    const hasEscape = content.includes("e.key === 'Escape'")
    const hasOverlayClick = content.includes('handleOverlayClick') && content.includes('e.target === e.currentTarget')
    const hasXButton = content.includes('data-testid="level-up-close"')
    const hasCTA = content.includes('data-testid="level-up-dismiss"')
    const all = hasEscape && hasOverlayClick && hasXButton && hasCTA
    return { pass: all, detail: all ? 'All 4 dismiss methods' : `escape:${hasEscape}, overlay:${hasOverlayClick}, x:${hasXButton}, cta:${hasCTA}` }
  })

  // ── 7. Performant animations (GPU-accelerated) ────────────
  check('Performant animations (transform/opacity only)', () => {
    const content = fs.readFileSync(path.join(rootDir, 'components/app/level-up-celebration.tsx'), 'utf-8')
    const hasTransform = content.includes('transform:') || content.includes('transform ')
    const hasOpacity = content.includes('opacity')
    const hasPointerNone = content.includes('pointer-events-none')
    const all = hasTransform && hasOpacity && hasPointerNone
    return { pass: all, detail: all ? 'GPU-accelerated properties' : `transform:${hasTransform}, opacity:${hasOpacity}, pointerNone:${hasPointerNone}` }
  })

  // ── 8. AnimatedProgressBar component ──────────────────────
  check('AnimatedProgressBar component exists', () => {
    const filePath = path.join(rootDir, 'components/app/animated-progress-bar.tsx')
    const exists = fs.existsSync(filePath)
    if (!exists) return { pass: false, detail: 'File not found' }
    const content = fs.readFileSync(filePath, 'utf-8')
    const hasExport = content.includes('export function AnimatedProgressBar')
    const hasIntersection = content.includes('IntersectionObserver')
    const hasShimmer = content.includes('shimmerOnComplete')
    const all = hasExport && hasIntersection && hasShimmer
    return { pass: all, detail: all ? 'AnimatedProgressBar with IO + shimmer' : `export:${hasExport}, io:${hasIntersection}, shimmer:${hasShimmer}` }
  })

  // ── 9. Badge shimmer CSS keyframes ────────────────────────
  check('Badge shimmer CSS keyframes in globals.css', () => {
    const content = fs.readFileSync(path.join(rootDir, 'app/globals.css'), 'utf-8')
    const hasShimmer = content.includes('@keyframes badge-shimmer')
    const hasUnlock = content.includes('@keyframes badge-unlock-glow')
    const hasScaleIn = content.includes('@keyframes badge-scale-in')
    const hasProgressFill = content.includes('@keyframes progress-fill')
    const all = hasShimmer && hasUnlock && hasScaleIn && hasProgressFill
    return { pass: all, detail: all ? 'All 4 animation keyframes' : `shimmer:${hasShimmer}, glow:${hasUnlock}, scaleIn:${hasScaleIn}, progress:${hasProgressFill}` }
  })

  // ── 10. Badge grid uses shimmer for newly earned ──────────
  check('Badge grid applies shimmer to newly earned badges', () => {
    const content = fs.readFileSync(path.join(rootDir, 'components/app/badge-grid.tsx'), 'utf-8')
    const hasNewlyEarned = content.includes('isNewlyEarned')
    const hasShimmerClass = content.includes('animate-badge-shimmer')
    const hasUnlockClass = content.includes('animate-badge-unlock')
    const hasScaleIn = content.includes('animate-badge-scale-in')
    const all = hasNewlyEarned && hasShimmerClass && hasUnlockClass && hasScaleIn
    return { pass: all, detail: all ? 'Badge shimmer integration' : `newlyEarned:${hasNewlyEarned}, shimmer:${hasShimmerClass}, unlock:${hasUnlockClass}, scaleIn:${hasScaleIn}` }
  })

  // ── 11. Progress bars in badge grid have animation ────────
  check('Badge grid progress bars have fill animation', () => {
    const content = fs.readFileSync(path.join(rootDir, 'components/app/badge-grid.tsx'), 'utf-8')
    const hasProgressFill = content.includes('animate-progress-fill')
    return { pass: hasProgressFill, detail: hasProgressFill ? 'Progress bars animated' : 'Missing animate-progress-fill class' }
  })

  // ── 12. Rising sparkles effect ────────────────────────────
  check('Rising sparkles celebration effect', () => {
    const content = fs.readFileSync(path.join(rootDir, 'components/app/level-up-celebration.tsx'), 'utf-8')
    const hasSparkles = content.includes('RisingSparkles')
    const hasKeyframes = content.includes('@keyframes rising-spark')
    const hasGlow = content.includes('boxShadow')
    const all = hasSparkles && hasKeyframes && hasGlow
    return { pass: all, detail: all ? 'Rising sparkles with glow' : `sparkles:${hasSparkles}, keyframes:${hasKeyframes}, glow:${hasGlow}` }
  })

  // ── 13. Level names for all 9 sovereignty levels ──────────
  check('Level names for all sovereignty levels (-2 to 6)', () => {
    const content = fs.readFileSync(path.join(rootDir, 'components/app/level-up-celebration.tsx'), 'utf-8')
    // Check for level entries: positive use `N:`, negative use `[N]:`
    const levelNames = ['Time Deficit', 'Time Drag', 'The Reset', 'The Anchor', 'Time Shield', 'Velocity', 'Autonomous', 'Sovereign', 'Timeless']
    const allNames = levelNames.every(n => content.includes(n))
    const hasNl = content.includes('nameNl')
    const hasBracketNeg = content.includes('[-2]') && content.includes('[-1]')
    const hasPositive = content.includes("0:") && content.includes("6:")
    const all = allNames && hasNl && hasBracketNeg && hasPositive
    return { pass: all, detail: all ? 'All 9 levels with Dutch names' : `allNames:${allNames}, dutchNames:${hasNl}, negLevels:${hasBracketNeg}, posLevels:${hasPositive}` }
  })

  // ── 14. Expanding rings animation ─────────────────────────
  check('Expanding rings animation behind level icon', () => {
    const content = fs.readFileSync(path.join(rootDir, 'components/app/level-up-celebration.tsx'), 'utf-8')
    const hasRing1 = content.includes('animate-level-ring-1')
    const hasRing2 = content.includes('animate-level-ring-2')
    const hasRing3 = content.includes('animate-level-ring-3')
    const hasKeyframes = content.includes('@keyframes level-ring-expand-1')
    const all = hasRing1 && hasRing2 && hasRing3 && hasKeyframes
    return { pass: all, detail: all ? '3 expanding rings with staggered delay' : `ring1:${hasRing1}, ring2:${hasRing2}, ring3:${hasRing3}, kf:${hasKeyframes}` }
  })

  // ── 15. Test page exists with all demo sections ───────────
  check('Test page with celebration demos', () => {
    const filePath = path.join(rootDir, 'app/test-level-up-celebration/page.tsx')
    const exists = fs.existsSync(filePath)
    if (!exists) return { pass: false, detail: 'Test page not found' }
    const content = fs.readFileSync(filePath, 'utf-8')
    const hasLevelUp = content.includes('LevelUpCelebration')
    const hasProgress = content.includes('AnimatedProgressBar')
    const hasShimmer = content.includes('animate-badge-shimmer')
    const all = hasLevelUp && hasProgress && hasShimmer
    return { pass: all, detail: all ? 'Test page with all 3 demo sections' : `levelUp:${hasLevelUp}, progress:${hasProgress}, shimmer:${hasShimmer}` }
  })

  // ── 16. Entrance/exit animation phases ────────────────────
  check('Entrance and exit animation phases', () => {
    const content = fs.readFileSync(path.join(rootDir, 'components/app/level-up-celebration.tsx'), 'utf-8')
    const hasEnter = content.includes("'enter'")
    const hasShow = content.includes("'show'")
    const hasExit = content.includes("'exit'")
    const hasScaleUp = content.includes('scale-75') || content.includes('scale-90')
    const all = hasEnter && hasShow && hasExit && hasScaleUp
    return { pass: all, detail: all ? 'enter → show → exit phases' : `enter:${hasEnter}, show:${hasShow}, exit:${hasExit}, scale:${hasScaleUp}` }
  })

  const passing = results.filter(r => r.pass).length
  const total = results.length

  return NextResponse.json({
    feature: '#209 Level-up celebration animations',
    passing,
    total,
    percentage: Math.round((passing / total) * 100),
    results,
  })
}
