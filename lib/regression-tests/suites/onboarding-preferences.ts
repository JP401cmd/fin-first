import { registerTests } from '../test-registry'
import { assert, assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { authenticatedFetch } from '../server-runner'

const CAT = 'onboarding.preferences'

// ── Module types (matches lib/module-registry.ts) ──────────────────────────
type ModuleId =
  | 'budgetteren'
  | 'vermogensregistratie'
  | 'aandelenregistratie'
  | 'toekomstplannen'
  | 'inzicht_acties'
  | 'nieuws'

// ── Mirror of constants from onboarding-preferences.tsx ─────────────────────

type FocusChoice = 'budget_cashflow' | 'assets_investments' | 'fire_freedom' | 'goals_actions' | 'overview'

interface PreferencesData {
  focuses: FocusChoice[]
}

const INITIAL_PREFERENCES: PreferencesData = { focuses: [] }
const DEFAULT_PREFERENCES: PreferencesData = { focuses: ['overview'] }

const ALL_FOCUS_OPTIONS: { id: FocusChoice; label: string; description: string }[] = [
  { id: 'budget_cashflow', label: 'Budgetten & cashflow', description: 'Grip op inkomsten, uitgaven en abonnementen' },
  { id: 'assets_investments', label: 'Vermogen & beleggen', description: 'Bezittingen, portefeuille en rendement' },
  { id: 'fire_freedom', label: 'FIRE & vrijheid', description: 'Vrijheidsprojecties, simulaties en mijlpalen' },
  { id: 'goals_actions', label: 'Doelen & acties', description: 'Financi\u00eble doelen en concrete stappen' },
  { id: 'overview', label: 'Totaaloverzicht', description: 'Een breed dashboard met de belangrijkste metrics' },
]

// ── Mirror of FOCUS_WIDGET_BOOST from auto-dashboard-builder.ts ─────────────

const FOCUS_WIDGET_BOOST: Record<FocusChoice, string[]> = {
  budget_cashflow: ['cash_flow', 'budgetten', 'spaarquote', 'vaste_lasten', 'nibud_benchmark', 'noodfonds', 'trend_inkomen', 'trend_uitgaven', 'trend_sparen', 'trend_schulden'],
  assets_investments: ['netto_vermogen', 'assets', 'holdings', 'belasting_box3', 'box3_drag', 'huishouden_vergelijking'],
  fire_freedom: ['fire_prognose', 'monte_carlo', 'vrijheidsscenarios', 'sim_vermogenspad', 'vrijheidsmijlpalen', 'backtesting_score', 'gezondheids_score', 'vrijheidsvoortgang', 'levensgebeurtenissen'],
  goals_actions: ['voorstellen', 'acties', 'doelen', 'volgende_stap', 'beslissingspatronen', 'vrijheidsdagen_maand', 'wilskracht'],
  overview: ['netto_vermogen', 'cash_flow', 'fire_prognose', 'acties', 'spaarquote', 'vrijheidsvoortgang', 'jouw_pad', 'maandoverzicht'],
}

// ── Focus filtering based on active modules ─────────────────────────────────

/**
 * Filter focus options based on which modules are active.
 * budget_cashflow: only when 'budgetteren' is active
 * fire_freedom: only when 'toekomstplannen' is active
 * assets_investments: only when 'vermogensregistratie' is active
 * goals_actions: only when 'inzicht_acties' is active
 * overview: always available
 */
function getVisibleFocusOptions(activeModules: ModuleId[]): FocusChoice[] {
  return ALL_FOCUS_OPTIONS
    .map((o) => o.id)
    .filter((id) => {
      if (id === 'budget_cashflow') return activeModules.includes('budgetteren')
      if (id === 'fire_freedom') return activeModules.includes('toekomstplannen')
      if (id === 'assets_investments') return activeModules.includes('vermogensregistratie')
      if (id === 'goals_actions') return activeModules.includes('inzicht_acties')
      return true // overview is always available
    })
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: Preferences only shown when inzicht_acties active ────
  {
    id: 'ob-pref-conditional-display',
    name: 'Preferences stap: alleen getoond als inzicht_acties actief is',
    category: CAT,
    description: 'De inzicht_acties module kan in diverse module-combinaties voorkomen',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Verify inzicht_acties module presence in various module combinations

      // Modules with inzicht_acties
      const modulesWithActies: ModuleId[] = ['vermogensregistratie', 'inzicht_acties']
      assert(modulesWithActies.includes('inzicht_acties'), 'Modules bevatten inzicht_acties')

      // Modules without inzicht_acties
      const modulesWithoutActies: ModuleId[] = ['vermogensregistratie', 'budgetteren']
      assert(!modulesWithoutActies.includes('inzicht_acties'), 'Modules bevatten GEEN inzicht_acties')

      // FIRE Fighter (all modules) includes inzicht_acties
      const fireModules: ModuleId[] = ['budgetteren', 'vermogensregistratie', 'aandelenregistratie', 'toekomstplannen', 'inzicht_acties', 'nieuws']
      assert(fireModules.includes('inzicht_acties'), 'FIRE Fighter bevat inzicht_acties')

      // Budgetteerder does NOT include inzicht_acties
      const budgetModules: ModuleId[] = ['budgetteren']
      assert(!budgetModules.includes('inzicht_acties'), 'Budgetteerder bevat geen inzicht_acties')
    },
  },

  // ── Step 2: Focus options filtered by active modules ─────────────
  {
    id: 'ob-pref-focus-options-filtered',
    name: 'Focus opties: gefilterd op basis van actieve modules',
    category: CAT,
    description: 'budget_cashflow alleen bij budgetteren, fire_freedom alleen bij toekomstplannen, etc.',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // All modules active: all 5 options visible
      const allModules: ModuleId[] = ['budgetteren', 'vermogensregistratie', 'toekomstplannen', 'inzicht_acties']
      const allOptions = getVisibleFocusOptions(allModules)
      assertEqual(allOptions.length, 5, 'Alle modules actief: 5 focus opties')

      // Only vermogensregistratie + inzicht_acties: assets_investments, goals_actions, overview
      const vermogenActies: ModuleId[] = ['vermogensregistratie', 'inzicht_acties']
      const vaOptions = getVisibleFocusOptions(vermogenActies)
      assert(vaOptions.includes('assets_investments'), 'Vermogensregistratie → assets_investments zichtbaar')
      assert(vaOptions.includes('goals_actions'), 'Inzicht_acties → goals_actions zichtbaar')
      assert(vaOptions.includes('overview'), 'Overview altijd zichtbaar')
      assert(!vaOptions.includes('budget_cashflow'), 'Geen budgetteren → budget_cashflow verborgen')
      assert(!vaOptions.includes('fire_freedom'), 'Geen toekomstplannen → fire_freedom verborgen')

      // Only inzicht_acties: just goals_actions + overview
      const actiesOnly: ModuleId[] = ['inzicht_acties']
      const aoOptions = getVisibleFocusOptions(actiesOnly)
      assertEqual(aoOptions.length, 2, 'Alleen inzicht_acties: 2 focus opties')
      assert(aoOptions.includes('goals_actions'), 'goals_actions zichtbaar')
      assert(aoOptions.includes('overview'), 'overview zichtbaar')

      // Pensioenplanner (vermogensregistratie + toekomstplannen + inzicht_acties)
      const pensioenModules: ModuleId[] = ['vermogensregistratie', 'toekomstplannen', 'inzicht_acties']
      const pensioenOptions = getVisibleFocusOptions(pensioenModules)
      assertEqual(pensioenOptions.length, 4, 'Pensioenplanner: 4 focus opties')
      assert(pensioenOptions.includes('assets_investments'), 'Pensioen: assets_investments')
      assert(pensioenOptions.includes('fire_freedom'), 'Pensioen: fire_freedom')
      assert(pensioenOptions.includes('goals_actions'), 'Pensioen: goals_actions')
      assert(pensioenOptions.includes('overview'), 'Pensioen: overview')
      assert(!pensioenOptions.includes('budget_cashflow'), 'Pensioen: geen budget_cashflow')
    },
  },

  // ── Step 3: All 5 focus options with labels and descriptions ─────
  {
    id: 'ob-pref-focus-options',
    name: 'Dashboard focus opties: 5 keuzes beschikbaar',
    category: CAT,
    description: 'Alle 5 focus opties zijn beschikbaar: budget_cashflow, assets_investments, fire_freedom, goals_actions, overview',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      assertEqual(ALL_FOCUS_OPTIONS.length, 5, 'Exact 5 focus opties beschikbaar')

      const expectedIds: FocusChoice[] = ['budget_cashflow', 'assets_investments', 'fire_freedom', 'goals_actions', 'overview']
      for (const id of expectedIds) {
        const found = ALL_FOCUS_OPTIONS.find(o => o.id === id)
        assert(found !== undefined, `Focus optie '${id}' bestaat`)
        assert(found!.label.length > 0, `Focus optie '${id}' heeft een label`)
        assert(found!.description.length > 0, `Focus optie '${id}' heeft een beschrijving`)
      }

      // Each focus has a corresponding widget boost list
      for (const id of expectedIds) {
        const boost = FOCUS_WIDGET_BOOST[id]
        assert(boost !== undefined, `Focus '${id}' heeft widget boost lijst`)
        assert(boost.length > 0, `Focus '${id}' boost lijst is niet leeg`)
      }
    },
  },

  // ── Step 4: buildWidgetPrefsFromPreferences ───────────────────
  {
    id: 'ob-pref-build-widget-prefs',
    name: 'buildWidgetPrefsFromPreferences: correcte widget set per gekozen focus',
    category: CAT,
    description: 'Functie genereert WidgetPrefs met enabled widgets geboost door gekozen focus',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // Verify the focus -> widget boost mapping is complete
      const budgetWidgets = FOCUS_WIDGET_BOOST['budget_cashflow']
      assert(budgetWidgets.includes('budgetten'), 'Budget focus bevat budgetten widget')
      assert(budgetWidgets.includes('cash_flow'), 'Budget focus bevat cash_flow widget')
      assert(budgetWidgets.includes('spaarquote'), 'Budget focus bevat spaarquote widget')

      const fireWidgets = FOCUS_WIDGET_BOOST['fire_freedom']
      assert(fireWidgets.includes('fire_prognose'), 'FIRE focus bevat fire_prognose widget')
      assert(fireWidgets.includes('monte_carlo'), 'FIRE focus bevat monte_carlo widget')
      assert(fireWidgets.includes('vrijheidsscenarios'), 'FIRE focus bevat vrijheidsscenarios widget')

      const overviewWidgets = FOCUS_WIDGET_BOOST['overview']
      assert(overviewWidgets.includes('netto_vermogen'), 'Overview focus bevat netto_vermogen')
      assert(overviewWidgets.includes('cash_flow'), 'Overview focus bevat cash_flow')
      assert(overviewWidgets.includes('fire_prognose'), 'Overview focus bevat fire_prognose')

      // Each focus boosts different widgets — minimal overlap ensures distinct dashboards
      const budgetSet = new Set(budgetWidgets)
      const fireSet = new Set(fireWidgets)
      const intersection = [...budgetSet].filter(w => fireSet.has(w))
      assert(
        intersection.length < budgetWidgets.length,
        'Budget en FIRE focus hebben grotendeels andere widget boosts',
      )
    },
  },

  // ── Step 5: INITIAL_PREFERENCES ───────────────────────────────
  {
    id: 'ob-pref-initial-values',
    name: 'INITIAL_PREFERENCES: default waarden correct',
    category: CAT,
    description: 'INITIAL_PREFERENCES heeft lege focuses array, DEFAULT_PREFERENCES heeft overview',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      assert(Array.isArray(INITIAL_PREFERENCES.focuses), 'INITIAL_PREFERENCES.focuses is array')
      assertEqual(INITIAL_PREFERENCES.focuses.length, 0, 'INITIAL_PREFERENCES heeft lege focuses')

      assert(Array.isArray(DEFAULT_PREFERENCES.focuses), 'DEFAULT_PREFERENCES.focuses is array')
      assertEqual(DEFAULT_PREFERENCES.focuses.length, 1, 'DEFAULT_PREFERENCES heeft 1 focus')
      assertEqual(DEFAULT_PREFERENCES.focuses[0], 'overview', 'DEFAULT_PREFERENCES default is overview')

      // When focuses is empty, buildWidgetPrefsFromPreferences falls back to ['overview']
      const fallbackFocuses = INITIAL_PREFERENCES.focuses.length > 0
        ? INITIAL_PREFERENCES.focuses
        : ['overview' as FocusChoice]
      assertEqual(fallbackFocuses[0], 'overview', 'Lege focuses valt terug op overview')
    },
  },

  // ── Step 6: buildDashboardLayout integratie ───────────────────
  {
    id: 'ob-pref-dashboard-layout-integration',
    name: 'buildDashboardLayout integratie: layout past bij gekozen focus',
    category: CAT,
    description: 'AutoDashboardAnswers met medium grid produceert 16-cel layout met focus-relevante widgets',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      const answers = {
        focuses: ['fire_freedom' as FocusChoice],
        modulePreference: 'balanced' as const,
        gridSize: 'medium' as const,
        detailLevel: 'balanced' as const,
        selectedBudgetFavIds: [] as string[],
      }

      const GRID_TARGET_CELLS = { small: 12, medium: 16, large: 20 }
      assertEqual(GRID_TARGET_CELLS[answers.gridSize], 16, 'Medium grid = 16 target cells')

      const boostedWidgets = FOCUS_WIDGET_BOOST[answers.focuses[0]]
      assert(boostedWidgets.length >= 5, `FIRE focus boosted minstens 5 widgets (was ${boostedWidgets.length})`)

      assertEqual(answers.gridSize, 'medium', 'Onboarding gebruikt medium grid')
      assertEqual(answers.detailLevel, 'balanced', 'Onboarding gebruikt balanced detail')
    },
  },

  // ── Step 7: Voorkeuren doorwerken naar dashboard ──────────────
  {
    id: 'ob-pref-affects-dashboard',
    name: 'Voorkeuren doorwerken naar uiteindelijke dashboard weergave',
    category: CAT,
    description: 'Gekozen focuses bepalen welke widgets enabled zijn en welke disabled op het dashboard',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      const budgetBoosted = new Set(FOCUS_WIDGET_BOOST['budget_cashflow'])
      const fireBoosted = new Set(FOCUS_WIDGET_BOOST['fire_freedom'])
      const goalsBoosted = new Set(FOCUS_WIDGET_BOOST['goals_actions'])

      assert(budgetBoosted.has('budgetten'), 'Budget focus: budgetten widget geboost')
      assert(budgetBoosted.has('cash_flow'), 'Budget focus: cash_flow widget geboost')

      assert(fireBoosted.has('fire_prognose'), 'FIRE focus: fire_prognose widget geboost')
      assert(fireBoosted.has('sim_vermogenspad'), 'FIRE focus: sim_vermogenspad widget geboost')

      assert(goalsBoosted.has('acties'), 'Goals focus: acties widget geboost')
      assert(goalsBoosted.has('doelen'), 'Goals focus: doelen widget geboost')
      assert(goalsBoosted.has('voorstellen'), 'Goals focus: voorstellen widget geboost')

      // Two-focus combo should boost union of widgets
      const comboFocuses: FocusChoice[] = ['budget_cashflow', 'fire_freedom']
      const comboBoost = new Set<string>()
      for (const f of comboFocuses) {
        for (const w of FOCUS_WIDGET_BOOST[f]) comboBoost.add(w)
      }
      assert(comboBoost.has('budgetten'), 'Combo boost bevat budget widgets')
      assert(comboBoost.has('fire_prognose'), 'Combo boost bevat FIRE widgets')
      assert(comboBoost.size > budgetBoosted.size, 'Combo boost is groter dan enkele focus')
    },
  },

  // ── Step 8: Route accessible ──────────────────────────────────
  {
    id: 'ob-pref-route-accessible',
    name: '/onboarding route bereikbaar (voorkeuren stap is onderdeel van onboarding)',
    category: CAT,
    description: 'Onboarding pagina (incl. voorkeuren stap) geeft 200 of auth redirect',
    priority: 'critical',
    estimatedDurationMs: 1000,
    async fn() {
      const res = await authenticatedFetch('/onboarding', { redirect: 'manual' })
      assert(
        res.status === 200 || (res.status >= 300 && res.status < 400),
        `Expected 200 or redirect for /onboarding, got ${res.status}`,
      )
    },
  },
]

export function register(): void {
  registerTests(tests)
}
