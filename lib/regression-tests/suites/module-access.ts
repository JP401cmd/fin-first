import { registerCategory, registerTests } from '../test-registry'
import {
  validateModules,
  getActiveNavModules,
  getHomePath,
  ALL_MODULES,
  PERSONA_MODULE_PRESETS,
} from '@/lib/module-registry'
import type { ModuleId, PersonaId } from '@/lib/module-registry'
import { isWidgetVisible } from '@/lib/compute-module-access'
import { assert, assertEqual } from '../assert'
import type { TestCase } from '../test-types'

const CAT = 'modules'

const tests: TestCase[] = [
  // ── Validatie: lege en ongeldige module sets ──────────────────────────────

  {
    id: 'mod-validate-empty',
    name: 'Lege modules array is ongeldig',
    description: 'Een lege modules array heeft geen basismodule en moet falen',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const result = validateModules([])
      assertEqual(result.valid, false, 'empty modules valid')
      assert(result.errors.length > 0, 'empty modules must have errors')
    },
  },

  {
    id: 'mod-validate-dependency',
    name: 'aandelenregistratie zonder vermogensregistratie is ongeldig',
    description: 'aandelenregistratie heeft een harde afhankelijkheid op vermogensregistratie',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // aandelenregistratie requires vermogensregistratie (hard dependency)
      // but no base module is present either, so two errors expected
      const result = validateModules(['aandelenregistratie'])
      assertEqual(result.valid, false, 'aandelenregistratie without vermogensregistratie valid')
      // Must contain a dependency error mentioning vermogensregistratie
      const hasDependencyError = result.errors.some((e) =>
        e.toLowerCase().includes('vermogensregistratie'),
      )
      assert(hasDependencyError, 'error must reference vermogensregistratie dependency')
    },
  },

  {
    id: 'mod-validate-requires-one-of',
    name: 'inzicht_acties zonder basismodule is ongeldig, met budgetteren geldig',
    description: 'inzicht_acties vereist budgetteren of vermogensregistratie (requiresOneOf)',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Without any base module: must be invalid (both base-module rule AND requiresOneOf)
      const withoutBase = validateModules(['inzicht_acties'])
      assertEqual(withoutBase.valid, false, 'inzicht_acties alone valid')

      // With budgetteren: valid (satisfies both base-module rule and requiresOneOf)
      const withBudget = validateModules(['budgetteren', 'inzicht_acties'])
      assertEqual(withBudget.valid, true, 'inzicht_acties + budgetteren valid')
    },
  },

  {
    id: 'mod-validate-toekomstplannen-dep',
    name: 'toekomstplannen zonder basismodule ongeldig, met vermogensregistratie geldig',
    description: 'toekomstplannen vereist budgetteren of vermogensregistratie (requiresOneOf)',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Without any base module: must be invalid
      const withoutBase = validateModules(['toekomstplannen'])
      assertEqual(withoutBase.valid, false, 'toekomstplannen alone valid')

      // With vermogensregistratie: valid
      const withAssets = validateModules(['vermogensregistratie', 'toekomstplannen'])
      assertEqual(withAssets.valid, true, 'toekomstplannen + vermogensregistratie valid')
    },
  },

  {
    id: 'mod-validate-valid-minimal',
    name: "['budgetteren'] is een geldige module set",
    description: 'Een array met alleen budgetteren voldoet aan de minimale vereiste',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const result = validateModules(['budgetteren'])
      assertEqual(result.valid, true, 'budgetteren alone valid')
      assertEqual(result.errors.length, 0, 'budgetteren alone errors')
    },
  },

  {
    id: 'mod-validate-valid-full',
    name: 'ALL_MODULES is een geldige module set',
    description: 'De volledige module set moet altijd de validatieregels doorstaan',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const result = validateModules(ALL_MODULES)
      assertEqual(result.valid, true, 'ALL_MODULES valid')
      assertEqual(result.errors.length, 0, 'ALL_MODULES errors')
    },
  },

  // ── Navigatie modules ─────────────────────────────────────────────────────

  {
    id: 'mod-nav-only-budget',
    name: "getActiveNavModules(['budgetteren']) geeft alleen ['kern']",
    description: 'Alleen budgetteren actief → alleen kern navigatietab zichtbaar',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const nav = getActiveNavModules(['budgetteren'])
      assertEqual(nav.length, 1, 'nav length for budgetteren only')
      assertEqual(nav[0], 'kern', 'nav[0] for budgetteren only')
    },
  },

  {
    id: 'mod-nav-all',
    name: 'getActiveNavModules(ALL_MODULES) geeft alle drie tabs',
    description: 'Met alle modules actief zijn kern, wil en horizon zichtbaar',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const nav = getActiveNavModules(ALL_MODULES)
      // Must include all three nav tabs in canonical order
      assert(nav.includes('kern'), 'ALL_MODULES nav includes kern')
      assert(nav.includes('wil'), 'ALL_MODULES nav includes wil')
      assert(nav.includes('horizon'), 'ALL_MODULES nav includes horizon')
      assertEqual(nav.length, 3, 'ALL_MODULES nav length')
      // Canonical order: kern, wil, horizon
      assertEqual(nav[0], 'kern', 'nav order: first is kern')
      assertEqual(nav[1], 'wil', 'nav order: second is wil')
      assertEqual(nav[2], 'horizon', 'nav order: third is horizon')
    },
  },

  {
    id: 'mod-nav-no-wil',
    name: 'Zonder inzicht_acties is er geen wil-tab',
    description: 'inzicht_acties is de enige module met navModule wil',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // budgetteren + vermogensregistratie together, but no inzicht_acties
      const nav = getActiveNavModules(['budgetteren', 'vermogensregistratie'])
      assert(!nav.includes('wil'), 'no wil tab without inzicht_acties')
    },
  },

  // ── Startpagina routing ──────────────────────────────────────────────────

  {
    id: 'mod-home-budget',
    name: "getHomePath(['budgetteren']) === '/core/budgets'",
    description: 'Alleen budgetteren actief → startpagina is /core/budgets',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const path = getHomePath(['budgetteren'])
      assertEqual(path, '/core/budgets', 'home path for budgetteren')
    },
  },

  {
    id: 'mod-home-assets',
    name: "getHomePath(['vermogensregistratie']) === '/core/assets'",
    description: 'Alleen vermogensregistratie actief → startpagina is /core/assets',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const path = getHomePath(['vermogensregistratie'])
      assertEqual(path, '/core/assets', 'home path for vermogensregistratie')
    },
  },

  {
    id: 'mod-home-dashboard',
    name: 'getHomePath met inzicht_acties === /dashboard',
    description: 'inzicht_acties activeert de rijkste startpagina /dashboard',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // inzicht_acties has highest priority in getHomePath regardless of other modules
      const withInzicht: ModuleId[] = ['budgetteren', 'inzicht_acties']
      assertEqual(getHomePath(withInzicht), '/dashboard', 'home path with inzicht_acties')

      // Also works with vermogensregistratie
      const withAssets: ModuleId[] = ['vermogensregistratie', 'inzicht_acties']
      assertEqual(getHomePath(withAssets), '/dashboard', 'home path with inzicht_acties + assets')
    },
  },

  // ── Widget zichtbaarheid ─────────────────────────────────────────────────

  {
    id: 'mod-widget-hidden-module',
    name: 'Budget widget verborgen zonder budgetteren module',
    description: 'Widget budgetten vereist de budgetteren module; zonder die module is het verborgen',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // vermogensregistratie active, but NOT budgetteren
      const result = isWidgetVisible('budgetten', ['vermogensregistratie'], [])
      assertEqual(result.visible, false, 'budgetten visible without budgetteren')
      assertEqual(result.reason, 'module_inactive', 'budgetten reason without budgetteren')
    },
  },

  {
    id: 'mod-widget-visible',
    name: 'Budget widget zichtbaar met budgetteren actief',
    description: 'Widget budgetten wordt zichtbaar wanneer de budgetteren module actief is',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // budgetteren active → budgetten widget must be visible
      // budgetten is not mapped to a paid feature, so tier check also passes
      const result = isWidgetVisible('budgetten', ['budgetteren'], [])
      assertEqual(result.visible, true, 'budgetten visible with budgetteren')
      assertEqual(result.reason, 'visible', 'budgetten reason with budgetteren')
    },
  },

  {
    id: 'mod-widget-tier-locked',
    name: 'AI widget verborgen zonder AI abonnement',
    description: 'Widget ai_inzicht vereist de ai subscription tier naast de inzicht_acties module',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // inzicht_acties module active, but subscriptions is empty (no 'ai' sub)
      const result = isWidgetVisible('ai_inzicht', ['budgetteren', 'inzicht_acties'], [])
      assertEqual(result.visible, false, 'ai_inzicht visible without ai subscription')
      assertEqual(result.reason, 'tier_locked', 'ai_inzicht reason without ai subscription')
    },
  },

  {
    id: 'mod-widget-foundation',
    name: 'Foundation widget netto_vermogen altijd zichtbaar',
    description: 'Widgets die niet in WIDGET_MODULE_MAP staan zijn altijd zichtbaar, ongeacht modules',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // netto_vermogen is a foundation widget — not in WIDGET_MODULE_MAP
      // Should be visible even with an empty module set
      const noModules = isWidgetVisible('netto_vermogen', [], [])
      assertEqual(noModules.visible, true, 'netto_vermogen visible with no modules')
      assertEqual(noModules.reason, 'visible', 'netto_vermogen reason with no modules')

      // Also visible when some modules are active
      const withModules = isWidgetVisible('netto_vermogen', ['budgetteren'], [])
      assertEqual(withModules.visible, true, 'netto_vermogen visible with budgetteren')
    },
  },

  // ── Persona presets ──────────────────────────────────────────────────────

  {
    id: 'mod-persona-presets-valid',
    name: 'Alle 4 persona presets zijn geldige module sets',
    description: 'Elke persona preset moet de module validatieregels doorstaan',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const personas = Object.keys(PERSONA_MODULE_PRESETS) as PersonaId[]
      assertEqual(personas.length, 4, 'persona preset count')

      for (const personaId of personas) {
        const modules = PERSONA_MODULE_PRESETS[personaId]
        const result = validateModules(modules)
        assertEqual(
          result.valid,
          true,
          `persona ${personaId} modules valid (errors: ${result.errors.join(', ')})`,
        )
      }
    },
  },
]

export function register(): void {
  registerCategory({
    id: CAT,
    label: 'Module Access',
    description: 'Module-gebaseerde feature scheiding',
    testCount: 0,
  })
  registerTests(tests)
}
