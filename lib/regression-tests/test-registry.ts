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

// ── Built-in test registrations ─────────────────────────────────────────────

// Register categories matching the app's module structure
// 'horizon-fire-simulatie' category is registered by its own suite module

// 'horizon-projecties' category is registered by its own suite module

registerCategory({
  id: 'onttrekkingsstrategie',
  label: 'Onttrekkingsstrategie',
  description: 'Withdrawal strategy engine: static, guardrails, VPW, ABW',
  icon: 'ArrowDownToLine',
  testCount: 0,
})

registerCategory({
  id: 'kern-metrics',
  label: 'Kern Metrics',
  description: 'Kernberekeningen: netto vermogen, spaarquote, etc.',
  icon: 'Calculator',
  testCount: 0,
})

registerCategory({
  id: 'kern-berekeningen',
  label: 'De Kern — Berekeningen',
  description: 'Regressietests voor core-metrics: effectieve uitgaven, FIRE target, vrijheidspercentage, vrijheidstijd, spaarquote',
  icon: 'Calculator',
  testCount: 0,
})

registerCategory({
  id: 'kern-formatting',
  label: 'De Kern — Formatting',
  description: 'Format utilities: valuta, vrijheidstijd strings, percentages',
  icon: 'Type',
  testCount: 0,
})

registerCategory({
  id: 'widget-systeem',
  label: 'Widget Systeem',
  description: 'Widget ordering, preferences, catalog',
  icon: 'LayoutGrid',
  testCount: 0,
})

registerCategory({
  id: 'categorisatie',
  label: 'Categorisatie',
  description: 'Transactiecategorisatie en parsing',
  icon: 'Tag',
  testCount: 0,
})

registerCategory({
  id: 'ai-beveiliging',
  label: 'AI Beveiliging',
  description: 'PII filtering, input sanitization',
  icon: 'Shield',
  testCount: 0,
})

registerCategory({
  id: 'dashboard-builder',
  label: 'Dashboard Builder',
  description: 'Automatische dashboard-configuratie',
  icon: 'Wand2',
  testCount: 0,
})

registerCategory({
  id: 'navigatie',
  label: 'Cross-cutting — Navigatie',
  description: 'Navigatie, redirects, routing, admin-beveiliging',
  icon: 'Navigation',
  testCount: 0,
})

registerCategory({
  id: 'sovereignty-levels',
  label: 'Identiteit — Sovereignty Levels',
  description: 'Sovereignty level berekening, fase transitie, feature gating',
  icon: 'Shield',
  testCount: 0,
})

registerCategory({
  id: 'profiel-instellingen',
  label: 'Identiteit — Profiel & Instellingen',
  description: 'Profiel CRUD, instellingen opslag, gids voortgangsberekening',
  icon: 'Settings',
  testCount: 0,
})

registerCategory({
  id: 'onboarding-flow',
  label: 'Onboarding — Flow',
  description: 'Onboarding stap navigatie, state management, auth guards, error handling',
  icon: 'Workflow',
  testCount: 0,
})

registerCategory({
  id: 'onboarding-intro',
  label: 'Onboarding — Intro',
  description: 'Intro scherm: WillDots avatar, filosofie, module preview, CTA',
  icon: 'Sparkles',
  testCount: 0,
})

registerCategory({
  id: 'onboarding-budgets',
  label: 'Onboarding — Budgetten',
  description: 'Budget template selectie, AI suggesties, handmatige bewerking',
  icon: 'Wallet',
  testCount: 0,
})

registerCategory({
  id: 'onboarding-preferences',
  label: 'Onboarding — Voorkeuren',
  description: 'Dashboard focus selectie en widget voorkeur generatie',
  icon: 'SlidersHorizontal',
  testCount: 0,
})

registerCategory({
  id: 'onboarding-reset',
  label: 'Onboarding — Reset',
  description: 'Onboarding reset flow: data wipe, profiel reset, herstart',
  icon: 'RotateCcw',
  testCount: 0,
})

registerCategory({
  id: 'onboarding-ui',
  label: 'Onboarding — UI Componenten',
  description: 'StepProgress, SpeechBubble, responsive layout, keyboard navigatie, terug-knop',
  icon: 'Component',
  testCount: 0,
})

registerCategory({
  id: 'onboarding-save',
  label: 'Onboarding — Save & Success',
  description: 'Save flow, animatie, voortgangsbalk, success scherm, fase activatie',
  icon: 'Save',
  testCount: 0,
})

registerCategory({
  id: 'onboarding-persona-seed',
  label: 'Onboarding — Persona Seeding',
  description: 'Persona seed flow: NDJSON streaming, deleteAllUserData, seedPersonaData, metadata constraints',
  icon: 'UserPlus',
  testCount: 0,
})

registerCategory({
  id: 'kern-belasting',
  label: 'De Kern — Belasting',
  description: 'Box 3 belastingberekeningen: fictief rendement, vrijstelling, partnerschap, gewogen rendement',
  icon: 'Calculator',
  testCount: 0,
})

registerCategory({
  id: 'kern-api-routes',
  label: 'De Kern — API Routes',
  description: 'Holdings, transactions, refresh-prices, valuations, snapshots, daily-expense-rate API routes',
  icon: 'Activity',
  testCount: 0,
})

registerCategory({
  id: 'wil-aanbevelingen',
  label: 'De Wil — Aanbevelingen',
  description: 'AI-aanbevelingensysteem, actie-management, PII sanitization',
  icon: 'Sparkles',
  testCount: 0,
})

registerCategory({
  id: 'wil-gezondheid',
  label: 'De Wil — Gezondheid',
  description: 'Financiële gezondheidsscore: 6-pijler systeem, weging, edge cases',
  icon: 'Heart',
  testCount: 0,
})

// ── Dynamic test loader ─────────────────────────────────────────────────────
// This function dynamically imports all test modules and registers their tests.

let loaded = false

export async function loadAllTests(): Promise<void> {
  if (loaded) return
  loaded = true

  try {
    const fireSimMod = await import('@/lib/regression-tests/suites/fire-simulatie')
    fireSimMod.register()
  } catch { /* module not found yet */ }

  try {
    const horizonMod = await import('@/lib/regression-tests/suites/horizon-grafiek')
    horizonMod.register()
  } catch { /* module not found yet */ }

  try {
    const withdrawalMod = await import('@/lib/regression-tests/suites/onttrekkingsstrategie')
    withdrawalMod.register()
  } catch { /* module not found yet */ }

  try {
    const kernMod = await import('@/lib/regression-tests/suites/kern-metrics')
    kernMod.register()
  } catch { /* module not found yet */ }

  try {
    const widgetMod = await import('@/lib/regression-tests/suites/widget-systeem')
    widgetMod.register()
  } catch { /* module not found yet */ }

  try {
    const catMod = await import('@/lib/regression-tests/suites/categorisatie')
    catMod.register()
  } catch { /* module not found yet */ }

  try {
    const aiMod = await import('@/lib/regression-tests/suites/ai-beveiliging')
    aiMod.register()
  } catch { /* module not found yet */ }

  try {
    const dashMod = await import('@/lib/regression-tests/suites/dashboard-builder')
    dashMod.register()
  } catch { /* module not found yet */ }

  try {
    const navMod = await import('@/lib/regression-tests/suites/navigatie')
    navMod.register()
  } catch { /* module not found yet */ }

  try {
    const beheerMod = await import('@/lib/regression-tests/suites/beheer-layout')
    beheerMod.register()
  } catch { /* module not found yet */ }

  try {
    const delenMod = await import('@/lib/regression-tests/suites/delen-jaaroverzicht')
    delenMod.register()
  } catch { /* module not found yet */ }

  try {
    const sovMod = await import('@/lib/regression-tests/suites/sovereignty-levels')
    sovMod.register()
  } catch { /* module not found yet */ }

  try {
    const beheerAiMod = await import('@/lib/regression-tests/suites/beheer-ai')
    beheerAiMod.register()
  } catch { /* module not found yet */ }

  try {
    const idNavMod = await import('@/lib/regression-tests/suites/identity-navigatie')
    idNavMod.register()
  } catch { /* module not found yet */ }

  try {
    const briefingMod = await import('@/lib/regression-tests/suites/briefing-directives')
    briefingMod.register()
  } catch { /* module not found yet */ }

  try {
    const profielMod = await import('@/lib/regression-tests/suites/profiel-instellingen')
    profielMod.register()
  } catch { /* module not found yet */ }

  try {
    const bankConnectMod = await import('@/lib/regression-tests/suites/beheer-bank-connect')
    bankConnectMod.register()
  } catch { /* module not found yet */ }

  try {
    const toegangMod = await import('@/lib/regression-tests/suites/beheer-toegang')
    toegangMod.register()
  } catch { /* module not found yet */ }

  try {
    const aowMod = await import('@/lib/regression-tests/suites/aow-leeftijd')
    aowMod.register()
  } catch { /* module not found yet */ }

  try {
    const nieuwsAiMod = await import('@/lib/regression-tests/suites/beheer-nieuws-ai')
    nieuwsAiMod.register()
  } catch { /* module not found yet */ }

  try {
    const testdataMod = await import('@/lib/regression-tests/suites/beheer-testdata')
    testdataMod.register()
  } catch { /* module not found yet */ }

  try {
    const widgetsAvatarMod = await import('@/lib/regression-tests/suites/widgets-avatar')
    widgetsAvatarMod.register()
  } catch { /* module not found yet */ }

  try {
    const migratieMod = await import('@/lib/regression-tests/suites/beheer-migratie')
    migratieMod.register()
  } catch { /* module not found yet */ }

  try {
    const informatiefMod = await import('@/lib/regression-tests/suites/beheer-informatief')
    informatiefMod.register()
  } catch { /* module not found yet */ }

  try {
    const obFlowMod = await import('@/lib/regression-tests/suites/onboarding-flow')
    obFlowMod.register()
  } catch { /* module not found yet */ }

  try {
    const obIntroMod = await import('@/lib/regression-tests/suites/onboarding-intro')
    obIntroMod.register()
  } catch { /* module not found yet */ }

  try {
    const obIdentityMod = await import('@/lib/regression-tests/suites/onboarding-identity')
    obIdentityMod.register()
  } catch { /* module not found yet */ }

  try {
    const obExtrasMod = await import('@/lib/regression-tests/suites/onboarding-extras')
    obExtrasMod.register()
  } catch { /* module not found yet */ }

  try {
    const obBudgetsMod = await import('@/lib/regression-tests/suites/onboarding-budgets')
    obBudgetsMod.register()
  } catch { /* module not found yet */ }

  try {
    const obPrefsMod = await import('@/lib/regression-tests/suites/onboarding-preferences')
    obPrefsMod.register()
  } catch { /* module not found yet */ }

  try {
    const obResetMod = await import('@/lib/regression-tests/suites/onboarding-reset')
    obResetMod.register()
  } catch { /* module not found yet */ }

  try {
    const obUiMod = await import('@/lib/regression-tests/suites/onboarding-ui')
    obUiMod.register()
  } catch { /* module not found yet */ }

  try {
    const obSaveMod = await import('@/lib/regression-tests/suites/onboarding-save')
    obSaveMod.register()
  } catch { /* module not found yet */ }

  try {
    const obPersonaSeedMod = await import('@/lib/regression-tests/suites/onboarding-persona-seed')
    obPersonaSeedMod.register()
  } catch { /* module not found yet */ }

  try {
    const kernFmtMod = await import('@/lib/regression-tests/suites/kern-formatting')
    kernFmtMod.register()
  } catch { /* module not found yet */ }

  try {
    const box3Mod = await import('@/lib/regression-tests/suites/box3-belasting')
    box3Mod.register()
  } catch { /* module not found yet */ }

  try {
    const budgetBerMod = await import('@/lib/regression-tests/suites/budget-berekeningen')
    budgetBerMod.register()
  } catch { /* module not found yet */ }

  try {
    const recurTransMod = await import('@/lib/regression-tests/suites/recurring-transfers')
    recurTransMod.register()
  } catch { /* module not found yet */ }

  try {
    const horizonParamsMod = await import('@/lib/regression-tests/suites/horizon-parameters')
    horizonParamsMod.register()
  } catch { /* module not found yet */ }

  try {
    const budgetApiMod = await import('@/lib/regression-tests/suites/budget-api-routes')
    budgetApiMod.register()
  } catch { /* module not found yet */ }

  try {
    const kernApiMod = await import('@/lib/regression-tests/suites/kern-api-routes')
    kernApiMod.register()
  } catch { /* module not found yet */ }

  try {
    const dashWidgetsMod = await import('@/lib/regression-tests/suites/dashboard-widgets')
    dashWidgetsMod.register()
  } catch { /* module not found yet */ }

  try {
    const nieuwsBriefingMod = await import('@/lib/regression-tests/suites/nieuws-briefing')
    nieuwsBriefingMod.register()
  } catch { /* module not found yet */ }

  try {
    const wilAanbevelingenMod = await import('@/lib/regression-tests/suites/wil-aanbevelingen')
    wilAanbevelingenMod.register()
  } catch { /* module not found yet */ }

  try {
    const wilGezondheidMod = await import('@/lib/regression-tests/suites/wil-gezondheid')
    wilGezondheidMod.register()
  } catch { /* module not found yet */ }

  try {
    const featureGatingMod = await import('@/lib/regression-tests/suites/feature-gating')
    featureGatingMod.register()
  } catch { /* module not found yet */ }
}

/** Reset loaded flag (for testing) */
export function resetLoaded(): void {
  loaded = false
}
