import { registerCategory, registerTests } from '../test-registry'
import { MODULE_REQUIRED_STEPS } from '@/lib/module-required-steps'
import type { ModuleId } from '@/lib/module-registry'
import { assert, assertEqual } from '../assert'
import type { TestCase } from '../test-types'

const CAT = 'module-activation'

const tests: TestCase[] = [
  // ── MODULE_REQUIRED_STEPS mapping ───────────────────────────────────────

  {
    id: 'modact-steps-budgetteren',
    name: 'Budgetteren vereist bezittingen en budgets stappen',
    description: 'MODULE_REQUIRED_STEPS voor budgetteren bevat bezittingen + budgets',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const steps = MODULE_REQUIRED_STEPS['budgetteren'] ?? []
      assert(steps.includes('bezittingen'), 'budgetteren must require bezittingen')
      assert(steps.includes('budgets'), 'budgetteren must require budgets')
      assertEqual(steps.length, 2, 'budgetteren step count')
    },
  },

  {
    id: 'modact-steps-vermogensregistratie',
    name: 'Vermogensregistratie vereist alleen bezittingen',
    description: 'MODULE_REQUIRED_STEPS voor vermogensregistratie bevat alleen bezittingen',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const steps = MODULE_REQUIRED_STEPS['vermogensregistratie'] ?? []
      assert(steps.includes('bezittingen'), 'vermogensregistratie must require bezittingen')
      assertEqual(steps.length, 1, 'vermogensregistratie step count')
    },
  },

  {
    id: 'modact-steps-aandelenregistratie',
    name: 'Aandelenregistratie vereist alleen bezittingen',
    description: 'MODULE_REQUIRED_STEPS voor aandelenregistratie bevat alleen bezittingen',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const steps = MODULE_REQUIRED_STEPS['aandelenregistratie'] ?? []
      assert(steps.includes('bezittingen'), 'aandelenregistratie must require bezittingen')
      assertEqual(steps.length, 1, 'aandelenregistratie step count')
    },
  },

  {
    id: 'modact-steps-toekomstplannen',
    name: 'Toekomstplannen vereist horizon stap',
    description: 'MODULE_REQUIRED_STEPS voor toekomstplannen bevat alleen horizon',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const steps = MODULE_REQUIRED_STEPS['toekomstplannen'] ?? []
      assert(steps.includes('horizon'), 'toekomstplannen must require horizon')
      assertEqual(steps.length, 1, 'toekomstplannen step count')
    },
  },

  {
    id: 'modact-steps-inzicht-acties-empty',
    name: 'Inzicht & Acties heeft geen verplichte stappen',
    description: 'MODULE_REQUIRED_STEPS voor inzicht_acties is een lege array',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const steps = MODULE_REQUIRED_STEPS['inzicht_acties'] ?? []
      assertEqual(steps.length, 0, 'inzicht_acties should have no required steps')
    },
  },

  // ── Missing steps computation ──────────────────────────────────────────

  {
    id: 'modact-missing-steps-filters-completed',
    name: 'Voltooide stappen worden gefilterd uit missing steps',
    description: 'Als een stap al voltooid is, verschijnt die niet in de missing list',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const requiredSteps = MODULE_REQUIRED_STEPS['budgetteren'] ?? []
      const completedSteps = ['bezittingen']
      const missing = requiredSteps.filter((s) => !completedSteps.includes(s))
      assertEqual(missing.length, 1, 'should have 1 missing step')
      assertEqual(missing[0], 'budgets', 'remaining step should be budgets')
    },
  },

  {
    id: 'modact-no-missing-steps-skips-modal',
    name: 'Geen ontbrekende stappen = geen modal (directe activatie)',
    description: 'Als alle stappen voltooid zijn, moet de modal niet getoond worden',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const requiredSteps = MODULE_REQUIRED_STEPS['vermogensregistratie'] ?? []
      const completedSteps = ['bezittingen', 'budgets', 'horizon']
      const missing = requiredSteps.filter((s) => !completedSteps.includes(s))
      assertEqual(missing.length, 0, 'no steps should be missing')
    },
  },

  // ── Cross-module step sharing ──────────────────────────────────────────

  {
    id: 'modact-shared-bezittingen-step',
    name: 'Bezittingen-stap wordt gedeeld tussen modules',
    description: 'Na voltooien van bezittingen voor vermogensregistratie, hoeft budgetteren die niet opnieuw',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // User completed bezittingen for vermogensregistratie
      const completedSteps = ['bezittingen']

      // Now enabling budgetteren — only budgets should be missing
      const budgetSteps = MODULE_REQUIRED_STEPS['budgetteren'] ?? []
      const budgetMissing = budgetSteps.filter((s) => !completedSteps.includes(s))
      assertEqual(budgetMissing.length, 1, 'only budgets should remain')
      assertEqual(budgetMissing[0], 'budgets', 'remaining step should be budgets')

      // Enabling aandelenregistratie — bezittingen already done, no steps missing
      const aandelenSteps = MODULE_REQUIRED_STEPS['aandelenregistratie'] ?? []
      const aandelenMissing = aandelenSteps.filter((s) => !completedSteps.includes(s))
      assertEqual(aandelenMissing.length, 0, 'aandelenregistratie should have no missing steps')
    },
  },

  // ── Nieuws module has no required steps ────────────────────────────────

  {
    id: 'modact-nieuws-no-steps',
    name: 'Nieuws module heeft geen verplichte stappen',
    description: 'Nieuws is niet in MODULE_REQUIRED_STEPS, dus geen modal nodig',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      const steps = MODULE_REQUIRED_STEPS['nieuws' as ModuleId]
      assert(steps === undefined, 'nieuws should not be in MODULE_REQUIRED_STEPS')
    },
  },

  // ── All modules covered ────────────────────────────────────────────────

  {
    id: 'modact-all-modules-have-mapping',
    name: 'Alle modules behalve nieuws hebben een stap-mapping',
    description: 'Elke module (behalve nieuws) moet een entry in MODULE_REQUIRED_STEPS hebben',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const modulesWithSteps: ModuleId[] = [
        'budgetteren',
        'vermogensregistratie',
        'aandelenregistratie',
        'toekomstplannen',
        'inzicht_acties',
      ]
      for (const moduleId of modulesWithSteps) {
        const steps = MODULE_REQUIRED_STEPS[moduleId]
        assert(steps !== undefined, `${moduleId} should have an entry in MODULE_REQUIRED_STEPS`)
      }
    },
  },
]

export function register() {
  registerCategory({
    id: CAT,
    label: 'Module Activatie',
    description: 'Testen voor de module-activatie modal met embedded onboarding formulieren',
    icon: 'Zap',
    testCount: 0,
  })
  registerTests(tests)
}
