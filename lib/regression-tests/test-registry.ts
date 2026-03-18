import type { TestCase, TestCategory } from './test-types'

// ── Test Registry ───────────────────────────────────────────────────────────
// Central place where all regression test cases are registered per category.

const categories: Map<string, TestCategory> = new Map()
const testCases: Map<string, TestCase[]> = new Map()

/** Register a new category */
export function registerCategory(category: TestCategory): void {
  categories.set(category.id, { ...category, testCount: 0 })
  if (!testCases.has(category.id)) {
    testCases.set(category.id, [])
  }
}

/** Register a test case. Category must be registered first. */
export function registerTest(test: TestCase): void {
  const catTests = testCases.get(test.category)
  if (!catTests) {
    // Auto-create category if not explicitly registered
    registerCategory({
      id: test.category,
      label: test.category,
      description: '',
      testCount: 0,
    })
    testCases.get(test.category)!.push(test)
  } else {
    catTests.push(test)
  }
  // Update count
  const cat = categories.get(test.category)
  if (cat) {
    cat.testCount = testCases.get(test.category)!.length
  }
}

/** Register multiple tests at once */
export function registerTests(tests: TestCase[]): void {
  tests.forEach(registerTest)
}

/** Get all registered categories (sorted by label) */
export function getCategories(): TestCategory[] {
  return Array.from(categories.values()).sort((a, b) =>
    a.label.localeCompare(b.label, 'nl'),
  )
}

/** Get all tests in a category */
export function getTestsByCategory(categoryId: string): TestCase[] {
  return testCases.get(categoryId) ?? []
}

/** Get all registered tests */
export function getAllTests(): TestCase[] {
  return Array.from(testCases.values()).flat()
}

/** Get a single test by id */
export function getTestById(id: string): TestCase | undefined {
  for (const tests of testCases.values()) {
    const found = tests.find((t) => t.id === id)
    if (found) return found
  }
  return undefined
}

/** Clear all registrations (for testing) */
export function clearRegistry(): void {
  categories.clear()
  testCases.clear()
}

// ── Dynamic test loader ─────────────────────────────────────────────────────
// This function dynamically imports all test modules and registers their tests.
//
// KNOWN LIMITATION — Test Isolatie
// Tests in deze regression suite delen dezelfde JavaScript runtime en hebben
// geen automatische isolatie van state (geen beforeEach/afterEach cleanup).
// Dit betekent:
//   1. Tests die globale/module-level state muteren kunnen andere tests beinvloeden
//   2. De volgorde van test-uitvoering kan het resultaat beinvloeden
//   3. Parallelle uitvoering binnen een category kan race conditions veroorzaken
// Mitigatie: elke test moet zelfstandig zijn en eigen test-data opzetten.
// Gebruik geen gedeelde mutable state tussen tests. Als isolatie nodig is,
// maak dan een lokale kopie van de data in de test-functie.

let loaded = false

/** Helper to import a suite module with error logging instead of silent failure */
async function loadSuite(path: string, name: string): Promise<void> {
  try {
    const mod = await import(/* @vite-ignore */ path)
    mod.register()
  } catch (err) {
    console.warn(
      `[test-registry] Failed to load suite "${name}" from ${path}:`,
      err instanceof Error ? err.message : err,
    )
  }
}

export async function loadAllTests(): Promise<void> {
  if (loaded) return
  loaded = true

  await loadSuite('@/lib/regression-tests/suites/fire-simulatie', 'fire-simulatie')
  await loadSuite('@/lib/regression-tests/suites/horizon-grafiek', 'horizon-grafiek')
  await loadSuite('@/lib/regression-tests/suites/onttrekkingsstrategie', 'onttrekkingsstrategie')
  await loadSuite('@/lib/regression-tests/suites/kern-metrics', 'kern-metrics')
  await loadSuite('@/lib/regression-tests/suites/widget-systeem', 'widget-systeem')
  await loadSuite('@/lib/regression-tests/suites/categorisatie', 'categorisatie')
  await loadSuite('@/lib/regression-tests/suites/ai-beveiliging', 'ai-beveiliging')
  await loadSuite('@/lib/regression-tests/suites/dashboard-builder', 'dashboard-builder')
  await loadSuite('@/lib/regression-tests/suites/navigatie', 'navigatie')
  await loadSuite('@/lib/regression-tests/suites/beheer-layout', 'beheer-layout')
  await loadSuite('@/lib/regression-tests/suites/delen-jaaroverzicht', 'delen-jaaroverzicht')
  await loadSuite('@/lib/regression-tests/suites/sovereignty-levels', 'sovereignty-levels')
  await loadSuite('@/lib/regression-tests/suites/beheer-ai', 'beheer-ai')
  await loadSuite('@/lib/regression-tests/suites/identity-navigatie', 'identity-navigatie')
  await loadSuite('@/lib/regression-tests/suites/briefing-directives', 'briefing-directives')
  await loadSuite('@/lib/regression-tests/suites/profiel-instellingen', 'profiel-instellingen')
  await loadSuite('@/lib/regression-tests/suites/beheer-bank-connect', 'beheer-bank-connect')
  await loadSuite('@/lib/regression-tests/suites/beheer-toegang', 'beheer-toegang')
  await loadSuite('@/lib/regression-tests/suites/aow-leeftijd', 'aow-leeftijd')
  await loadSuite('@/lib/regression-tests/suites/beheer-nieuws-ai', 'beheer-nieuws-ai')
  await loadSuite('@/lib/regression-tests/suites/beheer-testdata', 'beheer-testdata')
  await loadSuite('@/lib/regression-tests/suites/widgets-avatar', 'widgets-avatar')
  await loadSuite('@/lib/regression-tests/suites/beheer-migratie', 'beheer-migratie')
  await loadSuite('@/lib/regression-tests/suites/beheer-informatief', 'beheer-informatief')
  await loadSuite('@/lib/regression-tests/suites/onboarding-flow', 'onboarding-flow')
  await loadSuite('@/lib/regression-tests/suites/onboarding-intro', 'onboarding-intro')
  await loadSuite('@/lib/regression-tests/suites/onboarding-identity', 'onboarding-identity')
  await loadSuite('@/lib/regression-tests/suites/onboarding-extras', 'onboarding-extras')
  await loadSuite('@/lib/regression-tests/suites/onboarding-budgets', 'onboarding-budgets')
  await loadSuite('@/lib/regression-tests/suites/onboarding-preferences', 'onboarding-preferences')
  await loadSuite('@/lib/regression-tests/suites/onboarding-reset', 'onboarding-reset')
  await loadSuite('@/lib/regression-tests/suites/onboarding-ui', 'onboarding-ui')
  await loadSuite('@/lib/regression-tests/suites/onboarding-save', 'onboarding-save')
  await loadSuite('@/lib/regression-tests/suites/onboarding-persona-seed', 'onboarding-persona-seed')
  await loadSuite('@/lib/regression-tests/suites/kern-formatting', 'kern-formatting')
  await loadSuite('@/lib/regression-tests/suites/box3-belasting', 'box3-belasting')
  await loadSuite('@/lib/regression-tests/suites/budget-berekeningen', 'budget-berekeningen')
  await loadSuite('@/lib/regression-tests/suites/recurring-transfers', 'recurring-transfers')
  await loadSuite('@/lib/regression-tests/suites/horizon-parameters', 'horizon-parameters')
  await loadSuite('@/lib/regression-tests/suites/budget-api-routes', 'budget-api-routes')
  await loadSuite('@/lib/regression-tests/suites/kern-api-routes', 'kern-api-routes')
  await loadSuite('@/lib/regression-tests/suites/dashboard-widgets', 'dashboard-widgets')
  await loadSuite('@/lib/regression-tests/suites/nieuws-briefing', 'nieuws-briefing')
  await loadSuite('@/lib/regression-tests/suites/wil-aanbevelingen', 'wil-aanbevelingen')
  await loadSuite('@/lib/regression-tests/suites/wil-gezondheid', 'wil-gezondheid')
  await loadSuite('@/lib/regression-tests/suites/feature-gating', 'feature-gating')
  await loadSuite('@/lib/regression-tests/suites/rapportages', 'rapportages')
  await loadSuite('@/lib/regression-tests/suites/security-auth', 'security-auth')
  await loadSuite('@/lib/regression-tests/suites/checkin-flow', 'checkin-flow')
  await loadSuite('@/lib/regression-tests/suites/input-validatie', 'input-validatie')
  await loadSuite('@/lib/regression-tests/suites/api-response-performance', 'api-response-performance')
  await loadSuite('@/lib/regression-tests/suites/berekening-performance', 'berekening-performance')
  await loadSuite('@/lib/regression-tests/suites/security-privacy', 'security-privacy')
  await loadSuite('@/lib/regression-tests/suites/database-integriteit', 'database-integriteit')
  await loadSuite('@/lib/regression-tests/suites/data-tijdreeksen', 'data-tijdreeksen')
  await loadSuite('@/lib/regression-tests/suites/error-handling', 'error-handling')
  await loadSuite('@/lib/regression-tests/suites/onboarding-api-flow', 'onboarding-api-flow')
  await loadSuite('@/lib/regression-tests/suites/bank-connectie-flow', 'bank-connectie-flow')
  await loadSuite('@/lib/regression-tests/suites/testdata-persona-validatie', 'testdata-persona-validatie')
  await loadSuite('@/lib/regression-tests/suites/kern-assets-crud', 'kern-assets-crud')
  await loadSuite('@/lib/regression-tests/suites/kern-budget-crud', 'kern-budget-crud')
  await loadSuite('@/lib/regression-tests/suites/kern-bank-connect-flow', 'kern-bank-connect-flow')
  await loadSuite('@/lib/regression-tests/suites/kern-import-export', 'kern-import-export')
  await loadSuite('@/lib/regression-tests/suites/kern-schulden', 'kern-schulden')
  await loadSuite('@/lib/regression-tests/suites/kern-dividenden', 'kern-dividenden')
  await loadSuite('@/lib/regression-tests/suites/horizon-whatif', 'horizon-whatif')
  await loadSuite('@/lib/regression-tests/suites/berichten-chat', 'berichten-chat')
  await loadSuite('@/lib/regression-tests/suites/horizon-strategie-pagina', 'horizon-strategie-pagina')

  // ── Validate that all registered categories have tests ────────────────────
  // Warn about categories with 0 tests after loading — this likely indicates
  // a suite that failed to load or register its tests silently.
  for (const cat of getCategories()) {
    if (cat.testCount === 0) {
      console.warn(
        `[test-registry] Category "${cat.label}" (${cat.id}) has 0 tests after loading. ` +
          'This may indicate a failed suite import or missing register() call.',
      )
    }
  }
}

/** Reset loaded flag (for testing) */
export function resetLoaded(): void {
  loaded = false
}
