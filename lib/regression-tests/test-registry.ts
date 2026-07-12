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

/** Get a single category by id */
export function getCategoryById(categoryId: string): TestCategory | undefined {
  return categories.get(categoryId)
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

// ── Static test loader ──────────────────────────────────────────────────────
// All suite imports use STATIC string paths so Next.js Turbopack/webpack can
// statically analyse them. Each import is wrapped in its own try/catch so one
// failing suite never blocks the rest. Imports run in parallel via
// Promise.allSettled() for faster loading.
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

export async function loadAllTests(): Promise<void> {
  if (loaded) return
  loaded = true

  const results = await Promise.allSettled([
    import('@/lib/regression-tests/suites/fire-simulatie').then(m => m.register()).catch(e => { console.warn('[test-registry] fire-simulatie failed:', e) }),
    import('@/lib/regression-tests/suites/horizon-grafiek').then(m => m.register()).catch(e => { console.warn('[test-registry] horizon-grafiek failed:', e) }),
    import('@/lib/regression-tests/suites/onttrekkingsstrategie').then(m => m.register()).catch(e => { console.warn('[test-registry] onttrekkingsstrategie failed:', e) }),
    import('@/lib/regression-tests/suites/kern-metrics').then(m => m.register()).catch(e => { console.warn('[test-registry] kern-metrics failed:', e) }),
    import('@/lib/regression-tests/suites/widget-systeem').then(m => m.register()).catch(e => { console.warn('[test-registry] widget-systeem failed:', e) }),
    import('@/lib/regression-tests/suites/categorisatie').then(m => m.register()).catch(e => { console.warn('[test-registry] categorisatie failed:', e) }),
    import('@/lib/regression-tests/suites/ai-beveiliging').then(m => m.register()).catch(e => { console.warn('[test-registry] ai-beveiliging failed:', e) }),
    import('@/lib/regression-tests/suites/dashboard-builder').then(m => m.register()).catch(e => { console.warn('[test-registry] dashboard-builder failed:', e) }),
    import('@/lib/regression-tests/suites/navigatie').then(m => m.register()).catch(e => { console.warn('[test-registry] navigatie failed:', e) }),
    import('@/lib/regression-tests/suites/beheer-layout').then(m => m.register()).catch(e => { console.warn('[test-registry] beheer-layout failed:', e) }),
    import('@/lib/regression-tests/suites/delen-jaaroverzicht').then(m => m.register()).catch(e => { console.warn('[test-registry] delen-jaaroverzicht failed:', e) }),
    import('@/lib/regression-tests/suites/sovereignty-levels').then(m => m.register()).catch(e => { console.warn('[test-registry] sovereignty-levels failed:', e) }),
    import('@/lib/regression-tests/suites/beheer-ai').then(m => m.register()).catch(e => { console.warn('[test-registry] beheer-ai failed:', e) }),
    import('@/lib/regression-tests/suites/briefing-directives').then(m => m.register()).catch(e => { console.warn('[test-registry] briefing-directives failed:', e) }),
    import('@/lib/regression-tests/suites/profiel-instellingen').then(m => m.register()).catch(e => { console.warn('[test-registry] profiel-instellingen failed:', e) }),
    import('@/lib/regression-tests/suites/beheer-bank-connect').then(m => m.register()).catch(e => { console.warn('[test-registry] beheer-bank-connect failed:', e) }),
    import('@/lib/regression-tests/suites/aow-leeftijd').then(m => m.register()).catch(e => { console.warn('[test-registry] aow-leeftijd failed:', e) }),
    import('@/lib/regression-tests/suites/beheer-nieuws-ai').then(m => m.register()).catch(e => { console.warn('[test-registry] beheer-nieuws-ai failed:', e) }),
    import('@/lib/regression-tests/suites/beheer-testdata').then(m => m.register()).catch(e => { console.warn('[test-registry] beheer-testdata failed:', e) }),
    import('@/lib/regression-tests/suites/widgets-avatar').then(m => m.register()).catch(e => { console.warn('[test-registry] widgets-avatar failed:', e) }),
    import('@/lib/regression-tests/suites/beheer-informatief').then(m => m.register()).catch(e => { console.warn('[test-registry] beheer-informatief failed:', e) }),
    import('@/lib/regression-tests/suites/onboarding-flow').then(m => m.register()).catch(e => { console.warn('[test-registry] onboarding-flow failed:', e) }),
    import('@/lib/regression-tests/suites/onboarding-identity').then(m => m.register()).catch(e => { console.warn('[test-registry] onboarding-identity failed:', e) }),
    import('@/lib/regression-tests/suites/onboarding-budgets').then(m => m.register()).catch(e => { console.warn('[test-registry] onboarding-budgets failed:', e) }),
    import('@/lib/regression-tests/suites/onboarding-reset').then(m => m.register()).catch(e => { console.warn('[test-registry] onboarding-reset failed:', e) }),
    import('@/lib/regression-tests/suites/onboarding-ui').then(m => m.register()).catch(e => { console.warn('[test-registry] onboarding-ui failed:', e) }),
    import('@/lib/regression-tests/suites/onboarding-save').then(m => m.register()).catch(e => { console.warn('[test-registry] onboarding-save failed:', e) }),
    import('@/lib/regression-tests/suites/onboarding-persona-seed').then(m => m.register()).catch(e => { console.warn('[test-registry] onboarding-persona-seed failed:', e) }),
    import('@/lib/regression-tests/suites/kern-formatting').then(m => m.register()).catch(e => { console.warn('[test-registry] kern-formatting failed:', e) }),
    import('@/lib/regression-tests/suites/box3-belasting').then(m => m.register()).catch(e => { console.warn('[test-registry] box3-belasting failed:', e) }),
    import('@/lib/regression-tests/suites/budget-berekeningen').then(m => m.register()).catch(e => { console.warn('[test-registry] budget-berekeningen failed:', e) }),
    import('@/lib/regression-tests/suites/recurring-transfers').then(m => m.register()).catch(e => { console.warn('[test-registry] recurring-transfers failed:', e) }),
    import('@/lib/regression-tests/suites/horizon-parameters').then(m => m.register()).catch(e => { console.warn('[test-registry] horizon-parameters failed:', e) }),
    import('@/lib/regression-tests/suites/budget-api-routes').then(m => m.register()).catch(e => { console.warn('[test-registry] budget-api-routes failed:', e) }),
    import('@/lib/regression-tests/suites/budget-plan-editor').then(m => m.register()).catch(e => { console.warn('[test-registry] budget-plan-editor failed:', e) }),
    import('@/lib/regression-tests/suites/kern-api-routes').then(m => m.register()).catch(e => { console.warn('[test-registry] kern-api-routes failed:', e) }),
    import('@/lib/regression-tests/suites/dashboard-widgets').then(m => m.register()).catch(e => { console.warn('[test-registry] dashboard-widgets failed:', e) }),
    import('@/lib/regression-tests/suites/nieuws-briefing').then(m => m.register()).catch(e => { console.warn('[test-registry] nieuws-briefing failed:', e) }),
    import('@/lib/regression-tests/suites/wil-aanbevelingen').then(m => m.register()).catch(e => { console.warn('[test-registry] wil-aanbevelingen failed:', e) }),
    import('@/lib/regression-tests/suites/wil-gezondheid').then(m => m.register()).catch(e => { console.warn('[test-registry] wil-gezondheid failed:', e) }),
    import('@/lib/regression-tests/suites/feature-gating').then(m => m.register()).catch(e => { console.warn('[test-registry] feature-gating failed:', e) }),
    import('@/lib/regression-tests/suites/rapportages').then(m => m.register()).catch(e => { console.warn('[test-registry] rapportages failed:', e) }),
    import('@/lib/regression-tests/suites/security-auth').then(m => m.register()).catch(e => { console.warn('[test-registry] security-auth failed:', e) }),
    import('@/lib/regression-tests/suites/checkin-flow').then(m => m.register()).catch(e => { console.warn('[test-registry] checkin-flow failed:', e) }),
    import('@/lib/regression-tests/suites/input-validatie').then(m => m.register()).catch(e => { console.warn('[test-registry] input-validatie failed:', e) }),
    import('@/lib/regression-tests/suites/api-response-performance').then(m => m.register()).catch(e => { console.warn('[test-registry] api-response-performance failed:', e) }),
    import('@/lib/regression-tests/suites/berekening-performance').then(m => m.register()).catch(e => { console.warn('[test-registry] berekening-performance failed:', e) }),
    import('@/lib/regression-tests/suites/security-privacy').then(m => m.register()).catch(e => { console.warn('[test-registry] security-privacy failed:', e) }),
    import('@/lib/regression-tests/suites/database-integriteit').then(m => m.register()).catch(e => { console.warn('[test-registry] database-integriteit failed:', e) }),
    import('@/lib/regression-tests/suites/data-tijdreeksen').then(m => m.register()).catch(e => { console.warn('[test-registry] data-tijdreeksen failed:', e) }),
    import('@/lib/regression-tests/suites/error-handling').then(m => m.register()).catch(e => { console.warn('[test-registry] error-handling failed:', e) }),
    import('@/lib/regression-tests/suites/onboarding-api-flow').then(m => m.register()).catch(e => { console.warn('[test-registry] onboarding-api-flow failed:', e) }),
    import('@/lib/regression-tests/suites/bank-connectie-flow').then(m => m.register()).catch(e => { console.warn('[test-registry] bank-connectie-flow failed:', e) }),
    import('@/lib/regression-tests/suites/testdata-persona-validatie').then(m => m.register()).catch(e => { console.warn('[test-registry] testdata-persona-validatie failed:', e) }),
    import('@/lib/regression-tests/suites/kern-assets-crud').then(m => m.register()).catch(e => { console.warn('[test-registry] kern-assets-crud failed:', e) }),
    import('@/lib/regression-tests/suites/kern-budget-crud').then(m => m.register()).catch(e => { console.warn('[test-registry] kern-budget-crud failed:', e) }),
    import('@/lib/regression-tests/suites/kern-bank-connect-flow').then(m => m.register()).catch(e => { console.warn('[test-registry] kern-bank-connect-flow failed:', e) }),
    import('@/lib/regression-tests/suites/kern-import-export').then(m => m.register()).catch(e => { console.warn('[test-registry] kern-import-export failed:', e) }),
    import('@/lib/regression-tests/suites/kern-schulden').then(m => m.register()).catch(e => { console.warn('[test-registry] kern-schulden failed:', e) }),
    import('@/lib/regression-tests/suites/kern-dividenden').then(m => m.register()).catch(e => { console.warn('[test-registry] kern-dividenden failed:', e) }),
    import('@/lib/regression-tests/suites/horizon-whatif').then(m => m.register()).catch(e => { console.warn('[test-registry] horizon-whatif failed:', e) }),
    import('@/lib/regression-tests/suites/berichten-chat').then(m => m.register()).catch(e => { console.warn('[test-registry] berichten-chat failed:', e) }),
    import('@/lib/regression-tests/suites/horizon-strategie-pagina').then(m => m.register()).catch(e => { console.warn('[test-registry] horizon-strategie-pagina failed:', e) }),
    import('@/lib/regression-tests/suites/identiteit-household').then(m => m.register()).catch(e => { console.warn('[test-registry] identiteit-household failed:', e) }),
    import('@/lib/regression-tests/suites/beheer-notificaties').then(m => m.register()).catch(e => { console.warn('[test-registry] beheer-notificaties failed:', e) }),
    import('@/lib/regression-tests/suites/dashboard-empty-loading').then(m => m.register()).catch(e => { console.warn('[test-registry] dashboard-empty-loading failed:', e) }),
    import('@/lib/regression-tests/suites/kostenanalyse-ter').then(m => m.register()).catch(e => { console.warn('[test-registry] kostenanalyse-ter failed:', e) }),
    import('@/lib/regression-tests/suites/kern-hypotheek-vs-beleggen').then(m => m.register()).catch(e => { console.warn('[test-registry] kern-hypotheek-vs-beleggen failed:', e) }),
    import('@/lib/regression-tests/suites/rebalancing-drift').then(m => m.register()).catch(e => { console.warn('[test-registry] rebalancing-drift failed:', e) }),
    import('@/lib/regression-tests/suites/design-system-tokens').then(m => m.register()).catch(e => { console.warn('[test-registry] design-system-tokens failed:', e) }),
    import('@/lib/regression-tests/suites/design-system-typography').then(m => m.register()).catch(e => { console.warn('[test-registry] design-system-typography failed:', e) }),
    import('@/lib/regression-tests/suites/horizon-fase-analyse').then(m => m.register()).catch(e => { console.warn('[test-registry] horizon-fase-analyse failed:', e) }),
    import('@/lib/regression-tests/suites/levensgebeurtenissen-ui').then(m => m.register()).catch(e => { console.warn('[test-registry] levensgebeurtenissen-ui failed:', e) }),
    import('@/lib/regression-tests/suites/levensgebeurtenissen-classificatie').then(m => m.register()).catch(e => { console.warn('[test-registry] levensgebeurtenissen-classificatie failed:', e) }),
    import('@/lib/regression-tests/suites/tegenpartij-analyse').then(m => m.register()).catch(e => { console.warn('[test-registry] tegenpartij-analyse failed:', e) }),
    import('@/lib/regression-tests/suites/wil-acties').then(m => m.register()).catch(e => { console.warn('[test-registry] wil-acties failed:', e) }),
    import('@/lib/regression-tests/suites/inkomen-uitgaven-analyse').then(m => m.register()).catch(e => { console.warn('[test-registry] inkomen-uitgaven-analyse failed:', e) }),
    import('@/lib/regression-tests/suites/vaste-kosten-analyse').then(m => m.register()).catch(e => { console.warn('[test-registry] vaste-kosten-analyse failed:', e) }),
    import('@/lib/regression-tests/suites/whatif-scenarios').then(m => m.register()).catch(e => { console.warn('[test-registry] whatif-scenarios failed:', e) }),
    import('@/lib/regression-tests/suites/module-access').then(m => m.register()).catch(e => { console.warn('[test-registry] module-access failed:', e) }),
    import('@/lib/regression-tests/suites/coach-suggestions').then(m => m.register()).catch(e => { console.warn('[test-registry] coach-suggestions failed:', e) }),
    import('@/lib/regression-tests/suites/module-activation').then(m => m.register()).catch(e => { console.warn('[test-registry] module-activation failed:', e) }),
    import('@/lib/regression-tests/suites/uat-bezit').then(m => m.register()).catch(e => { console.warn('[test-registry] uat-bezit failed:', e) }),
    import('@/lib/regression-tests/suites/uat-toek').then(m => m.register()).catch(e => { console.warn('[test-registry] uat-toek failed:', e) }),
    import('@/lib/regression-tests/suites/uat-schuld').then(m => m.register()).catch(e => { console.warn('[test-registry] uat-schuld failed:', e) }),
    import('@/lib/regression-tests/suites/uat-budget').then(m => m.register()).catch(e => { console.warn('[test-registry] uat-budget failed:', e) }),
    import('@/lib/regression-tests/suites/uat-kruis').then(m => m.register()).catch(e => { console.warn('[test-registry] uat-kruis failed:', e) }),
    import('@/lib/regression-tests/suites/uat-start').then(m => m.register()).catch(e => { console.warn('[test-registry] uat-start failed:', e) }),
    import('@/lib/regression-tests/suites/uat-will').then(m => m.register()).catch(e => { console.warn('[test-registry] uat-will failed:', e) }),
    import('@/lib/regression-tests/suites/uat-cash').then(m => m.register()).catch(e => { console.warn('[test-registry] uat-cash failed:', e) }),
    import('@/lib/regression-tests/suites/uat-belast').then(m => m.register()).catch(e => { console.warn('[test-registry] uat-belast failed:', e) }),
    import('@/lib/regression-tests/suites/uat-ovz').then(m => m.register()).catch(e => { console.warn('[test-registry] uat-ovz failed:', e) }),
    import('@/lib/regression-tests/suites/uat-nav').then(m => m.register()).catch(e => { console.warn('[test-registry] uat-nav failed:', e) }),
    import('@/lib/regression-tests/suites/uat-rapp').then(m => m.register()).catch(e => { console.warn('[test-registry] uat-rapp failed:', e) }),
    import('@/lib/regression-tests/suites/uat-reken').then(m => m.register()).catch(e => { console.warn('[test-registry] uat-reken failed:', e) }),
    import('@/lib/regression-tests/suites/uat-mijn').then(m => m.register()).catch(e => { console.warn('[test-registry] uat-mijn failed:', e) }),
    import('@/lib/regression-tests/suites/uat-beheer').then(m => m.register()).catch(e => { console.warn('[test-registry] uat-beheer failed:', e) }),
  ])

  // Log any rejected promises (shouldn't happen due to .catch, but just in case)
  const failures = results.filter(r => r.status === 'rejected')
  if (failures.length > 0) {
    console.warn(`[test-registry] ${failures.length} suite(s) failed to load`)
  }

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
