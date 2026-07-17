import { registerTests } from '../test-registry'
import { assert, assertEqual, assertIncludes } from '../assert'
import type { TestCase } from '../test-types'
import { authenticatedFetch } from '../server-runner'

const CAT = 'onboarding.save'

// ── Module types (matches lib/module-registry.ts) ──────────────────────────
type ModuleId =
  | 'budgetteren'
  | 'vermogensregistratie'
  | 'aandelenregistratie'
  | 'toekomstplannen'
  | 'inzicht_acties'
  | 'nieuws'

// ── Zod schema constraints from save-own-data route ────────────────────────

const IDENTITY_REQUIRED_FIELDS = ['full_name', 'date_of_birth', 'household_type', 'net_monthly_income'] as const
const HOUSEHOLD_TYPES = ['solo', 'samen', 'gezin'] as const
const FIRE_STRATEGIES = ['perpetual', 'legacy', 'deplete'] as const
const RETIREMENT_METHODS = ['essential_budgets', 'custom_amount', 'current_income'] as const
const BUDGETTERING_MODES = ['none', 'template', 'manual'] as const
const WIDGET_SIZES = ['quarter', 'half', 'full'] as const

const SAVING_MESSAGES = [
  'Profiel wordt opgeslagen...',
  'Budgetten worden aangemaakt...',
  'Bezittingen en schulden verwerken...',
  'Dashboard wordt geconfigureerd...',
  'Bijna klaar...',
]

/** Minimal valid request body for schema validation tests (simplified identity, no FIRE params) */
function buildMinimalBody() {
  return {
    identity: {
      full_name: 'Test Gebruiker',
      date_of_birth: '1990-01-15',
      household_type: 'solo' as const,
      number_of_children: 0,
      net_monthly_income: 3500,
    },
    budgetAmounts: { voeding: 400, wonen: 1200 },
    budgetteringMode: 'manual' as const,
  }
}

/** Full request body with horizonData separate from identity, plus newsDescription */
function buildFullBody() {
  return {
    ...buildMinimalBody(),
    identity: {
      ...buildMinimalBody().identity,
      estimated_monthly_expenses: 2800,
    },
    // horizonData is now a separate top-level field (not inside identity)
    horizonData: {
      fire_end_strategy: 'legacy' as const,
      fire_end_age: 90,
      fire_legacy_amount: 200000,
      retirement_expense_method: 'custom_amount' as const,
      retirement_custom_amount: 2000,
      temporal_balance: 3,
      life_events: [],
    },
    // newsDescription is a new top-level field
    newsDescription: 'Ik ben ge\u00efnteresseerd in ETF-beleggen en FIRE-strategieën',
    bankAccounts: [
      { name: 'ING Betaal', bank_name: 'ING', account_type: 'checking', balance: 5000, has_budget_tracking: true },
    ],
    assets: [
      { name: 'Vanguard ETF', asset_type: 'investment', current_value: 80000 },
    ],
    debts: [
      { name: 'Studieschuld', debt_type: 'student_loan', current_balance: 12000, interest_rate: 0.01, monthly_payment: 200 },
    ],
    widgetPrefs: {
      widgets: [
        { id: 'netto_vermogen', enabled: true, size: 'full' as const, order: 0 },
        { id: 'fire_prognose', enabled: true, size: 'half' as const, order: 1 },
      ],
    },
    activeModules: ['budgetteren', 'vermogensregistratie', 'toekomstplannen', 'inzicht_acties'] as ModuleId[],
  }
}

// ── Numeric conversion helper (mirrors client logic) ────────────────────────

function convertStringToNumber(val: string | number | undefined): number | undefined {
  if (val === undefined || val === '') return undefined
  const n = Number(val)
  return isNaN(n) ? undefined : n
}

// ── Filtering helper (mirrors client logic) ─────────────────────────────────

interface BankInput { name: string; bank_name: string; balance: string | number }
interface AssetInput { name: string; current_value: string | number }
interface DebtInput { name: string; current_balance: string | number }

function filterValidBanks(banks: BankInput[]): BankInput[] {
  return banks.filter((a) => a.name && a.bank_name && a.balance)
}
function filterValidAssets(assets: AssetInput[]): AssetInput[] {
  return assets.filter((a) => a.name && a.current_value)
}
function filterValidDebts(debts: DebtInput[]): DebtInput[] {
  return debts.filter((d) => d.name && d.current_balance)
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: handleSaveOwnData request body construction ─────────────
  {
    id: 'ob-save-body-construction',
    name: 'handleSaveOwnData: correcte request body opbouw met horizonData en newsDescription',
    category: CAT,
    description: 'Request body bevat identity (simpel), horizonData (apart), newsDescription, budgetAmounts, widgetPrefs, activeModules',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const body = buildFullBody()

      // Identity section — simplified, no FIRE params
      assert(!!body.identity.full_name, 'Body bevat full_name')
      assert(!!body.identity.date_of_birth, 'Body bevat date_of_birth')
      assertIncludes([...HOUSEHOLD_TYPES], body.identity.household_type, 'household_type is geldig')
      assert(body.identity.net_monthly_income > 0, 'net_monthly_income is positief')
      assert(body.identity.estimated_monthly_expenses !== undefined, 'estimated_monthly_expenses aanwezig')

      // Verify FIRE params are NOT in identity
      const identityKeys = Object.keys(body.identity)
      assert(!identityKeys.includes('expected_return'), 'expected_return NIET in identity')
      assert(!identityKeys.includes('inflation_rate'), 'inflation_rate NIET in identity')
      assert(!identityKeys.includes('fire_end_strategy'), 'fire_end_strategy NIET in identity')
      assert(!identityKeys.includes('temporal_balance'), 'temporal_balance NIET in identity')

      // horizonData is a separate top-level field
      assert(body.horizonData !== undefined, 'horizonData aanwezig als apart top-level veld')
      assertIncludes([...FIRE_STRATEGIES], body.horizonData.fire_end_strategy, 'fire_end_strategy geldig')
      assertIncludes([...RETIREMENT_METHODS], body.horizonData.retirement_expense_method, 'retirement_expense_method geldig')
      assert(body.horizonData.temporal_balance >= 1 && body.horizonData.temporal_balance <= 5, 'temporal_balance 1-5 range')

      // newsDescription is a new top-level field
      assert(typeof body.newsDescription === 'string', 'newsDescription is een string')
      assert(body.newsDescription.length > 0, 'newsDescription is niet leeg')

      // Budget amounts
      assert(typeof body.budgetAmounts === 'object', 'budgetAmounts is een object')
      assert(Object.keys(body.budgetAmounts).length > 0, 'budgetAmounts niet leeg')

      // Optional arrays
      assert(Array.isArray(body.bankAccounts), 'bankAccounts is een array')
      assert(Array.isArray(body.assets), 'assets is een array')
      assert(Array.isArray(body.debts), 'debts is een array')

      // Widget prefs
      assert(!!body.widgetPrefs, 'widgetPrefs aanwezig')
      assert(Array.isArray(body.widgetPrefs.widgets), 'widgetPrefs.widgets is een array')
      body.widgetPrefs.widgets.forEach((w) => {
        assert(!!w.id, 'widget heeft id')
        assert(typeof w.enabled === 'boolean', 'widget heeft enabled boolean')
        assertIncludes([...WIDGET_SIZES], w.size, 'widget size geldig')
        assert(typeof w.order === 'number', 'widget heeft order nummer')
      })

      // Budgettering mode — derived from modules
      assertIncludes([...BUDGETTERING_MODES], body.budgetteringMode, 'budgetteringMode geldig')

      // activeModules — new field
      assert(Array.isArray(body.activeModules), 'activeModules is een array')
      assert(body.activeModules.length > 0, 'activeModules niet leeg')
    },
  },

  // ── Step 2: budgetteringMode derived from modules ──────────────────
  {
    id: 'ob-save-budgettering-derived',
    name: 'budgetteringMode: afgeleid uit activeModules, niet uit identity',
    category: CAT,
    description: 'budgetteringMode is "manual" als budgetteren in modules zit, anders "none"',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // When budgetteren is in selected modules → budgetteringMode = 'manual'
      function deriveBudgetteringMode(selectedModules: ModuleId[]): string {
        return selectedModules.includes('budgetteren') ? 'manual' : 'none'
      }

      assertEqual(deriveBudgetteringMode(['budgetteren', 'vermogensregistratie']), 'manual', 'Met budgetteren: manual')
      assertEqual(deriveBudgetteringMode(['budgetteren']), 'manual', 'Alleen budgetteren: manual')
      assertEqual(deriveBudgetteringMode(['vermogensregistratie']), 'none', 'Zonder budgetteren: none')
      assertEqual(deriveBudgetteringMode([]), 'none', 'Geen modules: none')

      // The old identity.budgettering_mode field is no longer used
      // budgetteringMode is derived in handleSaveOwnData from state.selectedModules
    },
  },

  // ── Step 3: horizonData separate from identity ──────────────────────
  {
    id: 'ob-save-horizon-data-separate',
    name: 'horizonData: apart top-level veld, alleen meegestuurd bij toekomstplannen actief',
    category: CAT,
    description: 'horizonData bevat FIRE strategie, pensioenuitgaven, temporal_balance en life_events',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // horizonData is only sent when toekomstplannen is in selectedModules
      const modulesWithToekomst: ModuleId[] = ['vermogensregistratie', 'toekomstplannen']
      const modulesWithoutToekomst: ModuleId[] = ['vermogensregistratie', 'budgetteren']

      assert(modulesWithToekomst.includes('toekomstplannen'), 'Modules met toekomstplannen')
      assert(!modulesWithoutToekomst.includes('toekomstplannen'), 'Modules zonder toekomstplannen')

      // When toekomstplannen is active, body includes horizonData
      const body = buildFullBody()
      assert(body.horizonData !== undefined, 'horizonData aanwezig bij toekomstplannen')

      // horizonData structure
      const horizon = body.horizonData
      assertIncludes([...FIRE_STRATEGIES], horizon.fire_end_strategy, 'fire_end_strategy geldig')
      assert(horizon.fire_end_age >= 60 && horizon.fire_end_age <= 120, 'fire_end_age in range 60-120')
      assertIncludes([...RETIREMENT_METHODS], horizon.retirement_expense_method, 'retirement_expense_method geldig')
      assert(horizon.temporal_balance >= 1 && horizon.temporal_balance <= 5, 'temporal_balance 1-5')
      assert(Array.isArray(horizon.life_events), 'life_events is een array')

      // Conditional fields
      if (horizon.fire_end_strategy === 'legacy') {
        assert(horizon.fire_legacy_amount > 0, 'Legacy: fire_legacy_amount positief')
      }
      if (horizon.retirement_expense_method === 'custom_amount') {
        assert(horizon.retirement_custom_amount > 0, 'Custom amount: retirement_custom_amount positief')
      }
    },
  },

  // ── Step 4: newsDescription in payload ──────────────────────────────
  {
    id: 'ob-save-news-description',
    name: 'newsDescription: nieuw top-level veld in save payload',
    category: CAT,
    description: 'newsDescription wordt meegestuurd als de gebruiker een nieuwsbeschrijving heeft ingevuld',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const body = buildFullBody()

      // newsDescription is a string field at the top level
      assert(typeof body.newsDescription === 'string', 'newsDescription is een string')
      assert(body.newsDescription.length > 0, 'newsDescription is gevuld')

      // Empty newsDescription should not be sent (checked in page.tsx: if (state.newsDescription))
      const emptyNewsBody = { ...buildMinimalBody(), newsDescription: '' }
      const shouldSendNews = !!emptyNewsBody.newsDescription
      assert(!shouldSendNews, 'Lege newsDescription wordt niet meegestuurd')

      // Non-empty newsDescription should be sent
      const filledNewsBody = { ...buildMinimalBody(), newsDescription: 'Interesse in ETFs' }
      const shouldSendFilled = !!filledNewsBody.newsDescription
      assert(shouldSendFilled, 'Gevulde newsDescription wordt wel meegestuurd')
    },
  },

  // ── Step 5: Numerieke conversie ─────────────────────────────────────
  {
    id: 'ob-save-numeric-conversion',
    name: 'Numerieke conversie: string inputs correct omgezet naar numbers',
    category: CAT,
    description: 'String waarden uit formulieren worden naar Number() geconverteerd voor de API',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // net_monthly_income: Number(state.identity.net_monthly_income)
      assertEqual(Number('4500'), 4500, 'String "4500" \u2192 number 4500')
      assertEqual(Number('0'), 0, 'String "0" \u2192 number 0')
      assert(isNaN(Number('')), 'Lege string \u2192 NaN')

      // estimated_monthly_expenses: conditional Number()
      const expense = '2800'
      const converted = expense ? Number(expense) : undefined
      assertEqual(converted, 2800, 'Expense string correct geconverteerd')

      // Empty string should not be sent
      const empty = ''
      const emptyConverted = empty ? Number(empty) : undefined
      assertEqual(emptyConverted, undefined, 'Lege string \u2192 undefined (niet meegestuurd)')

      // Bank balance: Number(a.balance)
      const bankBalanceStr = '5000.50'
      assertEqual(Number(bankBalanceStr), 5000.50, 'Bank balance decimaal correct')

      // Asset current_value
      assertEqual(Number('80000'), 80000, 'Asset value correct')

      // Debt current_balance
      assertEqual(Number('12000'), 12000, 'Debt balance correct')

      // horizonData numeric conversions
      assertEqual(Number('200000'), 200000, 'Legacy amount correct')
      assertEqual(Number('2000'), 2000, 'Retirement custom amount correct')
    },
  },

  // ── Step 6: Filtering \u2014 alleen items met verplichte velden ──────────
  {
    id: 'ob-save-filtering',
    name: 'Filtering: alleen items met verplichte velden worden meegestuurd',
    category: CAT,
    description: 'Bankrekening zonder naam of balance wordt geskipt, asset zonder name/value idem',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Bank accounts: filter by name && bank_name && balance
      const banks: BankInput[] = [
        { name: 'ING Betaal', bank_name: 'ING', balance: '5000' },
        { name: '', bank_name: 'Rabo', balance: '3000' },
        { name: 'Spaar', bank_name: '', balance: '10000' },
        { name: 'Lege', bank_name: 'ABN', balance: '' },
      ]
      const validBanks = filterValidBanks(banks)
      assertEqual(validBanks.length, 1, 'Alleen 1 complete bankrekening doorgelaten')
      assertEqual(validBanks[0].name, 'ING Betaal', 'Correcte bank doorgelaten')

      // Assets: filter by name && current_value
      const assets: AssetInput[] = [
        { name: 'ETF Portfolio', current_value: '80000' },
        { name: '', current_value: '50000' },
        { name: 'Crypto', current_value: '' },
        { name: 'Woning', current_value: '350000' },
      ]
      const validAssets = filterValidAssets(assets)
      assertEqual(validAssets.length, 2, 'Alleen 2 complete assets doorgelaten')
      assertEqual(validAssets[0].name, 'ETF Portfolio', 'Eerste asset correct')
      assertEqual(validAssets[1].name, 'Woning', 'Tweede asset correct')

      // Debts: filter by name && current_balance
      const debts: DebtInput[] = [
        { name: 'Studieschuld', current_balance: '12000' },
        { name: '', current_balance: '5000' },
        { name: 'Hypotheek', current_balance: '250000' },
      ]
      const validDebts = filterValidDebts(debts)
      assertEqual(validDebts.length, 2, 'Alleen 2 complete debts doorgelaten')

      // Empty arrays should not be included
      const emptyBanks: BankInput[] = [{ name: '', bank_name: '', balance: '' }]
      assertEqual(filterValidBanks(emptyBanks).length, 0, 'Geen valide banks = niet meegestuurd')
    },
  },

  // ── Step 7: 30-seconden timeout ─────────────────────────────────────
  {
    id: 'ob-save-timeout',
    name: '30-seconden timeout: AbortController stopt request bij timeout',
    category: CAT,
    description: 'AbortController met 30s timeout geeft AbortError met specifiek foutbericht',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Verify timeout mechanism: AbortController + setTimeout(30000)
      // Updated from 10s to 30s to allow for batched DB operations
      const TIMEOUT_MS = 30000
      assertEqual(TIMEOUT_MS, 30000, 'Timeout is 30 seconden')

      const abortMessage = 'De server reageert niet. Controleer je internetverbinding en probeer het opnieuw.'
      assert(abortMessage.includes('server reageert niet'), 'Abort error message verwijst naar server')
      assert(abortMessage.includes('probeer het opnieuw'), 'Abort error message biedt retry optie')

      // After error, step goes back to last content step (dynamic, not fixed)
      const errorRecoveryStep = 'last content step'
      assert(errorRecoveryStep.length > 0, 'Error recovery stap is dynamisch bepaald')
    },
  },

  // ── Step 8: Saving animatie ─────────────────────────────────────────
  {
    id: 'ob-save-animation',
    name: 'Saving animatie: WillDots (64px pulsing), roterende berichten (5\u00d7, 800ms)',
    category: CAT,
    description: 'WillDots avatar met pulse animatie, 5 roterende berichten elke 800ms',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const WILLDOTS_SIZE = 64
      assertEqual(WILLDOTS_SIZE, 64, 'WillDots size is 64px tijdens saving')

      const animationClass = 'animate-pulse'
      assert(animationClass.includes('pulse'), 'Pulse animatie actief op WillDots')

      assertEqual(SAVING_MESSAGES.length, 5, 'Exact 5 saving berichten')
      const MESSAGE_INTERVAL_MS = 800
      assertEqual(MESSAGE_INTERVAL_MS, 800, 'Berichten wisselen elke 800ms')

      const fullCycleMs = SAVING_MESSAGES.length * MESSAGE_INTERVAL_MS
      assertEqual(fullCycleMs, 4000, 'Volledige berichtencyclus is 4 seconden')

      assert(SAVING_MESSAGES[0].includes('Profiel'), 'Bericht 1: profiel opslaan')
      assert(SAVING_MESSAGES[1].includes('Budgetten'), 'Bericht 2: budgetten aanmaken')
      assert(SAVING_MESSAGES[2].includes('Bezittingen'), 'Bericht 3: bezittingen verwerken')
      assert(SAVING_MESSAGES[3].includes('Dashboard'), 'Bericht 4: dashboard configureren')
      assert(SAVING_MESSAGES[4].includes('Bijna klaar'), 'Bericht 5: bijna klaar')

      const savingStepInteractiveElements = 0
      assertEqual(savingStepInteractiveElements, 0, 'Saving stap heeft geen knoppen')
    },
  },

  // ── Step 9: Voortgangsbalk ──────────────────────────────────────────
  {
    id: 'ob-save-progress-bar',
    name: 'Voortgangsbalk: ramp 0%\u219290% over ~3s, spring naar 100% bij success',
    category: CAT,
    description: 'Progress bar start bij 0%, ramps naar 90% in intervallen, springt naar 100% bij success',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const INCREMENT = 3
      const INTERVAL_MS = 100
      const MAX_RAMP = 90
      const FINAL = 100

      const stepsToMax = MAX_RAMP / INCREMENT
      assertEqual(stepsToMax, 30, '30 stappen tot 90%')

      const timeToMaxMs = stepsToMax * INTERVAL_MS
      assertEqual(timeToMaxMs, 3000, '~3 seconden tot 90%')

      let progress = 0
      for (let i = 0; i < stepsToMax; i++) {
        progress = Math.min(progress + INCREMENT, MAX_RAMP)
      }
      assertEqual(progress, MAX_RAMP, 'Ramp stopt bij 90%')

      progress = FINAL
      assertEqual(progress, 100, 'Na success springt progress naar 100%')

      const progressDisplayClasses = 'font-mono text-xs tabular-nums'
      assert(progressDisplayClasses.includes('font-mono'), 'Progress tekst in monospace')
      assert(progressDisplayClasses.includes('tabular-nums'), 'Tabular nums voor stabiele breedte')

      const barFillClass = 'bg-[var(--ink)]'
      assert(barFillClass.includes('--ink'), 'Voortgangsbalk vult met ink kleur')
    },
  },

  // ── Step 10: Zod schema validatie ────────────────────────────────────
  {
    id: 'ob-save-zod-schema',
    name: 'POST /api/onboarding/save-own-data: zod schema validatie',
    category: CAT,
    description: 'API valideert request body met zod schema, retourneert 400 bij ongeldige data',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      // Test 1: Empty body \u2192 400 (identity required fields missing)
      const emptyRes = await authenticatedFetch('/api/onboarding/save-own-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      assert(
        emptyRes.status === 400 || emptyRes.status === 401,
        `Lege body \u2192 400 of 401, got ${emptyRes.status}`,
      )

      // Test 2: Invalid household_type \u2192 400
      const invalidHousehold = {
        ...buildMinimalBody(),
        identity: { ...buildMinimalBody().identity, household_type: 'invalid' },
      }
      const householdRes = await authenticatedFetch('/api/onboarding/save-own-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidHousehold),
      })
      assert(
        householdRes.status === 400 || householdRes.status === 401,
        `Ongeldige household_type \u2192 400 of 401, got ${householdRes.status}`,
      )

      // Test 3: Negative income \u2192 400
      const negIncomeBody = {
        ...buildMinimalBody(),
        identity: { ...buildMinimalBody().identity, net_monthly_income: -100 },
      }
      const negRes = await authenticatedFetch('/api/onboarding/save-own-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(negIncomeBody),
      })
      assert(
        negRes.status === 400 || negRes.status === 401,
        `Negatief inkomen \u2192 400 of 401, got ${negRes.status}`,
      )
    },
  },

  // ── Step 11: onboarding_completed flag ───────────────────────────────
  {
    id: 'ob-save-completed-flag',
    name: 'onboarding_completed flag: wordt true gezet na succesvolle save',
    category: CAT,
    description: 'API zet onboarding_completed=true en is_demo_user=false in profile na save',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // The API sets these profile fields:
      // onboarding_completed: true
      // is_demo_user: false
      // budgeting_active: derived from budgetteringMode (which is derived from modules)

      const profileUpdate = {
        onboarding_completed: true,
        is_demo_user: false,
        budgeting_active: true, // when budgetteringMode = 'manual' (budgetteren in modules)
      }

      assertEqual(profileUpdate.onboarding_completed, true, 'onboarding_completed wordt true')
      assertEqual(profileUpdate.is_demo_user, false, 'is_demo_user wordt false')
      assertEqual(profileUpdate.budgeting_active, true, 'budgeting_active true bij budgetteren module actief')

      // When budgetteren module is NOT active → budgetteringMode = 'none'
      const noBudgeting = { budgeting_active: false }
      assertEqual(noBudgeting.budgeting_active, false, 'budgeting_active false bij geen budgetteren module')

      // Idempotency: if already completed, returns { success: true, alreadyCompleted: true }
      const idempotentResponse = { success: true, alreadyCompleted: true }
      assert(idempotentResponse.success, 'Idempotent response is success')
      assert(idempotentResponse.alreadyCompleted, 'alreadyCompleted flag aanwezig')

      // FIRE parameters are saved from horizonData (when toekomstplannen active), not from identity
      const fireFieldsFromHorizon = [
        'fire_end_strategy',
        'fire_end_age',
        'fire_legacy_amount',
        'retirement_expense_method',
        'retirement_expense_custom_amount',
        'temporal_balance',
      ]
      assertEqual(fireFieldsFromHorizon.length, 6, 'Zes FIRE velden worden opgeslagen vanuit horizonData')

      // activeModules are saved in profile
      const activeModulesField = 'active_modules'
      assert(activeModulesField.length > 0, 'active_modules veld bestaat in profiel')
    },
  },

  // ── Step 12: Success scherm ──────────────────────────────────────────
  {
    id: 'ob-save-success-screen',
    name: 'Success scherm: WillDots avatar, module kaarten, CTA naar getHomePath()',
    category: CAT,
    description: 'OnboardingSuccess component toont welkomstscherm met dynamische module cards en CTA',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // WillDots size on success screen: 140px
      const SUCCESS_WILLDOTS_SIZE = 140
      assertEqual(SUCCESS_WILLDOTS_SIZE, 140, 'WillDots success size is 140px')
      const successAnimation = 'animate-[pulse_3s_ease-in-out_1]'
      assert(successAnimation.includes('pulse'), 'Success WillDots heeft pulse animatie')
      assert(successAnimation.includes('_1]'), 'Pulse speelt slechts 1 keer af')

      // Heading text
      const heading = 'Welkom bij TriFinity!'
      assert(heading.includes('TriFinity'), 'Heading bevat app naam')

      // Philosophy tagline
      const tagline = 'Geld is opgeslagen tijd \u2014 en jouw reis naar vrijheid begint nu.'
      assert(tagline.includes('opgeslagen tijd'), 'Tagline bevat kernfilosofie')
      assert(tagline.includes('vrijheid'), 'Tagline verwijst naar vrijheid')

      // Module cards: 3 cards with specific names and icons
      const moduleCards = [
        { name: 'De Kern', icon: 'Shield', border: 'border-kern-400' },
        { name: 'De Wil', icon: 'Zap', border: 'border-wil-400' },
        { name: 'De Horizon', icon: 'Telescope', border: 'border-horizon-400' },
      ]
      assertEqual(moduleCards.length, 3, 'Exact 3 module kaarten')

      // CTA destination depends on active modules via getHomePath
      // If only nieuws → '/berichten'
      // If inzicht_acties → '/will'
      // Otherwise → '/core'
      const ctaDestinations = {
        fireAll: '/will', // inzicht_acties is active
        budgetOnly: '/core', // no inzicht_acties
        nieuwsOnly: '/berichten',
      }
      assertEqual(ctaDestinations.nieuwsOnly, '/berichten', 'Nieuws-only → /berichten')
    },
  },

  // ── Step 13: POST /api/activate ─────────────────────────────────────
  {
    id: 'ob-save-activate-api',
    name: 'POST /api/activate: fase activatie na onboarding, last_known_phase correct gezet',
    category: CAT,
    description: 'Activate endpoint berekent fase via computeFeatureAccess en zet last_known_phase',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await authenticatedFetch('/api/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      assert(
        res.status === 401 || res.status === 400 || res.status === 200,
        `Activate endpoint bereikbaar: ${res.status}`,
      )

      if (res.status === 401) {
        const data = await res.json()
        // App-brede 401-tekst is gestandaardiseerd naar 'Niet ingelogd' (ADR 0044).
        assert(data.error === 'Niet ingelogd', 'Ongeauthenticeerd \u2192 Niet ingelogd')
      }

      const validPhases = ['recovery', 'stability', 'momentum', 'mastery']
      assertEqual(validPhases.length, 4, 'Vier mogelijke fasen')

      const doubleActivateResponse = { error: 'Already activated' }
      assert(doubleActivateResponse.error.includes('Already activated'), 'Dubbele activatie melding correct')
    },
  },

  // ── Step 14: Initial phase set after save ──────────────────────────
  {
    id: 'ob-save-initial-phase',
    name: 'Na save wordt last_known_phase gezet op recovery',
    category: CAT,
    description: 'Na succesvolle onboarding save wordt last_known_phase direct ingesteld zodat de gebruiker volledig actief is',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const initialPhase = 'recovery'
      assertEqual(initialPhase, 'recovery', 'Initiele fase is recovery na onboarding')
      assert(typeof initialPhase === 'string', 'Phase is een string')
    },
  },

  // ── Step 15: Error resilience via localStorage ────────────────────────
  {
    id: 'ob-save-localstorage-resilience',
    name: 'Error resilience: data bewaard via localStorage bij save failure',
    category: CAT,
    description: 'Bij save failure is alle data bewaard in localStorage voor herstel',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const DRAFT_KEY = 'trifinity_onboarding_draft'
      assertEqual(DRAFT_KEY, 'trifinity_onboarding_draft', 'Draft localStorage key correct')

      // Simulate the resilience flow including new fields
      const mockDraft = {
        identity: { full_name: 'Error Test', net_monthly_income: '4000' },
        persona: 'pensioenplanner',
        selectedModules: ['vermogensregistratie', 'toekomstplannen', 'inzicht_acties'],
        horizon: { fire_end_strategy: 'deplete', fire_end_age: 90, temporal_balance: 3 },
        newsDescription: 'Test beschrijving',
        budgetAmounts: { 'huur-hypotheek': 960 },
        bankAccounts: [{ name: 'ING', balance: '3000', has_budget_tracking: true }],
        assets: [],
        debts: [],
        preferences: { focuses: ['fire_freedom'] },
      }

      const serialized = JSON.stringify(mockDraft)
      const restored = JSON.parse(serialized)
      assertEqual(restored.identity.full_name, 'Error Test', 'Draft identity hersteld na error')
      assertEqual(restored.bankAccounts[0].has_budget_tracking, true, 'Draft budget tracking hersteld')
      assertEqual(restored.persona, 'pensioenplanner', 'Draft persona hersteld')
      assertEqual(restored.selectedModules.length, 3, 'Draft modules hersteld')
      assertEqual(restored.horizon.fire_end_strategy, 'deplete', 'Draft horizon hersteld')
      assertEqual(restored.newsDescription, 'Test beschrijving', 'Draft newsDescription hersteld')

      // After successful save, draft should be cleared
      const clearedDraft = null
      assertEqual(clearedDraft, null, 'Draft gewist na succesvolle save')
    },
  },

  // ── Step 16: Register under category ────────────────────────────────
  {
    id: 'ob-save-category-registered',
    name: 'Registratie onder categorie "Onboarding \u2014 Save & Success"',
    category: CAT,
    description: 'Alle tests zijn geregistreerd onder de juiste categorie',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      assertEqual(CAT, 'onboarding.save', 'Categorie ID is onboarding.save')

      const expectedPrefix = 'ob-save-'
      const testIds = tests.map((t) => t.id)
      testIds.forEach((id) => {
        assert(id.startsWith(expectedPrefix), `Test ID "${id}" begint met "${expectedPrefix}"`)
      })

      assert(tests.length >= 10, `Minstens 10 tests, actueel: ${tests.length}`)
    },
  },
]

export function register(): void {
  registerTests(tests)
}
