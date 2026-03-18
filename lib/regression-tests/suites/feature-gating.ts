// ── Feature Gating & Sovereignty Levels Regression Tests ────────────────────
// Tests for the feature-gating system: sovereignty levels, phase requirements,
// widget min-levels, feature registry, and admin overrides.

import { registerCategory, registerTests } from '../test-registry'
import type { TestCase } from '../test-types'
import {
  assert,
  assertEqual,
  assertNotNull,
  assertGreaterThanOrEqual,
  assertLessThanOrEqual,
  assertIncludes,
  assertDefined,
} from '../assert'
import {
  computeFeatureAccess,
  isFeatureAccessible,
  getFeatureAccess,
  type FinancialInput,
  type FeatureAccessMap,
} from '@/lib/compute-feature-access'
import {
  UNIFIED_FEATURES,
  LEGACY_FEATURE_MAP,
  WIDGET_TO_FEATURE,
  hasSubscription,
  isPhaseSufficient,
  phaseIndex,
  type PhaseId,
} from '@/lib/feature-registry'
import {
  computeSovereigntyLevel,
  levelToPhaseId,
  PHASES,
  FEATURES,
  DEFAULT_MATRIX,
} from '@/lib/feature-phases'
import {
  WIDGET_CATALOG,
  deriveMinLevel,
  deriveRequiredPhase,
  WIDGET_FEATURE_MAP,
} from '@/lib/widget-catalog'

const CAT = 'identity-feature-gating'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Build a FinancialInput for computeFeatureAccess */
function makeInput(overrides: Partial<FinancialInput> = {}): FinancialInput {
  return {
    assets: [{ current_value: 100000 }],
    debts: [],
    transactions: [
      { amount: -2000, is_income: false },
      { amount: -1500, is_income: false },
      { amount: -1000, is_income: false },
    ],
    activeSubscriptions: ['gratis'],
    matrixJson: null,
    userFeaturePrefs: null,
    ...overrides,
  }
}

/** Build input that produces a specific sovereignty level */
function makeInputForLevel(targetLevel: number): FinancialInput {
  // monthlyExpenses = 4500/3 = 1500, yearlyExpenses = 18000
  const base = {
    transactions: [
      { amount: -2000, is_income: false },
      { amount: -1500, is_income: false },
      { amount: -1000, is_income: false },
    ],
    activeSubscriptions: ['gratis'] as string[],
    matrixJson: null,
    userFeaturePrefs: null,
  }

  switch (targetLevel) {
    case -2: // Time Deficit: negative net worth + consumer debt
      return { ...base, assets: [{ current_value: 0 }], debts: [{ current_balance: 50000, debt_type: 'credit_card' }] }
    case -1: // Negative net worth, no consumer debt
      return { ...base, assets: [{ current_value: 0 }], debts: [{ current_balance: 50000, debt_type: 'mortgage' }] }
    case 0: // Net worth ~0, less than 1 month covered
      return { ...base, assets: [{ current_value: 500 }], debts: [] }
    case 1: // 1-3 months covered
      return { ...base, assets: [{ current_value: 2000 }], debts: [] }
    case 2: // 3-6 months covered
      return { ...base, assets: [{ current_value: 5000 }], debts: [] }
    case 3: // Freedom 10-25%
      return { ...base, assets: [{ current_value: 70000 }], debts: [] }
    case 4: // Freedom 25-75%
      return { ...base, assets: [{ current_value: 200000 }], debts: [] }
    case 5: // Freedom 75-100%
      return { ...base, assets: [{ current_value: 400000 }], debts: [] }
    case 6: // Full independence (freedom >= 100%)
      return { ...base, assets: [{ current_value: 600000 }], debts: [] }
    default:
      return { ...base, assets: [{ current_value: 0 }], debts: [] }
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: computeFeatureAccess per sovereignty level ────────────────────

  {
    id: `${CAT}-recovery-gating`,
    name: 'computeFeatureAccess: Recovery fase (level -2..0) — alleen recovery features beschikbaar',
    category: CAT,
    description: 'In recovery fase zijn alleen features met defaultPhase=recovery ontgrendeld',
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const input = makeInputForLevel(-2) // Recovery level -2
      const result = computeFeatureAccess(input)
      assertEqual(result.phase, 'recovery', 'phase')
      assert(result.level <= 0, 'level should be <= 0 for recovery')

      // Recovery-phase features should be accessible
      const recoveryFeatures = UNIFIED_FEATURES.filter(f => f.defaultPhase === 'recovery' && f.requiredTier === 'gratis')
      for (const feat of recoveryFeatures) {
        const access = result.features[feat.id]
        assertNotNull(access, `feature ${feat.id}`)
        assert(access.accessible, `${feat.id} should be accessible in recovery`)
      }

      // Stability+ features should NOT be accessible (default)
      const stabilityFeatures = UNIFIED_FEATURES.filter(f => f.defaultPhase === 'stability' && f.requiredTier === 'gratis')
      for (const feat of stabilityFeatures) {
        const access = result.features[feat.id]
        assertNotNull(access, `feature ${feat.id}`)
        assert(!access.defaultEnabled, `${feat.id} should not be default-enabled in recovery`)
      }
    },
  },

  {
    id: `${CAT}-stability-gating`,
    name: 'computeFeatureAccess: Stability fase (level 1-2) — stability features ontgrendeld',
    category: CAT,
    description: 'In stability fase worden stability + recovery features ontgrendeld',
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const input = makeInputForLevel(2) // Stability level 2
      const result = computeFeatureAccess(input)
      assertEqual(result.phase, 'stability', 'phase')

      // Recovery + stability features should be accessible
      const allowedPhases: PhaseId[] = ['recovery', 'stability']
      const accessibleFeatures = UNIFIED_FEATURES.filter(
        f => allowedPhases.includes(f.defaultPhase) && f.requiredTier === 'gratis'
      )
      for (const feat of accessibleFeatures) {
        assert(result.features[feat.id]?.accessible === true, `${feat.id} should be accessible in stability`)
      }

      // Momentum features should NOT be accessible
      const momentumFeatures = UNIFIED_FEATURES.filter(f => f.defaultPhase === 'momentum' && f.requiredTier === 'gratis')
      for (const feat of momentumFeatures) {
        assert(!result.features[feat.id]?.defaultEnabled, `${feat.id} should not be default-enabled in stability`)
      }
    },
  },

  {
    id: `${CAT}-momentum-gating`,
    name: 'computeFeatureAccess: Momentum fase (level 3-4) — momentum features ontgrendeld',
    category: CAT,
    description: 'In momentum fase worden recovery + stability + momentum features ontgrendeld',
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const input = makeInputForLevel(3) // Momentum level 3
      const result = computeFeatureAccess(input)
      assertEqual(result.phase, 'momentum', 'phase')

      // Recovery + stability + momentum features should be accessible
      const allowedPhases: PhaseId[] = ['recovery', 'stability', 'momentum']
      const accessibleFeatures = UNIFIED_FEATURES.filter(
        f => allowedPhases.includes(f.defaultPhase) && f.requiredTier === 'gratis'
      )
      for (const feat of accessibleFeatures) {
        assert(result.features[feat.id]?.accessible === true, `${feat.id} should be accessible in momentum`)
      }

      // Mastery features should NOT be accessible
      const masteryFeatures = UNIFIED_FEATURES.filter(f => f.defaultPhase === 'mastery' && f.requiredTier === 'gratis')
      for (const feat of masteryFeatures) {
        assert(!result.features[feat.id]?.defaultEnabled, `${feat.id} should not be default-enabled in momentum`)
      }
    },
  },

  {
    id: `${CAT}-mastery-gating`,
    name: 'computeFeatureAccess: Mastery fase (level 5-6) — alle features ontgrendeld',
    category: CAT,
    description: 'In mastery fase zijn alle gratis features ontgrendeld',
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const input = makeInputForLevel(6) // Mastery level 6
      const result = computeFeatureAccess(input)
      assertEqual(result.phase, 'mastery', 'phase')

      // ALL gratis features should be accessible
      const gratisFeatures = UNIFIED_FEATURES.filter(f => f.requiredTier === 'gratis')
      for (const feat of gratisFeatures) {
        assert(result.features[feat.id]?.accessible === true, `${feat.id} should be accessible in mastery`)
        assert(result.features[feat.id]?.defaultEnabled === true, `${feat.id} should be default-enabled in mastery`)
      }
    },
  },

  // ── Step 2: Feature registry ──────────────────────────────────────────────

  {
    id: `${CAT}-unified-features-count`,
    name: 'Feature registry: alle unified features correct geregistreerd',
    category: CAT,
    description: 'UNIFIED_FEATURES bevat het verwachte aantal features met correcte structuur',
    priority: 'critical',
    estimatedDurationMs: 30,
    fn() {
      // The spec says 16 features but registry has 18 (includes ai_briefing + ai_nieuws)
      assertGreaterThanOrEqual(UNIFIED_FEATURES.length, 16, 'at least 16 unified features')

      // Each feature has required fields
      for (const feat of UNIFIED_FEATURES) {
        assertNotNull(feat.id, `feature id`)
        assertNotNull(feat.label, `feature ${feat.id} label`)
        assertNotNull(feat.description, `feature ${feat.id} description`)
        assertNotNull(feat.module, `feature ${feat.id} module`)
        assertNotNull(feat.requiredTier, `feature ${feat.id} requiredTier`)
        assertNotNull(feat.defaultPhase, `feature ${feat.id} defaultPhase`)
        assert(Array.isArray(feat.widgets), `${feat.id} widgets should be array`)
        assert(Array.isArray(feat.legacyIds), `${feat.id} legacyIds should be array`)
      }

      // Check expected tiers
      const gratisFeat = UNIFIED_FEATURES.filter(f => f.requiredTier === 'gratis')
      const connectedFeat = UNIFIED_FEATURES.filter(f => f.requiredTier === 'connected')
      const aiFeat = UNIFIED_FEATURES.filter(f => f.requiredTier === 'ai')
      assertGreaterThanOrEqual(gratisFeat.length, 11, 'at least 11 gratis features')
      assertGreaterThanOrEqual(connectedFeat.length, 1, 'at least 1 connected feature')
      assertGreaterThanOrEqual(aiFeat.length, 4, 'at least 4 AI features')
    },
  },

  {
    id: `${CAT}-legacy-mapping`,
    name: 'Feature registry: legacy feature mapping werkt correct',
    category: CAT,
    description: 'LEGACY_FEATURE_MAP koppelt oude feature IDs aan unified feature IDs',
    priority: 'high',
    estimatedDurationMs: 30,
    fn() {
      // Legacy map should have entries
      const legacyKeys = Object.keys(LEGACY_FEATURE_MAP)
      assertGreaterThanOrEqual(legacyKeys.length, 20, 'at least 20 legacy mappings')

      // Each legacy ID should map to a valid unified feature
      const unifiedIds = new Set(UNIFIED_FEATURES.map(f => f.id))
      for (const [legacyId, unifiedId] of Object.entries(LEGACY_FEATURE_MAP)) {
        assert(unifiedIds.has(unifiedId), `legacy ${legacyId} maps to valid unified ${unifiedId}`)
      }

      // Spot-check known mappings
      assertEqual(LEGACY_FEATURE_MAP['widget_assets'], 'vermogensbeheer', 'widget_assets → vermogensbeheer')
      assertEqual(LEGACY_FEATURE_MAP['fire_projecties'], 'fire_projecties', 'fire_projecties → fire_projecties')
      assertEqual(LEGACY_FEATURE_MAP['ai_chat'], 'ai_assistent', 'ai_chat → ai_assistent')
      assertEqual(LEGACY_FEATURE_MAP['bank_connection'], 'bankintegratie', 'bank_connection → bankintegratie')
    },
  },

  {
    id: `${CAT}-legacy-access-resolution`,
    name: 'Feature registry: isFeatureAccessible resolveert legacy IDs',
    category: CAT,
    description: 'isFeatureAccessible werkt met zowel unified als legacy feature IDs',
    priority: 'high',
    estimatedDurationMs: 30,
    fn() {
      const input = makeInputForLevel(6) // Mastery: all gratis accessible
      const { features } = computeFeatureAccess(input)

      // Unified ID
      assert(isFeatureAccessible(features, 'vermogensbeheer'), 'unified ID vermogensbeheer')

      // Legacy ID
      assert(isFeatureAccessible(features, 'widget_assets'), 'legacy ID widget_assets')

      // Unknown ID → fail-open
      assert(isFeatureAccessible(features, 'nonexistent_feature_xyz'), 'unknown ID fail-open')

      // getFeatureAccess for unified
      const access = getFeatureAccess(features, 'vermogensbeheer')
      assertNotNull(access, 'getFeatureAccess unified')
      assertEqual(access.accessible, true, 'unified accessible')

      // getFeatureAccess for legacy
      const legacyAccess = getFeatureAccess(features, 'widget_assets')
      assertNotNull(legacyAccess, 'getFeatureAccess legacy')

      // getFeatureAccess for unknown
      const unknownAccess = getFeatureAccess(features, 'nonexistent_xyz')
      assertEqual(unknownAccess, null, 'getFeatureAccess unknown returns null')
    },
  },

  // ── Step 3: Widget min-levels ─────────────────────────────────────────────

  {
    id: `${CAT}-widget-min-levels`,
    name: 'Widget min-levels: elk van de widgets heeft een correct minimum level',
    category: CAT,
    description: 'WIDGET_CATALOG widgets met feature mapping krijgen minLevel van DEFAULT_MATRIX',
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Widget catalog should have the expected number of widgets
      assertGreaterThanOrEqual(WIDGET_CATALOG.length, 40, 'at least 40 widgets')

      for (const widget of WIDGET_CATALOG) {
        // minLevel should be a valid sovereignty level (-2..6)
        assertGreaterThanOrEqual(widget.minLevel, -2, `${widget.id} minLevel >= -2`)
        assertLessThanOrEqual(widget.minLevel, 6, `${widget.id} minLevel <= 6`)
      }

      // Widgets with feature mapping should have derived minLevel
      for (const widget of WIDGET_CATALOG) {
        const featureId = WIDGET_FEATURE_MAP[widget.id]
        if (featureId) {
          const derivedLevel = deriveMinLevel(featureId)
          assertEqual(widget.minLevel, derivedLevel, `${widget.id} minLevel matches derived`)
        }
      }
    },
  },

  {
    id: `${CAT}-widget-feature-mapping`,
    name: 'Widget min-levels: WIDGET_TO_FEATURE compleet voor alle feature-widget links',
    category: CAT,
    description: 'Elke widget in UNIFIED_FEATURES.widgets staat in WIDGET_TO_FEATURE',
    priority: 'high',
    estimatedDurationMs: 30,
    fn() {
      // Every widget listed in UNIFIED_FEATURES should be in WIDGET_TO_FEATURE
      for (const feat of UNIFIED_FEATURES) {
        for (const widgetId of feat.widgets) {
          assertEqual(
            WIDGET_TO_FEATURE[widgetId],
            feat.id,
            `widget ${widgetId} → feature ${feat.id}`,
          )
        }
      }

      // Spot-check specific mappings
      assertEqual(WIDGET_TO_FEATURE['fire_prognose'], 'fire_projecties', 'fire_prognose mapping')
      assertEqual(WIDGET_TO_FEATURE['monte_carlo'], 'simulaties', 'monte_carlo mapping')
      assertEqual(WIDGET_TO_FEATURE['ai_inzicht'], 'ai_assistent', 'ai_inzicht mapping')
    },
  },

  // ── Step 4: deriveMinLevel and deriveRequiredPhase ────────────────────────

  {
    id: `${CAT}-derive-min-level`,
    name: 'deriveMinLevel: correcte afleiding van sovereignty level per feature',
    category: CAT,
    description: 'deriveMinLevel geeft het laagste sovereignty level terug waarop een feature beschikbaar is',
    priority: 'high',
    estimatedDurationMs: 30,
    fn() {
      // Recovery features: minLevel = -2 (available from lowest level)
      assertEqual(deriveMinLevel('vermogensbeheer'), -2, 'vermogensbeheer recovery → -2')
      assertEqual(deriveMinLevel('doelen'), -2, 'doelen recovery → -2')

      // Stability features: minLevel = 1 (first stability level)
      assertEqual(deriveMinLevel('cashflow'), 1, 'cashflow stability → 1')
      assertEqual(deriveMinLevel('belasting'), 1, 'belasting stability → 1')

      // Momentum features: minLevel = 3 (first momentum level)
      assertEqual(deriveMinLevel('simulaties'), 3, 'simulaties momentum → 3')
      assertEqual(deriveMinLevel('data_export'), 3, 'data_export momentum → 3')

      // Mastery features: minLevel = 5 (first mastery level)
      assertEqual(deriveMinLevel('fire_planning'), 5, 'fire_planning mastery → 5')

      // Unknown feature: returns -2
      assertEqual(deriveMinLevel('nonexistent_xyz'), -2, 'unknown feature → -2')
    },
  },

  {
    id: `${CAT}-derive-required-phase`,
    name: 'deriveRequiredPhase: correcte fase-label per feature',
    category: CAT,
    description: 'deriveRequiredPhase geeft het fase-label terug (of undefined voor recovery)',
    priority: 'high',
    estimatedDurationMs: 30,
    fn() {
      // Recovery features: undefined (always available)
      assertEqual(deriveRequiredPhase('vermogensbeheer'), undefined, 'recovery → undefined')
      assertEqual(deriveRequiredPhase('doelen'), undefined, 'doelen recovery → undefined')

      // Stability features: 'Stability'
      assertEqual(deriveRequiredPhase('cashflow'), 'Stability', 'cashflow → Stability')
      assertEqual(deriveRequiredPhase('fire_projecties'), 'Stability', 'fire_projecties → Stability')

      // Momentum features: 'Momentum'
      assertEqual(deriveRequiredPhase('simulaties'), 'Momentum', 'simulaties → Momentum')

      // Mastery features: 'Mastery'
      assertEqual(deriveRequiredPhase('fire_planning'), 'Mastery', 'fire_planning → Mastery')

      // Unknown feature: undefined
      assertEqual(deriveRequiredPhase('nonexistent_xyz'), undefined, 'unknown → undefined')
    },
  },

  // ── Step 5: Phase transition ──────────────────────────────────────────────

  {
    id: `${CAT}-phase-transition-unlock`,
    name: 'Fase transitie: level 1→2 ontgrendelt stability features',
    category: CAT,
    description: 'Bij overgang van recovery naar stability worden nieuwe features beschikbaar',
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Level 0 = recovery, cashflow (stability) should not be accessible
      const recoveryInput = makeInputForLevel(0)
      const recoveryResult = computeFeatureAccess(recoveryInput)
      assertEqual(recoveryResult.phase, 'recovery', 'phase at level 0')
      assert(!recoveryResult.features['cashflow']?.accessible, 'cashflow locked in recovery')

      // Level 1 = stability, cashflow should now be accessible
      const stabilityInput = makeInputForLevel(1)
      const stabilityResult = computeFeatureAccess(stabilityInput)
      assertEqual(stabilityResult.phase, 'stability', 'phase at level 1')
      assert(stabilityResult.features['cashflow']?.accessible === true, 'cashflow unlocked in stability')

      // Level 2 = still stability, same access
      const stability2Input = makeInputForLevel(2)
      const stability2Result = computeFeatureAccess(stability2Input)
      assertEqual(stability2Result.phase, 'stability', 'phase at level 2')
      assert(stability2Result.features['cashflow']?.accessible === true, 'cashflow still accessible at level 2')
    },
  },

  {
    id: `${CAT}-sovereignty-level-computation`,
    name: 'Fase transitie: computeSovereigntyLevel correct per financieel scenario',
    category: CAT,
    description: 'Sovereignty level berekening voor alle 9 levels (-2 tot 6)',
    priority: 'high',
    estimatedDurationMs: 30,
    fn() {
      const exp = 1500 // monthlyExpenses

      // Level -2: negative net worth + consumer debt
      assertEqual(computeSovereigntyLevel(-50000, exp, 0, true), -2, 'level -2')

      // Level -1: negative net worth, no consumer debt
      assertEqual(computeSovereigntyLevel(-50000, exp, 0, false), -1, 'level -1')

      // Level 0: near zero (< 1 month)
      assertEqual(computeSovereigntyLevel(500, exp, 0, false), 0, 'level 0')

      // Level 1: 1-3 months covered
      assertEqual(computeSovereigntyLevel(2000, exp, 0, false), 1, 'level 1')

      // Level 2: 3-6 months covered
      assertEqual(computeSovereigntyLevel(5000, exp, 5, false), 2, 'level 2')

      // Level 3: freedom 10-25%
      assertEqual(computeSovereigntyLevel(50000, exp, 15, false), 3, 'level 3')

      // Level 4: freedom 25-75%
      assertEqual(computeSovereigntyLevel(200000, exp, 50, false), 4, 'level 4')

      // Level 5: freedom 75-100%
      assertEqual(computeSovereigntyLevel(400000, exp, 85, false), 5, 'level 5')

      // Level 6: freedom >= 100%
      assertEqual(computeSovereigntyLevel(600000, exp, 110, false), 6, 'level 6')
    },
  },

  {
    id: `${CAT}-level-to-phase-mapping`,
    name: 'Fase transitie: levelToPhaseId correct voor alle levels',
    category: CAT,
    description: 'Elk sovereignty level mapt naar de correcte fase',
    priority: 'high',
    estimatedDurationMs: 20,
    fn() {
      // Recovery: -2, -1, 0
      assertEqual(levelToPhaseId(-2), 'recovery', '-2 → recovery')
      assertEqual(levelToPhaseId(-1), 'recovery', '-1 → recovery')
      assertEqual(levelToPhaseId(0), 'recovery', '0 → recovery')

      // Stability: 1, 2
      assertEqual(levelToPhaseId(1), 'stability', '1 → stability')
      assertEqual(levelToPhaseId(2), 'stability', '2 → stability')

      // Momentum: 3, 4
      assertEqual(levelToPhaseId(3), 'momentum', '3 → momentum')
      assertEqual(levelToPhaseId(4), 'momentum', '4 → momentum')

      // Mastery: 5, 6
      assertEqual(levelToPhaseId(5), 'mastery', '5 → mastery')
      assertEqual(levelToPhaseId(6), 'mastery', '6 → mastery')

      // Out of range: defaults to recovery
      assertEqual(levelToPhaseId(99), 'recovery', '99 → recovery (fallback)')
    },
  },

  {
    id: `${CAT}-phase-ordering`,
    name: 'Fase transitie: isPhaseSufficient volgorde correct',
    category: CAT,
    description: 'Phase ordering: recovery < stability < momentum < mastery',
    priority: 'medium',
    estimatedDurationMs: 20,
    fn() {
      // Same phase = sufficient
      assert(isPhaseSufficient('recovery', 'recovery'), 'recovery >= recovery')
      assert(isPhaseSufficient('stability', 'stability'), 'stability >= stability')
      assert(isPhaseSufficient('mastery', 'mastery'), 'mastery >= mastery')

      // Higher phase = sufficient
      assert(isPhaseSufficient('stability', 'recovery'), 'stability >= recovery')
      assert(isPhaseSufficient('momentum', 'stability'), 'momentum >= stability')
      assert(isPhaseSufficient('mastery', 'recovery'), 'mastery >= recovery')

      // Lower phase = NOT sufficient
      assert(!isPhaseSufficient('recovery', 'stability'), 'recovery < stability')
      assert(!isPhaseSufficient('stability', 'momentum'), 'stability < momentum')
      assert(!isPhaseSufficient('momentum', 'mastery'), 'momentum < mastery')
    },
  },

  // ── Step 6: Admin override / subscription gating ──────────────────────────

  {
    id: `${CAT}-admin-matrix-override`,
    name: 'Admin override: matrixJson overschrijft defaultPhase',
    category: CAT,
    description: 'Admin kan via matrixJson features eerder beschikbaar maken',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // Without override: fire_planning (mastery) not accessible in recovery
      const baseInput = makeInputForLevel(0) // Recovery
      const baseResult = computeFeatureAccess(baseInput)
      assert(!baseResult.features['fire_planning']?.accessible, 'fire_planning locked without override')

      // With admin override: unlock fire_planning in recovery
      const overrideInput = makeInputForLevel(0)
      overrideInput.matrixJson = JSON.stringify({ fire_planning: { unlockPhase: 'recovery' } })
      const overrideResult = computeFeatureAccess(overrideInput)
      assert(overrideResult.features['fire_planning']?.accessible === true, 'fire_planning unlocked with admin override')
    },
  },

  {
    id: `${CAT}-subscription-tier-lock`,
    name: 'Subscription gating: connected/AI features locked zonder subscription',
    category: CAT,
    description: 'Features met requiredTier connected/ai zijn niet beschikbaar zonder subscription',
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // No subscriptions beyond gratis
      const input = makeInputForLevel(6) // Mastery level
      input.activeSubscriptions = [] // No subs at all
      const result = computeFeatureAccess(input)

      // Gratis features still accessible
      assert(result.features['vermogensbeheer']?.accessible === true, 'gratis feature accessible without sub')

      // Connected feature locked
      const bankAccess = result.features['bankintegratie']
      assertNotNull(bankAccess, 'bankintegratie in map')
      assert(!bankAccess.accessible, 'bankintegratie locked without connected sub')
      assertEqual(bankAccess.reason, 'tier_locked', 'bankintegratie reason')

      // AI feature locked
      const aiAccess = result.features['ai_assistent']
      assertNotNull(aiAccess, 'ai_assistent in map')
      assert(!aiAccess.accessible, 'ai_assistent locked without ai sub')
      assertEqual(aiAccess.reason, 'tier_locked', 'ai_assistent reason')
    },
  },

  {
    id: `${CAT}-subscription-unlock`,
    name: 'Subscription gating: connected/AI features ontgrendeld met subscription',
    category: CAT,
    description: 'Met de juiste subscription worden connected/ai features beschikbaar',
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // With both connected + ai subscriptions
      const input = makeInputForLevel(6) // Mastery
      input.activeSubscriptions = ['connected', 'ai']
      const result = computeFeatureAccess(input)

      // Connected feature accessible
      assert(result.features['bankintegratie']?.accessible === true, 'bankintegratie accessible with connected sub')

      // AI feature accessible (mastery phase covers all default phases)
      assert(result.features['ai_assistent']?.accessible === true, 'ai_assistent accessible with ai sub')
    },
  },

  {
    id: `${CAT}-user-pref-override`,
    name: 'User prefs: gebruiker kan feature uitschakelen',
    category: CAT,
    description: 'userFeaturePrefs kan een default-enabled feature uitschakelen',
    priority: 'high',
    estimatedDurationMs: 30,
    fn() {
      // Vermogensbeheer is always accessible in any phase
      const input = makeInputForLevel(6) // Mastery
      input.userFeaturePrefs = { vermogensbeheer: false }
      const result = computeFeatureAccess(input)

      // Feature should show as not accessible due to user override
      const access = result.features['vermogensbeheer']
      assertNotNull(access, 'vermogensbeheer in map')
      assert(!access.accessible, 'vermogensbeheer disabled by user pref')
      assertEqual(access.reason, 'user_disabled', 'reason is user_disabled')
      assert(access.defaultEnabled === true, 'defaultEnabled still true')
    },
  },

  // ── Step 7: DEFAULT_MATRIX and FEATURES backward compat ───────────────────

  {
    id: `${CAT}-default-matrix-completeness`,
    name: 'DEFAULT_MATRIX: alle unified + legacy IDs aanwezig',
    category: CAT,
    description: 'DEFAULT_MATRIX bevat entries voor alle unified feature IDs en hun legacy IDs',
    priority: 'medium',
    estimatedDurationMs: 30,
    fn() {
      for (const feat of UNIFIED_FEATURES) {
        // Unified ID in matrix
        assertDefined(DEFAULT_MATRIX[feat.id], `matrix has ${feat.id}`)

        // Legacy IDs in matrix
        for (const legacyId of feat.legacyIds) {
          assertDefined(DEFAULT_MATRIX[legacyId], `matrix has legacy ${legacyId}`)
        }

        // Phase booleans correct
        const row = DEFAULT_MATRIX[feat.id]
        for (const phase of PHASES) {
          const expected = isPhaseSufficient(phase.id as PhaseId, feat.defaultPhase)
          assertEqual(row[phase.id], expected, `${feat.id} x ${phase.id}`)
        }
      }
    },
  },

  {
    id: `${CAT}-features-backward-compat`,
    name: 'FEATURES array: bevat unified + legacy feature defs',
    category: CAT,
    description: 'FEATURES (backward compat) bevat alle unified IDs plus hun legacy IDs',
    priority: 'medium',
    estimatedDurationMs: 30,
    fn() {
      const featureIds = new Set(FEATURES.map(f => f.id))

      // All unified IDs present
      for (const feat of UNIFIED_FEATURES) {
        assert(featureIds.has(feat.id), `FEATURES has unified ${feat.id}`)
      }

      // All legacy IDs present
      for (const [legacyId] of Object.entries(LEGACY_FEATURE_MAP)) {
        assert(featureIds.has(legacyId), `FEATURES has legacy ${legacyId}`)
      }

      // Total should be unified + legacy (minus duplicates)
      assertGreaterThanOrEqual(FEATURES.length, UNIFIED_FEATURES.length, 'FEATURES >= UNIFIED_FEATURES count')
    },
  },

  {
    id: `${CAT}-phases-definition`,
    name: 'PHASES: 4 fasen met correcte level ranges',
    category: CAT,
    description: 'PHASES bevat recovery, stability, momentum, mastery met juiste levels',
    priority: 'medium',
    estimatedDurationMs: 20,
    fn() {
      assertEqual(PHASES.length, 4, '4 phases')

      // Check phase definitions
      const recovery = PHASES.find(p => p.id === 'recovery')
      assertNotNull(recovery, 'recovery exists')
      assertIncludes(recovery.levels, -2, 'recovery includes -2')
      assertIncludes(recovery.levels, -1, 'recovery includes -1')
      assertIncludes(recovery.levels, 0, 'recovery includes 0')

      const stability = PHASES.find(p => p.id === 'stability')
      assertNotNull(stability, 'stability exists')
      assertIncludes(stability.levels, 1, 'stability includes 1')
      assertIncludes(stability.levels, 2, 'stability includes 2')

      const momentum = PHASES.find(p => p.id === 'momentum')
      assertNotNull(momentum, 'momentum exists')
      assertIncludes(momentum.levels, 3, 'momentum includes 3')
      assertIncludes(momentum.levels, 4, 'momentum includes 4')

      const mastery = PHASES.find(p => p.id === 'mastery')
      assertNotNull(mastery, 'mastery exists')
      assertIncludes(mastery.levels, 5, 'mastery includes 5')
      assertIncludes(mastery.levels, 6, 'mastery includes 6')

      // All levels -2..6 covered
      const allLevels = PHASES.flatMap(p => p.levels).sort((a, b) => a - b)
      for (let i = -2; i <= 6; i++) {
        assertIncludes(allLevels, i, `level ${i} covered`)
      }
    },
  },

  {
    id: `${CAT}-hasSubscription-helper`,
    name: 'hasSubscription: gratis altijd true, connected/ai alleen met actieve sub',
    category: CAT,
    description: 'hasSubscription helper controleert subscription array correct',
    priority: 'medium',
    estimatedDurationMs: 20,
    fn() {
      // Gratis always true regardless of active subs
      assert(hasSubscription([], 'gratis'), 'gratis with empty array')
      assert(hasSubscription(['connected'], 'gratis'), 'gratis with connected')

      // Connected requires connected in array
      assert(hasSubscription(['connected'], 'connected'), 'connected with connected')
      assert(!hasSubscription([], 'connected'), 'connected with empty')
      assert(!hasSubscription(['ai'], 'connected'), 'connected not in [ai]')

      // AI requires ai in array
      assert(hasSubscription(['ai'], 'ai'), 'ai with ai')
      assert(!hasSubscription([], 'ai'), 'ai with empty')
      assert(!hasSubscription(['connected'], 'ai'), 'ai not in [connected]')
    },
  },

  {
    id: `${CAT}-edge-zero-expenses`,
    name: 'Edge case: monthlyExpenses = 0 geeft level 0',
    category: CAT,
    description: 'Als er geen uitgaven zijn, is sovereignty level 0',
    priority: 'medium',
    estimatedDurationMs: 20,
    fn() {
      // Zero expenses
      assertEqual(computeSovereigntyLevel(100000, 0, 0, false), 0, 'zero expenses → level 0')

      // Negative expenses (edge case)
      assertEqual(computeSovereigntyLevel(100000, -100, 0, false), 0, 'negative expenses → level 0')
    },
  },
]

// ── Registration ────────────────────────────────────────────────────────────

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Identiteit — Feature Gating',
    description: 'Feature gating systeem: sovereignty levels, fase-vereisten, widget min-levels, feature registry',
    icon: 'Lock',
    testCount: 0,
  })
  registerTests(tests)
}
