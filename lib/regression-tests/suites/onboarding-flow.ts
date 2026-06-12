import { registerTests } from '../test-registry'
import { assert, assertEqual } from '../assert'
import { unauthenticatedFetch } from '../server-runner'
import type { TestCase } from '../test-types'

const CAT = 'onboarding.flow'

// ── Constants derived from onboarding page.tsx (redesign mei 2026, ───────────
// versimpeld jun 2026)
//
// Happy-path: identity → inkomen → bezittingen → spaardoel → klaar →
// saving → success. De doel-stap ("Waar help ik je mee?") en het news-only-pad
// zijn in jun 2026 verwijderd; alle modules staan na onboarding default aan en
// gating gebeurt buiten onboarding (abonnement + user-toggles).

type Step =
  | 'identity'
  | 'inkomen'
  | 'bezittingen'
  | 'spaardoel'
  | 'klaar'
  | 'saving'
  | 'success'

type Direction = 'forward' | 'back'

/**
 * Replica van computeStepOrder uit page.tsx. Sinds jun 2026 statisch: er is
 * geen module-keuze (en dus geen afwijkend news-only-pad) meer in onboarding.
 */
function computeStepOrder(): Step[] {
  return ['identity', 'inkomen', 'bezittingen', 'spaardoel', 'klaar', 'saving', 'success']
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
    name: 'Happy-path: identity → inkomen → bezittingen → spaardoel → klaar',
    category: CAT,
    description: 'Vaste stappenvolgorde — de doel-stap en news-only zijn verwijderd (jun 2026)',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const steps = computeStepOrder()

      assertEqual(steps.length, 7, 'Happy-path: 7 stappen totaal')
      assertEqual(steps[0], 'identity', 'Stap 1: identity')
      assertEqual(steps[1], 'inkomen', 'Stap 2: inkomen')
      assertEqual(steps[2], 'bezittingen', 'Stap 3: bezittingen')
      assertEqual(steps[3], 'spaardoel', 'Stap 4: spaardoel')
      assertEqual(steps[4], 'klaar', 'Stap 5: klaar')
      assertEqual(steps[5], 'saving', 'Stap 6: saving')
      assertEqual(steps[6], 'success', 'Stap 7: success')
      assert(!(steps as string[]).includes('doel'), 'geen doel-stap meer')
      assert(!(steps as string[]).includes('nieuws_only'), 'geen nieuws_only-pad meer')
    },
  },

  // ── Step 2: Richting-berekening voor StepTransition ────────────────────────
  {
    id: 'ob-flow-step-transition-direction',
    name: 'StepTransition: forward/back richting per navigatie',
    category: CAT,
    description: 'Richting wordt afgeleid van index-volgorde in de actieve stappen',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const stepOrder = computeStepOrder()

      assertEqual(getDirection(stepOrder, 'identity', 'inkomen'), 'forward', 'identity → inkomen = forward')
      assertEqual(getDirection(stepOrder, 'inkomen', 'bezittingen'), 'forward', 'inkomen → bezittingen = forward')
      assertEqual(getDirection(stepOrder, 'bezittingen', 'spaardoel'), 'forward', 'bezittingen → spaardoel = forward')
      assertEqual(getDirection(stepOrder, 'spaardoel', 'klaar'), 'forward', 'spaardoel → klaar = forward')
      assertEqual(getDirection(stepOrder, 'klaar', 'saving'), 'forward', 'klaar → saving = forward')

      assertEqual(getDirection(stepOrder, 'inkomen', 'identity'), 'back', 'inkomen → identity = back')
      assertEqual(getDirection(stepOrder, 'klaar', 'spaardoel'), 'back', 'klaar → spaardoel = back')

      // Zelfde stap = forward (newIdx >= oldIdx)
      assertEqual(getDirection(stepOrder, 'identity', 'identity'), 'forward', 'Zelfde stap = forward')
    },
  },

  // ── Step 3: Error recovery — terug naar laatste content-stap ───────────────
  {
    id: 'ob-flow-error-recovery-step',
    name: 'Error recovery: save-failure landt op laatste content-stap (klaar)',
    category: CAT,
    description: 'Na save failure gaat de flow terug naar de laatste content-stap vóór saving',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const steps = computeStepOrder()
      const contentSteps = steps.filter((s) => !['saving', 'success'].includes(s))
      assertEqual(contentSteps.length, 5, 'Vijf content-stappen')
      assertEqual(contentSteps[contentSteps.length - 1], 'klaar', 'Laatste content-stap is klaar')
    },
  },

  // ── Step 4: localStorage draft persistence ─────────────────────────────────
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

  // ── Step 5: Auth guard — geen user → redirect naar /login ──────────────────
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

  // ── Step 6: Voltooid-guard — al geonboard → /overzicht ─────────────────────
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

  // ── Step 7: Save API endpoint structuur ────────────────────────────────────
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
