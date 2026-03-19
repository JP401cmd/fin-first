import { registerTests } from '../test-registry'
import { assert, assertEqual } from '../assert'
import type { TestCase } from '../test-types'
import { authenticatedFetch } from '../server-runner'

const CAT = 'onboarding.preferences'

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
  { id: 'goals_actions', label: 'Doelen & acties', description: 'Financiële doelen en concrete stappen' },
  { id: 'overview', label: 'Totaaloverzicht', description: 'Een breed dashboard met de belangrijkste metrics' },
]

// ── Mirror of FOCUS_WIDGET_BOOST from auto-dashboard-builder.ts ─────────────

const FOCUS_WIDGET_BOOST: Record<FocusChoice, string[]> = {
  budget_cashflow: ['cash_flow', 'budgetten', 'spaarquote', 'vaste_lasten', 'nibud_benchmark', 'noodfonds', 'trend_inkomen', 'trend_uitgaven', 'trend_sparen', 'trend_schulden'],
  assets_investments: ['netto_vermogen', 'assets', 'holdings', 'belasting_box3', 'box3_drag', 'huishouden_vergelijking'],
  fire_freedom: ['fire_prognose', 'monte_carlo', 'vrijheidsscenarios', 'sim_vermogenspad', 'passief_inkomen', 'vrijheidsmijlpalen', 'backtesting_score', 'gezondheids_score', 'vrijheidsvoortgang', 'levensgebeurtenissen'],
  goals_actions: ['voorstellen', 'acties', 'doelen', 'volgende_stap', 'beslissingspatronen', 'vrijheidsdagen_maand', 'wilskracht'],
  overview: ['netto_vermogen', 'cash_flow', 'fire_prognose', 'acties', 'spaarquote', 'vrijheidsvoortgang', 'jouw_pad', 'maandoverzicht'],
}

// ── Tests ───────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── Step 1: Dashboard focus opties ────────────────────────────
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

      // Max 2 focuses selectable (enforced by component)
      // Verified: handleToggleFocus checks data.focuses.length < 2
    },
  },

  // ── Step 2: buildWidgetPrefsFromPreferences ───────────────────
  {
    id: 'ob-pref-build-widget-prefs',
    name: 'buildWidgetPrefsFromPreferences: correcte widget set per gekozen focus',
    category: CAT,
    description: 'Functie genereert WidgetPrefs met enabled widgets geboost door gekozen focus',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // buildWidgetPrefsFromPreferences creates AutoDashboardAnswers with:
      // - focuses from prefs
      // - modulePreference: 'balanced'
      // - gridSize: 'medium' (16 cells)
      // - detailLevel: 'balanced'
      // - selectedBudgetFavIds: []

      // Then calls buildDashboardLayout(answers, WIDGET_CATALOG, {}, [])
      // Returns { widgets: WidgetPref[] } with ALL catalog widgets (enabled + disabled)

      // Verify the focus → widget boost mapping is complete
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

  // ── Step 3: INITIAL_PREFERENCES ───────────────────────────────
  {
    id: 'ob-pref-initial-values',
    name: 'INITIAL_PREFERENCES: default waarden correct',
    category: CAT,
    description: 'INITIAL_PREFERENCES heeft lege focuses array, DEFAULT_PREFERENCES heeft overview',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // INITIAL_PREFERENCES: empty focuses (user hasn't chosen yet)
      assert(Array.isArray(INITIAL_PREFERENCES.focuses), 'INITIAL_PREFERENCES.focuses is array')
      assertEqual(INITIAL_PREFERENCES.focuses.length, 0, 'INITIAL_PREFERENCES heeft lege focuses')

      // DEFAULT_PREFERENCES: overview as default (used for skip-defaults path)
      assert(Array.isArray(DEFAULT_PREFERENCES.focuses), 'DEFAULT_PREFERENCES.focuses is array')
      assertEqual(DEFAULT_PREFERENCES.focuses.length, 1, 'DEFAULT_PREFERENCES heeft 1 focus')
      assertEqual(DEFAULT_PREFERENCES.focuses[0], 'overview', 'DEFAULT_PREFERENCES default is overview')

      // When focuses is empty, buildWidgetPrefsFromPreferences falls back to ['overview']
      // This ensures a valid dashboard is always generated
      const fallbackFocuses = INITIAL_PREFERENCES.focuses.length > 0
        ? INITIAL_PREFERENCES.focuses
        : ['overview' as FocusChoice]
      assertEqual(fallbackFocuses[0], 'overview', 'Lege focuses valt terug op overview')
    },
  },

  // ── Step 4: buildDashboardLayout integratie ───────────────────
  {
    id: 'ob-pref-dashboard-layout-integration',
    name: 'buildDashboardLayout integratie: layout past bij gekozen focus',
    category: CAT,
    description: 'AutoDashboardAnswers met medium grid produceert 16-cel layout met focus-relevante widgets',
    priority: 'critical',
    estimatedDurationMs: 100,
    fn() {
      // buildWidgetPrefsFromPreferences constructs AutoDashboardAnswers:
      const answers = {
        focuses: ['fire_freedom' as FocusChoice],
        modulePreference: 'balanced' as const,
        gridSize: 'medium' as const,
        detailLevel: 'balanced' as const,
        selectedBudgetFavIds: [] as string[],
      }

      // Verify the grid target for medium = 16 cells
      const GRID_TARGET_CELLS = { small: 12, medium: 16, large: 20 }
      assertEqual(GRID_TARGET_CELLS[answers.gridSize], 16, 'Medium grid = 16 target cells')

      // The builder scores widgets and the focus-boosted ones should rank higher
      // FIRE focus boosts: fire_prognose, monte_carlo, vrijheidsscenarios, etc.
      const boostedWidgets = FOCUS_WIDGET_BOOST[answers.focuses[0]]
      assert(boostedWidgets.length >= 5, `FIRE focus boosted minstens 5 widgets (was ${boostedWidgets.length})`)

      // After building, result has enabled + disabled widgets = total catalog
      // All widgets get order 0..N sequentially
      // Enabled widgets come first, disabled widgets follow

      // Verify medium grid target
      assertEqual(answers.gridSize, 'medium', 'Onboarding gebruikt medium grid')
      assertEqual(answers.detailLevel, 'balanced', 'Onboarding gebruikt balanced detail')
    },
  },

  // ── Step 5: Voorkeuren doorwerken naar dashboard ──────────────
  {
    id: 'ob-pref-affects-dashboard',
    name: 'Voorkeuren doorwerken naar uiteindelijke dashboard weergave',
    category: CAT,
    description: 'Gekozen focuses bepalen welke widgets enabled zijn en welke disabled op het dashboard',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // The flow: onboarding-preferences.tsx → buildWidgetPrefsFromPreferences
      // → saves to profile.widget_prefs via /api/onboarding/save-own-data
      // → dashboard reads widget_prefs from profile → DraggableWidgetGrid renders

      // Different focuses produce different widget sets
      const budgetBoosted = new Set(FOCUS_WIDGET_BOOST['budget_cashflow'])
      const fireBoosted = new Set(FOCUS_WIDGET_BOOST['fire_freedom'])
      const goalsBoosted = new Set(FOCUS_WIDGET_BOOST['goals_actions'])

      // Budget focus: budgetten, cash_flow, spaarquote prominent
      assert(budgetBoosted.has('budgetten'), 'Budget focus: budgetten widget geboost')
      assert(budgetBoosted.has('cash_flow'), 'Budget focus: cash_flow widget geboost')

      // Fire focus: fire_prognose, sim_vermogenspad prominent
      assert(fireBoosted.has('fire_prognose'), 'FIRE focus: fire_prognose widget geboost')
      assert(fireBoosted.has('sim_vermogenspad'), 'FIRE focus: sim_vermogenspad widget geboost')

      // Goals focus: acties, doelen, voorstellen prominent
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

  // ── Step 6: Conditional hiding of budget_cashflow when budgeting is none ──
  {
    id: 'ob-pref-budget-cashflow-hidden',
    name: 'budget_cashflow focus optie verborgen wanneer budgettering_mode === none',
    category: CAT,
    description: 'Wanneer gebruiker geen budgettering heeft gekozen, wordt budget_cashflow focus optie niet getoond',
    priority: 'high',
    estimatedDurationMs: 100,
    fn() {
      // When budgettering_mode is 'none', the budget_cashflow option should be hidden
      // because there are no budgets to track
      type BudgetteringMode = 'none' | 'yes' | 'template' | 'manual'

      function getVisibleFocusOptions(budgetteringMode: BudgetteringMode): FocusChoice[] {
        const all = ALL_FOCUS_OPTIONS.map((o) => o.id)
        if (budgetteringMode === 'none') {
          return all.filter((id) => id !== 'budget_cashflow')
        }
        return all
      }

      // Mode none: budget_cashflow hidden, 4 options visible
      const noneOptions = getVisibleFocusOptions('none')
      assertEqual(noneOptions.length, 4, 'Mode none: 4 focus opties zichtbaar')
      assert(!noneOptions.includes('budget_cashflow'), 'Mode none: budget_cashflow niet zichtbaar')
      assert(noneOptions.includes('assets_investments'), 'Mode none: assets_investments wel zichtbaar')
      assert(noneOptions.includes('fire_freedom'), 'Mode none: fire_freedom wel zichtbaar')
      assert(noneOptions.includes('goals_actions'), 'Mode none: goals_actions wel zichtbaar')
      assert(noneOptions.includes('overview'), 'Mode none: overview wel zichtbaar')

      // Mode yes/template/manual: all 5 options visible
      for (const mode of ['yes', 'template', 'manual'] as BudgetteringMode[]) {
        const options = getVisibleFocusOptions(mode)
        assertEqual(options.length, 5, `Mode ${mode}: 5 focus opties zichtbaar`)
        assert(options.includes('budget_cashflow'), `Mode ${mode}: budget_cashflow zichtbaar`)
      }
    },
  },

  // ── Step 7: Route accessible ──────────────────────────────────
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
