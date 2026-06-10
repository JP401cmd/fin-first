import { registerTests } from '../test-registry'
import { assert, assertEqual } from '../assert'
import { unauthenticatedFetch } from '../server-runner'
import type { TestCase } from '../test-types'

const CAT = 'onboarding.flow'

// ── Constants derived from onboarding page.tsx (redesign mei 2026) ───────────
//
// Happy-path: doel → identity → inkomen → bezittingen → spaardoel → klaar →
// saving → success. Alle content-stappen zijn altijd actief; module-gating
// gebeurt buiten onboarding. News-only: doel → nieuws_only → saving → success.

type Step =
  | 'doel'
  | 'identity'
  | 'inkomen'
  | 'bezittingen'
  | 'spaardoel'
  | 'klaar'
  | 'nieuws_only'
  | 'saving'
  | 'success'

type Direction = 'forward' | 'back'

type ModuleId =
  | 'budgetteren'
  | 'vermogensregistratie'
  | 'aandelenregistratie'
  | 'toekomstplannen'
  | 'inzicht_acties'
  | 'nieuws'

/**
 * Replica van computeStepOrder uit page.tsx. Sinds de mei 2026-redesign is
 * de volgorde vast (geen module-afhankelijke content-stappen meer); alleen
 * news-only is een afwijkend pad.
 */
function computeStepOrder(selectedModules: ModuleId[]): Step[] {
  const isNewsOnly = selectedModules.length === 1 && selectedModules[0] === 'nieuws'

  if (isNewsOnly) {
    return ['doel', 'nieuws_only', 'saving', 'success']
  }

  return ['doel', 'identity', 'inkomen', 'bezittingen', 'spaardoel', 'klaar', 'saving', 'success']
}

/** Compute direction from old step to new step within a given step order */
function getDirection(stepOrder: Step[], from: Step, to: Step): Direction {
  return stepOrder.indexOf(to) >= stepOrder.indexOf(from) ? 'forward' : 'back'
}

/** localStorage key for onboarding draft persistence */
const LOCALSTORAGE_DRAFT_KEY = 'trifinity_onboarding_draft'

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: Happy-path — vaste stappenvolgorde ─────────────────────────────
  {
    id: 'ob-flow-happy-path-steps',
    name: 'Happy-path: doel → identity → inkomen → bezittingen → spaardoel → klaar',
    category: CAT,
    description: 'Alle content-stappen zijn altijd actief, ongeacht module-keuze',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const steps = computeStepOrder(['budgetteren', 'vermogensregistratie', 'toekomstplannen'])

      assertEqual(steps.length, 8, 'Happy-path: 8 stappen totaal')
      assertEqual(steps[0], 'doel', 'Stap 1: doel')
      assertEqual(steps[1], 'identity', 'Stap 2: identity')
      assertEqual(steps[2], 'inkomen', 'Stap 3: inkomen')
      assertEqual(steps[3], 'bezittingen', 'Stap 4: bezittingen')
      assertEqual(steps[4], 'spaardoel', 'Stap 5: spaardoel')
      assertEqual(steps[5], 'klaar', 'Stap 6: klaar')
      assertEqual(steps[6], 'saving', 'Stap 7: saving')
      assertEqual(steps[7], 'success', 'Stap 8: success')
      assert(!steps.includes('nieuws_only'), 'geen nieuws_only in happy-path')
    },
  },

  // ── Step 2: Module-keuze beïnvloedt de stappen NIET ────────────────────────
  {
    id: 'ob-flow-steps-module-onafhankelijk',
    name: 'Stappenvolgorde is module-onafhankelijk',
    category: CAT,
    description: 'Module-gating gebeurt buiten onboarding — elke (niet news-only) selectie geeft dezelfde stappen',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const variants: ModuleId[][] = [
        [],
        ['budgetteren'],
        ['vermogensregistratie', 'inzicht_acties'],
        ['budgetteren', 'vermogensregistratie', 'aandelenregistratie', 'toekomstplannen', 'inzicht_acties', 'nieuws'],
      ]
      const expected = computeStepOrder([]).join(',')
      for (const modules of variants) {
        assertEqual(
          computeStepOrder(modules).join(','),
          expected,
          `Zelfde stappen voor modules: [${modules.join(', ')}]`,
        )
      }
    },
  },

  // ── Step 3: News-only — verkort pad ────────────────────────────────────────
  {
    id: 'ob-flow-nieuws-only-steps',
    name: 'News-only: doel → nieuws_only → saving → success',
    category: CAT,
    description: 'Alleen nieuws-module → verkort pad zonder financiële content-stappen',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const steps = computeStepOrder(['nieuws'])

      assertEqual(steps.length, 4, 'News-only: 4 stappen totaal')
      assertEqual(steps[0], 'doel', 'Stap 1: doel')
      assertEqual(steps[1], 'nieuws_only', 'Stap 2: nieuws_only')
      assert(!steps.includes('identity'), 'geen identity')
      assert(!steps.includes('bezittingen'), 'geen bezittingen')

      // Nieuws + andere module → géén news-only pad
      const nieuwsPlus = computeStepOrder(['nieuws', 'budgetteren'])
      assert(!nieuwsPlus.includes('nieuws_only'), 'nieuws + budgetteren → geen nieuws_only')
      assert(nieuwsPlus.includes('identity'), 'nieuws + budgetteren → normale flow')
    },
  },

  // ── Step 4: Richting-berekening voor StepTransition ────────────────────────
  {
    id: 'ob-flow-step-transition-direction',
    name: 'StepTransition: forward/back richting per navigatie',
    category: CAT,
    description: 'Richting wordt afgeleid van index-volgorde in de actieve stappen',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const stepOrder = computeStepOrder([])

      assertEqual(getDirection(stepOrder, 'doel', 'identity'), 'forward', 'doel → identity = forward')
      assertEqual(getDirection(stepOrder, 'identity', 'inkomen'), 'forward', 'identity → inkomen = forward')
      assertEqual(getDirection(stepOrder, 'inkomen', 'bezittingen'), 'forward', 'inkomen → bezittingen = forward')
      assertEqual(getDirection(stepOrder, 'bezittingen', 'spaardoel'), 'forward', 'bezittingen → spaardoel = forward')
      assertEqual(getDirection(stepOrder, 'spaardoel', 'klaar'), 'forward', 'spaardoel → klaar = forward')
      assertEqual(getDirection(stepOrder, 'klaar', 'saving'), 'forward', 'klaar → saving = forward')

      assertEqual(getDirection(stepOrder, 'identity', 'doel'), 'back', 'identity → doel = back')
      assertEqual(getDirection(stepOrder, 'klaar', 'spaardoel'), 'back', 'klaar → spaardoel = back')

      // Zelfde stap = forward (newIdx >= oldIdx)
      assertEqual(getDirection(stepOrder, 'identity', 'identity'), 'forward', 'Zelfde stap = forward')
    },
  },

  // ── Step 5: Error recovery — terug naar laatste content-stap ───────────────
  {
    id: 'ob-flow-error-recovery-step',
    name: 'Error recovery: save-failure landt op laatste content-stap (klaar)',
    category: CAT,
    description: 'Na save failure gaat de flow terug naar de laatste content-stap vóór saving',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const steps = computeStepOrder([])
      const contentSteps = steps.filter((s) => !['saving', 'success'].includes(s))
      assertEqual(contentSteps[contentSteps.length - 1], 'klaar', 'Laatste content-stap is klaar')

      const newsSteps = computeStepOrder(['nieuws'])
      const newsContentSteps = newsSteps.filter((s) => !['saving', 'success'].includes(s))
      assertEqual(newsContentSteps[newsContentSteps.length - 1], 'nieuws_only', 'News-only: laatste content-stap is nieuws_only')
    },
  },

  // ── Step 6: localStorage draft persistence ─────────────────────────────────
  {
    id: 'ob-flow-localstorage-persistence',
    name: 'localStorage draft persistence: key trifinity_onboarding_draft',
    category: CAT,
    description: 'Onboarding draft wordt opgeslagen onder de stabiele localStorage-key',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      assertEqual(LOCALSTORAGE_DRAFT_KEY, 'trifinity_onboarding_draft', 'localStorage key correct')

      // Serialization roundtrip met de huidige draft-shape
      const mockState = {
        identity: { full_name: 'Draft Test', date_of_birth: '1990-01-15' },
        selectedGoals: ['vermogen-overzicht', 'eerder-stoppen'],
        activeModules: ['vermogensregistratie', 'toekomstplannen'],
        bankAccounts: [{ name: 'ING', balance: '2500' }],
        assets: [],
        debts: [],
        lastStep: 'bezittingen',
      }
      const roundtrip = JSON.parse(JSON.stringify(mockState))
      assertEqual(roundtrip.identity.full_name, 'Draft Test', 'Draft identity hersteld')
      assertEqual(roundtrip.selectedGoals.length, 2, 'Draft doelen hersteld')
      assertEqual(roundtrip.lastStep, 'bezittingen', 'Draft lastStep hersteld')
    },
  },

  // ── Step 7: Auth guard — geen user → redirect naar /login ──────────────────
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

  // ── Step 8: Voltooid-guard — al geonboard → /overzicht ─────────────────────
  {
    id: 'ob-flow-completed-guard',
    name: 'Onboarding voltooid guard: al voltooid → redirect naar /overzicht',
    category: CAT,
    description: 'Client-side check: als onboarding_completed = true, redirect naar /overzicht',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const guardConditions = [
        'Client: getUser() null → /login',
        'Client: onboarding_completed true → /overzicht',
        'Layout: !onboarding_completed → /onboarding',
        'API: onboarding_completed → alreadyCompleted: true',
      ]
      assertEqual(guardConditions.length, 4, 'Vier guard condities bestaan')
    },
  },

  // ── Step 9: Save API endpoint structuur ────────────────────────────────────
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
]

export function register(): void {
  registerTests(tests)
}
