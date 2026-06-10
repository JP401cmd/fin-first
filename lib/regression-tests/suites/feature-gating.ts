// ── Feature Gating Regression Tests ──────────────────────────────────────────
// Tests for the feature-gating system: abonnement-gating (harde lock),
// user-toggles (default aan) en de feature registry. Sovereignty levels zijn
// puur motivatie-weergave en sturen geen toegang — zie sovereignty-levels.ts
// voor de level-berekening zelf.

import { registerCategory, registerTests } from '../test-registry'
import type { TestCase } from '../test-types'
import {
  assert,
  assertEqual,
  assertNotNull,
  assertGreaterThanOrEqual,
  assertIncludes,
} from '../assert'
import {
  computeFeatureAccess,
  isFeatureAccessible,
  getFeatureAccess,
  type FinancialInput,
} from '@/lib/compute-feature-access'
import {
  UNIFIED_FEATURES,
  LEGACY_FEATURE_MAP,
  WIDGET_TO_FEATURE,
  hasSubscription,
} from '@/lib/feature-registry'
import {
  computeSovereigntyLevel,
  levelToPhaseId,
  PHASES,
  FEATURES,
} from '@/lib/feature-phases'

const CAT = 'identiteit.feature-gating'

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
    userFeaturePrefs: null,
    ...overrides,
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: Default toegang — alle gratis features staan aan ──────────────

  {
    id: `${CAT}-default-access`,
    name: 'computeFeatureAccess: gratis features standaard toegankelijk, ongeacht fase',
    category: CAT,
    description: 'Zonder user-toggles zijn alle gratis features aan; sovereignty-fase heeft geen invloed',
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Recovery-gebruiker (negatief vermogen + consumptieve schuld)
      const recoveryResult = computeFeatureAccess(makeInput({
        assets: [{ current_value: 0 }],
        debts: [{ current_balance: 50000, debt_type: 'credit_card' }],
      }))
      assertEqual(recoveryResult.phase, 'recovery', 'phase')

      // Mastery-gebruiker
      const masteryResult = computeFeatureAccess(makeInput({
        assets: [{ current_value: 600000 }],
      }))
      assertEqual(masteryResult.phase, 'mastery', 'phase')

      // ALLE gratis features toegankelijk voor beide
      const gratisFeatures = UNIFIED_FEATURES.filter(f => f.requiredTier === 'gratis')
      for (const feat of gratisFeatures) {
        assert(recoveryResult.features[feat.id]?.accessible === true, `${feat.id} aan in recovery`)
        assert(masteryResult.features[feat.id]?.accessible === true, `${feat.id} aan in mastery`)
        assert(recoveryResult.features[feat.id]?.defaultEnabled === true, `${feat.id} defaultEnabled`)
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
      const { features } = computeFeatureAccess(makeInput())

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

  // ── Step 3: Widget-feature mapping ────────────────────────────────────────

  {
    id: `${CAT}-widget-feature-mapping`,
    name: 'Widget mapping: WIDGET_TO_FEATURE compleet voor alle feature-widget links',
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

  // ── Step 4: Sovereignty als motivatie-weergave ────────────────────────────

  {
    id: `${CAT}-sovereignty-level-computation`,
    name: 'Motivatie: computeSovereigntyLevel correct per financieel scenario',
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
    name: 'Motivatie: levelToPhaseId correct voor alle levels',
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

  // ── Step 5: Abonnement-gating (de enige harde lock) ───────────────────────

  {
    id: `${CAT}-subscription-tier-lock`,
    name: 'Subscription gating: connected/AI features locked zonder subscription',
    category: CAT,
    description: 'Features met requiredTier connected/ai zijn niet beschikbaar zonder subscription',
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // No subscriptions beyond gratis
      const result = computeFeatureAccess(makeInput({ activeSubscriptions: [] }))

      // Gratis features still accessible
      assert(result.features['vermogensbeheer']?.accessible === true, 'gratis feature accessible without sub')

      // Connected feature locked
      const bankAccess = result.features['bankintegratie']
      assertNotNull(bankAccess, 'bankintegratie in map')
      assert(!bankAccess.accessible, 'bankintegratie locked without connected sub')
      assertEqual(bankAccess.reason, 'tier_locked', 'bankintegratie reason')
      assertEqual(bankAccess.defaultEnabled, false, 'tier-locked → defaultEnabled false')

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
      const result = computeFeatureAccess(makeInput({ activeSubscriptions: ['connected', 'ai'] }))

      // Connected feature accessible
      assert(result.features['bankintegratie']?.accessible === true, 'bankintegratie accessible with connected sub')

      // AI feature accessible
      assert(result.features['ai_assistent']?.accessible === true, 'ai_assistent accessible with ai sub')

      // ALLE features toegankelijk met beide subs (geen andere gating-as meer)
      for (const feat of UNIFIED_FEATURES) {
        assert(result.features[feat.id]?.accessible === true, `${feat.id} accessible met alle subs`)
      }
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
      const result = computeFeatureAccess(makeInput({
        userFeaturePrefs: { vermogensbeheer: false },
      }))

      // Feature should show as not accessible due to user override
      const access = result.features['vermogensbeheer']
      assertNotNull(access, 'vermogensbeheer in map')
      assert(!access.accessible, 'vermogensbeheer disabled by user pref')
      assertEqual(access.reason, 'user_disabled', 'reason is user_disabled')
      assert(access.defaultEnabled === true, 'defaultEnabled still true')

      // Andere features onaangetast
      assert(result.features['budgetbeheer']?.accessible === true, 'budgetbeheer onaangetast')
    },
  },

  {
    id: `${CAT}-user-pref-no-tier-bypass`,
    name: 'User prefs: toggle kan abonnement-lock niet omzeilen',
    category: CAT,
    description: 'Een user-pref true op een tier-locked feature maakt deze niet toegankelijk',
    priority: 'critical',
    estimatedDurationMs: 30,
    fn() {
      const result = computeFeatureAccess(makeInput({
        activeSubscriptions: [],
        userFeaturePrefs: { ai_assistent: true, bankintegratie: true },
      }))

      // Subscription-check komt vóór user-prefs: blijft tier_locked
      assert(!result.features['ai_assistent']?.accessible, 'ai_assistent blijft locked')
      assertEqual(result.features['ai_assistent']?.reason, 'tier_locked', 'reason blijft tier_locked')
      assert(!result.features['bankintegratie']?.accessible, 'bankintegratie blijft locked')
    },
  },

  // ── Step 6: FEATURES / PHASES backward compat ─────────────────────────────

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
    description: 'Feature gating systeem: abonnement-gating, user-toggles, feature registry',
    icon: 'Lock',
    testCount: 0,
  })
  registerTests(tests)
}
