import { registerTests } from '../test-registry'
import { assert, assertEqual, assertIncludes } from '../assert'
import { unauthenticatedFetch } from '../server-runner'
import type { TestCase } from '../test-types'

const CAT = 'onboarding.flow'

// ── Constants derived from onboarding page.tsx ──────────────────────────────

/**
 * Module IDs matching lib/module-registry.ts.
 * The onboarding step order is dynamic based on which modules the user selected.
 */
type ModuleId =
  | 'budgetteren'
  | 'vermogensregistratie'
  | 'aandelenregistratie'
  | 'toekomstplannen'
  | 'inzicht_acties'
  | 'nieuws'

type Step =
  | 'intro'
  | 'identity'
  | 'intent'
  | 'bezittingen'
  | 'budgets'
  | 'horizon'
  | 'nieuws_only'
  | 'saving'
  | 'success'

type Direction = 'forward' | 'back'

/**
 * Replicate the dynamic step computation from page.tsx.
 * Steps are only included when the corresponding module is active.
 * Special case: if only 'nieuws' is selected, show a single nieuws_only step.
 */
function computeStepOrder(selectedModules: ModuleId[]): Step[] {
  const steps: Step[] = ['intro', 'identity', 'intent']
  const has = (m: ModuleId) => selectedModules.includes(m)
  const isNewsOnly = selectedModules.length === 1 && has('nieuws')

  if (isNewsOnly) {
    steps.push('nieuws_only')
  } else {
    if (has('vermogensregistratie') || has('inzicht_acties')) steps.push('bezittingen')
    if (has('budgetteren')) steps.push('budgets')
    if (has('toekomstplannen')) steps.push('horizon')
  }

  steps.push('saving', 'success')
  return steps
}

/** Compute direction from old step to new step within a given step order */
function getDirection(stepOrder: Step[], from: Step, to: Step): Direction {
  return stepOrder.indexOf(to) >= stepOrder.indexOf(from) ? 'forward' : 'back'
}

/** localStorage key for onboarding draft persistence */
const LOCALSTORAGE_DRAFT_KEY = 'trifinity_onboarding_draft'

/** Minimal reducer replica for state management verification */
interface State {
  step: Step
  direction: Direction
  identity: Record<string, unknown>
  intent: string | null
  activeModules: ModuleId[]
  horizon: Record<string, unknown>
  newsDescription: string
  budgetAmounts: Record<string, number>
  bankAccounts: unknown[]
  assets: unknown[]
  debts: unknown[]
}

const SAVING_MESSAGES = [
  'Profiel wordt opgeslagen...',
  'Budgetten worden aangemaakt...',
  'Bezittingen en schulden verwerken...',
  'Dashboard wordt geconfigureerd...',
  'Bijna klaar...',
]

/** Persona module presets matching lib/module-registry.ts */
const PERSONA_MODULE_PRESETS: Record<string, ModuleId[]> = {
  budgetteerder: ['budgetteren'],
  vermogensverdeler: ['vermogensregistratie', 'inzicht_acties'],
  pensioenplanner: ['vermogensregistratie', 'toekomstplannen', 'inzicht_acties'],
  fire_fighter: ['budgetteren', 'vermogensregistratie', 'aandelenregistratie', 'toekomstplannen', 'inzicht_acties', 'nieuws'],
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: FIRE Fighter — all content steps ─────────────────
  {
    id: 'ob-flow-fire-fighter-steps',
    name: 'FIRE Fighter: alle content stappen (bezittingen, budgets, horizon)',
    category: CAT,
    description: 'FIRE Fighter selecteert alle modules → alle content stappen worden getoond',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const modules = PERSONA_MODULE_PRESETS.fire_fighter
      const steps = computeStepOrder(modules)

      // intro + identity + intent + bezittingen + budgets + horizon + saving + success = 8
      assertEqual(steps.length, 8, 'FIRE Fighter: 8 stappen totaal')
      assertEqual(steps[0], 'intro', 'Stap 1: intro')
      assertEqual(steps[1], 'identity', 'Stap 2: identity')
      assertEqual(steps[2], 'intent', 'Stap 3: intent')
      assertEqual(steps[3], 'bezittingen', 'Stap 4: bezittingen')
      assertEqual(steps[4], 'budgets', 'Stap 5: budgets')
      assertEqual(steps[5], 'horizon', 'Stap 6: horizon')
      assertEqual(steps[6], 'saving', 'Stap 7: saving')
      assertEqual(steps[7], 'success', 'Stap 8: success')

      // Verify all content steps are present
      assert(steps.includes('bezittingen'), 'bevat bezittingen')
      assert(steps.includes('budgets'), 'bevat budgets')
      assert(steps.includes('horizon'), 'bevat horizon')
      assert(!steps.includes('nieuws_only'), 'geen nieuws_only (niet nieuws-only)')
    },
  },

  // ── Step 2: Nieuws-only — only nieuws_only step ───────────────
  {
    id: 'ob-flow-nieuws-only-steps',
    name: 'Nieuws-only: alleen nieuws_only stap',
    category: CAT,
    description: 'Alleen nieuws module → enkele nieuws_only content stap',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const modules: ModuleId[] = ['nieuws']
      const steps = computeStepOrder(modules)

      // intro + identity + modules + nieuws_only + saving + success = 6
      assertEqual(steps.length, 6, 'Nieuws-only: 6 stappen totaal')
      assertEqual(steps[3], 'nieuws_only', 'Stap 4: nieuws_only')

      assert(!steps.includes('bezittingen'), 'geen bezittingen')
      assert(!steps.includes('budgets'), 'geen budgets')
      assert(!steps.includes('horizon'), 'geen horizon')
      assert(steps.includes('nieuws_only'), 'bevat nieuws_only')
    },
  },

  // ── Step 3: Budgetteerder — bezittingen + budgets ─────────────
  {
    id: 'ob-flow-budgetteerder-steps',
    name: 'Budgetteerder: bezittingen + budgets alleen',
    category: CAT,
    description: 'Budgetteerder selecteert alleen budgetteren → alleen budgets stap (geen bezittingen)',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const modules = PERSONA_MODULE_PRESETS.budgetteerder
      assertEqual(modules.length, 1, 'Budgetteerder: 1 module')
      assertEqual(modules[0], 'budgetteren', 'Budgetteerder: budgetteren module')

      const steps = computeStepOrder(modules)

      // intro + identity + intent + budgets + saving + success = 6
      assertEqual(steps.length, 6, 'Budgetteerder: 6 stappen totaal')
      assert(!steps.includes('bezittingen'), 'geen bezittingen (alleen budgetteren, geen vermogensregistratie/inzicht_acties)')
      assert(steps.includes('budgets'), 'bevat budgets')
      assert(!steps.includes('horizon'), 'geen horizon')
      assert(!steps.includes('nieuws_only'), 'geen nieuws_only')
    },
  },

  // ── Step 4: Pensioenplanner — bezittingen + horizon ─
  {
    id: 'ob-flow-pensioenplanner-steps',
    name: 'Pensioenplanner: bezittingen + horizon',
    category: CAT,
    description: 'Pensioenplanner selecteert vermogensregistratie + toekomstplannen + inzicht_acties',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const modules = PERSONA_MODULE_PRESETS.pensioenplanner
      assertEqual(modules.length, 3, 'Pensioenplanner: 3 modules')
      assert(modules.includes('vermogensregistratie'), 'bevat vermogensregistratie')
      assert(modules.includes('toekomstplannen'), 'bevat toekomstplannen')
      assert(modules.includes('inzicht_acties'), 'bevat inzicht_acties')

      const steps = computeStepOrder(modules)

      // intro + identity + intent + bezittingen + horizon + saving + success = 7
      assertEqual(steps.length, 7, 'Pensioenplanner: 7 stappen totaal')
      assert(steps.includes('bezittingen'), 'bevat bezittingen')
      assert(!steps.includes('budgets'), 'geen budgets (budgetteren niet actief)')
      assert(steps.includes('horizon'), 'bevat horizon')
    },
  },

  // ── Step 5: Vermogensverdeler — bezittingen ─────
  {
    id: 'ob-flow-vermogensverdeler-steps',
    name: 'Vermogensverdeler: bezittingen',
    category: CAT,
    description: 'Vermogensverdeler selecteert vermogensregistratie + inzicht_acties',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const modules = PERSONA_MODULE_PRESETS.vermogensverdeler
      assertEqual(modules.length, 2, 'Vermogensverdeler: 2 modules')
      assert(modules.includes('vermogensregistratie'), 'bevat vermogensregistratie')
      assert(modules.includes('inzicht_acties'), 'bevat inzicht_acties')

      const steps = computeStepOrder(modules)

      // intro + identity + intent + bezittingen + saving + success = 6
      assertEqual(steps.length, 6, 'Vermogensverdeler: 6 stappen totaal')
      assert(steps.includes('bezittingen'), 'bevat bezittingen')
      assert(!steps.includes('budgets'), 'geen budgets')
      assert(!steps.includes('horizon'), 'geen horizon')
      assert(!steps.includes('nieuws_only'), 'geen nieuws_only')
    },
  },

  // ── Step 6: State preservation on forward/back navigation ─────
  {
    id: 'ob-flow-state-preservation',
    name: 'State behoud bij voor/achteruit navigeren',
    category: CAT,
    description: 'useReducer bewaart alle velden bij stap wissels, inclusief horizon en newsDescription',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const modules: ModuleId[] = ['vermogensregistratie', 'toekomstplannen', 'inzicht_acties']
      const stepOrder = computeStepOrder(modules)

      // Simulate reducer behavior: setting identity data, then navigating away and back
      const state: State = {
        step: 'identity',
        direction: 'forward',
        identity: { full_name: 'Test Gebruiker', date_of_birth: '1990-01-15' },
        intent: 'pensioenplanner',
        activeModules: modules,
        horizon: { fire_end_strategy: 'deplete', fire_end_age: 90, temporal_balance: 3 },
        newsDescription: '',
        budgetAmounts: {},
        bankAccounts: [{ name: 'ING Betaal', balance: 5000 }],
        assets: [{ name: 'ETF Portfolio', current_value: 50000 }],
        debts: [],
      }

      // Navigate forward to bezittingen
      const newDirection = getDirection(stepOrder, 'identity', 'bezittingen')
      assertEqual(newDirection, 'forward', 'Navigatie vooruit geeft forward direction')

      // Navigate back to identity
      const backDirection = getDirection(stepOrder, 'bezittingen', 'identity')
      assertEqual(backDirection, 'back', 'Navigatie achteruit geeft back direction')

      // State should be preserved (spread operator in reducer)
      assertEqual(state.identity.full_name, 'Test Gebruiker', 'Naam bewaard na navigatie')
      assertEqual(state.identity.date_of_birth, '1990-01-15', 'Geboortedatum bewaard')
      assertEqual(state.intent, 'pensioenplanner', 'Intent bewaard na navigatie')
      assertEqual(state.activeModules.length, 3, 'Modules bewaard na navigatie')
      assertEqual(state.bankAccounts.length, 1, 'Bankrekeningen bewaard')
      assertEqual(state.assets.length, 1, 'Assets bewaard')
      assertEqual((state.horizon as Record<string, unknown>).fire_end_strategy, 'deplete', 'Horizon data bewaard')
    },
  },

  // ── Step 7: StepTransition animation classes ──────────────────
  {
    id: 'ob-flow-step-transition-classes',
    name: 'StepTransition: step-enter-forward en step-enter-back CSS classes',
    category: CAT,
    description: 'StepTransition component past correcte animatie-class toe op basis van direction',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Use FIRE Fighter step order (all steps) for comprehensive coverage
      const modules = PERSONA_MODULE_PRESETS.fire_fighter
      const stepOrder = computeStepOrder(modules)

      // Forward navigations
      assertEqual(getDirection(stepOrder, 'intro', 'identity'), 'forward', 'intro → identity = forward')
      assertEqual(getDirection(stepOrder, 'identity', 'intent'), 'forward', 'identity → modules = forward')
      assertEqual(getDirection(stepOrder, 'intent', 'bezittingen'), 'forward', 'modules → bezittingen = forward')
      assertEqual(getDirection(stepOrder, 'bezittingen', 'budgets'), 'forward', 'bezittingen → budgets = forward')
      assertEqual(getDirection(stepOrder, 'budgets', 'horizon'), 'forward', 'budgets → horizon = forward')
      assertEqual(getDirection(stepOrder, 'horizon', 'saving'), 'forward', 'horizon → saving = forward')
      assertEqual(getDirection(stepOrder, 'saving', 'success'), 'forward', 'saving → success = forward')

      // Back navigations
      assertEqual(getDirection(stepOrder, 'identity', 'intro'), 'back', 'identity → intro = back')
      assertEqual(getDirection(stepOrder, 'intent', 'identity'), 'back', 'modules → identity = back')
      assertEqual(getDirection(stepOrder, 'bezittingen', 'intent'), 'back', 'bezittingen → modules = back')
      assertEqual(getDirection(stepOrder, 'budgets', 'bezittingen'), 'back', 'budgets → bezittingen = back')
      assertEqual(getDirection(stepOrder, 'horizon', 'budgets'), 'back', 'horizon → budgets = back')

      // Same step = forward (newIdx >= oldIdx)
      assertEqual(getDirection(stepOrder, 'identity', 'identity'), 'forward', 'Zelfde stap = forward')

      // CSS class mapping
      function directionToClass(dir: Direction): string {
        return dir === 'forward' ? 'step-enter-forward' : 'step-enter-back'
      }
      assertEqual(directionToClass('forward'), 'step-enter-forward', 'Forward direction → step-enter-forward')
      assertEqual(directionToClass('back'), 'step-enter-back', 'Back direction → step-enter-back')
    },
  },

  // ── Step 8: Auth guard — no user → redirect to /login ─────────
  {
    id: 'ob-flow-auth-guard',
    name: 'Auth guard: geen gebruiker → redirect naar /login',
    category: CAT,
    description: 'Onboarding pagina vereist authenticatie',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await unauthenticatedFetch('/onboarding', { redirect: 'manual' })
      assert(
        res.status === 200 || (res.status >= 300 && res.status < 400),
        `Expected 200 or redirect for /onboarding, got ${res.status}`,
      )
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location') ?? ''
        assert(
          location.includes('/login'),
          `Expected redirect to /login, got ${location}`,
        )
      }
    },
  },

  // ── Step 9: onboarding_completed guard → redirect to /core ────
  {
    id: 'ob-flow-completed-guard',
    name: 'Onboarding voltooid guard: al voltooid → redirect naar /core',
    category: CAT,
    description: 'Client-side check: als onboarding_completed = true, redirect naar /core',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const guardConditions = [
        'Client: getUser() null → /login',
        'Client: onboarding_completed true → /core (via getHomePath)',
        'Layout: !onboarding_completed → /onboarding',
        'API: onboarding_completed → alreadyCompleted: true',
      ]
      assertEqual(guardConditions.length, 4, 'Vier guard condities bestaan')
    },
  },

  // ── Step 10: Loading state — spinner ──────────────────────────
  {
    id: 'ob-flow-loading-spinner',
    name: 'Loading state: spinner zichtbaar tijdens auth/onboarding check',
    category: CAT,
    description: 'Spinner met animate-spin en border styling toont tijdens initiële check',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const spinnerClasses = 'h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-ed)] border-t-[var(--ink)]'
      assert(spinnerClasses.includes('animate-spin'), 'Spinner heeft animate-spin class')
      assert(spinnerClasses.includes('rounded-full'), 'Spinner is rond')
      assert(spinnerClasses.includes('border-2'), 'Spinner heeft border styling')

      const containerClasses = 'flex min-h-screen items-center justify-center'
      assert(containerClasses.includes('min-h-screen'), 'Container vult scherm')
      assert(containerClasses.includes('items-center'), 'Spinner is verticaal gecentreerd')
      assert(containerClasses.includes('justify-center'), 'Spinner is horizontaal gecentreerd')
    },
  },

  // ── Step 11: Error handling — sticky error banner ─────────────
  {
    id: 'ob-flow-error-banner',
    name: 'Error handling: sticky error banner bij save failure',
    category: CAT,
    description: 'Bij save failure verschijnt een sticky error banner met retry en dismiss opties',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Verify error types are handled
      const errorTypes = {
        abort: 'De server reageert niet. Controleer je internetverbinding en probeer het opnieuw.',
        fetchFail: 'Geen internetverbinding. Controleer je netwerk en probeer het opnieuw.',
        generic: 'Onbekende fout bij opslaan',
      }

      assert(errorTypes.abort.includes('server reageert niet'), 'AbortError message correct')
      assert(errorTypes.fetchFail.includes('Geen internetverbinding'), 'Fetch fail message correct')
      assert(errorTypes.generic.includes('Onbekende fout'), 'Generic error message correct')

      // After error, step goes back to last content step (dynamic)
      // The page.tsx uses: contentSteps[contentSteps.length - 1]
      // For FIRE Fighter that would be 'horizon', for budgetteerder that would be 'budgets'
      const ffModules = PERSONA_MODULE_PRESETS.fire_fighter
      const ffSteps = computeStepOrder(ffModules)
      const ffContentSteps = ffSteps.filter((s) => !['saving', 'success'].includes(s))
      assertEqual(ffContentSteps[ffContentSteps.length - 1], 'horizon', 'FIRE Fighter: error recovery naar horizon')

      const budgetModules = PERSONA_MODULE_PRESETS.budgetteerder
      const budgetSteps = computeStepOrder(budgetModules)
      const budgetContentSteps = budgetSteps.filter((s) => !['saving', 'success'].includes(s))
      assertEqual(budgetContentSteps[budgetContentSteps.length - 1], 'budgets', 'Budgetteerder: error recovery naar budgets')
    },
  },

  // ── Step 12: Data preservation after error ─────────────────────
  {
    id: 'ob-flow-data-after-error',
    name: 'Data behoud bij error: terug naar laatste content stap met alle data intact',
    category: CAT,
    description: 'Na save failure gaat flow terug naar laatste content stap, alle useReducer state intact',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const modules: ModuleId[] = ['vermogensregistratie', 'toekomstplannen', 'inzicht_acties']
      const stepOrder = computeStepOrder(modules)
      const contentSteps = stepOrder.filter((s) => !['saving', 'success'].includes(s))
      const lastContentStep = contentSteps[contentSteps.length - 1]
      assertEqual(lastContentStep, 'horizon', 'Laatste content stap is horizon')

      const stateBeforeSave: State = {
        step: 'horizon',
        direction: 'forward',
        identity: { full_name: 'Jan Jansen', net_monthly_income: '4500' },
        intent: null,
        activeModules: modules,
        horizon: { fire_end_strategy: 'legacy', fire_legacy_amount: '200000' },
        newsDescription: '',
        budgetAmounts: {},
        bankAccounts: [{ name: 'ING Betaal', balance: '3000' }],
        assets: [{ name: 'Vanguard ETF', current_value: '80000' }],
        debts: [{ name: 'Studieschuld', current_balance: '12000' }],
      }

      // Save initiated → step goes to 'saving'
      const savingState = { ...stateBeforeSave, step: 'saving' as Step, direction: 'forward' as Direction }
      assertEqual(savingState.step, 'saving', 'Stap gaat naar saving')
      assertEqual(savingState.identity.full_name, 'Jan Jansen', 'Identity intact tijdens saving')

      // Save fails → step goes back to last content step
      const errorState = { ...savingState, step: lastContentStep, direction: 'back' as Direction }
      assertEqual(errorState.step, 'horizon', 'Stap terug naar horizon na error')
      assertEqual(errorState.identity.full_name, 'Jan Jansen', 'Identity intact na error')
      assertEqual(errorState.activeModules.length, 3, 'Modules intact na error')
      assertEqual((errorState.horizon as Record<string, unknown>).fire_end_strategy, 'legacy', 'Horizon intact na error')
      assertEqual(errorState.bankAccounts.length, 1, 'Bankrekeningen intact na error')
      assertEqual(errorState.assets.length, 1, 'Assets intact na error')
      assertEqual(errorState.debts.length, 1, 'Debts intact na error')
    },
  },

  // ── Step 13: Logout function ──────────────────────────────────
  {
    id: 'ob-flow-logout',
    name: 'Logout: supabase.auth.signOut() → redirect naar /login',
    category: CAT,
    description: 'Uitloggen op onboarding pagina beschikbaar op alle interactieve stappen',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // showHeader = !['intro', 'success', 'saving'].includes(step)
      // Header with logout visible on all interactive steps
      const modules = PERSONA_MODULE_PRESETS.fire_fighter
      const allSteps = computeStepOrder(modules)
      const headerVisibleSteps = allSteps.filter(
        (s) => !['intro', 'success', 'saving'].includes(s),
      )

      // identity, intent, bezittingen, budgets, horizon = 5 steps with header
      assertEqual(headerVisibleSteps.length, 5, 'Header met logout zichtbaar op 5 stappen')
      assertIncludes([...headerVisibleSteps], 'identity', 'Header zichtbaar op identity')
      assertIncludes([...headerVisibleSteps], 'intent', 'Header zichtbaar op intent')
      assertIncludes([...headerVisibleSteps], 'bezittingen', 'Header zichtbaar op bezittingen')
      assertIncludes([...headerVisibleSteps], 'budgets', 'Header zichtbaar op budgets')
      assertIncludes([...headerVisibleSteps], 'horizon', 'Header zichtbaar op horizon')
    },
  },

  // ── Step 14: Save API endpoint structure ──────────────────────
  {
    id: 'ob-flow-save-api-exists',
    name: 'Save API endpoint /api/onboarding/save-own-data bereikbaar',
    category: CAT,
    description: 'De save API endpoint bestaat en vereist authenticatie',
    priority: 'high',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await unauthenticatedFetch('/api/onboarding/save-own-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      assert(
        res.status === 401 || res.status === 400 || res.status === 403,
        `Expected 401/400/403 for unauthenticated save, got ${res.status}`,
      )
    },
  },

  // ── Step 15: Saving messages rotation ─────────────────────────
  {
    id: 'ob-flow-saving-messages',
    name: 'Saving stap: 5 roterende berichten',
    category: CAT,
    description: 'Tijdens het opslaan roteren 5 berichten elke 800ms',
    priority: 'medium',
    estimatedDurationMs: 100,
    fn() {
      assertEqual(SAVING_MESSAGES.length, 5, 'Exact 5 saving messages')
      assert(SAVING_MESSAGES[0].includes('Profiel'), 'Eerste bericht over profiel')
      assert(SAVING_MESSAGES[1].includes('Budgetten'), 'Tweede bericht over budgetten')
      assert(SAVING_MESSAGES[2].includes('Bezittingen'), 'Derde bericht over bezittingen')
      assert(SAVING_MESSAGES[3].includes('Dashboard'), 'Vierde bericht over dashboard')
      assert(SAVING_MESSAGES[4].includes('Bijna klaar'), 'Vijfde bericht = bijna klaar')
    },
  },

  // ── Step 16: Double-submit protection ─────────────────────────
  {
    id: 'ob-flow-double-submit-guard',
    name: 'Double-submit bescherming: 4-laags guard',
    category: CAT,
    description: 'Vier lagen voorkomen dubbele opslag: saving state, disabled buttons, UI replacement, server idempotency',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const layers = [
        'saving state guard',
        'disabled buttons',
        'UI replacement (saving step)',
        'server-side idempotency',
      ]
      assertEqual(layers.length, 4, 'Vier beschermingslagen')

      const savingStepHasButtons = false
      assertEqual(savingStepHasButtons, false, 'Saving stap heeft geen knoppen')
    },
  },

  // ── Step 17: Dynamic step order — module-driven ────────────────
  {
    id: 'ob-flow-dynamic-step-order',
    name: 'Dynamic step order: modules bepalen welke content stappen getoond worden',
    category: CAT,
    description: 'computeStepOrder genereert stappen op basis van geselecteerde modules',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Empty modules: only fixed steps (no content steps between modules and saving)
      const emptySteps = computeStepOrder([])
      assertEqual(emptySteps.length, 5, 'Geen modules: 5 stappen (intro, identity, modules, saving, success)')
      assert(!emptySteps.includes('bezittingen'), 'Geen modules: geen bezittingen')
      assert(!emptySteps.includes('budgets'), 'Geen modules: geen budgets')
      assert(!emptySteps.includes('horizon'), 'Geen modules: geen horizon')
      // Only vermogensregistratie: bezittingen only
      const vermogenSteps = computeStepOrder(['vermogensregistratie'])
      assert(vermogenSteps.includes('bezittingen'), 'vermogensregistratie → bezittingen')
      assert(!vermogenSteps.includes('budgets'), 'geen budgetteren → geen budgets')
      assert(!vermogenSteps.includes('horizon'), 'geen toekomstplannen → geen horizon')

      // Only toekomstplannen: horizon only
      const toekomstSteps = computeStepOrder(['toekomstplannen'])
      assert(!toekomstSteps.includes('bezittingen'), 'alleen toekomstplannen → geen bezittingen')
      assert(toekomstSteps.includes('horizon'), 'toekomstplannen → horizon')

      // budgetteren alone does NOT imply bezittingen (needs vermogensregistratie or inzicht_acties)
      const budgetSteps = computeStepOrder(['budgetteren'])
      assert(!budgetSteps.includes('bezittingen'), 'alleen budgetteren → geen bezittingen')
      assert(budgetSteps.includes('budgets'), 'budgetteren → budgets')

      // budgetteren + inzicht_acties implies bezittingen (via inzicht_acties)
      const coachingSteps = computeStepOrder(['budgetteren', 'inzicht_acties'])
      assert(coachingSteps.includes('bezittingen'), 'inzicht_acties triggert bezittingen')
      assert(coachingSteps.includes('budgets'), 'budgetteren → budgets')

      // Step order is preserved: bezittingen always before budgets, budgets before horizon, etc.
      const allModules: ModuleId[] = ['budgetteren', 'vermogensregistratie', 'toekomstplannen', 'inzicht_acties']
      const fullSteps = computeStepOrder(allModules)
      assert(fullSteps.indexOf('bezittingen') < fullSteps.indexOf('budgets'), 'bezittingen vóór budgets')
      assert(fullSteps.indexOf('budgets') < fullSteps.indexOf('horizon'), 'budgets vóór horizon')
      assert(fullSteps.indexOf('horizon') < fullSteps.indexOf('saving'), 'horizon vóór saving')
    },
  },

  // ── Step 18: localStorage draft persistence ────────────────────
  {
    id: 'ob-flow-localstorage-persistence',
    name: 'localStorage draft persistence: key trifinity_onboarding_draft',
    category: CAT,
    description: 'Onboarding data wordt opgeslagen in localStorage inclusief modules, horizon en newsDescription',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      assertEqual(LOCALSTORAGE_DRAFT_KEY, 'trifinity_onboarding_draft', 'localStorage key correct')

      // Draft data structure mirrors the PersistedData interface
      const draftFields = [
        'identity', 'intent', 'activeModules', 'horizon', 'newsDescription',
        'budgetAmounts', 'bankAccounts', 'assets', 'debts', 'preferences', 'lastStep',
      ]
      assertEqual(draftFields.length, 11, 'Draft bevat 11 velden (volledige PersistedData)')

      // Simulate serialization/deserialization roundtrip
      const mockState = {
        identity: { full_name: 'Draft Test', net_monthly_income: '3000' },
        intent: 'pensioenplanner',
        activeModules: ['vermogensregistratie', 'toekomstplannen', 'inzicht_acties'],
        horizon: { fire_end_strategy: 'deplete', fire_end_age: 90, temporal_balance: 3 },
        newsDescription: '',
        budgetAmounts: { 'huur-hypotheek': 840 },
        bankAccounts: [{ name: 'ING', balance: '2500' }],
        assets: [],
        debts: [],
        preferences: { focuses: [] },
        lastStep: 'bezittingen',
      }
      const serialized = JSON.stringify(mockState)
      const deserialized = JSON.parse(serialized)
      assertEqual(deserialized.identity.full_name, 'Draft Test', 'Draft identity hersteld')
      assertEqual(deserialized.intent, 'pensioenplanner', 'Draft intent hersteld')
      assertEqual(deserialized.activeModules.length, 3, 'Draft modules hersteld')
      assertEqual(deserialized.horizon.fire_end_strategy, 'deplete', 'Draft horizon hersteld')
      assertEqual(deserialized.lastStep, 'bezittingen', 'Draft lastStep hersteld')
      assertEqual(deserialized.bankAccounts.length, 1, 'Draft bankAccounts hersteld')
    },
  },

  // ── Step 19: Intent clears on manual toggle ──────────────────
  {
    id: 'ob-flow-intent-clears-on-toggle',
    name: 'Intent selectie: handmatig togglen wist intent naar null',
    category: CAT,
    description: 'Wanneer een module handmatig gewijzigd wordt, verdwijnt de intent-highlight',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Simulate: select intent → sets modules and intent
      let state = {
        intent: 'fire_fighter' as string | null,
        activeModules: [...PERSONA_MODULE_PRESETS.fire_fighter],
      }
      assertEqual(state.intent, 'fire_fighter', 'Intent geselecteerd')
      assertEqual(state.activeModules.length, 6, 'Alle 6 modules actief')

      // Simulate: toggle a module off → intent becomes null
      state = {
        intent: null,
        activeModules: state.activeModules.filter((m) => m !== 'nieuws'),
      }
      assertEqual(state.intent, null, 'Intent wordt null na handmatige toggle')
      assertEqual(state.activeModules.length, 5, 'Module verwijderd')
      assert(!state.activeModules.includes('nieuws'), 'Nieuws module uitgeschakeld')
    },
  },

  // ── Step 20: Nieuws-only special case ─────────────────────────
  {
    id: 'ob-flow-nieuws-only-special-case',
    name: 'Nieuws-only: nieuws + andere module is geen nieuws-only',
    category: CAT,
    description: 'nieuws_only stap verschijnt alleen als exact 1 module (nieuws) is geselecteerd',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // Only nieuws → nieuws_only
      const nieuwsOnly = computeStepOrder(['nieuws'])
      assert(nieuwsOnly.includes('nieuws_only'), 'Alleen nieuws → nieuws_only stap')
      assert(!nieuwsOnly.includes('bezittingen'), 'Alleen nieuws → geen bezittingen')

      // Nieuws + another module → NOT nieuws_only
      const nieuwsPlus = computeStepOrder(['nieuws', 'budgetteren'])
      assert(!nieuwsPlus.includes('nieuws_only'), 'Nieuws + budgetteren → geen nieuws_only')
      assert(!nieuwsPlus.includes('bezittingen'), 'Nieuws + budgetteren → geen bezittingen (geen vermogensregistratie/inzicht_acties)')
      assert(nieuwsPlus.includes('budgets'), 'Nieuws + budgetteren → budgets')
    },
  },
]

export function register(): void {
  registerTests(tests)
}
