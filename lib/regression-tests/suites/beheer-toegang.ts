import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual, assertGreaterThanOrEqual } from '../assert'
import type { TestCase } from '../test-types'
import {
  UNIFIED_FEATURES,
  isPhaseSufficient,
  type PhaseId,
  type CommercialTier,
} from '@/lib/feature-registry'
import { PHASES } from '@/lib/feature-phases'
import { TIERS } from '@/lib/tier-config'
import { computeFeatureAccess, type FinancialInput } from '@/lib/compute-feature-access'

const CAT = 'beheer-toegang'

const PHASE_IDS: PhaseId[] = ['recovery', 'stability', 'momentum', 'mastery']
const TIER_IDS: CommercialTier[] = ['gratis', 'connected', 'ai']

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a FinancialInput fixture for computeFeatureAccess tests */
function makeFinancialInput(overrides?: Partial<FinancialInput>): FinancialInput {
  return {
    assets: [{ current_value: 100_000 }],
    debts: [],
    transactions: [
      { amount: -2000, is_income: false },
      { amount: -2000, is_income: false },
      { amount: -2000, is_income: false },
    ],
    activeSubscriptions: ['connected', 'ai'],
    matrixJson: null,
    userFeaturePrefs: null,
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: GET /api/admin/feature-access ──────────────────────────────────
  {
    id: 'toegang-api-get-feature-access',
    name: 'GET /api/admin/feature-access: ophalen feature overrides',
    category: CAT,
    description: 'API retourneert features array en overrides object',
    priority: 'critical',
    estimatedDurationMs: 2000,
    async fn() {
      // Without admin auth, we expect 403 or redirect
      const res = await fetch('/api/admin/feature-access')
      // Should be 403 (forbidden) since we may not be logged in as admin
      // Or 307 redirect if middleware catches first
      // The key is it should not return 200 without admin auth
      // In the regression test runner context (logged-in admin), it may succeed
      if (res.ok) {
        const data = await res.json()
        // Verify response structure
        assert(
          Array.isArray(data.features),
          `Expected features array, got ${typeof data.features}`,
        )
        assert(
          typeof data.overrides === 'object' && data.overrides !== null,
          `Expected overrides object, got ${typeof data.overrides}`,
        )
        // Each feature should have effectivePhase and hasOverride
        for (const f of data.features) {
          assert(typeof f.id === 'string', `Feature missing id`)
          assert(typeof f.effectivePhase === 'string', `Feature ${f.id} missing effectivePhase`)
          assert(typeof f.hasOverride === 'boolean', `Feature ${f.id} missing hasOverride`)
          assert(PHASE_IDS.includes(f.effectivePhase), `Feature ${f.id} has invalid effectivePhase: ${f.effectivePhase}`)
        }
      } else {
        // 403 or redirect is acceptable (no admin session in test context)
        assert(
          res.status === 403 || res.status === 307 || res.status === 302 || res.status === 401,
          `Expected 403/401/redirect for non-admin, got ${res.status}`,
        )
      }
    },
  },

  // ── Step 2: Feature access matrix dimensions ──────────────────────────────
  {
    id: 'toegang-matrix-dimensions',
    name: 'Feature matrix: UNIFIED_FEATURES × 4 fases',
    category: CAT,
    description: 'Matrix bevat alle unified features met 4 fase-kolommen',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Verify we have the expected number of unified features
      assertGreaterThanOrEqual(
        UNIFIED_FEATURES.length,
        16,
        `Expected at least 16 unified features`,
      )

      // Verify 4 phases exist
      assertEqual(PHASES.length, 4, 'Expected 4 phases')
      assertEqual(PHASE_IDS[0], 'recovery', 'Phase 0')
      assertEqual(PHASE_IDS[1], 'stability', 'Phase 1')
      assertEqual(PHASE_IDS[2], 'momentum', 'Phase 2')
      assertEqual(PHASE_IDS[3], 'mastery', 'Phase 3')

      // Verify every feature has a valid defaultPhase
      for (const feat of UNIFIED_FEATURES) {
        assert(
          PHASE_IDS.includes(feat.defaultPhase),
          `Feature ${feat.id} has invalid defaultPhase: ${feat.defaultPhase}`,
        )
      }

      // Verify each feature × phase combination can be computed
      for (const feat of UNIFIED_FEATURES) {
        for (const phase of PHASE_IDS) {
          const enabled = isPhaseSufficient(phase, feat.defaultPhase)
          assert(
            typeof enabled === 'boolean',
            `isPhaseSufficient(${phase}, ${feat.defaultPhase}) did not return boolean`,
          )
        }
      }
    },
  },

  // ── Step 3: Phase override via computeFeatureAccess ────────────────────────
  {
    id: 'toegang-phase-override',
    name: 'Fase override: feature per fase in/uitschakelen via matrixJson',
    category: CAT,
    description: 'Admin override via matrixJson wijzigt effectieve fase in computeFeatureAccess',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Pick a 'gratis' feature with defaultPhase 'stability' (cashflow)
      const feat = UNIFIED_FEATURES.find(f => f.id === 'cashflow')
      assert(!!feat, 'cashflow feature not found')
      assertEqual(feat!.defaultPhase, 'stability', 'cashflow defaultPhase should be stability')

      // Without override: recovery user should NOT have access to cashflow
      const noOverride = computeFeatureAccess(makeFinancialInput({
        assets: [{ current_value: 500 }],  // low net worth → recovery
        matrixJson: null,
      }))
      const cashflowNoOverride = noOverride.features['cashflow']
      assert(!!cashflowNoOverride, 'cashflow missing from feature map')
      // Recovery user + stability feature = not accessible by default
      assertEqual(cashflowNoOverride.defaultEnabled, false, 'cashflow should be disabled for recovery without override')

      // With override: move cashflow to 'recovery' phase
      const withOverride = computeFeatureAccess(makeFinancialInput({
        assets: [{ current_value: 500 }],
        matrixJson: JSON.stringify({ cashflow: { unlockPhase: 'recovery' } }),
      }))
      const cashflowOverride = withOverride.features['cashflow']
      assert(!!cashflowOverride, 'cashflow missing from feature map with override')
      assertEqual(cashflowOverride.defaultEnabled, true, 'cashflow should be enabled for recovery with override to recovery')

      // With override: move cashflow to 'mastery' phase (more restrictive)
      const withRestrictive = computeFeatureAccess(makeFinancialInput({
        assets: [{ current_value: 100_000 }],
        matrixJson: JSON.stringify({ cashflow: { unlockPhase: 'mastery' } }),
      }))
      const cashflowRestrictive = withRestrictive.features['cashflow']
      // A momentum-level user should not have mastery-locked feature
      assert(!!cashflowRestrictive, 'cashflow missing with restrictive override')
      // With 100K assets and ~2K/mo expenses, user is likely momentum level
      // mastery requires level 5-6 which needs freedom% >= 75
      // With 100K and 24K/yr expenses, fireTarget = 24K/0.035 ≈ 685K, freedom% ≈ 14.6% → momentum (level 3)
      assertEqual(cashflowRestrictive.defaultEnabled, false, 'cashflow should be disabled with mastery override for momentum user')
    },
  },

  // ── Step 4: Tier tabs filtering ────────────────────────────────────────────
  {
    id: 'toegang-tier-tabs',
    name: 'Tier tabs: filteren op all/gratis/connected/ai',
    category: CAT,
    description: 'UNIFIED_FEATURES correct filteren per requiredTier',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Verify TIERS config
      assertEqual(TIERS.length, 3, 'Expected 3 tiers')
      assertEqual(TIERS[0].id, 'gratis', 'First tier')
      assertEqual(TIERS[1].id, 'connected', 'Second tier')
      assertEqual(TIERS[2].id, 'ai', 'Third tier')

      // Count features per tier
      const gratisCount = UNIFIED_FEATURES.filter(f => f.requiredTier === 'gratis').length
      const connectedCount = UNIFIED_FEATURES.filter(f => f.requiredTier === 'connected').length
      const aiCount = UNIFIED_FEATURES.filter(f => f.requiredTier === 'ai').length

      // Verify all features have a valid tier
      for (const feat of UNIFIED_FEATURES) {
        assert(
          TIER_IDS.includes(feat.requiredTier),
          `Feature ${feat.id} has invalid requiredTier: ${feat.requiredTier}`,
        )
      }

      // 'all' tab should include all features
      assertEqual(
        gratisCount + connectedCount + aiCount,
        UNIFIED_FEATURES.length,
        'Tier counts should sum to total features',
      )

      // Expect at least some features in each tier
      assertGreaterThanOrEqual(gratisCount, 1, 'Expected at least 1 gratis feature')
      assertGreaterThanOrEqual(connectedCount, 1, 'Expected at least 1 connected feature')
      assertGreaterThanOrEqual(aiCount, 1, 'Expected at least 1 ai feature')

      // Verify specific known distributions
      assertGreaterThanOrEqual(gratisCount, 10, 'Expected at least 10 gratis features')
      assertEqual(connectedCount, 1, 'Expected exactly 1 connected feature (bankintegratie)')

      // Verify connected feature is bankintegratie
      const connectedFeatures = UNIFIED_FEATURES.filter(f => f.requiredTier === 'connected')
      assertEqual(connectedFeatures[0].id, 'bankintegratie', 'Connected feature should be bankintegratie')
    },
  },

  // ── Step 5: Subscription toewijzing (POST /api/admin/tier-assign) ──────────
  {
    id: 'toegang-subscription-assignment',
    name: 'Subscription toewijzing: POST /api/admin/tier-assign structuur',
    category: CAT,
    description: 'POST endpoint valideert email + subscriptions, retourneert success of error',
    priority: 'high',
    estimatedDurationMs: 2000,
    async fn() {
      // Test without auth — should get 403 or redirect
      const res = await fetch('/api/admin/tier-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@test.nl',
          subscriptions: ['connected'],
        }),
      })
      if (res.ok) {
        // If admin session exists, verify response structure
        const data = await res.json()
        assert(
          typeof data === 'object',
          'Expected object response',
        )
        // Either success or user-not-found error
        assert(
          data.success === true || typeof data.error === 'string',
          'Expected success: true or error string',
        )
      } else {
        // 403 (no admin), 404 (user not found), or redirect are all acceptable
        assert(
          [302, 307, 401, 403, 404].includes(res.status),
          `Expected 403/401/404/redirect for tier-assign, got ${res.status}`,
        )
      }

      // Test missing body fields
      const res2 = await fetch('/api/admin/tier-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res2.ok || res2.status === 400) {
        // Either rejected (400) or handled gracefully
        const data2 = await res2.json()
        if (res2.status === 400) {
          assert(typeof data2.error === 'string', 'Expected error message for missing fields')
        }
      }
      // 403/redirect also acceptable
    },
  },

  // ── Step 6: computeFeatureAccess responds to override changes ──────────────
  {
    id: 'toegang-override-affects-access',
    name: 'Wijzigingen werken direct door in computeFeatureAccess',
    category: CAT,
    description: 'Override verandering beïnvloedt feature accessibility correct',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Test with a mastery-only feature (fire_planning, defaultPhase: mastery)
      const firePlanning = UNIFIED_FEATURES.find(f => f.id === 'fire_planning')
      assert(!!firePlanning, 'fire_planning feature not found')
      assertEqual(firePlanning!.defaultPhase, 'mastery', 'fire_planning defaultPhase should be mastery')

      // Low-level user (recovery) without override → should NOT have fire_planning
      const base = computeFeatureAccess(makeFinancialInput({
        assets: [{ current_value: 500 }],
        matrixJson: null,
      }))
      assertEqual(base.features['fire_planning'].defaultEnabled, false, 'fire_planning should be off for recovery user')
      assertEqual(base.features['fire_planning'].accessible, false, 'fire_planning should be inaccessible')

      // Same user WITH override to 'recovery' → should now have fire_planning
      const overridden = computeFeatureAccess(makeFinancialInput({
        assets: [{ current_value: 500 }],
        matrixJson: JSON.stringify({ fire_planning: { unlockPhase: 'recovery' } }),
      }))
      assertEqual(overridden.features['fire_planning'].defaultEnabled, true, 'fire_planning should be on with recovery override')
      assertEqual(overridden.features['fire_planning'].accessible, true, 'fire_planning should be accessible with override')

      // Now add a user pref that disables it again (layer 3)
      const userDisabled = computeFeatureAccess(makeFinancialInput({
        assets: [{ current_value: 500 }],
        matrixJson: JSON.stringify({ fire_planning: { unlockPhase: 'recovery' } }),
        userFeaturePrefs: { fire_planning: false },
      }))
      assertEqual(userDisabled.features['fire_planning'].defaultEnabled, true, 'default still enabled with override')
      assertEqual(userDisabled.features['fire_planning'].accessible, false, 'user pref overrides to disabled')
      assertEqual(userDisabled.features['fire_planning'].reason, 'user_disabled', 'reason should be user_disabled')
    },
  },

  // ── Extra: Tier-locked features bypass phase checks ────────────────────────
  {
    id: 'toegang-tier-locked-bypass',
    name: 'Tier-locked features: geen toegang zonder juiste subscription',
    category: CAT,
    description: 'Connected/AI features zijn ontoegankelijk zonder matching subscription',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // User with only 'gratis' (no subscriptions) should not access AI features
      const gratisOnly = computeFeatureAccess(makeFinancialInput({
        activeSubscriptions: [],
        assets: [{ current_value: 1_000_000 }], // high net worth → mastery level
      }))

      // AI features should be tier_locked
      const aiFeatures = UNIFIED_FEATURES.filter(f => f.requiredTier === 'ai')
      for (const feat of aiFeatures) {
        const result = gratisOnly.features[feat.id]
        assert(!!result, `${feat.id} missing from access map`)
        assertEqual(result.accessible, false, `${feat.id} should be inaccessible without ai subscription`)
        assertEqual(result.reason, 'tier_locked', `${feat.id} should be tier_locked`)
        assertEqual(result.requiredTier, 'ai', `${feat.id} requiredTier should be ai`)
      }

      // Connected feature should also be locked
      const bankFeature = gratisOnly.features['bankintegratie']
      assert(!!bankFeature, 'bankintegratie missing')
      assertEqual(bankFeature.accessible, false, 'bankintegratie should be inaccessible without connected')
      assertEqual(bankFeature.reason, 'tier_locked', 'bankintegratie reason')

      // With connected subscription, bankintegratie becomes accessible
      const connectedUser = computeFeatureAccess(makeFinancialInput({
        activeSubscriptions: ['connected'],
        assets: [{ current_value: 500 }],
      }))
      const bankConnected = connectedUser.features['bankintegratie']
      assertEqual(bankConnected.accessible, true, 'bankintegratie should be accessible with connected sub')
      assertEqual(bankConnected.reason, 'accessible', 'bankintegratie reason should be accessible')

      // But AI features should still be locked
      for (const feat of aiFeatures) {
        assertEqual(connectedUser.features[feat.id].accessible, false, `${feat.id} still locked without ai sub`)
      }
    },
  },

  // ── Extra: PUT feature-access validation ───────────────────────────────────
  {
    id: 'toegang-put-validation',
    name: 'PUT /api/admin/feature-access: validatie en opslaan',
    category: CAT,
    description: 'PUT endpoint valideert overrides structuur',
    priority: 'high',
    estimatedDurationMs: 2000,
    async fn() {
      // Without admin auth → should fail
      const res = await fetch('/api/admin/feature-access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrides: {} }),
      })
      if (res.ok) {
        // If admin session, verify response
        const data = await res.json()
        assert(data.success === true, 'Expected success: true')
        assert(typeof data.overrides === 'object', 'Expected overrides in response')
      } else {
        // 403/redirect are acceptable
        assert(
          [302, 307, 401, 403].includes(res.status),
          `Expected 403/redirect for PUT, got ${res.status}`,
        )
      }
    },
  },

  // ── Extra: Phase ordering correctness ──────────────────────────────────────
  {
    id: 'toegang-phase-ordering',
    name: 'Fase-volgorde: recovery < stability < momentum < mastery',
    category: CAT,
    description: 'isPhaseSufficient respecteert juiste fase-volgorde',
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      // Recovery can only access recovery features
      assertEqual(isPhaseSufficient('recovery', 'recovery'), true, 'recovery >= recovery')
      assertEqual(isPhaseSufficient('recovery', 'stability'), false, 'recovery < stability')
      assertEqual(isPhaseSufficient('recovery', 'momentum'), false, 'recovery < momentum')
      assertEqual(isPhaseSufficient('recovery', 'mastery'), false, 'recovery < mastery')

      // Stability can access recovery + stability
      assertEqual(isPhaseSufficient('stability', 'recovery'), true, 'stability >= recovery')
      assertEqual(isPhaseSufficient('stability', 'stability'), true, 'stability >= stability')
      assertEqual(isPhaseSufficient('stability', 'momentum'), false, 'stability < momentum')
      assertEqual(isPhaseSufficient('stability', 'mastery'), false, 'stability < mastery')

      // Momentum can access recovery + stability + momentum
      assertEqual(isPhaseSufficient('momentum', 'recovery'), true, 'momentum >= recovery')
      assertEqual(isPhaseSufficient('momentum', 'stability'), true, 'momentum >= stability')
      assertEqual(isPhaseSufficient('momentum', 'momentum'), true, 'momentum >= momentum')
      assertEqual(isPhaseSufficient('momentum', 'mastery'), false, 'momentum < mastery')

      // Mastery can access everything
      assertEqual(isPhaseSufficient('mastery', 'recovery'), true, 'mastery >= recovery')
      assertEqual(isPhaseSufficient('mastery', 'stability'), true, 'mastery >= stability')
      assertEqual(isPhaseSufficient('mastery', 'momentum'), true, 'mastery >= momentum')
      assertEqual(isPhaseSufficient('mastery', 'mastery'), true, 'mastery >= mastery')
    },
  },

  // ── Extra: Multiple overrides simultaneously ───────────────────────────────
  {
    id: 'toegang-multiple-overrides',
    name: 'Meerdere overrides tegelijkertijd',
    category: CAT,
    description: 'Meerdere features tegelijk overriden werkt correct',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      // Override multiple features at once
      const overrides = {
        cashflow: { unlockPhase: 'recovery' },      // normally stability
        simulaties: { unlockPhase: 'recovery' },     // normally momentum
        fire_planning: { unlockPhase: 'stability' },  // normally mastery
      }

      const result = computeFeatureAccess(makeFinancialInput({
        assets: [{ current_value: 500 }], // recovery user
        matrixJson: JSON.stringify(overrides),
      }))

      // cashflow: overridden to recovery → accessible
      assertEqual(result.features['cashflow'].defaultEnabled, true, 'cashflow accessible with recovery override')
      // simulaties: overridden to recovery → accessible
      assertEqual(result.features['simulaties'].defaultEnabled, true, 'simulaties accessible with recovery override')
      // fire_planning: overridden to stability, but user is recovery → still not accessible
      assertEqual(result.features['fire_planning'].defaultEnabled, false, 'fire_planning still locked (stability > recovery)')

      // Non-overridden features should use defaults
      const vermogen = result.features['vermogensbeheer']
      assert(!!vermogen, 'vermogensbeheer should exist')
      assertEqual(vermogen.defaultEnabled, true, 'vermogensbeheer should be enabled (default: recovery)')
    },
  },
]

// ── Register ─────────────────────────────────────────────────────────────────

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Beheer — Toegang & Tiers',
    description: 'Feature access matrix, fase overrides, tier filtering, subscription toewijzing',
    icon: 'KeyRound',
    testCount: 0,
  })
  registerTests(tests)
}
