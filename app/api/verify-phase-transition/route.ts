import { computeFeatureAccess } from '@/lib/compute-feature-access'
import { computeSovereigntyLevel, levelToPhaseId, PHASES, FEATURES, DEFAULT_MATRIX } from '@/lib/feature-phases'
import * as fs from 'fs'
import * as path from 'path'

/**
 * GET /api/verify-phase-transition
 *
 * Verifies the phase transition celebration modal (Feature #193):
 * 1. PhaseTransitionModal component exists with required elements
 * 2. Sovereignty level increase detection works
 * 3. Congratulations message includes phase name
 * 4. Newly unlocked features listed with descriptions
 * 5. CTA button present
 * 6. Themed animation matching phase color
 * 7. Close button and overlay dismiss supported
 */
export async function GET() {
  const tests: { name: string; pass: boolean; detail: string }[] = []

  // ── Test 1: PhaseTransitionModal component exists with required structure
  {
    let modalSource = ''
    try {
      modalSource = fs.readFileSync(
        path.join(process.cwd(), 'components', 'app', 'phase-transition-modal.tsx'),
        'utf-8'
      )
    } catch {
      modalSource = ''
    }

    tests.push({
      name: 'PhaseTransitionModal component file exists',
      pass: modalSource.length > 0,
      detail: modalSource.length > 0 ? `${modalSource.length} chars` : 'File not found',
    })

    // Check for congratulations message with phase name
    const hasGefeliciteerd = modalSource.includes('Gefeliciteerd!')
    const hasPhaseNameInSubtitle = modalSource.includes('phaseLabelNl(newPhase)') || modalSource.includes('-fase')
    tests.push({
      name: 'Shows "Gefeliciteerd!" with phase name',
      pass: hasGefeliciteerd && hasPhaseNameInSubtitle,
      detail: `Gefeliciteerd: ${hasGefeliciteerd}, Phase name in subtitle: ${hasPhaseNameInSubtitle}`,
    })

    // Check for close button
    const hasCloseButton = modalSource.includes('phase-transition-close') || modalSource.includes('Sluiten')
    tests.push({
      name: 'Close button present (X icon)',
      pass: hasCloseButton,
      detail: `Close button: ${hasCloseButton}`,
    })

    // Check for overlay click dismiss
    const hasOverlayClick = modalSource.includes('handleOverlayClick') || modalSource.includes('e.target === e.currentTarget')
    tests.push({
      name: 'Overlay click dismiss supported',
      pass: hasOverlayClick,
      detail: `Overlay click: ${hasOverlayClick}`,
    })

    // Check for entrance animation
    const hasEntranceAnimation = modalSource.includes('transition-all') && (
      modalSource.includes('scale-100') || modalSource.includes('scale-90')
    )
    tests.push({
      name: 'Entrance animation (scale + fade)',
      pass: hasEntranceAnimation,
      detail: `Entrance animation: ${hasEntranceAnimation}`,
    })

    // Check for themed sparkle/celebration animation
    const hasSparkleAnimation = modalSource.includes('SparkleParticles') || modalSource.includes('sparkle')
    tests.push({
      name: 'Themed celebration animation (sparkle particles)',
      pass: hasSparkleAnimation,
      detail: `Sparkle animation: ${hasSparkleAnimation}`,
    })

    // Check for phase-themed colors
    const hasPhaseColors = modalSource.includes('PHASE_COLORS') && modalSource.includes('colors.gradient')
    tests.push({
      name: 'Phase-themed color gradients',
      pass: hasPhaseColors,
      detail: `Phase colors: ${hasPhaseColors}`,
    })

    // Check CTA button text
    const hasCTA = modalSource.includes('Ontdek je nieuwe mogelijkheden')
    tests.push({
      name: 'CTA button "Ontdek je nieuwe mogelijkheden"',
      pass: hasCTA,
      detail: `CTA: ${hasCTA}`,
    })

    // Check for data-testid attributes
    const hasTestIds = modalSource.includes('data-testid="phase-transition-modal"') &&
      modalSource.includes('data-testid="phase-transition-cta"') &&
      modalSource.includes('data-testid="phase-transition-close"')
    tests.push({
      name: 'Data-testid attributes for testing',
      pass: hasTestIds,
      detail: `TestIds: ${hasTestIds}`,
    })

    // Check for unlocked feature list with descriptions
    const hasFeatureList = modalSource.includes('Nieuw ontgrendeld') && modalSource.includes('f.description')
    tests.push({
      name: 'Unlocked features listed with descriptions',
      pass: hasFeatureList,
      detail: `Feature list: ${hasFeatureList}`,
    })
  }

  // ── Test 2: Phase transition detection in layout
  {
    let layoutSource = ''
    try {
      layoutSource = fs.readFileSync(
        path.join(process.cwd(), 'app', '(app)', 'layout.tsx'),
        'utf-8'
      )
    } catch {
      layoutSource = ''
    }

    const hasPhaseDetection = layoutSource.includes('phaseTransition') && layoutSource.includes('last_known_phase')
    const hasUpwardCheck = layoutSource.includes('newIndex > oldIndex')
    tests.push({
      name: 'Layout detects sovereignty level increase',
      pass: hasPhaseDetection && hasUpwardCheck,
      detail: `Phase detection: ${hasPhaseDetection}, Upward check: ${hasUpwardCheck}`,
    })
  }

  // ── Test 3: Newly unlocked features for each transition
  {
    // Recovery → Stability
    const recoveryToStability = FEATURES.filter(f =>
      DEFAULT_MATRIX[f.id]?.stability === true && !DEFAULT_MATRIX[f.id]?.recovery
    )
    tests.push({
      name: 'Recovery→Stability unlocks features with descriptions',
      pass: recoveryToStability.length > 0 && recoveryToStability.every(f => f.description.length > 0),
      detail: `${recoveryToStability.length} features: ${recoveryToStability.map(f => f.label).join(', ')}`,
    })

    // Stability → Momentum
    const stabilityToMomentum = FEATURES.filter(f =>
      DEFAULT_MATRIX[f.id]?.momentum === true && !DEFAULT_MATRIX[f.id]?.stability
    )
    tests.push({
      name: 'Stability→Momentum unlocks features with descriptions',
      pass: stabilityToMomentum.length > 0 && stabilityToMomentum.every(f => f.description.length > 0),
      detail: `${stabilityToMomentum.length} features: ${stabilityToMomentum.map(f => f.label).join(', ')}`,
    })

    // Momentum → Mastery
    const momentumToMastery = FEATURES.filter(f =>
      DEFAULT_MATRIX[f.id]?.mastery === true && !DEFAULT_MATRIX[f.id]?.momentum
    )
    tests.push({
      name: 'Momentum→Mastery unlocks features with descriptions',
      pass: momentumToMastery.length > 0 && momentumToMastery.every(f => f.description.length > 0),
      detail: `${momentumToMastery.length} features: ${momentumToMastery.map(f => f.label).join(', ')}`,
    })
  }

  // ── Test 4: Phase colors match all four phases
  {
    const allPhasesHaveColors = ['recovery', 'stability', 'momentum', 'mastery'].every(phase => {
      let modalSource = ''
      try {
        modalSource = fs.readFileSync(
          path.join(process.cwd(), 'components', 'app', 'phase-transition-modal.tsx'),
          'utf-8'
        )
      } catch {
        return false
      }
      return modalSource.includes(phase)
    })

    tests.push({
      name: 'All four phases have themed colors defined',
      pass: allPhasesHaveColors,
      detail: `recovery/stability/momentum/mastery all present: ${allPhasesHaveColors}`,
    })
  }

  // ── Test 5: Provider passes phaseTransition to modal
  {
    let providerSource = ''
    try {
      providerSource = fs.readFileSync(
        path.join(process.cwd(), 'components', 'app', 'feature-access-provider.tsx'),
        'utf-8'
      )
    } catch {
      providerSource = ''
    }

    const passesTransition = providerSource.includes('PhaseTransitionModal') && providerSource.includes('phaseTransition')
    tests.push({
      name: 'FeatureAccessProvider renders PhaseTransitionModal on transition',
      pass: passesTransition,
      detail: `Provider renders modal: ${passesTransition}`,
    })
  }

  const passing = tests.filter(t => t.pass).length
  const total = tests.length

  return Response.json({
    summary: `${passing}/${total} tests pass`,
    allPass: passing === total,
    tests,
  })
}
