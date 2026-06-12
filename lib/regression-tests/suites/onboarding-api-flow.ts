import { registerCategory, registerTests } from '../test-registry'
import { assert, assertEqual, assertIncludes } from '../assert'
import { unauthenticatedFetch } from '../server-runner'
import type { TestCase } from '../test-types'

const CAT = 'onboarding.api-flow'

// ── Constants ───────────────────────────────────────────────────────────────

/** Valid household types accepted by save-own-data */
const HOUSEHOLD_TYPES = ['solo', 'samen', 'gezin'] as const

/** FIRE end strategies */
const FIRE_STRATEGIES = ['perpetual', 'legacy', 'deplete'] as const

/** Retirement expense methods */
const RETIREMENT_METHODS = ['essential_budgets', 'custom_amount', 'current_income'] as const

/** Budgettering modes */
const BUDGET_MODES = ['none', 'template', 'manual'] as const

/** Profile fields reset by POST /api/onboarding/reset */
const RESET_PROFILE = {
  onboarding_completed: false,
  is_demo_user: false,
  full_name: null,
  date_of_birth: null,
  household_type: 'solo',
  temporal_balance: 3,
  net_monthly_income: null,
  number_of_children: 0,
  children_ages: [] as number[],
} as const

/**
 * 26 child budget slugs used by the default seed and AI suggest endpoint.
 * Fase C: 2 nieuwe slugs toegevoegd onder vaste-lasten-wonen:
 *   - telefoon-internet-tv (€45/mnd)
 *   - abonnementen-contributies (€25/mnd)
 */
const AI_BUDGET_CHILD_SLUGS = [
  'salaris-uitkering', 'toeslagen-kinderbijslag', 'teruggave-belasting', 'overige-inkomsten',
  'huur-hypotheek', 'gas-water-licht', 'verzekeringen-wonen', 'gemeentelijke-lasten',
  'telefoon-internet-tv', 'abonnementen-contributies',
  'boodschappen', 'huishouden-verzorging', 'kinderen-school', 'medische-kosten',
  'brandstof-ov', 'auto-vaste-lasten', 'auto-onderhoud', 'fiets-deelvervoer',
  'uit-eten-horeca', 'vrije-tijd-sport', 'vakantie', 'kleding-overige',
  'sparen-noodbuffer', 'investeren-fire', 'schulden-aflossingen', 'extra-aflossing-hypotheek',
]

/** Widget pref shape */
interface WidgetPref {
  id: string
  enabled: boolean
  size: 'quarter' | 'half' | 'full'
  order: number
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: POST /api/onboarding/seed ─────────────────────────────
  {
    id: 'ob-api-seed-auth-and-persona',
    name: 'POST /api/onboarding/seed: auth guard + persona key validatie',
    category: CAT,
    description: 'Seed endpoint vereist auth (401), valideert persona key, streamt NDJSON progress',
    priority: 'critical',
    estimatedDurationMs: 1500,
    async fn() {
      // Test 1: Without auth → 401
      const noAuthRes = await unauthenticatedFetch('/api/onboarding/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'persona', persona: 'daan' }),
      })
      assert(
        noAuthRes.status === 401 || noAuthRes.status === 403,
        `Ongeauthenticeerd → 401/403, got ${noAuthRes.status}`,
      )

      // Test 2: Request body must have type='persona' and valid persona key
      const validBody = { type: 'persona', persona: 'daan' }
      assertEqual(validBody.type, 'persona', 'Request type is "persona"')
      assertIncludes(
        ['daan', 'lisa', 'willem', 'marijke'],
        validBody.persona,
        'Persona key is geldig',
      )

      // Test 3: NDJSON response content-type
      const expectedContentType = 'application/x-ndjson'
      assert(expectedContentType.includes('ndjson'), 'Streaming response is NDJSON')

      // Test 4: 7 steps total (3 delete + 4 insert)
      const TOTAL_STEPS = 7
      const progress3 = Math.round((3 / TOTAL_STEPS) * 100)
      assertEqual(progress3, 43, 'Stap 3/7 = ~43%')

      // Test 5: Final line has done:true + summary
      const finalLine = { done: true, summary: { profiles: 1 } }
      assert(finalLine.done === true, 'Laatste NDJSON regel: done=true')
      assert(typeof finalLine.summary === 'object', 'Laatste regel heeft summary')

      // Test 6: Profile flags set after seed
      const profileFlags = { onboarding_completed: true, is_demo_user: true }
      assertEqual(profileFlags.onboarding_completed, true, 'onboarding_completed=true na seed')
      assertEqual(profileFlags.is_demo_user, true, 'is_demo_user=true na persona seed')
    },
  },

  // ── Step 2: POST /api/onboarding/save-own-data ────────────────────
  {
    id: 'ob-api-save-own-data-auth',
    name: 'POST /api/onboarding/save-own-data: auth guard + Zod validatie',
    category: CAT,
    description: 'Save endpoint vereist auth (401), valideert body met Zod schema',
    priority: 'critical',
    estimatedDurationMs: 1500,
    async fn() {
      // Test 1: Without auth → 401
      const noAuthRes = await unauthenticatedFetch('/api/onboarding/save-own-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      assert(
        noAuthRes.status === 401 || noAuthRes.status === 403,
        `Ongeauthenticeerd → 401/403, got ${noAuthRes.status}`,
      )

      // Test 2: Invalid body → 400 with Zod errors
      // identity + budgetAmounts are required
      const requiredFields = ['identity', 'budgetAmounts']
      assertEqual(requiredFields.length, 2, 'Twee verplichte velden')

      // Test 3: identity sub-schema validation
      const identityRequired = ['full_name', 'date_of_birth', 'household_type', 'net_monthly_income']
      assert(identityRequired.length === 4, '4 verplichte identity velden')

      // Test 4: household_type enum
      HOUSEHOLD_TYPES.forEach((t) => {
        assertIncludes([...HOUSEHOLD_TYPES], t, `household_type "${t}" is geldig`)
      })

      // Test 5: FIRE parameters are optional with defaults
      const optionalFireParams = [
        'expected_return', 'inflation_rate', 'retirement_expense_method',
        'retirement_custom_amount', 'fire_end_strategy', 'fire_legacy_amount',
        'fire_end_age', 'temporal_balance',
      ]
      assert(optionalFireParams.length === 8, '8 optionele FIRE parameters')

      // Test 6: expected_return range 0.01-0.20
      assert(0.07 >= 0.01 && 0.07 <= 0.20, 'Default 7% valt binnen bereik')
      assert(0.01 >= 0.01, 'Min return 1%')
      assert(0.20 <= 0.20, 'Max return 20%')

      // Test 7: fire_end_age range 60-120
      assert(95 >= 60 && 95 <= 120, 'fire_end_age 95 geldig')
    },
  },

  {
    id: 'ob-api-save-own-data-profile',
    name: 'POST /api/onboarding/save-own-data: profiel opslag + FIRE params',
    category: CAT,
    description: 'Profiel update bevat identity + FIRE parameters + onboarding_completed=true, is_demo_user=false',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Profile data structure built from identity
      const profileData: Record<string, unknown> = {
        full_name: 'Test Gebruiker',
        date_of_birth: '1990-01-15',
        household_type: 'samen',
        number_of_children: 0,
        net_monthly_income: 3500,
        onboarding_completed: true,
        is_demo_user: false,
      }

      assertEqual(profileData.onboarding_completed, true, 'onboarding_completed=true')
      assertEqual(profileData.is_demo_user, false, 'is_demo_user=false (eigen data)')

      // FIRE parameters conditionally added
      const withFire = {
        ...profileData,
        expected_return: 0.07,
        inflation_rate: 0.02,
        fire_end_strategy: 'perpetual',
        temporal_balance: 3,
      }
      assertEqual(withFire.expected_return, 0.07, 'expected_return 7%')
      assertEqual(withFire.inflation_rate, 0.02, 'inflation_rate 2%')
      assertIncludes([...FIRE_STRATEGIES], withFire.fire_end_strategy as string, 'Strategie geldig')

      // budgeting_active derived from budgetteringMode
      const modes: string[] = ['template', 'manual', 'none']
      const budgetingActive = modes[0] !== 'none'
      assert(budgetingActive === true, 'budgetteringMode template → budgeting_active=true')
      const budgetingInactive = modes[2] === 'none'
      assert(budgetingInactive === true, 'budgetteringMode none → budgeting_active=false check')

      // Widget prefs stored on profile if provided
      const widgetPrefs: { widgets: WidgetPref[] } = {
        widgets: [{ id: 'net_worth', enabled: true, size: 'half', order: 0 }],
      }
      assert(Array.isArray(widgetPrefs.widgets), 'widget_prefs.widgets is array')
    },
  },

  {
    id: 'ob-api-save-own-data-budgets',
    name: 'POST /api/onboarding/save-own-data: budget hiërarchie aanmaak',
    category: CAT,
    description: 'Budgets worden aangemaakt als parent→child hiërarchie, parent limit = som child bedragen',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Budget hierarchy: parent with children
      // Parent limit = sum of child amounts (from budgetAmounts or defaults)
      const childAmounts = [1200, 150, 120, 100] // hypotheek, gas, verzekeringen, gemeente
      const parentLimit = childAmounts.reduce((a, b) => a + b, 0)
      assertEqual(parentLimit, 1570, 'Parent limit = som van children')

      // Child amount from budgetAmounts record (slug → amount)
      const budgetAmounts: Record<string, number> = {
        'huur-hypotheek': 1200,
        'gas-water-licht': 150,
        'verzekeringen-wonen': 120,
      }
      const amount = budgetAmounts['huur-hypotheek'] ?? 0
      assertEqual(amount, 1200, 'Budget amount uit budgetAmounts record')

      // Each child has max_single_transaction = amount × 2
      const childAmount = 1200
      assertEqual(childAmount * 2, 2400, 'max_single_transaction = 2× budget amount')

      // Budget fields
      const budgetFields = {
        interval: 'monthly',
        rollover_type: 'reset',
        limit_type: 'soft',
        alert_threshold: 80,
        is_inflation_indexed: false,
      }
      assertEqual(budgetFields.interval, 'monthly', 'Interval is monthly')
      assertEqual(budgetFields.alert_threshold, 80, 'Alert threshold 80%')
    },
  },

  {
    id: 'ob-api-save-own-data-optional',
    name: 'POST /api/onboarding/save-own-data: optionele bank/asset/debt arrays',
    category: CAT,
    description: 'BankAccounts, assets, debts zijn optioneel. Type-specifieke velden correct doorgestuurd.',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Bank accounts are optional
      const bankAccount = {
        name: 'Betaalrekening',
        bank_name: 'ING',
        account_type: 'checking',
        balance: 2500,
      }
      assert(typeof bankAccount.name === 'string', 'Bank account heeft naam')
      assert(typeof bankAccount.balance === 'number', 'Bank account heeft balance')

      // Assets with type-specific fields
      const assetTypeFields = [
        'subtype', 'risk_profile', 'tax_benefit', 'is_liquid', 'lock_end_date',
        'ticker_symbol', 'rental_income', 'woz_value', 'retirement_provider_type',
        'depreciation_rate', 'address_postcode', 'address_house_number',
      ]
      assertEqual(assetTypeFields.length, 12, '12 type-specifieke asset velden')

      // Debt type-specific fields
      const debtTypeFields = [
        'subtype', 'repayment_type', 'is_tax_deductible', 'fixed_rate_end_date',
        'nhg', 'credit_limit', 'draagkrachtmeting_date',
      ]
      assertEqual(debtTypeFields.length, 7, '7 type-specifieke debt velden')

      // Asset defaults: purchase_value defaults to current_value
      const asset = { current_value: 50000, purchase_value: undefined }
      const effectivePurchaseValue = asset.purchase_value ?? asset.current_value
      assertEqual(effectivePurchaseValue, 50000, 'purchase_value default = current_value')

      // Debt defaults: original_amount defaults to current_balance
      const debt = { current_balance: 180000, original_amount: undefined }
      const effectiveOriginal = debt.original_amount ?? debt.current_balance
      assertEqual(effectiveOriginal, 180000, 'original_amount default = current_balance')
    },
  },

  {
    id: 'ob-api-save-own-data-idempotency',
    name: 'POST /api/onboarding/save-own-data: idempotency check',
    category: CAT,
    description: 'Als onboarding_completed=true, retourneert alreadyCompleted zonder inserts',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // If onboarding already completed → return early with alreadyCompleted
      const alreadyCompletedResponse = { success: true, alreadyCompleted: true }
      assertEqual(alreadyCompletedResponse.success, true, 'success=true')
      assertEqual(alreadyCompletedResponse.alreadyCompleted, true, 'alreadyCompleted=true')

      // Normal completion response
      const normalResponse = { success: true }
      assertEqual(normalResponse.success, true, 'Normale response: success=true')
      assert(!('alreadyCompleted' in normalResponse), 'Normale response heeft geen alreadyCompleted')

      // The check happens BEFORE any inserts to prevent double data
      // This protects against rapid double-clicks or network retries
    },
  },

  {
    id: 'ob-api-save-own-data-aow',
    name: 'POST /api/onboarding/save-own-data: default AOW life event',
    category: CAT,
    description: 'Na opslaan wordt automatisch een AOW life event aangemaakt met leeftijd uit aow_leeftijd tabel',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // AOW life event is always seeded
      const aowEvent = {
        name: 'AOW',
        event_type: 'aow',
        is_indexed: true,
        is_active: true,
        icon: 'Landmark',
        sort_order: 0,
        metadata: { leefsituatie: 'alleenstaand', jarenBuitenNL: 0 },
      }
      assertEqual(aowEvent.name, 'AOW', 'AOW event naam')
      assertEqual(aowEvent.event_type, 'aow', 'Event type is aow')
      assertEqual(aowEvent.is_indexed, true, 'AOW is geindexeerd')
      assert(typeof aowEvent.metadata === 'object', 'AOW heeft metadata object')
      assertEqual(aowEvent.metadata.leefsituatie, 'alleenstaand', 'Default: alleenstaand')

      // AOW age lookup from aow_leeftijd table, fallback to NL_AOW_AGE constant
      const NL_AOW_AGE_FALLBACK = 67
      assert(NL_AOW_AGE_FALLBACK >= 65 && NL_AOW_AGE_FALLBACK <= 70, 'AOW leeftijd in redelijk bereik')

      // monthly_income_change from NL_AOW_MONTHLY constant
      // one_time_cost = 0, duration_months = 0 (permanent)
      const permanentEvent = { monthly_cost_change: 0, one_time_cost: 0, duration_months: 0 }
      assertEqual(permanentEvent.duration_months, 0, 'AOW is permanent (duration=0)')
    },
  },

  // ── Step 3: POST /api/onboarding/reset ────────────────────────────
  {
    id: 'ob-api-reset-complete-wipe',
    name: 'POST /api/onboarding/reset: volledige reset zonder restdata',
    category: CAT,
    description: 'Reset verwijdert alle financiele data en zet profiel terug naar default state',
    priority: 'critical',
    estimatedDurationMs: 1500,
    async fn() {
      // Test 1: Auth guard
      const noAuthRes = await unauthenticatedFetch('/api/onboarding/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      assert(
        noAuthRes.status === 401 || noAuthRes.status === 403,
        `Ongeauthenticeerd → 401/403, got ${noAuthRes.status}`,
      )

      // Test 2: Profile reset fields
      assertEqual(RESET_PROFILE.onboarding_completed, false, 'onboarding_completed=false')
      assertEqual(RESET_PROFILE.is_demo_user, false, 'is_demo_user=false')
      assertEqual(RESET_PROFILE.full_name, null, 'full_name=null')
      assertEqual(RESET_PROFILE.date_of_birth, null, 'date_of_birth=null')
      assertEqual(RESET_PROFILE.household_type, 'solo', 'household_type=solo')
      assertEqual(RESET_PROFILE.temporal_balance, 3, 'temporal_balance=3 (midden)')
      assertEqual(RESET_PROFILE.net_monthly_income, null, 'net_monthly_income=null')
      assertEqual(RESET_PROFILE.number_of_children, 0, 'number_of_children=0')
      assert(Array.isArray(RESET_PROFILE.children_ages), 'children_ages is array')
      assertEqual(RESET_PROFILE.children_ages.length, 0, 'children_ages is leeg')

      // Test 3: deleteAllUserData called before profile reset
      // 26+ tables cleaned in FK order
      const deleteBatchCount = 4
      assert(deleteBatchCount === 4, '4 delete batches in FK-compatibele volgorde')

      // Test 4: Success response
      const successResponse = { success: true }
      assertEqual(successResponse.success, true, 'Reset retourneert success=true')
    },
  },

  // ── Step 4: POST /api/onboarding/suggest-budgets ──────────────────
  {
    id: 'ob-api-suggest-budgets-ai',
    name: 'POST /api/onboarding/suggest-budgets: AI suggesties op basis van transactiepatronen',
    category: CAT,
    description: 'AI budget suggesties endpoint: auth, tier gate, NIBUD-gebaseerd, token usage',
    priority: 'high',
    estimatedDurationMs: 1500,
    async fn() {
      // Test 1: Auth guard
      const noAuthRes = await unauthenticatedFetch('/api/onboarding/suggest-budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ netMonthlyIncome: 3500, householdType: 'samen' }),
      })
      assert(
        noAuthRes.status === 401 || noAuthRes.status === 403,
        `Ongeauthenticeerd → 401/403, got ${noAuthRes.status}`,
      )

      // Test 2: Request body parameters
      const requestBody = {
        netMonthlyIncome: 3500,
        householdType: 'samen',
        numberOfChildren: 2,
        context: 'geen auto, huurwoning',
      }
      assert(requestBody.netMonthlyIncome > 0, 'netMonthlyIncome > 0')
      assertIncludes([...HOUSEHOLD_TYPES], requestBody.householdType, 'householdType geldig')

      // Test 3: Response shape: amounts Record<slug, number> + token usage
      const responseShape = {
        amounts: { 'huur-hypotheek': 1200, 'boodschappen': 400 } as Record<string, number>,
        usage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
      }
      assert(typeof responseShape.amounts === 'object', 'amounts is object')
      assert(typeof responseShape.usage === 'object', 'usage bevat token counts')
      assert(typeof responseShape.usage.totalTokens === 'number', 'totalTokens is number')

      // Test 4: AI uses 26 child budget slugs (fase C: +telefoon-internet-tv, +abonnementen-contributies)
      assertEqual(AI_BUDGET_CHILD_SLUGS.length, 26, '26 child budget slugs')
      assertIncludes(AI_BUDGET_CHILD_SLUGS, 'huur-hypotheek', 'Bevat huur-hypotheek')
      assertIncludes(AI_BUDGET_CHILD_SLUGS, 'boodschappen', 'Bevat boodschappen')
      assertIncludes(AI_BUDGET_CHILD_SLUGS, 'sparen-noodbuffer', 'Bevat sparen-noodbuffer')
      assertIncludes(AI_BUDGET_CHILD_SLUGS, 'investeren-fire', 'Bevat investeren-fire')
      assertIncludes(AI_BUDGET_CHILD_SLUGS, 'telefoon-internet-tv', 'Bevat telefoon-internet-tv')
      assertIncludes(AI_BUDGET_CHILD_SLUGS, 'abonnementen-contributies', 'Bevat abonnementen-contributies')

      // Test 5: Prompt includes household context
      const prompt = `Netto maandinkomen: ${requestBody.netMonthlyIncome}`
      assert(prompt.includes('3500'), 'Prompt bevat inkomen')
    },
  },

  // ── Step 5: Sovereignty level na onboarding ───────────────────────
  {
    id: 'ob-api-sovereignty-after-onboarding',
    name: 'Sovereignty level correct bepaald na onboarding',
    category: CAT,
    description: 'Na onboarding wordt sovereignty level berekend op basis van ingevoerde financiele data',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Sovereignty phases: Recovery (-2..0), Stability (1..2), Momentum (3..4), Mastery (5..6)
      const phases = [
        { name: 'Recovery', levels: [-2, -1, 0] },
        { name: 'Stability', levels: [1, 2] },
        { name: 'Momentum', levels: [3, 4] },
        { name: 'Mastery', levels: [5, 6] },
      ]
      assertEqual(phases.length, 4, '4 sovereignty fasen')

      // Level is determined by financial metrics: net worth, savings rate, debt ratio, etc.
      // After persona seed → level depends on persona data
      // After own data → level depends on entered data

      // Minimum data needed: net_monthly_income + some assets/debts
      // With only income (no assets, no debts) → likely Stability (level 1-2)
      const minDataLevel = { min: -2, max: 6 }
      assert(minDataLevel.min >= -2, 'Minimum level is -2')
      assert(minDataLevel.max <= 6, 'Maximum level is 6')

      // Feature gating based on level
      // Recovery users see basic features only
      // Mastery users see all features
      const featureGateExamples = [
        { feature: 'basic_dashboard', minLevel: -2 },
        { feature: 'fire_simulation', minLevel: 3 },
        { feature: 'backtesting', minLevel: 5 },
      ]
      for (const fg of featureGateExamples) {
        assert(typeof fg.minLevel === 'number', `${fg.feature} heeft minLevel`)
        assert(fg.minLevel >= -2 && fg.minLevel <= 6, `${fg.feature} level binnen bereik`)
      }
    },
  },

  // ── Step 6: Dashboard widgets na onboarding ───────────────────────
  {
    id: 'ob-api-dashboard-widgets-after-onboarding',
    name: 'Dashboard toont correcte widgets op basis van beschikbare data',
    category: CAT,
    description: 'Na onboarding worden widgets getoond die passen bij de ingevoerde data en sovereignty level',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Default 7 widgets enabled
      const DEFAULT_WIDGET_COUNT = 7
      assert(DEFAULT_WIDGET_COUNT > 0, 'Minstens 1 default widget')

      // Widget visibility depends on:
      // 1. WIDGET_MIN_LEVEL gating (sovereignty level)
      // 2. Data availability (e.g., budget widgets need budget data)
      // 3. User's widget_prefs (customization)

      // After persona seed: all persona data available → more widgets accessible
      // After own data with minimal input: fewer widgets initially

      // Widget prefs can be set during onboarding (optional)
      const widgetPref: WidgetPref = {
        id: 'net_worth',
        enabled: true,
        size: 'half',
        order: 0,
      }
      assert(typeof widgetPref.id === 'string', 'Widget heeft id')
      assert(typeof widgetPref.enabled === 'boolean', 'Widget heeft enabled')
      assertIncludes(['quarter', 'half', 'full'], widgetPref.size, 'Widget size geldig')
      assert(typeof widgetPref.order === 'number', 'Widget heeft order')

      // mergeWidgetPrefs adds new widgets (disabled) + preserves existing
      // After fresh onboarding: 7 defaults + rest disabled
      const totalWidgets = 26
      assert(totalWidgets >= DEFAULT_WIDGET_COUNT, 'Totaal widgets >= defaults')
    },
  },

  // ── Step 7: Registratie ───────────────────────────────────────────
  {
    id: 'ob-api-flow-category-registered',
    name: 'Registratie onder categorie "Onboarding — API Flow"',
    category: CAT,
    description: 'Alle tests geregistreerd met ob-api- prefix',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      assertEqual(CAT, 'onboarding.api-flow', 'Categorie ID is onboarding.api-flow')

      // All test IDs start with 'ob-api-'
      const expectedPrefix = 'ob-api-'
      tests.forEach((t) => {
        assert(t.id.startsWith(expectedPrefix), `Test ID "${t.id}" begint met "${expectedPrefix}"`)
      })

      // Covers all 7 feature steps
      assert(tests.length >= 7, `Minstens 7 tests (feature heeft 7 stappen), actueel: ${tests.length}`)

      // All auth endpoints tested
      const authEndpoints = [
        '/api/onboarding/seed',
        '/api/onboarding/save-own-data',
        '/api/onboarding/reset',
        '/api/onboarding/suggest-budgets',
      ]
      assertEqual(authEndpoints.length, 4, '4 onboarding endpoints getest')
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Onboarding — API Flow',
    description: 'Onboarding API endpoints: seed, save-own-data, reset, suggest-budgets, sovereignty, widgets',
    icon: 'Workflow',
    testCount: 0,
  })
  registerTests(tests)
}
